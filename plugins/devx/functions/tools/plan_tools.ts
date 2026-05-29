// @ts-nocheck - Deno edge function
/**
 * Plan mode tools: questionnaire, write_plan, exit_plan.
 *
 * Questionnaire uses a DB-backed pending_responses table so that the
 * answer POST (which may land on a different worker instance) can resolve
 * the blocking poll in the SSE-stream worker.
 */
import type { ToolDefinition } from "./types.ts";
import { getAppWorkspacePath } from "./workspace.ts";

const POLL_INTERVAL_MS = 500;
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/** Generate a short slug from plan content (first heading or first line) */
function planSlug(content: string): string {
  // Try to extract first heading
  const headingMatch = content.match(/^#+\s+(.+)$/m);
  const title = headingMatch ? headingMatch[1] : content.split("\n")[0] || "plan";
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Write plan content to specs/NN-title.md in the app workspace (best-effort). */
async function writePlanToWorkspace(userId: string, appId: string | null | undefined, content: string) {
  if (!appId) return;
  try {
    const wsPath = getAppWorkspacePath(userId, appId);
    const specsDir = `${wsPath}/specs`;
    await Deno.mkdir(specsDir, { recursive: true });

    // Find the next number
    let maxNum = 0;
    try {
      for await (const entry of Deno.readDir(specsDir)) {
        if (entry.isFile && entry.name.endsWith(".md")) {
          const num = parseInt(entry.name.split("-")[0], 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      }
    } catch { /* empty dir */ }

    const num = String(maxNum + 1).padStart(2, "0");
    const slug = planSlug(content);
    const fileName = `${num}-${slug}.md`;
    await Deno.writeTextFile(`${specsDir}/${fileName}`, content);
  } catch { /* best-effort — workspace may not exist yet */ }
}

/** Resolve a pending questionnaire by writing the answer to the DB */
export async function resolveQuestionnaire(requestId, answers, userId, sql) {
  const result = await sql(
    `UPDATE devx.pending_responses
     SET answer = $1
     WHERE request_id = $2 AND user_id = $3 AND answer IS NULL
     RETURNING request_id`,
    [JSON.stringify(answers), requestId, userId],
  );
  return result.rows.length > 0;
}

/** Clean up pending responses for a chat (called on stream abort) */
export async function clearPendingResponses(chatId, sql) {
  try {
    await sql(
      `DELETE FROM devx.pending_responses WHERE chat_id = $1`,
      [chatId],
    );
  } catch {
    // Best-effort cleanup
  }
}

/** Poll the DB for an answer to a pending response */
async function pollForAnswer(requestId, sql, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await sql(
      `SELECT answer FROM devx.pending_responses WHERE request_id = $1`,
      [requestId],
    );
    if (result.rows.length === 0) {
      // Row was deleted (stream aborted) — treat as no response
      return null;
    }
    if (result.rows[0].answer !== null) {
      // Answer received — clean up and return
      await sql(`DELETE FROM devx.pending_responses WHERE request_id = $1`, [requestId]);
      return result.rows[0].answer;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  // Timeout — clean up
  await sql(`DELETE FROM devx.pending_responses WHERE request_id = $1`, [requestId]);
  return null;
}

export const planningQuestionnaireTool: ToolDefinition<{
  questions: Array<{
    id: string;
    type: "text" | "radio" | "checkbox";
    label: string;
    options?: string[];
  }>;
}> = {
  name: "AskUserQuestion",
  description:
    "Ask the user clarifying questions during planning. Supports text input, radio (single choice), and checkbox (multiple choice) question types. Blocks until the user answers.",
  parameters: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique identifier for this question" },
            type: { type: "string", enum: ["text", "radio", "checkbox"], description: "Question type" },
            label: { type: "string", description: "The question text" },
            options: {
              type: "array",
              items: { type: "string" },
              description: "Options for radio/checkbox questions",
            },
          },
          required: ["id", "type", "label"],
        },
        description: "Questions to ask the user",
      },
    },
    required: ["questions"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args, ctx) {
    const requestId = crypto.randomUUID();

    // Insert pending row (answer = NULL means waiting)
    await ctx.sql(
      `INSERT INTO devx.pending_responses (request_id, chat_id, user_id, kind)
       VALUES ($1, $2, $3, 'questionnaire')`,
      [requestId, ctx.chatId, ctx.userId],
    );

    // Send questionnaire to client
    ctx.send({ type: "questionnaire", requestId, questions: args.questions });

    // Poll DB until answer arrives or timeout
    const answers = await pollForAnswer(requestId, ctx.sql);

    if (!answers) {
      return "User did not respond to the questionnaire.";
    }

    return `User answers:\n${JSON.stringify(answers, null, 2)}`;
  },
};

export const writePlanTool: ToolDefinition<{ content: string }> = {
  name: "WritePlan",
  description:
    "Write or update the implementation plan for this conversation. The plan content should be markdown. This stores the plan and displays it to the user in the Plan tab.",
  parameters: {
    type: "object",
    properties: {
      content: { type: "string", description: "Plan content in markdown format" },
    },
    required: ["content"],
  },
  defaultConsent: "always",
  modifiesState: true,

  async execute(args, ctx) {
    // Upsert plan for this chat
    await ctx.sql(
      `INSERT INTO devx.plans (chat_id, content, status)
       VALUES ($1, $2, 'draft')
       ON CONFLICT (chat_id) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [ctx.chatId, args.content],
    );

    // Write plan to specs/plan.md in the app workspace
    await writePlanToWorkspace(ctx.userId, ctx.appId, args.content);

    // Notify client
    ctx.send({ type: "plan_update", content: args.content });

    return "Plan written and displayed to user.";
  },
};

export const exitPlanTool: ToolDefinition<{ confirmation: boolean }> = {
  name: "ExitPlanMode",
  description:
    "Exit plan mode and switch to implementation. Call this when the plan is finalized and the user has accepted it. The chat mode will switch from 'plan' to 'agent'.",
  parameters: {
    type: "object",
    properties: {
      confirmation: {
        type: "boolean",
        description: "Set to true to confirm exiting plan mode",
      },
    },
    required: ["confirmation"],
  },
  defaultConsent: "always",
  modifiesState: true,

  async execute(args, ctx) {
    if (!args.confirmation) {
      return "Plan mode exit cancelled.";
    }

    // Update plan status
    await ctx.sql(
      `UPDATE devx.plans SET status = 'accepted', updated_at = NOW() WHERE chat_id = $1`,
      [ctx.chatId],
    );

    // Write the accepted plan to specs/plan.md in the app workspace
    try {
      const planResult = await ctx.sql(
        `SELECT content FROM devx.plans WHERE chat_id = $1`,
        [ctx.chatId],
      );
      if (planResult.rows.length > 0 && planResult.rows[0].content) {
        await writePlanToWorkspace(ctx.userId, ctx.appId, planResult.rows[0].content);
      }
    } catch { /* best-effort */ }

    // Switch chat mode to agent
    await ctx.sql(
      `UPDATE devx.chats SET mode = 'agent', updated_at = NOW() WHERE id = $1`,
      [ctx.chatId],
    );

    ctx.send({ type: "plan_exit", mode: "agent" });

    return "Plan accepted. Chat mode switched to agent for implementation.";
  },
};
