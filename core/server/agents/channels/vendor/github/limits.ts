// Vendored from eve@0.19.0 dist/src/public/channels/github/limits.js
// (Apache-2.0), de-minified. PURE — no imports. The comment-body split (prefer a
// newline boundary past the halfway point, else a space, else a hard cut) and the
// 65536-char GitHub comment cap are eve's, unchanged. See vendor/VENDOR.md.

/** GitHub's maximum issue/PR comment body length. */
export const GITHUB_COMMENT_BODY_MAX_LENGTH = 65536;

/**
 * Splits a reply body into chunks GitHub's comment API will accept
 * (<= `GITHUB_COMMENT_BODY_MAX_LENGTH` each), preferring a newline then space
 * boundary past the halfway mark so words/lines are not cut mid-token.
 */
export function splitGitHubCommentBody(text: string, max = GITHUB_COMMENT_BODY_MAX_LENGTH): readonly string[] {
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
