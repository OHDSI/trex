// @ts-nocheck - Deno edge function
import type { ToolDefinition, AgentContext } from "./types.ts";

export const webSearchTool: ToolDefinition = {
  name: "WebSearch",
  description: "Search the web for information. Returns a list of search results with titles, URLs, and snippets.",
  modifiesState: false,
  defaultConsent: "always",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query" },
      num_results: { type: "number", description: "Number of results to return (default 5, max 10)" },
    },
    required: ["query"],
  },
  async execute(args: { query: string; num_results?: number }, ctx: AgentContext) {
    const numResults = Math.min(args.num_results || 5, 10);
    try {
      // Use DuckDuckGo lite endpoint (POST required for results)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch("https://lite.duckduckgo.com/lite/", {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DevX/1.0)",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `q=${encodeURIComponent(args.query)}`,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const html = await res.text();

      // Parse results from the HTML
      const results: { title: string; url: string; snippet: string }[] = [];
      const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]+class=["']result-link["'][^>]*>([^<]*)<\/a>/g;
      const snippetRegex = /<td class=["']result-snippet["']>([\s\S]*?)<\/td>/g;

      let linkMatch;
      const links: { url: string; title: string }[] = [];
      while ((linkMatch = linkRegex.exec(html)) !== null) {
        links.push({ url: linkMatch[1], title: linkMatch[2].trim() });
      }

      let snippetMatch;
      const snippets: string[] = [];
      while ((snippetMatch = snippetRegex.exec(html)) !== null) {
        let snippet = snippetMatch[1];
        let prevSnippet = "";
        while (snippet !== prevSnippet) {
          prevSnippet = snippet;
          snippet = snippet.replace(/<[^>]*>/g, "");
        }
        snippets.push(snippet.trim());
      }

      for (let i = 0; i < Math.min(links.length, numResults); i++) {
        results.push({
          title: links[i].title,
          url: links[i].url,
          snippet: snippets[i] || "",
        });
      }

      if (results.length === 0) {
        return `No search results found for: ${args.query}`;
      }

      return results
        .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`)
        .join("\n\n");
    } catch (err) {
      return `Search failed: ${err.message}`;
    }
  },
};
