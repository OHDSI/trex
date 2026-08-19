// Plain-text matching helpers for a busy or gated session's reply.
//
// isStatusPing (Task 4, claw-devx-reliability): a message that only asks
// whether the agent is still working must never itself start a turn — doing
// so was part of why 43 of 263 turns (16%) started while the previous turn on
// the same session was still running. Callers answer a status ping from live
// state (store.getRunningTurn) instead.
//
// matchGateText (Task 3, not yet implemented): will resolve a plain-text
// reply against a session's single pending approval gate (store's
// getSinglePendingApproval) — e.g. a postChoice option's id/label. Left as a
// seam here; this task does not implement it.

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
