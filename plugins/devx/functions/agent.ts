// @ts-nocheck - Deno edge function
/**
 * Agent streaming loop using Vercel AI SDK with tool calling.
 * Used for "agent" mode chats only.
 */
import { streamText, tool, jsonSchema, stepCountIs } from "npm:ai";
import { createAnthropic } from "npm:@ai-sdk/anthropic";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google";
import { createAmazonBedrock } from "npm:@ai-sdk/amazon-bedrock";
import { constructSystemPrompt } from "./prompts.ts";
import { buildToolSet, getToolByName } from "./tools/registry.ts";
import type { AgentContext } from "./tools/types.ts";
import { ensureWorkspace, ensureAppWorkspace } from "./tools/workspace.ts";
import { mcpManager } from "./mcp_manager.ts";
import { loadHooks, runPreToolHooks, runPostToolHooks, runStopHooks } from "./skills/hooks.ts";

const DEFAULT_MAX_STEPS = 25;

/** Clean up all pending consents for a given chat (called on stream abort) */
export async function clearPendingConsents(chatId, sqlFn?) {
  if (sqlFn) {
    await sqlFn(
      `UPDATE devx.pending_consents SET decision = 'deny' WHERE chat_id = $1 AND decision IS NULL`,
      [chatId],
    );
  }
}

export async function resolveConsent(requestId, decision, userId, sqlFn?) {
  if (!sqlFn) return false;
  const result = await sqlFn(
    `UPDATE devx.pending_consents SET decision = $1
     WHERE request_id = $2 AND user_id = $3 AND decision IS NULL
     RETURNING request_id`,
    [decision, requestId, userId],
  );
  return result.rows.length > 0;
}

function createModel(settings) {
  const { provider, model, api_key, base_url } = settings;

  if (provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey: api_key });
    return anthropic(model);
  }
  if (provider === "google") {
    const google = createGoogleGenerativeAI({ apiKey: api_key });
    return google(model);
  }
  if (provider === "bedrock") {
    const bedrockConfig: Record<string, any> = {};
    if (base_url) bedrockConfig.region = base_url;

    // Credentials are packed as JSON in api_key
    let bearerToken = "";
    if (api_key) {
      try {
        const creds = JSON.parse(api_key);
        if (creds.bearerToken) {
          bearerToken = creds.bearerToken;
        } else {
          if (creds.accessKeyId) bedrockConfig.accessKeyId = creds.accessKeyId;
          if (creds.secretAccessKey) bedrockConfig.secretAccessKey = creds.secretAccessKey;
        }
      } catch {
        // Fall through to env vars
      }
    }

    // Check env var fallback for bearer token
    if (!bearerToken) {
      bearerToken = Deno.env.get("AWS_BEARER_TOKEN_BEDROCK") || "";
    }

    if (bearerToken) {
      // Use bearer token auth via custom fetch that injects the Authorization header
      // and dummy credentials to bypass SigV4 requirement
      bedrockConfig.accessKeyId = "bearer-token-auth";
      bedrockConfig.secretAccessKey = "bearer-token-auth";
      const origFetch = globalThis.fetch;
      bedrockConfig.fetch = (url: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${bearerToken}`);
        // Fix Bedrock rejecting assistant messages with empty content
        // (happens in multi-step tool calling when assistant only has toolUse)
        let body = init?.body;
        if (body && typeof body === "string") {
          try {
            const parsed = JSON.parse(body);
            if (parsed.messages) {
              for (const msg of parsed.messages) {
                if (msg.role === "assistant" && Array.isArray(msg.content)) {
                  const hasText = msg.content.some((p: any) => p.text != null);
                  const hasToolUse = msg.content.some((p: any) => p.toolUse != null);
                  if (hasToolUse && !hasText) {
                    msg.content.unshift({ text: "." });
                  }
                }
              }
              body = JSON.stringify(parsed);
            }
          } catch {}
        }
        return origFetch(url, { ...init, body, headers });
      };
    }

    const bedrock = createAmazonBedrock(bedrockConfig);
    return bedrock(model);
  }
  // OpenAI and OpenAI-compatible
  const openai = createOpenAI({
    apiKey: api_key,
    ...(base_url ? { baseURL: base_url } : {}),
  });
  return openai(model);
}

export async function streamAgentChat({
  chatId,
  userId,
  appId,
  chatMode,
  settings,
  history,
  send,
  sqlFn,
  // Skills/commands/hooks integration
  skillContext,
  commandOverride,
  hasComponentSelection,
}) {
  // Dispatch to Claude Code SDK agent when that provider is selected
  if (settings.provider === "claude-code") {
    const { streamClaudeCodeChat } = await import("./claude_code_agent.ts");
    return streamClaudeCodeChat({
      chatId, userId, appId, chatMode, settings, history, send, sqlFn,
      skillContext, commandOverride, hasComponentSelection,
    });
  }

  // Dispatch to GitHub Copilot SDK agent when that provider is selected
  if (settings.provider === "copilot") {
    const { streamCopilotChat } = await import("./copilot_agent.ts");
    return streamCopilotChat({
      chatId, userId, appId, chatMode, settings, history, send, sqlFn,
      skillContext, commandOverride, hasComponentSelection,
    });
  }

  const mode = chatMode || "agent";
  const maxSteps = settings.max_steps || DEFAULT_MAX_STEPS;

  // Apply model override from command if present
  const effectiveSettings = commandOverride?.model
    ? { ...settings, model: commandOverride.model }
    : settings;

  // Ensure workspace exists — app-scoped if chat belongs to an app
  const workspacePath = appId
    ? await ensureAppWorkspace(userId, appId)
    : await ensureWorkspace(userId);

  // Read AI_RULES.md from app workspace (like Dyad), fall back to DB settings
  let aiRules = effectiveSettings.ai_rules || undefined;
  if (appId) {
    try {
      aiRules = await Deno.readTextFile(`${workspacePath}/AI_RULES.md`);
    } catch { /* no AI_RULES.md, use DB setting or default */ }
  }

  let systemPrompt = constructSystemPrompt(mode, aiRules, skillContext);
  if (hasComponentSelection) {
    systemPrompt += "\nThe user has selected specific components for editing. Component details and code snippets are in the user's message. Focus your modifications on those components.";
  }

  // Load user consent preferences
  const consentResult = await sqlFn(
    `SELECT tool_name, consent FROM devx.tool_consents WHERE user_id = $1`,
    [userId],
  );
  const consents = {};
  for (const row of consentResult.rows) {
    consents[row.tool_name] = row.consent;
  }

  // Build AI SDK tool set with consent-aware execution
  // Apply command/skill allowedTools filter if present
  const allowedTools = commandOverride?.allowed_tools || null;
  const toolDefs = buildToolSet(mode, consents, allowedTools);

  // Load hooks for this user
  let preToolHooks = [];
  let postToolHooks = [];
  try {
    [preToolHooks, postToolHooks] = await Promise.all([
      loadHooks(userId, "PreToolUse", sqlFn),
      loadHooks(userId, "PostToolUse", sqlFn),
    ]);
  } catch (err) {
    console.error("[agent] Failed to load hooks:", err);
  }
  const aiTools = {};

  for (const [name, def] of Object.entries(toolDefs)) {
    // Ensure schema has type: "object" (required by Bedrock)
    const schema = { type: "object", ...def.parameters };
    aiTools[name] = tool({
      description: def.description,
      inputSchema: jsonSchema(schema, { validate: (value) => ({ success: true, value }) }),
      execute: async (args, { toolCallId }) => {
        const toolDef = getToolByName(name);
        if (!toolDef) return `Error: tool ${name} not found`;

        const ctx: AgentContext = {
          chatId,
          userId,
          appId,
          workspacePath,
          send,
          sql: sqlFn,
          requireConsent: async (params) => {
            // Auto-approve if setting enabled
            if (settings.auto_approve) return true;

            // Check consent: user preference takes priority, then tool default
            const userConsent = consents[params.toolName];
            if (userConsent === "always") return true;
            if (!userConsent && toolDef.defaultConsent === "always") return true;

            // Send consent request to client and wait (DB-backed for cross-isolate support)
            const requestId = crypto.randomUUID();
            await sqlFn(
              `INSERT INTO devx.pending_consents (request_id, chat_id, user_id) VALUES ($1, $2, $3)`,
              [requestId, chatId, userId],
            );
            send({ type: "consent_request", requestId, toolName: params.toolName, inputPreview: params.inputPreview });

            // Poll DB for decision
            const decision = await new Promise((resolve) => {
              const startTime = Date.now();
              const poll = async () => {
                const result = await sqlFn(
                  `SELECT decision FROM devx.pending_consents WHERE request_id = $1`,
                  [requestId],
                );
                const row = result.rows[0];
                if (row?.decision) {
                  resolve(row.decision);
                  return;
                }
                // Timeout after 5 minutes
                if (Date.now() - startTime > 5 * 60 * 1000) {
                  await sqlFn(`DELETE FROM devx.pending_consents WHERE request_id = $1`, [requestId]);
                  resolve("deny");
                  return;
                }
                setTimeout(poll, 500);
              };
              poll();
            });
            // Clean up
            await sqlFn(`DELETE FROM devx.pending_consents WHERE request_id = $1`, [requestId]);

            if (decision === "always") {
              // Persist "always" consent
              await sqlFn(
                `INSERT INTO devx.tool_consents (user_id, tool_name, consent)
                 VALUES ($1, $2, 'always')
                 ON CONFLICT (user_id, tool_name) DO UPDATE SET consent = 'always'`,
                [userId, params.toolName],
              );
              consents[params.toolName] = "always";
            }

            return decision === "allow" || decision === "always";
          },
        };

        // Run PreToolUse hooks before consent
        let effectiveArgs = args;
        if (preToolHooks.length > 0) {
          try {
            const hookResult = await runPreToolHooks(name, args, preToolHooks);
            if (!hookResult.allow) {
              return `Tool call blocked by hook.`;
            }
            if (hookResult.modifiedArgs) effectiveArgs = hookResult.modifiedArgs;
          } catch (err) {
            console.error("[agent] PreToolUse hook error:", err);
          }
        }

        // Check consent
        const consentPreview = toolDef.getConsentPreview ? toolDef.getConsentPreview(effectiveArgs) : JSON.stringify(effectiveArgs).slice(0, 200);
        const approved = await ctx.requireConsent({
          toolName: name,
          toolDescription: toolDef.description,
          inputPreview: consentPreview,
        });

        if (!approved) {
          return `Tool call denied by user.`;
        }

        const callId = toolCallId;
        // Inject tool marker into the content stream so frontend can render it inline
        send({ type: "chunk", content: `<!--tool:${callId}-->` });
        send({ type: "tool_call_start", callId, name, args: effectiveArgs });
        try {
          let result = await toolDef.execute(effectiveArgs, ctx);

          // Run PostToolUse hooks
          if (postToolHooks.length > 0) {
            try {
              result = await runPostToolHooks(name, effectiveArgs, result, postToolHooks);
            } catch (err) {
              console.error("[agent] PostToolUse hook error:", err);
            }
          }

          collectedToolCalls.push({ callId, name, args: effectiveArgs, result: result.slice(0, 500) });
          send({ type: "tool_call_end", callId, name, result: result.slice(0, 500) });
          const MAX_RESULT = 20_000;
          if (result.length > MAX_RESULT) {
            return result.slice(0, MAX_RESULT) + `\n\n[truncated — ${result.length - MAX_RESULT} chars omitted]`;
          }
          return result;
        } catch (err) {
          const errMsg = `Tool error: ${err.message || String(err)}`;
          collectedToolCalls.push({ callId, name, args: effectiveArgs, result: errMsg, error: true });
          send({ type: "tool_call_end", callId, name, result: errMsg, error: true });
          return errMsg;
        }
      },
    });
  }

  // Phase 6: Inject MCP tools dynamically
  try {
    const mcpServersResult = await sqlFn(
      `SELECT name, transport, command, args, env, url, headers
       FROM devx.mcp_servers WHERE user_id = $1 AND enabled = true`,
      [userId],
    );
    if (mcpServersResult.rows.length > 0) {
      const mcpConsentsResult = await sqlFn(
        `SELECT server_name, tool_name, consent FROM devx.mcp_tool_consents WHERE user_id = $1`,
        [userId],
      );
      const mcpConsents = {};
      for (const row of mcpConsentsResult.rows) {
        mcpConsents[`${row.server_name}:${row.tool_name}`] = row.consent;
      }

      const mcpTools = await mcpManager.getTools(userId, mcpServersResult.rows);
      for (const mcpTool of mcpTools) {
        const toolName = `mcp_${mcpTool.serverName}_${mcpTool.name}`;
        const consentKey = `${mcpTool.serverName}:${mcpTool.name}`;
        const userMcpConsent = mcpConsents[consentKey];
        if (userMcpConsent === "never") continue;

        aiTools[toolName] = tool({
          description: `[MCP: ${mcpTool.serverName}] ${mcpTool.description}`,
          inputSchema: jsonSchema({ type: "object", ...mcpTool.inputSchema }),
          execute: async (args) => {
            // Consent check for MCP tools
            const approved = settings.auto_approve || userMcpConsent === "always" || await (async () => {
              const requestId = crypto.randomUUID();
              await sqlFn(
                `INSERT INTO devx.pending_consents (request_id, chat_id, user_id) VALUES ($1, $2, $3)`,
                [requestId, chatId, userId],
              );
              send({ type: "consent_request", requestId, toolName, inputPreview: JSON.stringify(args).slice(0, 200) });
              const decision = await new Promise((resolve) => {
                const startTime = Date.now();
                const poll = async () => {
                  const result = await sqlFn(
                    `SELECT decision FROM devx.pending_consents WHERE request_id = $1`,
                    [requestId],
                  );
                  const row = result.rows[0];
                  if (row?.decision) { resolve(row.decision); return; }
                  if (Date.now() - startTime > 5 * 60 * 1000) {
                    await sqlFn(`DELETE FROM devx.pending_consents WHERE request_id = $1`, [requestId]);
                    resolve("deny");
                    return;
                  }
                  setTimeout(poll, 500);
                };
                poll();
              });
              await sqlFn(`DELETE FROM devx.pending_consents WHERE request_id = $1`, [requestId]);
              if (decision === "always") {
                await sqlFn(
                  `INSERT INTO devx.mcp_tool_consents (user_id, server_name, tool_name, consent)
                   VALUES ($1, $2, $3, 'always')
                   ON CONFLICT (user_id, server_name, tool_name) DO UPDATE SET consent = 'always'`,
                  [userId, mcpTool.serverName, mcpTool.name],
                );
              }
              return decision === "allow" || decision === "always";
            })();

            if (!approved) return "Tool call denied by user.";

            const callId = crypto.randomUUID();
            send({ type: "chunk", content: `<!--tool:${callId}-->` });
            send({ type: "tool_call_start", callId, name: toolName, args });
            try {
              const result = await mcpManager.executeTool(userId, mcpTool.serverName, mcpTool.name, args);
              send({ type: "tool_call_end", callId, name: toolName, result: result.slice(0, 500) });
              return result.length > 20_000
                ? result.slice(0, 20_000) + `\n\n[truncated]`
                : result;
            } catch (err) {
              const errMsg = `MCP tool error: ${err.message || String(err)}`;
              send({ type: "tool_call_end", callId, name: toolName, result: errMsg, error: true });
              return errMsg;
            }
          },
        });
      }
    }
  } catch (err) {
    console.error("MCP tool injection error:", err);
    // Don't fail the agent — just skip MCP tools
  }

  // Build messages for AI SDK
  // Filter out messages with empty content (Bedrock rejects these)
  const messages = history
    .filter((m) => m.content && (typeof m.content === "string" ? m.content.trim() !== "" : m.content.length > 0))
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  const model = createModel(effectiveSettings);
  let fullContent = "";
  let stepCount = 0;
  const collectedToolCalls: { callId: string; name: string; args: any; result?: string; error?: boolean }[] = [];

  try {
    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      tools: aiTools,
      stopWhen: stepCountIs(maxSteps),
      onStepFinish: ({ stepType }) => {
        if (stepType === "tool-result") {
          stepCount++;
          send({ type: "step", step: stepCount, maxSteps });
        }
      },
    });

    for await (const part of result.fullStream) {
      if (part.type === "text" || part.type === "text-delta") {
        const text = (part as any).text ?? (part as any).textDelta ?? "";
        if (text) {
          fullContent += text;
          send({ type: "chunk", content: text });
        }
      } else if (part.type === "tool-call") {
        // Inject marker at tool invocation position (before tool executes)
        const callId = (part as any).toolCallId;
        if (callId) {
          const marker = `\n<!--tool:${callId}-->\n`;
          fullContent += marker;
          send({ type: "chunk", content: marker });
        }
      }
    }

    // Send token usage info after streaming completes
    try {
      const usage = await result.usage;
      if (usage) {
        send({
          type: "token_usage",
          prompt_tokens: usage.promptTokens,
          completion_tokens: usage.completionTokens,
        });
      }
    } catch (usageErr) {
      console.error("Failed to get token usage:", usageErr);
    }
  } catch (err) {
    console.error("Agent stream error:", err);
    const msg = err.message || String(err);
    // Surface auth/key errors so users know to fix their settings
    const lower = msg.toLowerCase();
    let safeMsg: string;
    if (lower.includes("authentication") || lower.includes("unauthorized") || lower.includes("invalid api key") || lower.includes("401") || lower.includes("invalid x-api-key")) {
      safeMsg = "Invalid API key. Please check your API key in Settings.";
    } else if (lower.includes("permission") || lower.includes("403")) {
      safeMsg = "API key does not have permission for this model. Check your provider settings.";
    } else if (lower.includes("not_found") || lower.includes("404") || (lower.includes("model") && lower.includes("not found"))) {
      safeMsg = `Model "${settings.model}" not found. Check the model name in Settings.`;
    } else if (lower.includes("rate limit") || lower.includes("429")) {
      safeMsg = "Rate limit exceeded. Please wait a moment and try again.";
    } else if (lower.includes("insufficient") || lower.includes("quota") || lower.includes("billing")) {
      safeMsg = "API quota exceeded or billing issue. Check your provider account.";
    } else {
      safeMsg = "An error occurred during agent execution. Check the browser console for details.";
    }
    throw new Error(safeMsg);
  }

  // Run Stop hooks
  try {
    const stopHooks = await loadHooks(userId, "Stop", sqlFn);
    if (stopHooks.length > 0) {
      await runStopHooks(stopHooks, { chatId, content: fullContent });
    }
  } catch (err) {
    console.error("[agent] Stop hooks error:", err);
  }

  return { content: fullContent, toolCalls: collectedToolCalls };
}
