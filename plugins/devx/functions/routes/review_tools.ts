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

/** The provider whose turns run on the delegated sidecar loop rather than the
 * model loop (agent/agent.ts's resolveEngine). */
export const DELEGATED_PROVIDER = "claude-code";

// Review types that produce nothing real without a browser. On the delegated
// path there is no browser tool at all, so these are refused rather than run
// blind; security and code review still run there, since Read/Glob/Grep
// genuinely cover them.
const BROWSER_DEPENDENT: ReadonlyMap<string, string> = new Map([
  ["qa-test", "QA review"],
  ["design-review", "design review"],
]);

/**
 * The refusal for a review that cannot work on this provider, or null to
 * proceed. A refusal, not a partial result: a reader who misses a banner reads
 * a QA pass that never rendered a page as a real one.
 */
export function browserlessRefusal(reviewType: string, provider: string | null | undefined): string | null {
  const label = BROWSER_DEPENDENT.get(reviewType);
  if (!label || provider !== DELEGATED_PROVIDER) return null;
  const browserTools = (REVIEW_TOOLSETS[reviewType] ?? []).filter((t) => t.startsWith("Browser")).join(", ");
  return `A ${label} needs a browser (${browserTools}), and the ${DELEGATED_PROVIDER} provider has none: ` +
    `it hands the whole turn to the Claude Agent SDK, whose built-in tool set carries no browser tool and ` +
    `no MCP equivalent, so the review would read files and never open the app. There is no fallback either — ` +
    `a ${DELEGATED_PROVIDER} account stores no API key, so this review cannot be run on the model loop instead. ` +
    `Switch to an API-key provider in devx Settings to run it.`;
}
