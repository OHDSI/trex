import type { EveEvalContext, EveEvalSession } from "eve/evals";

// Mode filtering (plugins/devx/agent/agent.ts's filterTools hook, :164-195)
// keys off `metadata.mode` — a raw HTTP request field, not something eve's
// session driver can carry. Same structural gap already documented for
// tools/sql/execute-sql.eval.ts and tools/tasks/task-create.eval.ts:
// `t.send()`'s `SendTurnPayload` has no `metadata` field at all (only
// message/inputResponses/clientContext/outputSchema/continuationToken —
// `clientContext` is a different channel, rendered as an injected user-role
// message, never surfaced as `ToolContext.metadata`). So a plain `t.send()`
// turn always resolves `ctx.metadata` to nothing and mode filtering can never
// be exercised through it.
//
// An earlier draft of this helper used a standalone, unauthenticated
// `fetch(BASE + ...)` (mirroring a plan-stage brief written before the
// live target's auth requirement was discovered) — that 401s against the
// live dx stack (`pluginAuthz` rejects anonymous requests, and the devx
// agent additionally refuses anonymous turns). Fixed by driving the turn
// through the same two documented, supported `EveEvalTargetHandle` members
// execute-sql.eval.ts/task-create.eval.ts already use instead:
//
//   1. `t.target.fetch(...)` — "Authenticated fetch against the target base
//      URL" per eve's own type doc comment; carries EVE_EVAL_AUTH_TOKEN
//      automatically and posts straight to the raw HTTP route with a
//      `metadata` field the `ClientSession` wrapper would otherwise strip.
//   2. `t.target.attachSession(sessionId)` — attaches to the resulting
//      session and returns a full `EveEvalSession` wired into the same
//      assertion collector as the eval's primary session, so
//      succeeded()/calledTool()/notCalledTool()/usedNoTools() all work
//      exactly as they would off `t.send()`.
export async function sendWithMode(
  t: EveEvalContext,
  message: string,
  mode: "ask" | "plan" | "build",
): Promise<EveEvalSession> {
  const res = await t.target.fetch("/eve/v1/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, metadata: { mode } }),
    signal: t.signal,
  });
  if (!res.ok) {
    throw new Error(`session create failed: ${res.status} ${await res.text()}`);
  }
  const { sessionId } = (await res.json()) as { sessionId: string };
  return t.target.attachSession(sessionId);
}

// Mirrors eve's internal extractCompletedMessage (client/session-utils.js):
// the last message.completed event whose finishReason isn't "tool-calls".
// Needed because EveEvalSession (returned by attachSession()) has no
// `.message` field — only EveEvalTurn (send()/respond()'s return value)
// does. Identical to the private helper duplicated in execute-sql.eval.ts
// and task-create.eval.ts; shared here since three of the four mode evals
// need it.
export function lastAssistantMessage(events: readonly unknown[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as { type?: string; data?: { message?: string; finishReason?: string } };
    if (e?.type === "message.completed" && e.data?.finishReason !== "tool-calls") {
      return e.data?.message;
    }
  }
  return undefined;
}

// DatabaseSchema (plugins/devx/functions/tools/get_database_schema.ts) takes
// `app_id` as an explicit tool argument — no ctx.chatId/ownership check —
// and is read-only (`modifiesState: false`, `defaultConsent: "always"`, so
// no sticky `agents.tool_consents` row is needed regardless of mode). It is
// used deliberately across ask-blocks-mutation.eval.ts and
// plan-restricted.eval.ts as the probe for "a non-mutating tool that plan
// mode's allowlist still excludes": grepping agent.ts's PLAN_MODE_TOOLS
// (:23-31, verified to match this source directly before writing these
// evals) shows DatabaseSchema is NOT a member, so plan mode blocks it
// exactly like a mutating tool would, while ask mode (which only drops
// `modifiesState`/`agent`) and the framework default both allow it. Without
// this probe, an "ask vs. plan" pair of evals that only ever tries
// Read+Write would pass identically under either mode's real semantics AND
// under a buggy "ask mode == plan mode" implementation — this is what makes
// the distinction non-vacuous. Same fixture app id seed.sh seeds for the
// tools/sql family (plugins/devx/agent/evals/seed.sh).
export const EVAL_APP_ID = "6e6a3b1c-0000-4000-8000-00000000a001";
