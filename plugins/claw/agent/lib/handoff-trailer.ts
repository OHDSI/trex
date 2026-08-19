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
  // The FULL-track triggers the coder named in step 5 (a subset of
  // 'new subsystem' | 'schema change' | 'multiple components' |
  // 'design space' — see prompts_channel.ts's
  // <reply_contract>), so step 6's "gate the spec before the plan" exception
  // can key off a machine-readable fact instead of re-reading the coder's
  // prose for the literal label strings.
  triggers?: string[];
}

// Anchored on the LAST "<handoff" in the reply, then matched forward from
// there to the end of the string. Two bugs shaped this design:
//
// A bounded [^>]* class let a `>` embedded inside an attribute value (e.g.
// blocked="needs decision: A > B") terminate the match early, dropping the
// whole trailer and leaking the raw markup into the channel-facing body.
// Fixed by widening the capture to [\s\S]*?.
//
// With a whole-string regex, that widened [\s\S]*? was free to start
// matching at the FIRST "<handoff"-shaped substring (e.g. a decoy the coder
// quotes while explaining the trailer format, or pastes from a prior reply
// inside a fenced code block) and stretch non-greedily to whatever "/?>\s*$"
// it could reach — silently taking facts from the decoy instead of the real
// trailer at the end, and truncating the body back to before the decoy.
// lastIndexOf + a regex anchored with ^ (not a bare scan) fixes this by
// construction: there is only one "<handoff" candidate to test — the last
// one — and it only counts as a trailer if the rest of the string, from that
// exact point, is the tag itself plus trailing whitespace. Earlier
// occurrences are never candidates at all, so they can't win and can't be
// truncated away.
function matchTrailer(reply: string): { raw: string; index: number } | null {
  const idx = reply.lastIndexOf("<handoff");
  if (idx === -1) return null;
  const m = /^<handoff\b([\s\S]*?)\/?>\s*$/.exec(reply.slice(idx));
  if (!m) return null; // real text (or another decoy) after it -> not a trailer
  return { raw: m[1], index: idx };
}

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
  const found = matchTrailer(reply);
  if (!found) return { trailer: null, body: reply };
  const { raw, index } = found;
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
      ...(list(raw, "triggers") ? { triggers: list(raw, "triggers") } : {}),
    },
    body: reply.slice(0, index).trimEnd(),
  };
}
