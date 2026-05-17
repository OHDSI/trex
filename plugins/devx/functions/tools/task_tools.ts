// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";

export const taskCreateTool: ToolDefinition<{
  subject: string;
  description?: string;
  status?: string;
}> = {
  name: "TaskCreate",
  description:
    "Create a new task for the current conversation. Tasks are stored in the database and can be listed, updated, or removed.",
  parameters: {
    type: "object",
    properties: {
      subject: {
        type: "string",
        description: "Short subject/title for the task",
      },
      description: {
        type: "string",
        description: "Longer description of the task (optional)",
      },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "completed"],
        description: "Initial status of the task (default: pending)",
      },
    },
    required: ["subject"],
  },
  defaultConsent: "always",
  modifiesState: true,

  async execute(args, ctx) {
    const { subject, description, status = "pending" } = args;
    const content = description ? `${subject}: ${description}` : subject;

    await ctx.sql(
      `INSERT INTO devx.agent_todos (chat_id, content, status) VALUES ($1, $2, $3)`,
      [ctx.chatId, content, status],
    );

    return `Task created: ${subject}`;
  },
};

export const taskGetTool: ToolDefinition<{
  task_id: string;
}> = {
  name: "TaskGet",
  description:
    "Get details of a specific task by its ID.",
  parameters: {
    type: "object",
    properties: {
      task_id: {
        type: "string",
        description: "The ID of the task to retrieve",
      },
    },
    required: ["task_id"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args, ctx) {
    const { task_id } = args;

    const result = await ctx.sql(
      `SELECT id, content, status, created_at, updated_at FROM devx.agent_todos WHERE id = $1`,
      [task_id],
    );

    if (result.rows.length === 0) {
      return `Task not found: ${task_id}`;
    }

    const task = result.rows[0];
    return `Task ${task.id}:\n  Content: ${task.content}\n  Status: ${task.status}\n  Created: ${task.created_at}\n  Updated: ${task.updated_at}`;
  },
};

export const taskListTool: ToolDefinition<Record<string, never>> = {
  name: "TaskList",
  description:
    "List all tasks for the current conversation.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(_args, ctx) {
    const result = await ctx.sql(
      `SELECT id, content, status FROM devx.agent_todos WHERE chat_id = $1 ORDER BY created_at ASC`,
      [ctx.chatId],
    );

    if (result.rows.length === 0) {
      return "No tasks found for this conversation.";
    }

    const lines = result.rows.map(
      (t: any) => `- [${t.status}] ${t.content} (id: ${t.id})`,
    );
    return `Tasks (${result.rows.length}):\n${lines.join("\n")}`;
  },
};

export const taskUpdateTool: ToolDefinition<{
  task_id: string;
  status?: string;
  content?: string;
}> = {
  name: "TaskUpdate",
  description:
    "Update a task's status or content by its ID.",
  parameters: {
    type: "object",
    properties: {
      task_id: {
        type: "string",
        description: "The ID of the task to update",
      },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "completed"],
        description: "New status for the task",
      },
      content: {
        type: "string",
        description: "New content for the task",
      },
    },
    required: ["task_id"],
  },
  defaultConsent: "always",
  modifiesState: true,

  async execute(args, ctx) {
    const { task_id, status, content } = args;

    if (status && content) {
      await ctx.sql(
        `UPDATE devx.agent_todos SET status = $1, content = $2, updated_at = NOW() WHERE id = $3`,
        [status, content, task_id],
      );
    } else if (status) {
      await ctx.sql(
        `UPDATE devx.agent_todos SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, task_id],
      );
    } else if (content) {
      await ctx.sql(
        `UPDATE devx.agent_todos SET content = $1, updated_at = NOW() WHERE id = $2`,
        [content, task_id],
      );
    } else {
      return "No updates provided. Specify status or content to update.";
    }

    return "Task updated";
  },
};

export const taskStopTool: ToolDefinition<{
  task_id: string;
}> = {
  name: "TaskStop",
  description:
    "Delete/cancel a task by its ID, removing it from the database.",
  parameters: {
    type: "object",
    properties: {
      task_id: {
        type: "string",
        description: "The ID of the task to remove",
      },
    },
    required: ["task_id"],
  },
  defaultConsent: "always",
  modifiesState: true,

  async execute(args, ctx) {
    const { task_id } = args;

    await ctx.sql(
      `DELETE FROM devx.agent_todos WHERE id = $1`,
      [task_id],
    );

    return "Task removed";
  },
};
