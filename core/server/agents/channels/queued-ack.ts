// Wording for the acknowledgement a channel adapter posts when the service
// folds an incoming message into the follow-up queue instead of starting it as
// a second concurrent turn (the `message.queued` event — see
// service/events.ts and startTurn's busy branch in service/handler.ts).
// Without it the human's message appears to vanish until the next turn happens
// to pick it up.
//
// Only the WORDS are shared. Each adapter still owns how it sends: its own
// primitive, its own destination in delivery state, and any platform
// decoration (Discord prefixes an emoji; the plain-text transports don't).

/**
 * The one-line acknowledgement text, minus any platform decoration.
 *
 * `deniedPendingGate` is the distinction that has to survive into the copy: it
 * means the queued message ALSO denied a pending approval gate. The generic
 * "queued, I'll get to it" line would then be actively misleading — it tells
 * the human the ball is in the running turn's court when it is actually back in
 * theirs: the gate is closed and their reply is about to drive the revision.
 */
export function queuedAckText(deniedPendingGate: boolean): string {
  return deniedPendingGate
    ? "Got it — that's more than a plain yes/no, so I'm treating it as feedback: I closed the pending approval and I'll send this to the coder as the revision."
    : "Got it — queued. I'll get to it right after the current step finishes.";
}
