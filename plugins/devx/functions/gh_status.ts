// Pure parsers for `gh auth status` output.
//
// Deliberately a leaf module: routes/github_routes.ts owns the OAuth device
// flow and re-exports these, but chat_branch.ts needs only the account name to
// build a branch — importing the route module for that would pull the whole
// GitHub route surface into the coder's start-up path.

/**
 * Narrow `gh auth status` output to the active account's block.
 *
 * `gh` can hold several accounts for one host and prints a
 * "Logged in to <host> account <name>" block for each, distinguished only by a
 * following "Active account: true|false" line. The active one is the
 * credential every other `gh` invocation will actually use, and it is not
 * necessarily printed first — so reporting the first block would name an
 * account whose token nothing uses. Falls back to the whole text for
 * single-account output, which carries no "Active account" line at all.
 */
function activeAccountBlock(text: string): string {
  const blocks = text.split(/(?=Logged in to )/);
  return blocks.find((b) => /Active account:\s*true/i.test(b)) || text;
}

/** Parse the active account from `gh auth status` output. */
export function parseGhAccount(text: string): string | null {
  const source = activeAccountBlock(text);
  const match = source.match(/Logged in to \S+ account (\S+)/i) ||
    source.match(/Logged in to \S+ as (\S+)/i) ||
    source.match(/\baccount\s+(\S+)/i);
  return match ? match[1] : null;
}

/** Parse the active account's `Token scopes: 'a', 'b'` line. */
export function parseGhScopes(text: string): string | null {
  const match = activeAccountBlock(text).match(/Token scopes:\s*(.+)/i);
  if (!match) return null;
  return match[1].trim().replace(/['"]/g, "") || null;
}
