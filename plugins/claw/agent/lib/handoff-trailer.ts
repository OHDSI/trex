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

const TRAILER_RE = /\n?\s*<handoff\b([^>]*)\/?>\s*$/;

function attr(raw: string, name: string): string | undefined {
  const m = new RegExp(`${name}="([^"]*)"`).exec(raw);
  const v = m?.[1]?.trim();
  return v ? v : undefined;
}

function list(raw: string, name: string): string[] | undefined {
  const v = attr(raw, name);
  if (v === undefined) return new RegExp(`${name}="`).test(raw) ? [] : undefined;
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
