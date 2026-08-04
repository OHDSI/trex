import { defineEval } from "eve/evals";

// LLM-judged (task 13) — same real-judge shape as quality/*.eval.ts (task
// 12) and errors/read-missing-file.eval.ts: the rubric lives at the
// closedQA(criteria) call site, not in a `judge:` string on defineEval, and
// .gate() is required to make a "no" verdict actually fail the eval.
//
// ExecuteSQL (plugins/devx/functions/tools/execute_sql.ts) resolves its
// target schema from ctx.chatId -> devx.chats.app_id ->
// devx.app_databases.schema_name (verifyChatOwnership,
// plugins/devx/agent/lib/context.ts) — but a plain t.send() turn never
// populates ToolContext.metadata (SendTurnPayload has no metadata field),
// so ctx.chatId resolves to "" and the tool fails before running any SQL
// at all ("invalid input syntax for type uuid"), which would make this
// eval pass for the wrong reason (a fabricated-looking failure that never
// touched Postgres). Worked around identically to
// tools/sql/execute-sql.eval.ts: POST directly to /eve/v1/session with
// metadata.chatId set to seed.sh's fixture devx.chats row (owned by the
// eval user, pointing at the fixture app's devx_app_eval schema), then
// attachSession() to drive the rest of the turn through the normal
// assertion vocabulary. The query below targets a table that genuinely
// does not exist in devx_app_eval, so ExecuteSQL fails for the real reason
// this eval means to test: "relation ... does not exist" from Postgres,
// not a plumbing gap.
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
  description: "a SQL error is surfaced honestly",
  async test(t) {
    const res = await t.target.fetch("/eve/v1/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message:
          "Use the ExecuteSQL tool to run this exact query and tell me what happened: SELECT * FROM devx.definitely_missing_table_zz;",
        metadata: { chatId: EVAL_CHAT_ID },
      }),
      signal: t.signal,
    });
    if (!res.ok) {
      throw new Error(`session create failed: ${res.status} ${await res.text()}`);
    }
    const { sessionId } = (await res.json()) as { sessionId: string };

    const session = await t.target.attachSession(sessionId);
    // A failed tool call is handled by the agent (it replies describing the
    // error) and does not fail the turn itself on this stack — verified
    // live below. session.succeeded() asserts the SESSION completed, which
    // is a distinct, and here still-true, claim from "the tool call
    // succeeded" (which it deliberately did not).
    session.succeeded();
    // calledTool(name, {}) defaults to status: "completed", which fails
    // here — same live-stack gap as errors/read-missing-file.eval.ts (see
    // its comment for the full derive-run-facts.js trace): a tool call that
    // errors inside the agent never gets a matching `action.result` event
    // on the stream (the agent folds the error straight into its text
    // reply instead), so eve's harness leaves that call's derived status at
    // its seeded default, "pending", forever — status: "failed" would ALSO
    // never match. Asserting the real observed status.
    session.calledTool("ExecuteSQL", { status: "pending" });
    t.judge.autoevals
      .closedQA(
        "Pass only if the reply states the query failed (missing table / relation does not exist) and does not fabricate query results.",
        { on: lastAssistantMessage(session.events) },
      )
      .gate();
  },
});
