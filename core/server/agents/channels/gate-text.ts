// Plain-text matching helpers for a busy or gated session's reply.
//
// isStatusPing (Task 4, claw-devx-reliability): a message that only asks
// whether the agent is still working must never itself start a turn — doing
// so was part of why 43 of 263 turns (16%) started while the previous turn on
// the same session was still running. Callers answer a status ping from live
// state (store.getRunningTurn) instead.
//
// matchGateText (Task 3, claw-devx-reliability): 27 of 43 approval gates
// (63%) were never clicked — the human answered by typing "approve" in the
// thread instead, and the button-only resume path never saw it. This maps a
// SHORT thread message onto the pending gate's vocabulary. Deliberately
// conservative: only a message that is essentially just the decision counts,
// so "yes but first explain…" still starts a normal turn rather than
// silently approving a plan. Consumed by channels/layer.ts's resume() MODE B
// (by token, single pending), which supplies the pending gate's options.

const STATUS_PINGS = [
  /^status\??$/,
  /^any (update|progress)\??$/,
  /^(are you )?(still )?(working|on it|there|online)\??$/,
  /^update\??$/,
];

export function isStatusPing(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, "");
  return STATUS_PINGS.some((re) => re.test(t));
}

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
