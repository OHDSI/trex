// task-5-report.md Finding 2 (fix round 1): prompt_parity.test.ts only ever
// called buildCoderContext directly with an explicit `skills` array, so it
// never exercised the real dispatch paths and couldn't have caught Finding 1
// (three of four dispatch paths silently rendering an empty skills listing).
// This file unit-tests loadSkillsForPrompt itself — the shared resolver all
// four dispatch paths (functions/agent.ts, claude_code_agent.ts, index.ts,
// agent/agent.ts) now call — so a regression in its mapping or its no-userId
// guard is caught here, independent of prompt_divergence.test.ts's
// structural check that each call site actually wires the result in.
import { assert, assertEquals } from "jsr:@std/assert";
import { loadSkillsForPrompt } from "./resolver.ts";

Deno.test("loadSkillsForPrompt: no userId returns an empty listing without querying", async () => {
  let called = false;
  const sqlFn = (_q: string, _p?: unknown[]) => {
    called = true;
    return Promise.resolve({ rows: [] });
  };
  const result = await loadSkillsForPrompt(undefined, sqlFn);
  assertEquals(result, []);
  assert(!called, "loadSkillsForPrompt must not query devx.skills without a userId");
});

Deno.test("loadSkillsForPrompt: maps devx.skills rows to {name, description}, dropping other columns", async () => {
  const rows = [
    { id: "s1", name: "brainstorming", slug: "brainstorming", description: "Explore an idea before building it", allowed_tools: null, mode: "agent", aliases: [], is_builtin: true },
    { id: "s2", name: "writing-plans", slug: "writing-plans", description: "Turn a spec into an implementation plan", allowed_tools: null, mode: "agent", aliases: [], is_builtin: false },
  ];
  const sqlFn = (_q: string, _p?: unknown[]) => Promise.resolve({ rows });
  const result = await loadSkillsForPrompt("u1", sqlFn);
  assertEquals(result, [
    { name: "brainstorming", description: "Explore an idea before building it" },
    { name: "writing-plans", description: "Turn a spec into an implementation plan" },
  ]);
});

Deno.test("loadSkillsForPrompt: queries devx.skills scoped to the given userId", async () => {
  let seenQuery = "";
  let seenParams: unknown[] | undefined;
  const sqlFn = (q: string, p?: unknown[]) => {
    seenQuery = q;
    seenParams = p;
    return Promise.resolve({ rows: [] });
  };
  await loadSkillsForPrompt("u-42", sqlFn);
  assert(seenQuery.includes("FROM devx.skills"), "expected a devx.skills query");
  assertEquals(seenParams, ["u-42"]);
});

Deno.test("loadSkillsForPrompt: no rows returns an empty listing, not a throw", async () => {
  const sqlFn = (_q: string, _p?: unknown[]) => Promise.resolve({ rows: [] });
  const result = await loadSkillsForPrompt("u1", sqlFn);
  assertEquals(result, []);
});
