// Task 15: rankDeferredTools is a pure function (no I/O, no agent/session
// state), so it's tested standalone here without a loaded agent or store.
// See tools/ToolSearch.ts for the default-exported tool that calls it.
//
// Deviation from task-15-brief.md: the brief names this file's source as
// `tools/tool_search.ts` (lowercase, snake_case) — the real file is
// `tools/ToolSearch.ts` (PascalCase, matching every other tools/<Name>.ts
// wrapper's filename-is-the-tool-name convention). Imported from its real
// path below.
import { assertEquals } from "jsr:@std/assert";
import { rankDeferredTools } from "../tools/ToolSearch.ts";

const candidates = [
  { name: "KBSearch", description: "Search the knowledge base" },
  { name: "GenerateImage", description: "Create an image from a prompt" },
  { name: "WebCrawl", description: "Crawl a site and search its pages" },
];

Deno.test("rankDeferredTools ranks a name match above a description match", () => {
  const out = rankDeferredTools("search", candidates);
  assertEquals(out[0].name, "KBSearch");
});

Deno.test("rankDeferredTools returns nothing for an unrelated query", () => {
  assertEquals(rankDeferredTools("quantum", candidates), []);
});

Deno.test("rankDeferredTools caps results at 10", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ name: `Search${i}`, description: "search" }));
  assertEquals(rankDeferredTools("search", many).length, 10);
});

Deno.test("rankDeferredTools is case-insensitive and matches multi-term queries against both fields", () => {
  const out = rankDeferredTools("IMAGE prompt", candidates);
  assertEquals(out[0].name, "GenerateImage");
});

// Scoring used to be SUBSTRING containment, so the query term "base" matched
// inside the token "database" and a knowledge-base query came back with the
// database tools. Terms now have to match a whole token; tool names are
// PascalCase, so they split on case boundaries as well as separators.
const mixed = [
  { name: "KBSearch", description: "Search the knowledge base" },
  { name: "DatabaseSchema", description: "Get the database schema for the current app" },
  { name: "ExecuteSQL", description: "Execute SQL against the app's database schema" },
];

Deno.test("rankDeferredTools does not match the term 'base' inside 'database'", () => {
  assertEquals(rankDeferredTools("knowledge base", mixed).map((t) => t.name), ["KBSearch"]);
});

Deno.test("rankDeferredTools still returns the database tools for a genuine query", () => {
  assertEquals(rankDeferredTools("database schema", mixed).map((t) => t.name), ["DatabaseSchema", "ExecuteSQL"]);
});

Deno.test("rankDeferredTools splits a PascalCase name into whole tokens", () => {
  assertEquals(rankDeferredTools("execute", mixed).map((t) => t.name), ["ExecuteSQL"]);
});
