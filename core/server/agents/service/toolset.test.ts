// Task 9: cap tool output at execution time so `agents.steps` never holds an
// unbounded blob. See .superpowers/sdd/2026-08-25-agent-context-handling/task-9-brief.md.
//
// Deviation (ruling applied): the brief's wrapToolWithCap(tool, config,
// onResult) is dropped to wrapToolWithCap(tool, config) — no callback,
// asserted on the return value instead. See toolset.ts for why.
import { assert, assertEquals } from "jsr:@std/assert";
import { wrapToolWithCap, buildSdkTools } from "./toolset.ts";
import { DEFAULT_CONTEXT_CONFIG } from "./context/budget.ts";
import { assembleHistory } from "./context/history.ts";
import { loadAgent } from "../loader.ts";
import type { HookCtx } from "../eve-shim/types.ts";
import { createStore } from "./store.ts";

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

// ---------------------------------------------------------------------------
// Task 15: the narrow ToolContext.activateTools capability threaded through
// authoredTool — a tool gets exactly ITS OWN session's write, never the raw
// AgentStore. Exercised through a minimal fake agent (not the TOY fixture)
// so the probe tool's execute() can capture the ToolContext it's actually
// handed, which none of TOY's real tools (echo/propose_card) do.
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
function fakeProbeAgent(captured: { ctx?: any }): any {
  return {
    dir: "fake-probe-agent",
    tools: {
      probe: {
        description: "probe",
        inputSchema: { type: "object", properties: {} },
        execute: (_input: unknown, ctx?: unknown) => {
          captured.ctx = ctx;
          return Promise.resolve({});
        },
      },
    },
    skills: [],
    subagents: {},
    connections: {},
    config: { context: DEFAULT_CONTEXT_CONFIG, maxSteps: 25 },
  };
}

Deno.test("buildSdkTools: an authored tool's ToolContext exposes sessionId and an activateTools bound to store.activateTools", async () => {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const query = (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return Promise.resolve({ rows: [] });
  };
  const store = createStore(query as never);
  // deno-lint-ignore no-explicit-any
  const captured: { ctx?: any } = {};
  const tools = await buildSdkTools({
    agent: fakeProbeAgent(captured),
    sessionId: "s-42",
    depth: 0,
    hookCtx: fakeHookCtx(),
    store,
  });
  await (tools.probe as { execute: (i: unknown) => Promise<unknown> }).execute({});

  assertEquals(captured.ctx?.sessionId, "s-42");
  assert(typeof captured.ctx?.activateTools === "function");

  await captured.ctx.activateTools(["KBSearch"]);
  assert(calls[0].sql.includes("UPDATE agents.sessions"));
  assert(calls[0].sql.includes("activated_tools"));
  assertEquals(calls[0].params, ["s-42", ["KBSearch"]]);
});

Deno.test("buildSdkTools: activateTools is undefined on ToolContext when no store is wired (never a throwing stub)", async () => {
  // deno-lint-ignore no-explicit-any
  const captured: { ctx?: any } = {};
  const tools = await buildSdkTools({
    agent: fakeProbeAgent(captured),
    sessionId: "s-1",
    depth: 0,
    hookCtx: fakeHookCtx(),
  });
  await (tools.probe as { execute: (i: unknown) => Promise<unknown> }).execute({});
  assertEquals(captured.ctx?.activateTools, undefined);
});

// --- Cap arithmetic: no double truncation ----------------------------------
// truncateMiddle's maxChars bounds RETAINED content; the warning header and
// omission marker are additional (truncate.ts). Capping at exactly
// freshToolOutputChars therefore stored a value OVER the cap, which
// assembleHistory's fresh tier — capped at the same number — truncated a
// second time. The inner header then reported the length of the
// already-truncated text (e.g. "original length: 20102") instead of the true
// original (412839), defeating the header's whole purpose: telling the model
// how much it is missing so it can re-run with `| tail -50`.
Deno.test("wrapToolWithCap: a capped result is NOT re-truncated by assembleHistory's fresh tier", async () => {
  const config = { ...DEFAULT_CONTEXT_CONFIG, freshToolOutputChars: 20_000 };
  const original = "y".repeat(412_839);
  // deno-lint-ignore no-explicit-any
  const tool = { execute: () => Promise.resolve(original) } as any;
  // deno-lint-ignore no-explicit-any
  const stored = await wrapToolWithCap(tool, config).execute({}, {} as any) as string;

  // Storage-time cap already fits inside the assembly-time cap.
  assert(
    stored.length <= config.freshToolOutputChars,
    `stored value (${stored.length}) exceeds the cap (${config.freshToolOutputChars}) and will be truncated again`,
  );

  const msgs = assembleHistory([{
    seq: 1,
    message: "dump it",
    metadata: null,
    steps: [
      { kind: "tool-call", name: "Bash", payload: { toolCallId: "c1", input: {} } },
      { kind: "tool-result", name: "Bash", payload: { toolCallId: "c1", output: stored } },
    ],
  }], config);

  const result = msgs.find((m) => m.role === "tool") as { content: Array<{ output: unknown }> };
  const assembled = result.content[0].output as string;
  assertEquals(assembled, stored, "assembleHistory truncated an already-capped value a second time");

  // Exactly one header, and it reports the TRUE original length.
  const headers = assembled.match(/Warning: truncated output \(original length: (\d+) chars/g) ?? [];
  assertEquals(headers.length, 1, `expected one truncation header, got ${headers.length}: ${headers.join(" | ")}`);
  assert(
    assembled.includes(`original length: ${original.length} chars`),
    `header does not report the true original length ${original.length}`,
  );
});

// The cap must still be respected as an upper bound on the stored string, not
// just on its retained content — that is the difference the subtraction buys.
Deno.test("wrapToolWithCap: the RETURNED string stays within freshToolOutputChars", async () => {
  const config = { ...DEFAULT_CONTEXT_CONFIG, freshToolOutputChars: 1_000 };
  // deno-lint-ignore no-explicit-any
  const tool = { execute: () => Promise.resolve("z".repeat(500_000)) } as any;
  // deno-lint-ignore no-explicit-any
  const out = await wrapToolWithCap(tool, config).execute({}, {} as any) as string;
  assert(out.length <= config.freshToolOutputChars, `returned ${out.length} chars for a ${config.freshToolOutputChars} cap`);
  assert(out.includes("original length: 500000 chars"));
});

// JSON.stringify throws on a circular structure or a BigInt. Such a tool
// worked before the cap wrapper existed; failing to MEASURE its result must
// not turn it into a turn-killing throw.
Deno.test("wrapToolWithCap: an unserializable result passes through instead of throwing", async () => {
  // deno-lint-ignore no-explicit-any
  const circular: any = { name: "loop" };
  circular.self = circular;
  // deno-lint-ignore no-explicit-any
  const wrapped = wrapToolWithCap({ execute: () => Promise.resolve(circular) } as any, DEFAULT_CONTEXT_CONFIG);
  // deno-lint-ignore no-explicit-any
  const out = await wrapped.execute({}, {} as any);
  assertEquals(out, circular);
});

Deno.test("wrapToolWithCap: a BigInt-bearing result passes through instead of throwing", async () => {
  const value = { id: 10n };
  // deno-lint-ignore no-explicit-any
  const wrapped = wrapToolWithCap({ execute: () => Promise.resolve(value) } as any, DEFAULT_CONTEXT_CONFIG);
  // deno-lint-ignore no-explicit-any
  const out = await wrapped.execute({}, {} as any);
  assertEquals(out, value);
});

// Spec success criterion 4: the tool-payload reduction must be "logged as a
// byte count before and after". Nothing measured bytes before this.
Deno.test("buildSdkTools: the deferral logs the serialized tool payload before and after", async () => {
  const agent = await loadAgent(TOY);
  agent.config.context.deferredTools = ["propose_card", "connection_search"];
  const origLog = console.log;
  const logged: string[] = [];
  console.log = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  } finally {
    console.log = origLog;
  }
  const line = logged.find((l) => l.includes("tool payload"));
  assert(line, `no tool-payload byte log emitted; got: ${logged.join(" | ")}`);
  const m = line.match(/tool payload (\d+) -> (\d+) bytes, (\d+) -> (\d+) tools/);
  assert(m, `byte log is not in the expected before/after shape: ${line}`);
  const [, before, after, countBefore, countAfter] = m.map(Number);
  assert(before > after, `payload did not shrink: ${before} -> ${after}`);
  assert(after > 0, "after-size measured as zero — the measurement is not reading real schemas");
  assertEquals(countBefore - countAfter, 2, "both deferred tools should have been withheld");
});

// An agent that defers nothing (every agent but devx) must not pay for this
// log on every single request — the branch it lives in never runs.
Deno.test("buildSdkTools: no tool-payload log when the agent defers nothing", async () => {
  const agent = await loadAgent(TOY);
  assertEquals(agent.config.context.deferredTools, []);
  const origLog = console.log;
  const logged: string[] = [];
  console.log = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  } finally {
    console.log = origLog;
  }
  assertEquals(logged.filter((l) => l.includes("tool payload")), []);
});

// ---------------------------------------------------------------------------
// Task 7: `agent` becomes a child session, keeping its external contract
// (blocking, `{text}`; unknown subagent -> `{error, available}`). See
// .superpowers/sdd/2026-08-27-agent-orchestration/task-7-brief.md.
//
// Deviation from the brief: the in-process nested loop (runSubagent) is kept
// as a fallback for when ctx.spawn is not wired, rather than deleted. Deleting
// it breaks hooks.test.ts's "runSubagent ..." tests (5 tests exercising the
// old in-process behavior — mocked model, granular subagent.tool events, and
// errors that THROW rather than returning {error} — none of which wire
// ctx.spawn). Every real production call site (handler.ts) always wires
// ctx.spawn, so the fallback only serves callers/tests with no session store.
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
function fakeToolCtx(overrides: Record<string, unknown> = {}): any {
  return {
    agent: {
      dir: "fake-spawn-agent",
      instructions: "you are a fake agent",
      tools: {},
      skills: [],
      subagents: { "code-reviewer": { dir: "fake-code-reviewer" } },
      connections: {},
      config: { context: DEFAULT_CONTEXT_CONFIG, maxSteps: 25 },
    },
    sessionId: "s-1",
    ...overrides,
  };
}

Deno.test("agent still returns {text} and now routes through a child session", async () => {
  const spawned: unknown[] = [];
  const ctx = fakeToolCtx({
    spawn: {
      spawnChild: (o: unknown) => {
        spawned.push(o);
        return Promise.resolve({ agentId: "c-1", nickname: "Kepler" });
      },
      awaitChild: () => Promise.resolve({ text: "done" }),
    },
  });
  const tools = await buildSdkTools(ctx as never);
  const out = await (tools.agent as { execute: (i: unknown) => Promise<unknown> })
    .execute({ agent: "code-reviewer", prompt: "review" });
  assertEquals(out, { text: "done" });
  assertEquals((spawned[0] as { detached: boolean }).detached, false, "blocking agent must spawn NON-detached");
});

Deno.test("agent passes fork_turns through", async () => {
  const spawned: unknown[] = [];
  const ctx = fakeToolCtx({
    spawn: {
      spawnChild: (o: unknown) => {
        spawned.push(o);
        return Promise.resolve({ agentId: "c-1", nickname: "K" });
      },
      awaitChild: () => Promise.resolve({ text: "ok" }),
    },
  });
  const tools = await buildSdkTools(ctx as never);
  await (tools.agent as { execute: (i: unknown) => Promise<unknown> }).execute({ prompt: "x", fork_turns: "3" });
  assertEquals((spawned[0] as { forkTurns: string }).forkTurns, "3");
});

Deno.test("agent still rejects an unknown subagent without spawning", async () => {
  const spawned: unknown[] = [];
  const ctx = fakeToolCtx({
    spawn: {
      spawnChild: (o: unknown) => {
        spawned.push(o);
        return Promise.resolve({ agentId: "x", nickname: "y" });
      },
    },
  });
  const tools = await buildSdkTools(ctx as never);
  const out = await (tools.agent as { execute: (i: unknown) => Promise<unknown> })
    .execute({ agent: "nope", prompt: "x" }) as { error?: string };
  assert(out.error?.includes("nope"));
  assertEquals(spawned.length, 0);
});

Deno.test("agent does not resolve __proto__ as a subagent", async () => {
  const ctx = fakeToolCtx({
    spawn: { spawnChild: () => Promise.resolve({ agentId: "x", nickname: "y" }) },
  });
  const tools = await buildSdkTools(ctx as never);
  const out = await (tools.agent as { execute: (i: unknown) => Promise<unknown> })
    .execute({ agent: "__proto__", prompt: "x" }) as { error?: string };
  assert(out.error?.includes("__proto__"), "must fall into the unknown-subagent branch");
});

Deno.test("agent falls back to the in-process nested loop when ctx.spawn is not wired", async () => {
  const agent = await loadAgent(TOY);
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  // No subagent named "shouter" invocation needed here — this only proves the
  // fallback path is reachable and still returns the old {error, available}
  // shape for an unknown name, with no ctx.spawn required to get there.
  const out = await (tools.agent as { execute: (i: unknown) => Promise<unknown> })
    .execute({ agent: "nope", prompt: "x" }) as { error?: string; available?: string[] };
  assertEquals(out, { error: 'unknown subagent "nope"', available: Object.keys(agent.subagents) });
});
