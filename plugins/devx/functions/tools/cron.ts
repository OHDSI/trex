// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";

export const cronCreateTool: ToolDefinition<{
  schedule: string;
  prompt: string;
  name?: string;
}> = {
  name: "CronCreate",
  description:
    "Create a scheduled task that runs on a cron schedule. The task will execute the given prompt at the specified interval.",
  parameters: {
    type: "object",
    properties: {
      schedule: {
        type: "string",
        description: "Cron expression (e.g. '0 * * * *' for every hour)",
      },
      prompt: {
        type: "string",
        description: "The prompt or command to run on each invocation",
      },
      name: {
        type: "string",
        description: "Optional human-readable label for the task",
      },
    },
    required: ["schedule", "prompt"],
  },
  defaultConsent: "ask",
  modifiesState: true,
  execute: async (args, ctx) => {
    const label = args.name || args.prompt.slice(0, 50);
    try {
      await ctx.sql(
        `INSERT INTO devx.scheduled_tasks (chat_id, user_id, schedule, prompt, name) VALUES ($1, $2, $3, $4, $5)`,
        [ctx.chatId, ctx.userId, args.schedule, args.prompt, label]
      );
      return `Scheduled task created: ${label} (schedule: ${args.schedule})`;
    } catch (err) {
      return `Error creating scheduled task: ${err.message || String(err)}`;
    }
  },
  getConsentPreview: (args) =>
    `Create cron "${args.name || args.prompt.slice(0, 40)}" [${args.schedule}]`,
};

export const cronDeleteTool: ToolDefinition<{ task_id: string }> = {
  name: "CronDelete",
  description: "Delete a scheduled task by its ID.",
  parameters: {
    type: "object",
    properties: {
      task_id: {
        type: "string",
        description: "The ID of the scheduled task to delete",
      },
    },
    required: ["task_id"],
  },
  defaultConsent: "ask",
  modifiesState: true,
  execute: async (args, ctx) => {
    try {
      await ctx.sql(
        `DELETE FROM devx.scheduled_tasks WHERE id = $1 AND user_id = $2`,
        [args.task_id, ctx.userId]
      );
      return "Scheduled task deleted.";
    } catch (err) {
      return `Error deleting scheduled task: ${err.message || String(err)}`;
    }
  },
  getConsentPreview: (args) => `Delete scheduled task ${args.task_id}`,
};

export const cronListTool: ToolDefinition<Record<string, never>> = {
  name: "CronList",
  description: "List all scheduled tasks for the current user.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  defaultConsent: "always",
  modifiesState: false,
  execute: async (_args, ctx) => {
    try {
      const result = await ctx.sql(
        `SELECT id, name, schedule, prompt, created_at FROM devx.scheduled_tasks WHERE user_id = $1 ORDER BY created_at DESC`,
        [ctx.userId]
      );
      if (!result.rows || result.rows.length === 0) {
        return "No scheduled tasks found.";
      }
      const lines = result.rows.map(
        (r: any) => `- [${r.id}] "${r.name}" schedule: ${r.schedule} — ${r.prompt.slice(0, 80)}`
      );
      return `Scheduled tasks:\n${lines.join("\n")}`;
    } catch (err) {
      return `Error listing scheduled tasks: ${err.message || String(err)}`;
    }
  },
};
