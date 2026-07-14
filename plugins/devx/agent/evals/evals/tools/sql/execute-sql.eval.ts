import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

// ExecuteSQL (plugins/devx/functions/tools/execute_sql.ts) scopes every
// query to one app's own devx_app_* Postgres schema, resolved via
// ctx.chatId -> devx.chats.app_id -> devx.app_databases.schema_name
// (plugins/devx/agent/lib/context.ts toDevxCtx/verifyChatOwnership).
// ctx.chatId is populated from the raw HTTP request's top-level
// `metadata.chatId` field (core/server/agents/service/handler.ts's
// `/eve/v1/session` route reads `body.metadata` directly) — but eve's
// eval-harness `t.send()` never sends a `metadata` field at all.
// `SendTurnPayload` (node_modules/eve/dist/src/client/types.d.ts) only
// carries message/inputResponses/clientContext/outputSchema/
// continuationToken, and `clientContext` is a different channel entirely
// (rendered as an injected user-role context message, never surfaced on
// ToolContext.metadata — confirmed in
// node_modules/eve/dist/src/client/session.js's createHandleMessageBody).
// So a plain `t.send()` turn always resolves ctx.chatId to "" and
// ExecuteSQL fails before running any SQL
// ("invalid input syntax for type uuid: \"\"").
//
// Worked around with the target handle's lower-level primitives instead
// of the session driver: `t.target.fetch()` posts directly to the eve
// session route with a `metadata.chatId` matching seed.sh's fixture
// devx.chats row (owned by the eval user, pointing at the fixture app's
// devx_app_eval schema), then `t.target.attachSession()` attaches to the
// resulting session and reads the turn — both are documented, supported
// EveEvalTargetHandle members (not an eve internals hack), and the
// returned EveEvalSession carries the full assertion vocabulary
// (succeeded/calledTool/etc.) same as a t.send() turn would. Verified live
// via a raw curl POST + stream read before writing this file: the tool
// call's actual output was "answer\n------\n42" (real SQL execution
// against the fixture schema, not the model doing arithmetic in text).
const EVAL_CHAT_ID = "6e6a3b1c-0000-4000-8000-00000000c001";

// `session.events` (EveEvalSessionDriver's one documented event accessor) is
// the only public surface exposing the final assistant text once a session
// is driven via attachSession() rather than send() — there is no `.message`
// on EveEvalSession itself (that field only exists on EveEvalTurn, which
// send()/respond() return). Mirrors eve's own internal
// `extractCompletedMessage`/`isFinalMessageCompleted`
// (node_modules/eve/dist/src/client/session-utils.js): the last
// "message.completed" event whose finishReason isn't "tool-calls".
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
  description: "runs a query with the ExecuteSQL tool",
  async test(t) {
    const res = await t.target.fetch("/eve/v1/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message:
          "Use the ExecuteSQL tool to run this exact query and reply with the value it returns: SELECT 41 + 1 AS answer;",
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
    session.calledTool("ExecuteSQL");
    t.check(lastAssistantMessage(session.events), includes("42"));
  },
});
