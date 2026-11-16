import { assertEquals } from "jsr:@std/assert";
import { parseDuckDuckGoLite, webSearch } from "./web_search.ts";

const on = (k: string) => (k === "CONCEPT_MAPPING_WEB_SEARCH" ? "on" : undefined);

const HTML = `
<table>
<tr><td><a rel="nofollow" href="https://example.org/ncsp" class='result-link'>NCSP &amp; codes</a></td></tr>
<tr><td class='result-snippet'>The <b>Nordic</b> Classification of Surgical Procedures</td></tr>
<tr><td><a rel="nofollow" href="https://example.org/two" class='result-link'>Second</a></td></tr>
<tr><td class='result-snippet'>Two</td></tr>
<tr><td><a rel="nofollow" href="https://example.org/three" class='result-link'>Third</a></td></tr>
<tr><td class='result-snippet'>Three</td></tr>
</table>`;

Deno.test("parses titles, urls and tag-stripped snippets, capped at n", () => {
  assertEquals(parseDuckDuckGoLite(HTML, 2), [
    { title: "NCSP & codes", url: "https://example.org/ncsp", snippet: "The Nordic Classification of Surgical Procedures" },
    { title: "Second", url: "https://example.org/two", snippet: "Two" },
  ]);
});

Deno.test("disabled web search returns an error without fetching", async () => {
  let fetched = false;
  const out = await webSearch({ query: "NCSP" }, {
    env: (k) => (k === "CONCEPT_MAPPING_WEB_SEARCH" ? "off" : undefined),
    fetchFn: (() => { fetched = true; throw new Error(); }) as typeof fetch,
  });
  assertEquals(out, { results: [], error: "web search disabled" });
  assertEquals(fetched, false);
});

Deno.test("a failing fetch returns an error instead of throwing", async () => {
  const out = await webSearch({ query: "NCSP" }, {
    env: on,
    fetchFn: (() => Promise.reject(new Error("offline"))) as typeof fetch,
  });
  assertEquals(out, { results: [], error: "search failed: offline" });
});

Deno.test("num_results is capped at 10", async () => {
  const many = Array.from({ length: 15 }, (_, i) =>
    `<a href="https://e.org/${i}" class='result-link'>t${i}</a><td class='result-snippet'>s${i}</td>`).join("");
  const out = await webSearch({ query: "x", num_results: 50 }, {
    env: on,
    fetchFn: (() => Promise.resolve(new Response(many))) as typeof fetch,
  });
  assertEquals(out.results.length, 10);
});

Deno.test("a DuckDuckGo bot-check page is reported, not returned as zero results", async () => {
  const out = await webSearch({ query: "x" }, {
    env: on,
    fetchFn: (() => Promise.resolve(new Response('<html><div class="anomaly-modal__title">Unfortunately, bots use DuckDuckGo too.</div></html>', { status: 202 }))) as typeof fetch,
  });
  assertEquals(out.results, []);
  assertEquals(out.error, "search provider refused the request (bot check); set BRAVE_SEARCH_API_KEY for reliable web search");
});

Deno.test("uses the Brave Search API when a key is configured", async () => {
  let url = "";
  let token = "";
  const fetchFn = (u: string | URL | Request, init?: RequestInit) => {
    url = String(u);
    token = new Headers(init?.headers).get("X-Subscription-Token") ?? "";
    return Promise.resolve(new Response(JSON.stringify({
      web: { results: [{ title: "NCSP", url: "https://e.org", description: "The <strong>Nordic</strong> classification" }] },
    })));
  };
  const out = await webSearch({ query: "NCSP codes", num_results: 3 }, {
    env: (k) => (k === "BRAVE_SEARCH_API_KEY" ? "k1" : on(k)),
    fetchFn: fetchFn as typeof fetch,
  });
  assertEquals(url, "https://api.search.brave.com/res/v1/web/search?q=NCSP+codes&count=3");
  assertEquals(token, "k1");
  assertEquals(out, { results: [{ title: "NCSP", url: "https://e.org", snippet: "The Nordic classification" }] });
});

Deno.test("a Brave API error status is reported", async () => {
  const out = await webSearch({ query: "x" }, {
    env: (k) => (k === "BRAVE_SEARCH_API_KEY" ? "k1" : on(k)),
    fetchFn: (() => Promise.resolve(new Response("{}", { status: 429 }))) as typeof fetch,
  });
  assertEquals(out, { results: [], error: "search failed: HTTP 429" });
});

Deno.test("an ordinary results page mentioning 'anomaly' is not mistaken for a bot check", async () => {
  const page = `<a href="https://e.org/a" class='result-link'>Congenital anomaly repair</a><td class='result-snippet'>Surgery for a congenital anomaly</td>`;
  const out = await webSearch({ query: "congenital anomaly repair" }, {
    env: on,
    fetchFn: (() => Promise.resolve(new Response(page))) as typeof fetch,
  });
  assertEquals(out.results.length, 1);
  assertEquals(out.error, undefined);
});

Deno.test("web search is off unless explicitly enabled", async () => {
  let fetched = false;
  const out = await webSearch({ query: "NCSP" }, {
    env: () => undefined,
    fetchFn: (() => { fetched = true; throw new Error(); }) as typeof fetch,
  });
  assertEquals(out, { results: [], error: "web search disabled" });
  assertEquals(fetched, false);
});
