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
//
// The `eve` adapter (adapters/eve.ts) needs nothing from here and defines no
// events map at all: its browser client reads the NDJSON event tail directly,
// so it already receives `message.queued` verbatim and renders it itself.
// Adding a server-composed line there would duplicate what the client shows.

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

// The only non-ASCII character in either variant. On SMS it is the difference
// between one billable segment and three: a single character outside GSM-7
// forces the whole body into UCS-2, which drops the per-segment budget from 160
// septets to 70 code units. The denial variant is 152 characters, so UCS-2 bills
// it as ceil(152/67) = 3 segments; as GSM-7 it is a single segment.
const EM_DASH = "\u2014";

/**
 * The same acknowledgement, rendered so every character is ASCII (and within
 * GSM-7's basic set) by swapping the em dash for a hyphen. Identical copy — this
 * is an encoding concern, not a wording one.
 *
 * For transports that bill per encoding unit. Only twilio.ts uses it; every
 * other adapter takes `queuedAckText` unchanged, so their strings are
 * unaffected. `queued-ack.test.ts` pins the ASCII-only property, because the
 * cost is silently reintroduced by any future copy edit that reaches for a
 * typographic dash, quote, or ellipsis.
 */
export function queuedAckTextGsm7(deniedPendingGate: boolean): string {
  return queuedAckText(deniedPendingGate).replaceAll(EM_DASH, "-");
}
