// @ts-nocheck - Deno edge function
/**
 * Coding-agent sidecar — starts Node.js server via duckdb process manager,
 * forwards chat to it with workspace cwd, streams SSE events back to browser.
 * SDK built-in tools (Read, Write, Edit, Bash, Glob, Grep) are enabled.
 */
import { duckdb, escapeSql } from "./duckdb.ts";
import { buildCoderContext } from "./coder_context.ts";
import {
  ensureWorkspace,
  ensureAppWorkspace,
  readProjectRules,
} from "./tools/workspace.ts";
import { ensureGitConfig } from "./git_identity.ts";
import { ensureChatWorktree } from "./chat_worktree.ts";
import { materializeAttachments, renderAttachmentBlock } from "./attachments.ts";
import { loadHooks, runStopHooks } from "./skills/hooks.ts";
import { loadSkillsForPrompt } from "./skills/resolver.ts";
import { getValidOAuthToken } from "./routes/claude_code_routes.ts";
import { getFigmaToken } from "./routes/figma_routes.ts";

const CLAUDE_PORT = 4322;
const CLAUDE_PROCESS = "claude-code-node-server";

// Re-exported for claude_code_agent.test.ts, which imports it from here.
// The rule itself now lives in coder_context.ts alongside buildCoderContext,
// which is what actually applies it during prompt assembly.
export { buildAskQuestionRule } from "./coder_context.ts";

/**
 * The `allowedTools` value put on the wire to the sidecar. An EMPTY declared
 * allowlist means "no built-ins" and must survive as `[]`; only an ABSENT one
 * leaves the SDK preset alone. A truthiness test here (`?.length ? … :
 * undefined`) inverts that and hands a declared-nothing session every tool.
 */
export function sidecarAllowedTools(
  allowedTools: readonly string[] | null | undefined,
): string[] | undefined {
  return Array.isArray(allowedTools) ? [...allowedTools] : undefined;
}

export async function ensureClaudeCodeServer() {
  try {
    const raw = await duckdb(`SELECT * FROM trex_devx_process_status('${CLAUDE_PROCESS}', '')`);
    const s = JSON.parse(raw);
    if (s.status === "running" || s.status === "starting") return;
  } catch {}

  // The devx plugin lives at /usr/src/plugins-dx/devx in the consolidated
  // (TREX_DX_ENABLED) image and at /usr/src/plugins-dev/devx in source/bind
  // layouts. Resolve whichever fn-claude-code actually exists.
  let claudeDir = "/usr/src/plugins-dx/devx/fn-claude-code";
  try {
    await Deno.stat(`${claudeDir}/server.js`);
  } catch {
    claudeDir = "/usr/src/plugins-dev/devx/fn-claude-code";
  }
  const serverPath = `${claudeDir}/server.js`;
  const config = JSON.stringify({
    path: claudeDir,
    command: `node ${serverPath}`,
    port: CLAUDE_PORT,
  });
  await duckdb(`SELECT * FROM trex_devx_process_start('${CLAUDE_PROCESS}', '${escapeSql(config)}')`);

  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const resp = await fetch(`http://localhost:${CLAUDE_PORT}/health`);
      if (resp.ok) return;
    } catch {}
  }
  throw new Error("Claude Code Node.js server failed to start");
}

/**
 * Answers a sidecar "permission" event by writing the decision file it polls for.
 * WHO decides is now pluggable: a caller running the sidecar as an eve turn
 * supplies `resolvePermission` (eve's approval gate, keyed to a real
 * agents.turns row — see agent/lib/sidecar_engine.ts); the legacy /stream path
 * supplies none and keeps devx's own tool_consents/pending_consents flow.
 * Any decision failure denies rather than hangs.
 */
export async function answerPermissionRequest({ id, toolName, input, chatId, userId, sqlFn, send, autoApprove, resolvePermission }) {
  let result;
  try {
    // A supplied resolver decides ALONE — autoApprove is a devx-settings
    // shortcut around devx's flow, and eve's gate has its own (unattended,
    // escalate tiers) that a pre-emptive allow here would bypass.
    result = resolvePermission
      ? await resolvePermission({ id, toolName, input: input || {} })
      : await decidePermission({ id, toolName, input: input || {}, chatId, userId, sqlFn, send, autoApprove });
  } catch {
    result = { behavior: "deny", message: "Permission decision failed" };
  }
  try {
    await Deno.writeTextFile(`/tmp/.claude-permission-${id}.decision`, JSON.stringify(result));
  } catch {}
  return result;
}

async function decidePermission({ id, toolName, input, chatId, userId, sqlFn, send, autoApprove }) {
  if (autoApprove) return { behavior: "allow", updatedInput: input };

  const pref = await sqlFn(
    `SELECT consent FROM devx.tool_consents WHERE user_id = $1 AND tool_name = $2`,
    [userId, toolName],
  );
  if (pref.rows[0]?.consent === "always") return { behavior: "allow", updatedInput: input };

  await sqlFn(
    `INSERT INTO devx.pending_consents (request_id, chat_id, user_id) VALUES ($1, $2, $3)`,
    [id, chatId, userId],
  );
  // Reuses the existing consent_request UI/round trip (same event the ai-sdk
  // agent loop in agent.ts sends) rather than inventing a second mechanism.
  send({ type: "consent_request", requestId: id, toolName, inputPreview: JSON.stringify(input).slice(0, 200) });

  const decision = await new Promise((resolve) => {
    const startTime = Date.now();
    const poll = async () => {
      const result = await sqlFn(`SELECT decision FROM devx.pending_consents WHERE request_id = $1`, [id]);
      const row = result.rows[0];
      if (row?.decision) { resolve(row.decision); return; }
      if (Date.now() - startTime > 5 * 60 * 1000) { resolve("deny"); return; }
      setTimeout(poll, 500);
    };
    poll();
  });
  await sqlFn(`DELETE FROM devx.pending_consents WHERE request_id = $1`, [id]);

  if (decision === "always") {
    await sqlFn(
      `INSERT INTO devx.tool_consents (user_id, tool_name, consent) VALUES ($1, $2, 'always')
       ON CONFLICT (user_id, tool_name) DO UPDATE SET consent = 'always'`,
      [userId, toolName],
    );
  }

  return decision === "allow" || decision === "always"
    ? { behavior: "allow", updatedInput: input }
    : { behavior: "deny", message: "Denied by user" };
}

export async function streamClaudeCodeChat({
  chatId, userId, appId, chatMode, settings, history, send, sqlFn,
  skillContext, commandOverride, hasComponentSelection, workspacePathOverride, useWorktree, remoteChannel, attachments,
  // The eve session's declared tool allowlist (V14). Undefined = unrestricted;
  // an EMPTY array declares "no tools" and must stay distinct from undefined.
  allowedTools,
  // Set only when this stream IS an eve turn (agent/lib/sidecar_engine.ts) —
  // see answerPermissionRequest for what supplying it changes.
  resolvePermission,
}) {
  const mode = chatMode || "agent";
  const effectiveSettings = commandOverride?.model
    ? { ...settings, model: commandOverride.model }
    : settings;

  // Optional isolated workspace (git worktree for an agent-driven run).
  let workspacePath = workspacePathOverride
    ? workspacePathOverride
    : appId
    ? await ensureAppWorkspace(userId, appId)
    : await ensureWorkspace(userId);
  // Per-user git identity/signing: sync the MAIN repo's devx include file at
  // the start of every coder turn. Worktrees share the main repo's
  // .git/config, so this also covers commits the coder makes inside the
  // per-chat worktree below; local repo config beats the sidecar's global
  // gh-derived identity.
  if (appId) {
    try {
      await ensureGitConfig(workspacePath, userId, sqlFn);
    } catch (e) {
      console.warn("[claude-code] git identity setup failed:", e?.message || e);
    }
  }
  // Facilitated (claw) sessions pin to a stable per-chat worktree so feature
  // work stays isolated and survives the cwd reset between turns.
  if (!workspacePathOverride && useWorktree && appId && chatId) {
    const wt = await ensureChatWorktree(userId, appId, chatId, sqlFn);
    if (wt) workspacePath = wt;
  }

  let aiRules = effectiveSettings.ai_rules || undefined;
  if (appId) {
    const rules = await readProjectRules(workspacePath);
    if (rules !== undefined) aiRules = rules;
  }

  // Skills listing for SKILL_USAGE_RULE ("The skills above are real and
  // invocable") — loadSkillsForPrompt is the one shared resolver every
  // dispatch path (including the eve loop) uses, so this loop's listing is
  // identical to the others.
  const skills = await loadSkillsForPrompt(userId, sqlFn);

  const { systemPrompt, maxSteps } = await buildCoderContext({
    mode, aiRules, skillContext, remoteChannel,
    hasComponentSelection, settings: effectiveSettings,
    // Only this sidecar registers mcp__ask__ask_question (see server.js) —
    // the rule that instructs the model to use it is safe to enable here.
    askToolAvailable: true,
    skills,
  });
  // Remote-channel context is no longer appended here: for a channel turn,
  // buildCoderContext's resolveCoderProfile() already selected
  // CHANNEL_CODER_SYSTEM_PROMPT as the BASE prompt (it folds in the same
  // remote-channel guidance), so systemPrompt already reflects it — see
  // prompts_channel.ts.

  const messages = history
    .filter((m) => m.content && (typeof m.content === "string" ? m.content.trim() !== "" : m.content.length > 0))
    .map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }));
  const lastUserMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  let prompt = lastUserMsg?.role === "user" ? lastUserMsg.content : "";

  // Channel attachments (claw relay): download into the resolved workspace —
  // AFTER worktree resolution so they land where the coder actually runs —
  // and point the coder at the paths. Only paths enter the prompt, never
  // content; the coder Reads images multimodally on its own.
  if (attachments?.length) {
    const saved = await materializeAttachments(workspacePath, attachments);
    prompt += renderAttachmentBlock(saved);
  }

  // Refreshes the token in-place when expired (it lives ~1h) so long-lived
  // sessions don't start sending a stale token and 401-ing.
  const oauthToken = await getValidOAuthToken();
  // Optional Figma: when a PAT is connected (Settings -> Figma), hand it to
  // the sidecar as FIGMA_TOKEN so the coder can pull designs via the REST API
  // (pulling-figma-mockups skill). Null when not connected -- invisible.
  const figmaToken = await getFigmaToken(userId, sqlFn);

  let fullContent = "";
  const collectedToolCalls = [];

  try {
    await ensureClaudeCodeServer();

    const response = await fetch(`http://localhost:${CLAUDE_PORT}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        systemPrompt,
        model: effectiveSettings.model,
        maxTurns: maxSteps,
        oauthToken,
        figmaToken: figmaToken || undefined,
        cwd: workspacePath,
        // Restricts the SDK's built-in tool set (server.js maps it to `tools`).
        // Sent only when declared, so an unrestricted session keeps the preset.
        allowedTools: sidecarAllowedTools(allowedTools),
        // Resume each chat's OWN claude session — a single global session would
        // bleed context across chats and let one bad session break all of them.
        chatId,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err || `Claude Code server returned ${response.status}`);
    }

    // Read SSE stream and forward to browser
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let eventType = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith("data: ") && eventType) {
          try {
            const data = JSON.parse(line.slice(6));
            switch (eventType) {
              case "text":
                fullContent += data.content || "";
                send({ type: "chunk", content: data.content || "" });
                break;
              case "tool_call_start": {
                const callId = data.callId;
                // Append the marker to fullContent (not just the live stream) so the
                // persisted message records WHERE the tool was invoked — otherwise the
                // reloaded message has no marker and the UI appends tool cards at the end.
                const marker = `\n<!--tool:${callId}-->\n`;
                fullContent += marker;
                send({ type: "chunk", content: marker });
                send({ type: "tool_call_start", callId, name: data.name, args: data.args || {} });
                break;
              }
              case "tool_call_end":
                collectedToolCalls.push({ callId: data.callId, name: data.name || "", result: data.result });
                send({ type: "tool_call_end", callId: data.callId, name: data.name || "", result: data.result || "" });
                break;
              case "step":
                send({ type: "step", step: data.step, maxSteps: data.maxSteps || maxSteps });
                break;
              case "token_usage":
                send({ type: "token_usage", ...data });
                break;
              case "permission":
                await answerPermissionRequest({
                  id: data.id, toolName: data.toolName, input: data.input,
                  chatId, userId, sqlFn, send,
                  autoApprove: !!effectiveSettings.auto_approve,
                  resolvePermission,
                });
                break;
              case "elicitation": {
                // Use the existing questionnaire UI to ask the user
                const requestId = data.id;

                // Render structured questions (from the ask_question tool) as
                // radio/checkbox/text; fall back to a single text question for
                // plain MCP elicitations.
                const structured = Array.isArray(data.questions) ? data.questions : null;
                const questions = structured
                  ? structured.map((q, i) => ({
                      id: String(i),
                      type: q.options?.length ? (q.multiSelect ? "checkbox" : "radio") : "text",
                      label: q.question || "The agent has a question",
                      options: q.options?.length ? q.options : undefined,
                    }))
                  : [{
                      id: "response",
                      type: "text",
                      label: data.question || "The agent has a question",
                    }];
                send({ type: "questionnaire", requestId, questions });

                // Insert pending response and poll (same mechanism as plan_tools)
                await sqlFn(
                  `INSERT INTO devx.pending_responses (request_id, chat_id, user_id, kind) VALUES ($1, $2, $3, 'elicitation')`,
                  [requestId, chatId, userId],
                );

                const answer = await new Promise((resolve) => {
                  const startTime = Date.now();
                  const poll = async () => {
                    const result = await sqlFn(
                      `SELECT answer FROM devx.pending_responses WHERE request_id = $1`, [requestId],
                    );
                    const row = result.rows[0];
                    if (row?.answer) { resolve(row.answer); return; }
                    if (Date.now() - startTime > 5 * 60 * 1000) { resolve(null); return; }
                    setTimeout(poll, 500);
                  };
                  poll();
                });
                await sqlFn(`DELETE FROM devx.pending_responses WHERE request_id = $1`, [requestId]);

                // Forward answer to Node.js server
                const userResponse = answer ? (typeof answer === "string" ? answer : JSON.stringify(answer)) : "";
                await fetch(`http://localhost:${CLAUDE_PORT}/elicitation/${requestId}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    content: { response: userResponse },
                    cancelled: !answer,
                  }),
                }).catch(() => {});
                break;
              }
              case "subagent_start":
                send({ type: "subagent_start", taskId: data.taskId, name: data.name, task: data.task });
                break;
              case "subagent_step":
                send({ type: "subagent_step", taskId: data.taskId, step: data.step, lastTool: data.lastTool, summary: data.summary });
                break;
              case "subagent_done":
                send({ type: "subagent_done", taskId: data.taskId, status: data.status, result: data.result });
                break;
              case "error":
                throw new Error(data.error);
              case "done":
                break;
            }
          } catch (e) {
            if (e.message && !e.message.includes("Unexpected")) throw e;
          }
          eventType = "";
        }
      }
    }
  } catch (err) {
    console.error("[claude-code-agent] Error:", err);
    throw new Error(err.message || String(err));
  }

  try {
    const stopHooks = await loadHooks(userId, "Stop", sqlFn);
    if (stopHooks.length > 0) await runStopHooks(stopHooks, { chatId, content: fullContent });
  } catch {}

  return { content: fullContent, toolCalls: collectedToolCalls };
}
