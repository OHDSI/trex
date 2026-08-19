import { assertEquals } from "jsr:@std/assert";
import { firstComponentMatch, listAppsCore } from "./listApps.ts";
import type { AppFileNode } from "./listApps.ts";
import { effectiveUserId } from "./askCodeAgent.ts";

function fakeSql(rows: unknown[]) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const fn = (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return Promise.resolve({ rows });
  };
  return { fn, calls };
}

Deno.test("listAppsCore filters by user when known and maps rows", async () => {
  const f = fakeSql([
    { id: "a1", name: "dashboard", tech_stack: "react", updated_at: "2026-07-15" },
    { id: "a2", name: "etl-jobs", tech_stack: null, updated_at: "2026-07-14" },
  ]);
  const out = await listAppsCore(f.fn, "u1");
  assertEquals(f.calls[0].sql.includes("WHERE user_id = $1"), true);
  assertEquals(f.calls[0].params, ["u1"]);
  assertEquals(out.apps, [
    { id: "a1", name: "dashboard", techStack: "react" },
    { id: "a2", name: "etl-jobs", techStack: null },
  ]);
});

Deno.test("listAppsCore lists all apps when no user is known", async () => {
  const f = fakeSql([]);
  await listAppsCore(f.fn, undefined);
  assertEquals(f.calls[0].sql.includes("WHERE"), false);
});

Deno.test("effectiveUserId prefers ctx user, then CLAW_CODE_USER_ID env", () => {
  const env = (k: string) => (k === "CLAW_CODE_USER_ID" ? "devx-user" : undefined);
  assertEquals(effectiveUserId("u1", env), "u1");
  assertEquals(effectiveUserId(undefined, env), "devx-user");
  assertEquals(effectiveUserId(undefined, () => undefined), undefined);
  assertEquals(effectiveUserId(undefined, () => ""), undefined);
});

// --- component search (find components inside registered apps) ---

function tree(): AppFileNode[] {
  return [
    { name: "src", path: "src", type: "directory", children: [
      { name: "index.ts", path: "src/index.ts", type: "file" },
    ] },
    { name: "plugins", path: "plugins", type: "directory", children: [
      { name: "flows", path: "plugins/flows", type: "directory", children: [
        { name: "whiterabbit", path: "plugins/flows/whiterabbit", type: "directory", children: [
          { name: "README.md", path: "plugins/flows/whiterabbit/README.md", type: "file" },
        ] },
      ] },
    ] },
  ];
}

Deno.test("firstComponentMatch finds a nested directory by case-insensitive name", () => {
  assertEquals(firstComponentMatch(tree(), "whiterabbit"), "plugins/flows/whiterabbit");
});

Deno.test("firstComponentMatch returns undefined when nothing matches", () => {
  assertEquals(firstComponentMatch(tree(), "nonexistent"), undefined);
});

// The plan's own motivating example — a team names a product "White Rabbit"
// (with a space), but the checked-out directory name (`whiterabbit`) never
// has one, so a bare `.includes` match
// found nothing. Spaces, hyphens, and underscores are stripped from both
// sides before comparing, so any of these phrasings resolves to the same
// directory.
Deno.test("firstComponentMatch matches across spaces/hyphens/underscores on either side", () => {
  assertEquals(firstComponentMatch(tree(), "White Rabbit"), "plugins/flows/whiterabbit");
  assertEquals(firstComponentMatch(tree(), "white-rabbit"), "plugins/flows/whiterabbit");
  assertEquals(firstComponentMatch(tree(), "white_rabbit"), "plugins/flows/whiterabbit");
});

Deno.test("firstComponentMatch does not blow up on nodes without children", () => {
  const nodes: AppFileNode[] = [{ name: "empty-dir", path: "empty-dir", type: "directory" }];
  assertEquals(firstComponentMatch(nodes, "anything"), undefined);
});

function fakeFinder(hits: Record<string, string | undefined>) {
  const calls: Array<{ appId: string; userId: string; component: string }> = [];
  const fn = (appId: string, userId: string, component: string) => {
    calls.push({ appId, userId, component });
    return Promise.resolve(hits[appId]);
  };
  return { fn, calls };
}

Deno.test("listAppsCore sets matchedPath only on the app that contains the component", async () => {
  const f = fakeSql([
    { id: "a1", name: "dashboard", tech_stack: "react", updated_at: "2026-07-15" },
    { id: "a2", name: "data2evidence", tech_stack: "d2e", updated_at: "2026-07-14" },
  ]);
  const finder = fakeFinder({ a2: "plugins/flows/whiterabbit" });
  const out = await listAppsCore(f.fn, "u1", "whiterabbit", finder.fn);
  assertEquals(out.apps, [
    { id: "a1", name: "dashboard", techStack: "react" },
    { id: "a2", name: "data2evidence", techStack: "d2e", matchedPath: "plugins/flows/whiterabbit" },
  ]);
});

Deno.test("listAppsCore leaves matchedPath unset when no app contains the component", async () => {
  const f = fakeSql([{ id: "a1", name: "dashboard", tech_stack: "react", updated_at: "2026-07-15" }]);
  const finder = fakeFinder({});
  const out = await listAppsCore(f.fn, "u1", "nonexistent", finder.fn);
  assertEquals(out.apps, [{ id: "a1", name: "dashboard", techStack: "react" }]);
});

Deno.test("listAppsCore does not search at all when component is omitted (bounded: no walk on a plain call)", async () => {
  const f = fakeSql([{ id: "a1", name: "dashboard", tech_stack: "react", updated_at: "2026-07-15" }]);
  const finder = fakeFinder({ a1: "should-not-be-called" });
  await listAppsCore(f.fn, "u1", undefined, finder.fn);
  assertEquals(finder.calls.length, 0);
});

Deno.test("listAppsCore skips the search (not an error) when no user id is known", async () => {
  const f = fakeSql([{ id: "a1", name: "dashboard", tech_stack: "react", updated_at: "2026-07-15" }]);
  const finder = fakeFinder({ a1: "should-not-be-called" });
  const out = await listAppsCore(f.fn, undefined, "whiterabbit", finder.fn);
  assertEquals(out.apps, [{ id: "a1", name: "dashboard", techStack: "react" }]);
  assertEquals(finder.calls.length, 0);
});

Deno.test("listAppsCore tolerates one app's finder failing without failing the whole call", async () => {
  const f = fakeSql([
    { id: "a1", name: "broken-workspace", tech_stack: "react", updated_at: "2026-07-15" },
    { id: "a2", name: "data2evidence", tech_stack: "d2e", updated_at: "2026-07-14" },
  ]);
  const calls: string[] = [];
  const finder = (appId: string, _userId: string, _component: string) => {
    calls.push(appId);
    if (appId === "a1") return Promise.resolve(undefined); // e.g. workspace not checked out
    return Promise.resolve("plugins/flows/whiterabbit");
  };
  const out = await listAppsCore(f.fn, "u1", "whiterabbit", finder);
  assertEquals(calls, ["a1", "a2"]);
  assertEquals(out.apps, [
    { id: "a1", name: "broken-workspace", techStack: "react" },
    { id: "a2", name: "data2evidence", techStack: "d2e", matchedPath: "plugins/flows/whiterabbit" },
  ]);
});
