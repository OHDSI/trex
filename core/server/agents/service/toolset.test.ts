// Task 9: cap tool output at execution time so `agents.steps` never holds an
// unbounded blob. See .superpowers/sdd/2026-08-25-agent-context-handling/task-9-brief.md.
//
// Deviation (ruling applied): the brief's wrapToolWithCap(tool, config,
// onResult) is dropped to wrapToolWithCap(tool, config) — no callback,
// asserted on the return value instead. See toolset.ts for why.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { wrapToolWithCap, buildSdkTools, restrictChildSkills } from "./toolset.ts";
import { DEFAULT_CONTEXT_CONFIG } from "./context/budget.ts";
import { assembleHistory } from "./context/history.ts";
import { loadAgent } from "../loader.ts";
import type { HookCtx } from "../eve-shim/types.ts";
import { createStore } from "./store.ts";
import { publish } from "./stream.ts";

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
// Fix round 1, Finding 1: the in-process nested loop (runSubagent) is fully
// deleted, not kept as a fallback — /chat wires ctx.spawn too now (see
// handler.ts's buildSpawnCapabilities), so there is exactly one delegation
// implementation and no route where the old fallback is still reachable.
// The 5 "runSubagent ..." tests that exercised it directly (hooks.test.ts)
// are migrated to drive the same semantics through the child-session path —
// see hooks.test.ts's "delegation (child session)" block.
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

// ---------------------------------------------------------------------------
// Task 14: restrictChildSkills — reducing only (codex role.rs). See
// loader.ts's resolveChildSkills for the pure intersection logic this wires
// into a real delegation.
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
function fakeAgentWithSkills(names: string[], configSkills?: string[]): any {
  return {
    dir: `fake-${names.join("-") || "none"}`,
    instructions: "x",
    tools: {},
    skills: names.map((name) => ({ name, description: name, path: `/fake/${name}.md` })),
    subagents: {},
    connections: {},
    config: {
      context: DEFAULT_CONTEXT_CONFIG,
      maxSteps: 25,
      ...(configSkills !== undefined ? { skills: configSkills } : {}),
    },
  };
}

Deno.test("restrictChildSkills: a self-delegation is returned unchanged", () => {
  const agent = fakeAgentWithSkills(["a", "b"]);
  assertEquals(restrictChildSkills(agent, agent), agent);
});

Deno.test("restrictChildSkills: a named subagent's skills are intersected with the parent's, never unioned", () => {
  const parent = fakeAgentWithSkills(["a", "b"]);
  const child = fakeAgentWithSkills(["b", "c"], ["b", "c"]); // child has b,c loaded AND declares both
  const restricted = restrictChildSkills(parent, child);
  assertEquals(restricted.skills.map((s: { name: string }) => s.name), ["b"]); // c dropped: parent lacks it
});

Deno.test("restrictChildSkills: no config.skills declared inherits everything the parent has, capped by what the child actually loaded", () => {
  const parent = fakeAgentWithSkills(["a", "b"]);
  const child = fakeAgentWithSkills(["a"]); // no config.skills; only "a" loaded on disk
  const restricted = restrictChildSkills(parent, child);
  assertEquals(restricted.skills.map((s: { name: string }) => s.name), ["a"]);
});

Deno.test("restrictChildSkills: a subagent cannot grant itself a skill the parent lacks, even if it loaded it", () => {
  const parent = fakeAgentWithSkills([]); // parent has no skills at all
  const child = fakeAgentWithSkills(["secret"], ["secret"]);
  const restricted = restrictChildSkills(parent, child);
  assertEquals(restricted.skills, []);
});

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

// Fix round 1, Finding 1: the old in-process fallback (runSubagent) is gone
// — both real routes (session/turn path and /chat) always wire ctx.spawn now,
// so there is exactly one delegation implementation. A caller that omits it
// is a wiring bug and must fail loudly, not silently revive the old path.
Deno.test("agent rejects loudly (does not silently fall back) when ctx.spawn is not wired", async () => {
  const agent = await loadAgent(TOY);
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  await assertRejects(
    () => (tools.agent as { execute: (i: unknown) => Promise<unknown> }).execute({ prompt: "x" }),
    Error,
    "ctx.spawn",
  );
});

// The unknown-subagent guard runs BEFORE ctx.spawn is even checked, so it
// still works with no spawn capabilities wired at all — this is the ONE
// case that genuinely needs no ctx.spawn, not a fallback delegation path.
Deno.test("agent still rejects an unknown subagent even with no ctx.spawn wired at all", async () => {
  const agent = await loadAgent(TOY);
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  const out = await (tools.agent as { execute: (i: unknown) => Promise<unknown> })
    .execute({ agent: "nope", prompt: "x" }) as { error?: string; available?: string[] };
  assertEquals(out, { error: 'unknown subagent "nope"', available: Object.keys(agent.subagents) });
});

// Fix round 1, Finding 4: the child now runs as its own turn/session, which
// publishes its own actions.requested/action.result on stream.ts's live
// fan-out — runAsChild subscribes to that for the duration of the wait and
// bridges them onto the parent's toolEmit as subagent.tool, under the SAME
// runId as subagent.start/end, matching the old in-process loop's
// one-runId granularity.
Deno.test("agent bridges the child's own tool-call/tool-result events onto the parent's toolEmit as subagent.tool", async () => {
  const events: Array<{ name: string; data: unknown }> = [];
  const ctx = fakeToolCtx({
    toolEmit: (name: string, data: unknown) => events.push({ name, data }),
    spawn: {
      spawnChild: () => Promise.resolve({ agentId: "c-1", nickname: "Kepler" }),
      awaitChild: (agentId: string) => {
        // Simulate the child's own turn publishing progress WHILE the
        // parent is still waiting — exactly the live window runAsChild's
        // subscribe() is meant to observe.
        publish(agentId, {
          type: "actions.requested",
          data: { turnId: "ct-1", actions: [{ kind: "tool-call", callId: "x", toolName: "shout", input: { text: "hi" } }] },
        });
        publish(agentId, {
          type: "action.result",
          data: { turnId: "ct-1", result: { kind: "tool-result", callId: "x", toolName: "shout", output: "HI" }, status: "completed" },
        });
        return { text: "done" };
      },
    },
  });
  const tools = await buildSdkTools(ctx as never);
  const out = await (tools.agent as { execute: (i: unknown) => Promise<unknown> }).execute({ prompt: "go" });
  assertEquals(out, { text: "done" });

  const names = events.map((e) => e.name);
  assertEquals(names, ["subagent.start", "subagent.tool", "subagent.tool", "subagent.end"]);
  const runIds = new Set(events.map((e) => (e.data as { runId: string }).runId));
  assertEquals(runIds.size, 1, "one runId for the whole delegation, same as the old in-process loop");
  assertEquals((events[1].data as { name: string; input: unknown }).name, "shout");
  assertEquals((events[1].data as { input: unknown }).input, { text: "hi" });
  assertEquals((events[2].data as { result: unknown }).result, "HI");
});

// ---------------------------------------------------------------------------
// Fix round 1, Finding 2: /chat's session is created fresh per request and
// never revisited (COMPAT.md) — a DETACHED child spawned from it would be
// silently orphaned (nothing will ever poll/wake for its result). /chat
// must only ever get the BLOCKING `agent` tool. This pins that contract at
// the tool-set level so Task 9 (which registers agent_spawn/agent_list at
// depth 0, gated on ctx.spawn) cannot give /chat detached spawning by
// accident — see spawn.ts's SpawnCapabilities.allowDetached, which is the
// mechanism this must be gated on instead of ctx.spawn alone.
// ---------------------------------------------------------------------------

Deno.test("a spawn-capable ctx with allowDetached:false still exposes the blocking agent tool", async () => {
  const ctx = fakeToolCtx({
    spawn: {
      allowDetached: false,
      spawnChild: () => Promise.resolve({ agentId: "c-1", nickname: "K" }),
      awaitChild: () => Promise.resolve({ text: "ok" }),
    },
  });
  const tools = await buildSdkTools(ctx as never);
  assert("agent" in tools, "/chat-shaped ctx must still get the blocking agent tool");
  // Task 9 doesn't exist yet in this codebase snapshot, so these are
  // trivially absent today — the assertion is a tripwire: once agent_spawn
  // exists, it must still be absent here specifically BECAUSE ctx.spawn
  // .allowDetached is false, not merely because nobody wrote it yet.
  assert(!("agent_spawn" in tools), "a session that cannot spawn detached children must never get agent_spawn");
  assert(!("agent_list" in tools), "a session that cannot spawn detached children must never get agent_list");
});

// ---------------------------------------------------------------------------
// Task 9 (2026-08-27-agent-orchestration): agent_spawn / agent_list. See
// .superpowers/sdd/2026-08-27-agent-orchestration/task-9-brief.md.
// ---------------------------------------------------------------------------

Deno.test("agent_spawn returns a handle immediately and spawns detached", async () => {
  const spawned: unknown[] = [];
  const ctx = fakeToolCtx({
    spawn: {
      allowDetached: true,
      spawnChild: (o: unknown) => {
        spawned.push(o);
        return Promise.resolve({ agentId: "c-1", nickname: "Kepler" });
      },
      awaitChild: () => {
        throw new Error("agent_spawn must not await the child");
      },
    },
  });
  const tools = await buildSdkTools(ctx as never);
  const out = await tools.agent_spawn.execute({ prompt: "explore" }, {} as never);
  assertEquals((out as { agentId: string }).agentId, "c-1");
  assertEquals((spawned[0] as { detached: boolean }).detached, true);
});

Deno.test("agent_list reports live children with nicknames", async () => {
  const ctx = fakeToolCtx({
    spawn: {
      allowDetached: true,
      listChildren: () =>
        Promise.resolve([
          { agentId: "c-1", nickname: "Kepler", status: "completed", subagent: "explorer" },
          { agentId: "c-2", nickname: "Faraday", status: "running", subagent: "explorer" },
        ]),
    },
  });
  const tools = await buildSdkTools(ctx as never);
  const out = await tools.agent_list.execute({}, {} as never) as { agents: unknown[] };
  assertEquals(out.agents.length, 2);
  assert(JSON.stringify(out.agents).includes("Faraday"));
});

Deno.test("agent_spawn/agent_list are not registered when the session disallows detached children (/chat)", async () => {
  const ctx = fakeToolCtx({
    spawn: {
      allowDetached: false,
      spawnChild: () => Promise.reject(new Error("must not be reachable")),
    },
  });
  const tools = await buildSdkTools(ctx as never);
  assertEquals(tools.agent_spawn, undefined);
  assertEquals(tools.agent_list, undefined);
  assert(tools.agent, "the blocking agent tool must still be registered");
});

// ---------------------------------------------------------------------------
// Task 10 (2026-08-27-agent-orchestration): agent_wait. A mailbox wait, not a
// join — reports WHICH children finished, never their content. See
// .superpowers/sdd/2026-08-27-agent-orchestration/task-10-brief.md.
// ---------------------------------------------------------------------------

Deno.test("agent_wait reports a finished child's status without its content", async () => {
  const ctx = fakeToolCtx({
    spawn: {
      allowDetached: true,
      waitForChildren: (_ids: unknown, _ms: unknown) =>
        Promise.resolve([
          { agentId: "c-1", nickname: "Kepler", status: "completed", subagent: null, startedAt: new Date(), detached: true },
        ]),
    },
  });
  const tools = await buildSdkTools(ctx as never);
  const out = await tools.agent_wait.execute({}, {} as never) as { updated: unknown[]; timedOut: boolean };
  assertEquals(out.updated, [{ agentId: "c-1", nickname: "Kepler", status: "completed" }]);
  assertEquals(out.timedOut, false);
});

Deno.test("agent_wait reports an empty list (not an error) on timeout", async () => {
  const ctx = fakeToolCtx({
    spawn: { allowDetached: true, waitForChildren: () => Promise.resolve([]) },
  });
  const tools = await buildSdkTools(ctx as never);
  const out = await tools.agent_wait.execute({}, {} as never) as { updated: unknown[]; timedOut: boolean };
  assertEquals(out.updated, []);
  assertEquals(out.timedOut, true);
});

Deno.test("agent_wait passes agent_ids/timeout_ms through to waitForChildren", async () => {
  const calls: unknown[] = [];
  const ctx = fakeToolCtx({
    spawn: {
      allowDetached: true,
      waitForChildren: (ids: unknown, ms: unknown) => {
        calls.push([ids, ms]);
        return Promise.resolve([]);
      },
    },
  });
  const tools = await buildSdkTools(ctx as never);
  await tools.agent_wait.execute({ agent_ids: ["c-1"], timeout_ms: 5_000 }, {} as never);
  assertEquals(calls[0], [["c-1"], 5_000]);
});

Deno.test("agent_wait is not registered when the session disallows detached children (/chat)", async () => {
  const ctx = fakeToolCtx({ spawn: { allowDetached: false } });
  const tools = await buildSdkTools(ctx as never);
  assertEquals(tools.agent_wait, undefined);
});

// ---------------------------------------------------------------------------
// Task 11 (2026-08-27-agent-orchestration): agent_stop. See
// .superpowers/sdd/2026-08-27-agent-orchestration/task-11-brief.md.
// ---------------------------------------------------------------------------

Deno.test("agent_stop reports the previous status of a stopped child", async () => {
  const ctx = fakeToolCtx({
    spawn: { allowDetached: true, stopChild: (_id: string) => Promise.resolve("running") },
  });
  const tools = await buildSdkTools(ctx as never);
  const out = await tools.agent_stop.execute({ agent_id: "c-1" }, {} as never);
  assertEquals(out, { previousStatus: "running" });
});

Deno.test("agent_stop surfaces an unknown/foreign agent id as {error}, not a thrown rejection", async () => {
  const ctx = fakeToolCtx({
    spawn: {
      allowDetached: true,
      stopChild: (id: string) => Promise.reject(new Error(`unknown agent "${id}"`)),
    },
  });
  const tools = await buildSdkTools(ctx as never);
  const out = await tools.agent_stop.execute({ agent_id: "foreign" }, {} as never) as { error?: string };
  assert(out.error?.toLowerCase().includes("unknown"));
});

Deno.test("agent_stop is not registered when the session disallows detached children (/chat)", async () => {
  const ctx = fakeToolCtx({ spawn: { allowDetached: false } });
  const tools = await buildSdkTools(ctx as never);
  assertEquals(tools.agent_stop, undefined);
});

// ---------------------------------------------------------------------------
// Task 12 (2026-08-27-agent-orchestration): agent_send. Delivers a message
// into an already-running child's turn — there is no "next turn" to queue it
// for (see runner.ts's makePrepareStep). See
// .superpowers/sdd/2026-08-27-agent-orchestration/task-12-brief.md.
// ---------------------------------------------------------------------------

Deno.test("agent_send reports delivered:true for a running child", async () => {
  const ctx = fakeToolCtx({
    spawn: { allowDetached: true, sendToChild: (_id: string, _msg: string) => Promise.resolve({ delivered: true }) },
  });
  const tools = await buildSdkTools(ctx as never);
  const out = await tools.agent_send.execute({ agent_id: "c-1", message: "hi" }, {} as never);
  assertEquals(out, { delivered: true });
});

Deno.test("agent_send reports delivered:false for a finished child", async () => {
  const ctx = fakeToolCtx({
    spawn: { allowDetached: true, sendToChild: (_id: string, _msg: string) => Promise.resolve({ delivered: false }) },
  });
  const tools = await buildSdkTools(ctx as never);
  const out = await tools.agent_send.execute({ agent_id: "c-1", message: "hi" }, {} as never);
  assertEquals(out, { delivered: false });
});

Deno.test("agent_send is not registered when the session disallows detached children (/chat)", async () => {
  const ctx = fakeToolCtx({ spawn: { allowDetached: false } });
  const tools = await buildSdkTools(ctx as never);
  assertEquals(tools.agent_send, undefined);
});
