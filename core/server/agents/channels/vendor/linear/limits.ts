// Reimplemented for trex — NO eve source. eve's Linear channel posts Agent
// Activities (`agentActivityCreate`) and defines no comment-length constant
// (its only Linear constant is the default route). The trex Linear channel
// posts comments (`commentCreate`), so it needs a split. The SPLIT ALGORITHM is
// copied from the vendored `github/limits.ts` (prefer a newline boundary past
// the halfway mark, else a space, else a hard cut). The CAP is trex-chosen:
// Linear publishes no hard comment-body limit, so `LINEAR_COMMENT_BODY_MAX_LENGTH`
// is a conservative 64_000 chars — large enough for normal replies, small enough
// to stay well within Linear's practical GraphQL payload limits. See vendor/VENDOR.md.

/** Conservative Linear comment-body chunk size (trex-chosen; eve defines none). */
export const LINEAR_COMMENT_BODY_MAX_LENGTH = 64_000;

/**
 * Splits a reply body into chunks Linear's comment API will accept
 * (<= `LINEAR_COMMENT_BODY_MAX_LENGTH` each), preferring a newline then space
 * boundary past the halfway mark so words/lines are not cut mid-token.
 */
export function splitLinearCommentBody(text: string, max = LINEAR_COMMENT_BODY_MAX_LENGTH): readonly string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const cut = findCommentSplitIndex(rest, max);
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) out.push(rest);
  return out;
}

function findCommentSplitIndex(text: string, max: number): number {
  const nl = text.lastIndexOf("\n", max);
  if (nl > max * 0.5) return nl;
  const sp = text.lastIndexOf(" ", max);
  return sp > max * 0.5 ? sp : max;
}
