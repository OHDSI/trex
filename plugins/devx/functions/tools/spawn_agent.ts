// @ts-nocheck - Deno edge function
/**
 * spawn_agent tool — allows the AI to launch autonomous subagents.
 * Subagents run with their own system prompt, tool set, and context.
 */

import type { ToolDefinition } from "./types.ts";
import { assertEncryptionMigrated, assertProviderConfigEncryptionMigrated, readProviderKey } from "../provider_key.ts";
import { assertProviderSupported, NO_KEY_PROVIDERS } from "../provider_support.ts";

export const spawnAgentTool: ToolDefinition<{
  agent_name: string;
  task: string;
}> = {
  name: "Agent",
  description:
    "Spawn a subagent to handle a specific subtask autonomously. The subagent runs with its own system prompt and tool set, then returns a result summary. Use this for focused tasks like code exploration, code review, or security scanning.",
  parameters: {
    type: "object",
    properties: {
      agent_name: {
        type: "string",
        description:
          "Name of the agent to spawn (e.g. 'code-explorer', 'code-reviewer')",
      },
      task: {
        type: "string",
        description:
          "Specific task description for the agent. Be clear about what to analyze and what output you expect.",
      },
    },
    required: ["agent_name", "task"],
  },
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview(args) {
    return `Spawn agent "${args.agent_name}": ${args.task.slice(0, 150)}`;
  },

  async execute(args, ctx) {
    const { agent_name, task } = args;

    // Look up agent definition
    const agentResult = await ctx.sql(
      `SELECT * FROM devx.agents
       WHERE name = $1 AND enabled = true
         AND (user_id = $2 OR (is_builtin = true AND user_id IS NULL))
       ORDER BY (user_id IS NOT NULL) DESC
       LIMIT 1`,
      [agent_name, ctx.userId],
    );

    if (agentResult.rows.length === 0) {
      // List available agents
      const available = await ctx.sql(
        `SELECT name, description FROM devx.agents
         WHERE enabled = true
           AND (user_id = $1 OR (is_builtin = true AND user_id IS NULL))`,
        [ctx.userId],
      );
      const names = available.rows.map((a) => `- ${a.name}: ${a.description?.slice(0, 80)}`);
      return `Agent "${agent_name}" not found. Available agents:\n${names.join("\n") || "(none)"}`;
    }

    const agentDef = agentResult.rows[0];

    // Create subagent run record
    const runResult = await ctx.sql(
      `INSERT INTO devx.subagent_runs (parent_chat_id, agent_name, task)
       VALUES ($1, $2, $3) RETURNING id`,
      [ctx.chatId, agent_name, task],
    );
    const runId = runResult.rows[0].id;

    // Notify frontend
    ctx.send({
      type: "subagent_start",
      runId,
      agentName: agent_name,
      task: task.slice(0, 200),
    });

    try {
      // Get active provider config + user prefs for model creation. Probe
      // before selecting the encrypted columns — see provider_key.ts's
      // assertProviderConfigEncryptionMigrated header comment.
      await assertProviderConfigEncryptionMigrated(ctx.sql);
      const activePC = await ctx.sql(
        `SELECT provider, model, api_key, api_key_encrypted, api_key_iv, base_url FROM devx.provider_configs WHERE user_id = $1 AND is_active = true LIMIT 1`,
        [ctx.userId],
      );
      const prefsResult = await ctx.sql(
        `SELECT ai_rules, auto_approve, max_steps FROM devx.settings WHERE user_id = $1`,
        [ctx.userId],
      );
      let settings;
      if (activePC.rows[0]) {
        // Resolve through the encryption helper — never let the raw
        // api_key_encrypted/api_key_iv columns leak into settings.api_key
        // unresolved. A decryption failure propagates uncaught to the outer
        // catch below, which already reports it as "Subagent error: ..." —
        // the same fail-loud posture as every other failure this tool
        // surfaces, so no new error shape is needed here.
        const resolvedApiKey = await readProviderKey(activePC.rows[0]);
        // The comment above says ciphertext never leaks into `settings` —
        // make that true by destructuring it out rather than spreading the
        // raw row (same fix as index.ts's settings/agentSettings assembly).
        const { api_key_encrypted: _spawnEnc, api_key_iv: _spawnIv, ...activePCNoCiphertext } = activePC.rows[0];
        settings = { ...activePCNoCiphertext, api_key: resolvedApiKey, ...(prefsResult.rows[0] || {}) };
      } else {
        // Legacy fallback. devx.settings carries the same encrypted-pair
        // columns as provider_configs (V16) now — resolved through
        // readProviderKey below, the same shape as the activePC branch
        // above, not a second, differently-shaped resolution.
        await assertEncryptionMigrated("settings", ctx.sql);
        const legacyRow = (await ctx.sql(
          `SELECT provider, model, api_key, api_key_encrypted, api_key_iv, base_url, ai_rules, auto_approve, max_steps FROM devx.settings WHERE user_id = $1`,
          [ctx.userId],
        )).rows[0];
        if (legacyRow) {
          const resolvedLegacyApiKey = await readProviderKey(legacyRow);
          const { api_key_encrypted: _legacyEnc, api_key_iv: _legacyIv, ...legacyNoCiphertext } = legacyRow;
          settings = { ...legacyNoCiphertext, api_key: resolvedLegacyApiKey };
        } else {
          settings = {};
        }
      }

      // This tool re-reads the active provider row itself rather than reusing
      // the caller's, so the gates the route layer applied to the parent turn
      // (index.ts's two /stream sites, security_routes.ts's runAgentReview) do
      // NOT cover it: a user who activates a different provider while a turn
      // is in flight lands here with a row nothing has vetted. Re-apply both
      // route-layer gates on the row this tool actually resolved.
      //
      // The removed-engine gate first, keyed on the provider name rather than
      // on the missing key: the engine that used to serve these rows is gone,
      // so without this the row reaches createModel's final
      // `return openai(model)` — the OpenAI-compatible client, which resolves
      // an absent key from the worker's own OPENAI_API_KEY and runs the
      // subagent turn on the operator's account. This tool fails the turn
      // rather than answering a request, so it takes the throwing wrapper over
      // the same shared predicate the route sites return a 400 from.
      assertProviderSupported(settings.provider);
      // Then the key gate, same membership set as the three route sites: only
      // providers that genuinely authenticate without a stored key are waived.
      // Also catches the `|| {}` empty-settings case above, which has the same
      // fallthrough.
      if (!settings.api_key && !NO_KEY_PROVIDERS.has(settings.provider)) {
        throw new Error("No provider configured. Please set up your provider in Settings.");
      }

      // Import streamAgentChat dynamically to avoid circular dependency.
      // Loaded after the gates above so a rejected turn never pulls in the
      // engine (and its provider SDKs) at all.
      const { streamAgentChat } = await import("../agent.ts");

      // Determine model — use agent's model or inherit parent's
      const effectiveModel = agentDef.model === "inherit" ? settings.model : agentDef.model;

      // Create a send wrapper that prefixes events with subagent info
      const subagentSend = (data) => {
        if (data.type === "chunk") {
          ctx.send({ type: "subagent_chunk", runId, content: data.content });
        } else if (data.type === "tool_call_start") {
          ctx.send({ type: "subagent_tool_call_start", runId, callId: data.callId, name: data.name, args: data.args });
        } else if (data.type === "tool_call_end") {
          ctx.send({ type: "subagent_tool_call_end", runId, callId: data.callId, name: data.name, result: data.result, error: data.error });
        } else if (data.type === "step") {
          ctx.send({ type: "subagent_step", runId, step: data.step, maxSteps: data.maxSteps });
        }
        // Consent events go through parent's send (ctx.send) via requireConsent
        // Token usage and other internal events are not forwarded
      };

      // Run the subagent
      const result = await streamAgentChat({
        chatId: ctx.chatId, // Share parent's chat for consent resolution
        userId: ctx.userId,
        appId: ctx.appId,
        chatMode: "agent",
        settings: {
          ...settings,
          model: effectiveModel,
          max_steps: agentDef.max_steps || 15,
        },
        history: [{ role: "user", content: task }], // Fresh context with just the task
        send: subagentSend,
        sqlFn: ctx.sql,
        skillContext: agentDef.body, // Agent's system prompt as skill context
        commandOverride: agentDef.allowed_tools
          ? { allowed_tools: agentDef.allowed_tools, model: null, body: "" }
          : undefined,
      });

      // Update run record
      const summary = result.content.slice(0, 10000);
      await ctx.sql(
        `UPDATE devx.subagent_runs
         SET status = 'completed', result = $1, completed_at = NOW()
         WHERE id = $2`,
        [summary, runId],
      );

      ctx.send({ type: "subagent_done", runId, summary: summary.slice(0, 500) });

      return summary;
    } catch (err) {
      const errMsg = `Subagent error: ${err.message || String(err)}`;

      await ctx.sql(
        `UPDATE devx.subagent_runs
         SET status = 'failed', result = $1, completed_at = NOW()
         WHERE id = $2`,
        [errMsg, runId],
      );

      ctx.send({ type: "subagent_done", runId, error: errMsg });
      return errMsg;
    }
  },
};
