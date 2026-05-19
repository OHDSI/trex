// @ts-nocheck - Deno edge function
import type { ToolDefinition, AgentContext } from "./types.ts";

export const webCrawlTool: ToolDefinition = {
  name: "WebCrawl",
  description: "Crawl a web page and its linked pages (depth 1). Returns the main page content plus content from linked pages.",
  modifiesState: false,
  defaultConsent: "always",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "The starting URL to crawl" },
      max_pages: { type: "number", description: "Maximum number of pages to crawl (default 3, max 5)" },
    },
    required: ["url"],
  },
  async execute(args: { url: string; max_pages?: number }, ctx: AgentContext) {
    const maxPages = Math.min(args.max_pages || 3, 5);
    const results: string[] = [];

    function stripHtml(html: string): string {
      // Use DOMParser to safely extract text content, avoiding regex-based HTML sanitization
      // which cannot reliably handle nested/malformed tags
      try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        for (const el of doc.querySelectorAll("script, style")) el.remove();
        return (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
      } catch {
        // Fallback: strip all angle-bracket sequences
        return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      }
    }

    async function fetchPage(pageUrl: string): Promise<{ text: string; links: string[] }> {
      const res = await fetch(pageUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; DevX/1.0)" },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();

      // Extract links
      const links: string[] = [];
      const linkRegex = /href="(https?:\/\/[^"]+)"/g;
      let m;
      const baseHost = new URL(pageUrl).host;
      while ((m = linkRegex.exec(html)) !== null) {
        try {
          const linkUrl = new URL(m[1]);
          if (linkUrl.host === baseHost) links.push(m[1]);
        } catch {
          /* skip invalid URLs */
        }
      }

      return { text: stripHtml(html).substring(0, 3000), links: [...new Set(links)].slice(0, 10) };
    }

    try {
      const main = await fetchPage(args.url);
      results.push(`## ${args.url}\n${main.text}`);

      const visited = new Set([args.url]);
      for (const link of main.links) {
        if (results.length >= maxPages) break;
        if (visited.has(link)) continue;
        visited.add(link);
        try {
          const page = await fetchPage(link);
          results.push(`## ${link}\n${page.text}`);
        } catch {
          /* skip failed pages */
        }
      }

      return results.join("\n\n---\n\n");
    } catch (err) {
      return `Crawl failed: ${err.message}`;
    }
  },
};
