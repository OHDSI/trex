// Plain-text matching helpers for a busy or gated session's reply.
//
// matchGateText (Task 3, claw-devx-reliability): 27 of 43 approval gates
// (63%) were never clicked — the human answered by typing "approve" in the
// thread instead, and the button-only resume path never saw it. This maps a
// SHORT thread message onto the pending gate's vocabulary. Deliberately
// conservative: only a message that is essentially just the decision counts,
// so "yes but first explain…" still starts a normal turn rather than
// silently approving a plan. Consumed by channels/layer.ts's resume() MODE B
// (by token, single pending), which supplies the pending gate's options.
//
// This file used to also export `isStatusPing` — implemented, tested, but
// never wired to an immediate reply anywhere (Task 4's architectural move to
// store.getRunningTurn/queueFollowUp stranded it; the generic queued-ack
// already covers the user need). Deleted rather than left as a trap for a
// future caller to half-wire.

export type GateMatch =
  | { kind: "approve" }
  | { kind: "deny" }
  | { kind: "option"; optionId: string };

const APPROVE = ["approve", "approved", "approve it", "go ahead", "go", "yes", "yep", "yeah", "ok", "okay", "ok go", "ship it", "ship", "lgtm", "do it", "proceed", "continue"];
const DENY = ["no", "nope", "stop", "hold", "hold on", "wait", "deny", "denied", "not yet", "cancel", "abort"];

const MAX_DECISION_WORDS = 4;

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/[.!,]+$/g, "").replace(/\s+/g, " ");
}

// Strips the wrapper blocks a channel adapter composes around the human's
// actual words before they ever reach matchGateText. Discord's inbound
// message for a thread-turn (adapters/discord.ts's sendToThread call) is
// `[contextBlock, attachmentsBlock, text].join("\n\n")`, so by the time the
// busy branch in service/handler.ts sees it, it is always a
// `<discord_context>` block (~40 words, well past MAX_DECISION_WORDS) plus an
// optional `<attachments>` block, wrapped around the reply.
//
// The `mention-in-thread` trigger (adapters/discord.ts:866-869) composes a
// THIRD block into the same message — `formatMessagesBlock("thread_messages",
// history)`, up to 50 lines of past conversation (discord-messages.ts's
// formatMessagesBlock) — and reuses the same continuation token as
// thread-turn, so it can land on the very same session/pending gate. That
// history block is full of ordinary conversational yes/no/ok words that have
// nothing to do with the CURRENT reply, so it must be stripped too, or a
// stale exchange in the history — not the human's actual current words — can
// trip looksLikeGateResponse. `mention-in-channel`'s `<channel_messages>`
// variant of the same block is stripped for the same reason, even though
// that trigger always creates a fresh thread/session (no pending gate can
// exist there yet) — belt and suspenders costs nothing here.
//
// Only the human's words after stripping all four blocks are meaningful for
// judging whether the CURRENT message is about the pending gate at all.
function stripComposedWrapper(text: string): string {
  return text
    .replace(/<discord_context>[\s\S]*?<\/discord_context>/g, " ")
    .replace(/<attachments>[\s\S]*?<\/attachments>/g, " ")
    .replace(/<thread_messages>[\s\S]*?<\/thread_messages>/g, " ")
    .replace(/<channel_messages>[\s\S]*?<\/channel_messages>/g, " ")
    .trim();
}

function containsWholeWord(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(haystack);
}

// The busy branch in service/handler.ts denies a pending gate when the
// incoming reply doesn't cleanly resolve it (matchGateText -> null), on the
// theory that a QUALIFIED answer like "yes but first explain why the chunk
// count is wrong" must not be stranded behind its own gate for the rest of
// the approval poll. But
// matchGateText(asText(message), ...) is fed the composed message, which for
// the only adapter that reaches this path (Discord) is ALWAYS wrapped in a
// <discord_context> block — so matchGateText returns null for every message,
// decision or not, and the old guard denied the gate on ANY chatter in the
// thread ("fyi @alice is out today", a stray emoji, a side note to a
// teammate), not just on qualified answers.
//
// looksLikeGateResponse is the missing predicate: after stripping the
// composed wrapper, does the human's actual text look like it's ANSWERING
// the gate at all (containing approve/deny vocabulary, or an option's
// label/id when the gate has options)? It is deliberately looser than
// matchGateText — a qualified "yes but…" must count — but still requires the
// text to be plausibly ABOUT the decision, not just any message that happens
// to land while a gate is open.
export function looksLikeGateResponse(
  text: string,
  options?: Array<{ id: string; label: string }>,
): boolean {
  const stripped = stripComposedWrapper(text);
  const t = normalize(stripped);
  if (!t) return false;

  for (const phrase of [...APPROVE, ...DENY]) {
    if (containsWholeWord(t, phrase)) return true;
  }

  if (options?.length) {
    for (const o of options) {
      const label = normalize(o.label).replace(/\s*[—-]\s*.*$/, "");
      for (const token of [normalize(o.id), label]) {
        if (token && containsWholeWord(t, token)) return true;
      }
    }
  }

  return false;
}

export function matchGateText(
  text: string,
  options?: Array<{ id: string; label: string }>,
): GateMatch | null {
  const t = normalize(text);
  if (!t) return null;

  if (options?.length) {
    for (const o of options) {
      const label = normalize(o.label).replace(/\s*[—-]\s*.*$/, "");
      if (t === normalize(o.id) || t === normalize(o.label) || t === label) {
        return { kind: "option", optionId: o.id };
      }
    }
    // "no checks open pr" / "skip reviews" resolve a checks menu that has a
    // none-style option; the phrasing came straight from the real transcripts.
    const none = options.find((o) => normalize(o.id) === "none" || normalize(o.label).startsWith("none"));
    if (none && /^(no checks?|skip (the )?(checks?|reviews?)|none)\b/.test(t)) {
      return { kind: "option", optionId: none.id };
    }
  }

  // Only treat SHORT messages as bare decisions — a long sentence carries
  // qualifications the agent must read.
  if (t.split(" ").length > MAX_DECISION_WORDS) return null;
  if (APPROVE.includes(t)) return { kind: "approve" };
  if (DENY.includes(t)) return { kind: "deny" };
  return null;
}
