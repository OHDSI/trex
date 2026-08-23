// Stream event vocabulary, reconciled against real eve (npm `eve@0.19.0`,
// see COMPAT.md). Verified two ways: eve's *public* docs
// (docs/concepts/sessions-runs-and-streaming.md — event names, high-level
// semantics) AND, because the docs undersell how strict the wire shape
// actually is, eve's bundled client source
// (dist/src/protocol/message.js's create*Event() builders and
// dist/src/evals/runner/derive-run-facts.js, which is what `eve eval`'s
// `t.calledTool()`/`t.succeeded()` actually read off the stream) — live
// end-to-end against the real `eve eval` CLI (see COMPAT.md's e2e section).
//
// Every eve event is `{ type, data }` — NOT flat fields on the event
// itself. This file mirrors that envelope and the `data` shapes eve's own
// client code destructures (`actions[].kind/callId/toolName/input`,
// `result.kind/callId/toolName/output`, `messageSoFar`, etc.), not just the
// prose event names. We implement the core turn/message/action/session
// lifecycle eve documents, and additively extend `actions.requested`'s
// action items with `clientOnly` so a frontend can tell a client-rendered
// proposal card from a server-executed tool call. We do NOT implement eve's
// full vocabulary (subagent.*, compaction.*, authorization.*, reasoning.*,
// step.*) — see COMPAT.md for the exact list and why.
//
// message.completed IS implemented (added after a live `eve eval --url` run
// against a real eve target proved it load-bearing, not cosmetic): eve's own
// client (`#client/session-utils.js`'s `extractCompletedMessage`, which
// backs `t.reply` and the `includes()`/`messageIncludes` eval assertion)
// only reads the final assistant text off a `message.completed` event whose
// `finishReason !== "tool-calls"` — it never falls back to
// `message.appended`'s `messageSoFar`. Without it, `t.reply` is always
// `null` and any eval asserting on reply text fails even though the turn
// completed successfully and the text was streamed. See COMPAT.md's
// eve-eval section for the exact run that surfaced this.
//
// session.waiting / session.failed ARE included despite the smaller
// vocabulary, even though we have no multi-turn "parked" durability: eve's
// own client (`MessageResponse.result()`) ends its per-turn read
// specifically on session.waiting, session.completed, or session.failed —
// NOT on turn.completed/turn.failed (confirmed in derive-run-facts.js's
// `TURN_EPILOGUE_EVENT_TYPES`). Without one of those three, a real eve
// client (including `eve eval`) hangs forever after a turn finishes. We
// emit session.waiting right after a successful turn.completed (our "turn
// ended, ready for the next message" is eve's "session parked between
// turns") and session.failed right after turn.failed. We never emit
// session.completed (no concept of a session reaching a terminal,
// non-resumable end).

export interface ActionRequestItem {
  kind: "tool-call";
  callId: string;
  toolName: string;
  input: unknown;
  clientOnly?: boolean; // additive, not part of eve's shape — see COMPAT.md
}

export interface ActionResultData {
  kind: "tool-result";
  callId: string;
  toolName: string;
  output: unknown;
}

export interface InputRequestItem {
  requestId: string;
  action: { kind: "tool-call"; callId: string; toolName: string; input: unknown };
}

export type AgentEvent =
  | { type: "turn.started"; data: { turnId: string; sequence: number } }
  | { type: "message.appended"; data: { turnId: string; messageDelta: string; messageSoFar: string } }
  | { type: "message.completed"; data: { turnId: string; message: string; finishReason: string } }
  | { type: "actions.requested"; data: { turnId: string; actions: ActionRequestItem[] } }
  | { type: "action.result"; data: { turnId: string; result: ActionResultData; status: "completed" | "failed" } }
  | { type: "input.requested"; data: { turnId: string; requests: InputRequestItem[] } }
  // usage/finishReason are additive here (eve puts them on step.completed,
  // which we don't implement — see COMPAT.md) rather than turn.completed.
  | { type: "turn.completed"; data: { turnId: string; usage?: { inputTokens?: number; outputTokens?: number }; finishReason?: string } }
  | { type: "turn.failed"; data: { turnId: string; message: string } }
  | { type: "session.waiting"; data: { wait: "next-user-message" } }
  | { type: "session.failed"; data: { sessionId: string; message: string } }
  // Trex extension (not part of eve's documented vocabulary — see
  // COMPAT.md): an authored tool's ToolContext.emit(name, data) call,
  // published verbatim as `{name, payload: data}`. Persisted as an
  // `agents.steps` row with `kind: 'custom'` (runner.ts's toolEmit; the
  // steps.kind CHECK constraint was widened for this in
  // migrations/V2__custom_steps.sql), so — unlike turn.started/
  // input.requested/session.waiting/session.failed above — this one IS
  // replayable (handler.ts's stepToEvent maps a `custom` step straight back
  // to `tool.event`).
  | { type: "tool.event"; data: { name: string; payload: unknown } }
  // Trex extension (not part of eve's documented vocabulary): fired when
  // startTurn folds a message into the follow-up queue instead of starting it
  // as a second concurrent turn on a busy session, so a channel adapter with a
  // live delivery subscription can acknowledge receipt instead of the message
  // silently vanishing until the next turn happens to fold it in. Turn-agnostic
  // (no turnId) and live-only — not persisted/replayed — same posture as
  // session.waiting/session.failed above.
  //
  // `deniedPendingGate` is set when the queued message ALSO denied a pending
  // approval gate (handler.ts's startTurn resolves it before queueing). It
  // changes what the acknowledgement can truthfully say: the generic "queued,
  // I'll get to it" line implies the ball is still in the running turn's court,
  // when a denied gate puts it back in the human's — the gate is closed and
  // their reply is about to drive the revision. Optional so a publisher that
  // never checks a gate can omit it (absent === false).
  | { type: "message.queued"; data: { text: string; deniedPendingGate?: boolean } };
