// connection_search ranking (Task 5). The `connection_search` built-in
// (service/toolset.ts) is the DISCOVERY surface for connection-backed tools:
// given a natural-language query it returns the best-matching
// `<conn>__<tool>` names + descriptions so the model can find the right tool
// without the whole connection surface being spelled out in the system prompt.
//
// v1 scope: this is discovery only. The `<conn>__<tool>` tools are still
// realized eagerly by the connection provider (Task 3/4) and stay directly
// callable — connection_search helps the model NAME them, it does not gate
// their availability. Full lazy-gating (hiding the tools until searched) is a
// larger change deferred past v1.
//
// Keep this file dependency-free (pure ranking over already-loaded metadata):
// it runs inside the tool's execute() with no I/O.

// Metadata for one realized connection tool, as collected by buildSdkTools
// from the eager connection-provider merge.
export interface ConnectionToolMeta {
  name: string; // "<conn>__<tool>"
  connection: string; // the owning connection's name (for its description)
  description: string; // the realized tool's own description
}

// A single search hit handed back to the model.
export interface ConnectionSearchMatch {
  name: string;
  description: string;
}

// Rank connection tools against a free-text query. The haystack for each tool
// is its namespaced name + its own description + its connection's description
// (so a query that names the connection, e.g. "github", still surfaces that
// connection's tools). Scoring is simple query-token overlap: one point per
// distinct query token found as a substring of the haystack. Ties break on the
// tool name for a stable ordering. A blank query returns every tool — the
// full-surface discovery case — preserving the same stable ordering.
export function searchConnectionTools(
  query: string,
  tools: ConnectionToolMeta[],
  connectionDescriptions: Record<string, string> = {},
): ConnectionSearchMatch[] {
  const tokens = Array.from(new Set(query.toLowerCase().split(/\s+/).filter((t) => t.length > 0)));
  const scored = tools.map((t) => {
    const haystack = `${t.name} ${t.description} ${connectionDescriptions[t.connection] ?? ""}`.toLowerCase();
    let score = 0;
    for (const tok of tokens) if (haystack.includes(tok)) score += 1;
    return { tool: t, score };
  });
  const kept = tokens.length === 0 ? scored : scored.filter((s) => s.score > 0);
  kept.sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
  return kept.map((s) => ({ name: s.tool.name, description: s.tool.description }));
}
