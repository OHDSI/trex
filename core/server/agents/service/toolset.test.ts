// Task 9: cap tool output at execution time so `agents.steps` never holds an
// unbounded blob. See .superpowers/sdd/2026-08-25-agent-context-handling/task-9-brief.md.
//
// Deviation (ruling applied): the brief's wrapToolWithCap(tool, config,
// onResult) is dropped to wrapToolWithCap(tool, config) — no callback,
// asserted on the return value instead. See toolset.ts for why.
import { assert, assertEquals } from "jsr:@std/assert";
import { wrapToolWithCap, buildSdkTools } from "./toolset.ts";
import { DEFAULT_CONTEXT_CONFIG } from "./context/budget.ts";
import { loadAgent } from "../loader.ts";
import type { HookCtx } from "../eve-shim/types.ts";

function fakeHookCtx(overrides: Partial<HookCtx> = {}): HookCtx {
  return {
    sessionId: "s-1",
    env: () => undefined,
    sql: () => Promise.resolve({ rows: [] }),
    ...overrides,
  };
}

const TOY = new URL("../testdata/toy-agent/agent", import.meta.url).pathname;

Deno.test("wrapToolWithCap: oversized output is truncated before it is returned", async () => {
  // deno-lint-ignore no-explicit-any
  const tool = { execute: () => Promise.resolve("z".repeat(100_000)) } as any;
  const wrapped = wrapToolWithCap(tool, { ...DEFAULT_CONTEXT_CONFIG, freshToolOutputChars: 1_000 });
  // deno-lint-ignore no-explicit-any
  const out = await wrapped.execute({}, {} as any);
  assert(typeof out === "string");
  assert((out as string).includes("original length: 100000 chars"));
  assert((out as string).length < 2_000);
});

Deno.test("wrapToolWithCap: output within the cap is returned untouched (type preserved)", async () => {
  // deno-lint-ignore no-explicit-any
  const tool = { execute: () => Promise.resolve({ echoed: "hi" }) } as any;
  const wrapped = wrapToolWithCap(tool, DEFAULT_CONTEXT_CONFIG);
  // deno-lint-ignore no-explicit-any
  const out = await wrapped.execute({}, {} as any);
  assertEquals(out, { echoed: "hi" });
});

Deno.test("wrapToolWithCap: a tool with no execute (clientOnly) passes through unchanged", () => {
  // deno-lint-ignore no-explicit-any
  const tool = { description: "d" } as any;
  const wrapped = wrapToolWithCap(tool, DEFAULT_CONTEXT_CONFIG);
  assertEquals(wrapped, tool);
});

Deno.test("wrapToolWithCap: an oversized non-string result is stringified, not double-stringified", async () => {
  // deno-lint-ignore no-explicit-any
  const tool = { execute: () => Promise.resolve({ blob: "x".repeat(100_000) }) } as any;
  const wrapped = wrapToolWithCap(tool, { ...DEFAULT_CONTEXT_CONFIG, freshToolOutputChars: 1_000 });
  // deno-lint-ignore no-explicit-any
  const out = await wrapped.execute({}, {} as any);
  assert(typeof out === "string");
  // A double-stringified value would show escaped quotes/backslashes; a
  // single JSON.stringify of {"blob":"..."} does not.
  assert(!(out as string).includes('\\"blob\\"'));
  assert((out as string).includes('"blob"'));
});

// ---------------------------------------------------------------------------
// Integration: the cap is applied inside buildSdkTools (the core boundary),
// so it covers every authored tool AND the subagent path (runSubagent calls
// buildSdkTools again at depth 1) without devx (or any other plugin) opting
// in.
// ---------------------------------------------------------------------------

Deno.test("buildSdkTools: an authored tool's oversized output is capped on the way out", async () => {
  const agent = await loadAgent(TOY);
  agent.config.context.freshToolOutputChars = 500;
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  const result = await (tools.echo as { execute: (input: unknown) => Promise<unknown> })
    .execute({ text: "z".repeat(50_000) });
  assert(typeof result === "string", "an oversized object result must be stringified+truncated, not passed through");
  assert((result as string).length < 1_000);
  assert((result as string).includes("original length:"));
});

Deno.test("buildSdkTools: a small authored tool result is unaffected (no spurious stringification)", async () => {
  const agent = await loadAgent(TOY);
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  const result = await (tools.echo as { execute: (input: unknown) => Promise<unknown> }).execute({ text: "hi" });
  assertEquals(result, { echoed: "hi" });
});

Deno.test("buildSdkTools: a subagent's tools are ALSO capped (depth 1 goes through the same wrapping)", async () => {
  const agent = await loadAgent(TOY);
  const shouter = agent.subagents.shouter;
  shouter.config.context.freshToolOutputChars = 500;
  const tools = await buildSdkTools({ agent: shouter, sessionId: "s-1", depth: 1, hookCtx: fakeHookCtx() });
  const result = await (tools.shout as { execute: (input: unknown) => Promise<unknown> })
    .execute({ text: "z".repeat(50_000) });
  assert(typeof result === "string", "the subagent's own oversized tool result must be capped too");
  assert((result as string).length < 1_000);
  assert((result as string).includes("original length:"));
});

// ---------------------------------------------------------------------------
// Tasks 13/14 fix round 1, Finding 1: buildSdkTools' own deferred-tool
// wiring (Step 6) was previously verified only by inspection — partitionTools
// and withToolCachePoint each had unit tests, but nothing exercised the
// gate condition, the ctx.activatedTools default, or the delete+Object.assign
// rebuild of `out` through the real buildSdkTools entrypoint. The toy agent's
// undeferred tool set (verified empirically) is, in order:
// ["echo", "propose_card", "skill", "agent", "connection_search"].
// ---------------------------------------------------------------------------

Deno.test("buildSdkTools: deferred tools are withheld from the request until activated", async () => {
  const agent = await loadAgent(TOY);
  agent.config.context.deferredTools = ["propose_card", "connection_search"];
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  // Withheld tools are absent entirely — not present-but-empty, not stubbed.
  assertEquals(Object.keys(tools), ["echo", "skill", "agent"]);
});

Deno.test("buildSdkTools: an activated deferred tool is appended after core, and core stays byte-identical", async () => {
  const agent = await loadAgent(TOY);
  agent.config.context.deferredTools = ["propose_card", "connection_search"];

  const before = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  const after = await buildSdkTools({
    agent,
    sessionId: "s-1",
    depth: 0,
    hookCtx: fakeHookCtx(),
    activatedTools: ["propose_card"],
  });

  assertEquals(Object.keys(before), ["echo", "skill", "agent"]);
  // propose_card is appended AFTER the core tools; connection_search stays
  // withheld (never activated).
  assertEquals(Object.keys(after), ["echo", "skill", "agent", "propose_card"]);

  // The core tools' serialized shape (description/inputSchema/providerOptions
  // — execute functions aren't JSON-serializable and are covered separately
  // by the wrapToolWithCap tests above) must be byte-identical whether or
  // not anything downstream of them has been activated.
  // deno-lint-ignore no-explicit-any
  const shape = (t: Record<string, any>, name: string) =>
    JSON.stringify({ description: t[name].description, inputSchema: t[name].inputSchema, providerOptions: t[name].providerOptions });
  for (const name of ["echo", "skill", "agent"]) {
    assertEquals(shape(before, name), shape(after, name));
  }
});

Deno.test("buildSdkTools: deferredTools empty (the default) never adds a providerOptions cache marker to any tool", async () => {
  const agent = await loadAgent(TOY);
  // DEFAULT_CONTEXT_CONFIG.deferredTools is [] — this is the no-regression
  // path Step 6's length-gate exists to protect. Pass an anthropic model
  // explicitly: if the gate were absent, withToolCachePoint would put a
  // fresh providerOptions.anthropic.cacheControl marker on the last tool,
  // which no tool carried before Task 14 and must not appear here.
  assertEquals(agent.config.context.deferredTools, []);
  const tools = await buildSdkTools({
    agent,
    sessionId: "s-1",
    depth: 0,
    hookCtx: fakeHookCtx(),
    model: { provider: "anthropic.messages", modelId: "claude-sonnet-5" },
  });
  assertEquals(Object.keys(tools), ["echo", "propose_card", "skill", "agent", "connection_search"]);
  for (const [name, def] of Object.entries(tools)) {
    assert(
      !Object.hasOwn(def as object, "providerOptions"),
      `${name} must not carry a providerOptions cache marker when deferredTools is empty`,
    );
  }
});

Deno.test("buildSdkTools: a deferredTools entry naming no real tool is ignored, not thrown", async () => {
  const agent = await loadAgent(TOY);
  agent.config.context.deferredTools = ["NoSuchTool"];
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  assertEquals(Object.keys(tools), ["echo", "propose_card", "skill", "agent", "connection_search"]);
});
