// Web search used to identify source coding systems and look up official code
// descriptions. Uses the Brave Search API when BRAVE_SEARCH_API_KEY is set;
// otherwise the keyless DuckDuckGo lite endpoint (same approach as the devx
// agent's search tool, reimplemented because plugins can't share code), which
// may refuse automated requests. A refusal is reported, never shown as "no results".
import { defineTool } from "eve/tools";
import type { Env } from "../lib/vocab.ts";
import { envGet } from "../lib/ctx.ts";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&#39;": "'", "&nbsp;": " " };

function clean(html: string): string {
  let s = html;
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(/<[^>]*>/g, "");
  }
  return s.replace(/&[#a-z0-9]+;/gi, (e) => ENTITIES[e] ?? e).replace(/\s+/g, " ").trim();
}

export function parseDuckDuckGoLite(html: string, n: number): SearchResult[] {
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]+class=["']result-link["'][^>]*>([\s\S]*?)<\/a>/g)];
  const snippets = [...html.matchAll(/<td class=["']result-snippet["']>([\s\S]*?)<\/td>/g)];
  return links.slice(0, n).map((m, i) => ({ title: clean(m[2]), url: m[1], snippet: clean(snippets[i]?.[1] ?? "") }));
}

export async function webSearch(
  input: { query: string; num_results?: number },
  deps: { env: Env; fetchFn?: typeof fetch },
): Promise<{ results: SearchResult[]; error?: string }> {
  // External service: off unless explicitly enabled.
  if (deps.env("CONCEPT_MAPPING_WEB_SEARCH")?.trim().toLowerCase() !== "on") {
    return { results: [], error: "web search disabled" };
  }
  const n = Math.min(Math.max(input.num_results ?? 5, 1), 10);
  const fetchFn = deps.fetchFn ?? fetch;
  try {
    const braveKey = deps.env("BRAVE_SEARCH_API_KEY")?.trim();
    if (braveKey) return { results: await braveSearch(input.query, n, braveKey, fetchFn) };
    const res = await fetchFn("https://lite.duckduckgo.com/lite/", {
      method: "POST",
      headers: { "User-Agent": "trex-concept-mapping/1.0", "Content-Type": "application/x-www-form-urlencoded" },
      body: `q=${encodeURIComponent(input.query)}`,
      signal: AbortSignal.timeout(15_000),
    });
    const html = await res.text();
    if (res.status === 202 || html.includes("anomaly-modal")) {
      return { results: [], error: "search provider refused the request (bot check); set BRAVE_SEARCH_API_KEY for reliable web search" };
    }
    return { results: parseDuckDuckGoLite(html, n) };
  } catch (e) {
    return { results: [], error: `search failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function braveSearch(query: string, n: number, key: string, fetchFn: typeof fetch): Promise<SearchResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.search = new URLSearchParams({ q: query, count: String(n) }).toString();
  const res = await fetchFn(url.toString(), {
    headers: { "Accept": "application/json", "X-Subscription-Token": key },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  return (body.web?.results ?? []).slice(0, n).map((r) => ({
    title: clean(r.title ?? ""),
    url: r.url ?? "",
    snippet: clean(r.description ?? ""),
  }));
}

export default defineTool({
  description:
    "Search the web. Returns titles, URLs and snippets. Use it to identify a source coding system, its publisher and " +
    "prefix structure, published crosswalks, and the official description of a specific code.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      num_results: { type: "integer", minimum: 1, maximum: 10, description: "Default 5." },
    },
    required: ["query"],
  },
  execute: (input) => webSearch(input as { query: string; num_results?: number }, { env: envGet }),
});
