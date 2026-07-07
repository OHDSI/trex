// Unit tests for the connection_search ranking function (search.ts). The
// built-in tool that wraps it (service/toolset.ts) is exercised end-to-end in
// service/hooks.test.ts; here we pin the ranking/filtering behavior in
// isolation from buildSdkTools and the connection provider.
import { assertEquals } from "jsr:@std/assert";
import { searchConnectionTools, type ConnectionToolMeta } from "./search.ts";

const TOOLS: ConnectionToolMeta[] = [
  { name: "gh__create_issue", connection: "gh", description: "Create a GitHub issue" },
  { name: "gh__list_repos", connection: "gh", description: "List repositories" },
  { name: "cal__add_event", connection: "cal", description: "Add a calendar event" },
];
const CONN_DESC = { gh: "GitHub API", cal: "Google Calendar" };

Deno.test("searchConnectionTools ranks tools matching the query first", () => {
  const matches = searchConnectionTools("issue", TOOLS, CONN_DESC);
  assertEquals(matches[0].name, "gh__create_issue");
});

Deno.test("searchConnectionTools filters out non-matching tools for a non-empty query", () => {
  // Matches only via the tool's own description + its connection description.
  const matches = searchConnectionTools("calendar event", TOOLS, CONN_DESC);
  assertEquals(matches.map((m) => m.name), ["cal__add_event"]);
});

Deno.test("searchConnectionTools returns { name, description } entries", () => {
  const [m] = searchConnectionTools("repositories", TOOLS, CONN_DESC);
  assertEquals(m, { name: "gh__list_repos", description: "List repositories" });
});

Deno.test("searchConnectionTools: an empty query returns every tool (full-surface discovery)", () => {
  const matches = searchConnectionTools("", TOOLS, CONN_DESC);
  assertEquals(matches.length, 3);
});

Deno.test("searchConnectionTools: the connection description contributes to ranking", () => {
  // "github" appears only in the connection description, not in any tool text.
  const matches = searchConnectionTools("github", TOOLS, CONN_DESC);
  assertEquals(matches.map((m) => m.name).sort(), ["gh__create_issue", "gh__list_repos"]);
});
