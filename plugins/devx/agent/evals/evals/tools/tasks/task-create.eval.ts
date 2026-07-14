import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

// TaskCreate/TaskList (plugins/devx/functions/tools/task_tools.ts) scope
// every row to ctx.chatId (INSERT ... chat_id / SELECT ... WHERE chat_id =
// $1) — same shape as the tools/sql ExecuteSQL gap documented in
// evals/README.md: a plain t.send() turn never populates ToolContext.metadata
// (SendTurnPayload has no metadata field), so ctx.chatId resolves to "" and
// the INSERT fails outright ("invalid input syntax for type uuid: \"\"").
// Worked around identically to tools/sql/execute-sql.eval.ts: POST directly
// to /eve/v1/session with metadata.chatId set to seed.sh's fixture
// devx.chats row (owned by the eval user), then attachSession() to drive
// the rest of the turn through the normal assertion vocabulary. Both
// TaskCreate and TaskList run as tool calls within the SAME turn/request, so
// they see the same ctx.chatId and the created row is visible to the list.
const EVAL_CHAT_ID = "6e6a3b1c-0000-4000-8000-00000000c001";

// Mirrors eve's internal extractCompletedMessage (client/session-utils.js):
// the last message.completed event whose finishReason isn't "tool-calls".
// Needed because EveEvalSession (returned by attachSession()) has no
// `.message` field — only EveEvalTurn (send()/respond()'s return value) does.
function lastAssistantMessage(events: readonly unknown[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as { type?: string; data?: { message?: string; finishReason?: string } };
    if (e?.type === "message.completed" && e.data?.finishReason !== "tool-calls") {
      return e.data?.message;
    }
  }
  return undefined;
}

export default defineEval({
  description: "creates and lists a task with TaskCreate/TaskList",
  async test(t) {
    const res = await t.target.fetch("/eve/v1/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message:
          "Use the TaskCreate tool to create a task titled 'Eval fixture task', then use the TaskList tool to confirm it appears, and reply CONFIRMED if it does.",
        metadata: { chatId: EVAL_CHAT_ID },
      }),
      signal: t.signal,
    });
    if (!res.ok) {
      throw new Error(`session create failed: ${res.status} ${await res.text()}`);
    }
    const { sessionId } = (await res.json()) as { sessionId: string };

    const session = await t.target.attachSession(sessionId);
    session.succeeded();
    session.calledTool("TaskCreate");
    session.calledTool("TaskList");
    t.check(lastAssistantMessage(session.events), includes("CONFIRMED"));
  },
});
