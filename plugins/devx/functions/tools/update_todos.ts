// @ts-nocheck - Deno edge function
import type { ToolDefinition, AgentTodo } from "./types.ts";

export const updateTodosTool: ToolDefinition<{
  mode: "merge" | "replace";
  todos: Array<{ id: string; content?: string; status?: string }>;
}> = {
  name: "TodoWrite",
  description:
    "Update the task/todo list for the current conversation. Use 'merge' mode to update specific todos by id, or 'replace' mode to set the entire list. Each todo has an id, content, and status (pending/in_progress/completed). Only one todo should be in_progress at a time.",
  parameters: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["merge", "replace"],
        description: "merge: update existing todos by id. replace: replace entire list.",
      },
      todos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique identifier for the todo" },
            content: { type: "string", description: "Description of the task" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed"],
              description: "Current status of the task",
            },
          },
          required: ["id"],
        },
        description: "List of todos to update or set",
      },
    },
    required: ["mode", "todos"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args, ctx) {
    const { mode, todos: inputTodos } = args;

    if (mode === "replace") {
      // Atomic replace: delete + insert in a single transaction block
      const validTodos = inputTodos.filter((t) => t.content && t.status);
      if (validTodos.length === 0) {
        await ctx.sql(`DELETE FROM devx.todos WHERE chat_id = $1`, [ctx.chatId]);
      } else {
        // Delete then insert as separate statements
        await ctx.sql(`DELETE FROM devx.todos WHERE chat_id = $1`, [ctx.chatId]);
        const placeholders = validTodos
          .map((_, i) => `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`)
          .join(", ");
        const params = [ctx.chatId];
        for (const t of validTodos) {
          params.push(t.id, t.content, t.status);
        }
        await ctx.sql(
          `INSERT INTO devx.todos (chat_id, todo_id, content, status) VALUES ${placeholders}`,
          params,
        );
      }
    } else {
      // Merge: upsert each todo
      for (const todo of inputTodos) {
        if (todo.content && todo.status) {
          await ctx.sql(
            `INSERT INTO devx.todos (chat_id, todo_id, content, status)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (chat_id, todo_id) DO UPDATE SET
               content = COALESCE(EXCLUDED.content, devx.todos.content),
               status = COALESCE(EXCLUDED.status, devx.todos.status),
               updated_at = NOW()`,
            [ctx.chatId, todo.id, todo.content, todo.status],
          );
        } else if (todo.status) {
          await ctx.sql(
            `UPDATE devx.todos SET status = $1, updated_at = NOW()
             WHERE chat_id = $2 AND todo_id = $3`,
            [todo.status, ctx.chatId, todo.id],
          );
        } else if (todo.content) {
          await ctx.sql(
            `UPDATE devx.todos SET content = $1, updated_at = NOW()
             WHERE chat_id = $2 AND todo_id = $3`,
            [todo.content, ctx.chatId, todo.id],
          );
        }
      }
    }

    // Fetch current todos and send to client
    const result = await ctx.sql(
      `SELECT todo_id as id, content, status FROM devx.todos
       WHERE chat_id = $1 ORDER BY created_at ASC`,
      [ctx.chatId],
    );
    const currentTodos: AgentTodo[] = result.rows;
    ctx.send({ type: "todos", todos: currentTodos });

    const completed = currentTodos.filter((t) => t.status === "completed").length;
    return `Todos updated (${completed}/${currentTodos.length} completed)`;
  },
};
