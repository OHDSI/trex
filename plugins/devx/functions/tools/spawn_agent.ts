// @ts-nocheck - Deno edge function
/**
 * spawn_agent tool — allows the AI to launch autonomous subagents.
 * Subagents run with their own system prompt, tool set, and context.
 */

import type { ToolDefinition, AgentContext } from "./types.ts";

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
      // Import streamAgentChat dynamically to avoid circular dependency
      const { streamAgentChat } = await import("../agent.ts");

      // Get active provider config + user prefs for model creation
      const activePC = await ctx.sql(
        `SELECT provider, model, api_key, base_url FROM devx.provider_configs WHERE user_id = $1 AND is_active = true LIMIT 1`,
        [ctx.userId],
      );
      const prefsResult = await ctx.sql(
        `SELECT ai_rules, auto_approve, max_steps FROM devx.settings WHERE user_id = $1`,
        [ctx.userId],
      );
      const settings = activePC.rows[0]
        ? { ...activePC.rows[0], ...(prefsResult.rows[0] || {}) }
        : (await ctx.sql(`SELECT provider, model, api_key, base_url, ai_rules, auto_approve, max_steps FROM devx.settings WHERE user_id = $1`, [ctx.userId])).rows[0] || {};

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
