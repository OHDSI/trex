// The per-review-type tool allowlists security_routes.ts declares on the eve
// session row. Extracted so a test can assert the tools a route allowlists are
// the tools the turn actually gets — importing security_routes.ts for that
// pulls duckdb and the whole route surface with it.

export const CODE_REVIEW_TOOLS: readonly string[] = [
  "Read", "Glob", "Grep", "CodeSearch", "GitDiff", "GitLog", "GitStatus",
];

export const SECURITY_REVIEW_TOOLS: readonly string[] = [
  "Read", "Glob", "Grep", "CodeSearch", "GitDiff", "GitLog", "GitStatus",
];

// Screenshot lets a QA finding carry visual evidence; without it a bug report is
// prose only. BrowserEvaluate doubles as the console/pageerror capture channel.
export const QA_REVIEW_TOOLS: readonly string[] = [
  "BrowserNavigate", "BrowserClick", "BrowserFill", "BrowserGetText", "BrowserEvaluate",
  "BrowserScreenshot",
  "Read", "Glob", "Grep", "GitDiff",
];

// BrowserEvaluate is what makes the design review measurable rather than impressionistic:
// it can read computed styles (font stacks, contrast, touch-target sizes) and resize the
// viewport, without which the Responsive Design category cannot be honestly assessed.
export const DESIGN_REVIEW_TOOLS: readonly string[] = [
  "BrowserNavigate", "BrowserClick", "BrowserScreenshot", "BrowserGetText", "BrowserEvaluate",
  "Read", "Glob", "Grep", "GitDiff",
];

// The one agent here that WRITES: it adds/updates pages in the app's
// documentation website (d2e: docs/website), so it needs Write/Edit/SearchReplace
// on top of the explore set the code review uses.
export const DOCS_UPDATE_TOOLS: readonly string[] = [
  "Read", "Glob", "Grep", "CodeSearch", "GitDiff", "GitLog", "GitStatus",
  "Write", "Edit", "SearchReplace",
];

/** Every review type, keyed by its devx.agent_results.result_type. */
export const REVIEW_TOOLSETS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "security-review": SECURITY_REVIEW_TOOLS,
  "code-review": CODE_REVIEW_TOOLS,
  "qa-test": QA_REVIEW_TOOLS,
  "design-review": DESIGN_REVIEW_TOOLS,
  "docs-update": DOCS_UPDATE_TOOLS,
});
