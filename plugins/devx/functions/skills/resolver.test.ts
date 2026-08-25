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

// loadSkillsForPrompt itself does NOT swallow a query failure — it propagates
// (task-5-report.md Finding 3, fix round 2). Graceful degradation is a
// CALLER concern: functions/agent.ts and claude_code_agent.ts have no
// try/catch at all (any DB error already kills those turns, by existing
// design), agent/agent.ts's buildInstructions is documented to fail the turn
// on a throw, and index.ts is the one caller with an established
// graceful-degradation contract for devx.skills reads, so it is the one
// caller required to catch this. This pins that loadSkillsForPrompt would
// indeed break an unguarded caller if a devx.skills query failed — the
// reason index.ts's placement inside its try/catch (asserted positionally
// in prompt_divergence.test.ts) matters.
Deno.test("loadSkillsForPrompt: propagates a sql failure rather than swallowing it (degradation is the caller's job)", async () => {
  const sqlFn = (_q: string, _p?: unknown[]) => Promise.reject(new Error("devx.skills unavailable"));
  let threw = false;
  try {
    await loadSkillsForPrompt("u1", sqlFn);
  } catch (e) {
    threw = true;
    assert((e as Error).message.includes("devx.skills unavailable"));
  }
  assert(threw, "expected loadSkillsForPrompt to propagate the sql failure");
});
