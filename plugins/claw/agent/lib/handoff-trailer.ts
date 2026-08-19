// The coder ends every channel-driven reply with a one-line machine block, so
// claw reads facts instead of inferring them from prose (and stops burning a
// round trip asking for the saved path or whether it actually tested).
export interface HandoffTrailer {
  track?: "light" | "full";
  saved?: string;
  tests?: string;
  blocked?: string;
  needs?: string;
  done?: string[];
  remaining?: string[];
}

// Non-greedy but end-anchored: [^>]* would let a `>` embedded inside an
// attribute value (e.g. blocked="needs decision: A > B") terminate the match
// early, dropping the whole trailer and leaving the raw markup in the
// channel-facing body — the exact failure this feature exists to prevent.
// [\s\S]*? still can't cross the true closing `/>` because \s*$ after it only
// succeeds once the rest of the string is whitespace, which the interior `>`
// case never satisfies (there's always more attribute text after it).
const TRAILER_RE = /\n?\s*<handoff\b([\s\S]*?)\/?>\s*$/;

// Anchored on a preceding boundary (start-of-string or whitespace) so a name
// that happens to be a suffix of another attribute's name (e.g. a future
// "remaining" vs. hypothetical "sub-remaining") can't match inside it.
function attr(raw: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(raw);
  const v = m?.[1]?.trim();
  return v ? v : undefined;
}

function list(raw: string, name: string): string[] | undefined {
  const v = attr(raw, name);
  if (v === undefined) return new RegExp(`(?:^|\\s)${name}="`).test(raw) ? [] : undefined;
  return v.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

export function parseTrailer(reply: string): { trailer: HandoffTrailer | null; body: string } {
  const m = TRAILER_RE.exec(reply);
  if (!m) return { trailer: null, body: reply };
  const raw = m[1];
  const track = attr(raw, "track");
  return {
    trailer: {
      ...(track === "light" || track === "full" ? { track } : {}),
      ...(attr(raw, "saved") ? { saved: attr(raw, "saved") } : {}),
      ...(attr(raw, "tests") ? { tests: attr(raw, "tests") } : {}),
      ...(attr(raw, "blocked") ? { blocked: attr(raw, "blocked") } : {}),
      ...(attr(raw, "needs") ? { needs: attr(raw, "needs") } : {}),
      ...(list(raw, "done") ? { done: list(raw, "done") } : {}),
      ...(list(raw, "remaining") ? { remaining: list(raw, "remaining") } : {}),
    },
    body: reply.slice(0, m.index).trimEnd(),
  };
}
