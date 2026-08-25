// H1: per-request model/instructions hooks + authenticated ToolContext.userId.
// See .superpowers/sdd/task-h1-brief.md. Two layers of coverage:
//  - resolveModelForTurn (model.ts) unit tests: string/spec/no-hook/throwing
//    hook resolution order, without touching streamText at all.
//  - runTurn (runner.ts) + createHandler (handler.ts) integration tests,
//    matching runner.test.ts's/handler.test.ts's MockLanguageModelV3 +
//    in-memory-store conventions: buildInstructions reaching the model's
//    system prompt, userId flowing into ToolContext from the header (never
//    metadata), and a throwing resolveModel hook failing the turn with a
//    turn.failed/session.failed pair instead of silently falling back to
//    env credentials.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { resolveModelForTurn } from "./model.ts";
import { runTurn } from "./runner.ts";
import { createHandler } from "./handler.ts";
import { buildSdkTools, buildSystemPrompt } from "./toolset.ts";
import { loadAgent } from "../loader.ts";
import type { LoadedAgent } from "../loader.ts";
import { _resetMcpCache, type McpClient, type McpConnectFn } from "../connections/mcp.ts";
import { createStore } from "./store.ts";
import { subscribe } from "./stream.ts";
import type { AgentEvent } from "./events.ts";
import type { HookCtx } from "../eve-shim/types.ts";

const TOY = new URL("../testdata/toy-agent/agent", import.meta.url).pathname;
const BASE = "http://local/plugins/trex/toy";

function fakeHookCtx(overrides: Partial<HookCtx> = {}): HookCtx {
  return {
    sessionId: "s-1",
    env: () => undefined,
    sql: () => Promise.resolve({ rows: [] }),
    ...overrides,
  };
}

// See runner.test.ts's FINISH/sequencedModel comment for why the raw
// doStream chunk shapes are nested this way under ai@6 / LanguageModelV3.
const FINISH = {
  type: "finish",
  finishReason: { unified: "stop", raw: "stop" },
  usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
};
// deno-lint-ignore no-explicit-any
const textChunks = (text: string): any[] => [
  { type: "text-start", id: "1" },
  { type: "text-delta", id: "1", delta: text },
  { type: "text-end", id: "1" },
  FINISH,
];
// deno-lint-ignore no-explicit-any
const toolCallChunks = (toolName: string, input: unknown): any[] => [
  { type: "tool-call", toolCallId: "c-1", toolName, input: JSON.stringify(input) },
  {
    type: "finish",
    finishReason: { unified: "tool-calls", raw: "tool-calls" },
    usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
  },
];

// deno-lint-ignore no-explicit-any
function sequencedModel(...responses: any[][]) {
  let call = 0;
  return new MockLanguageModelV3({
    doStream: () => {
      const chunks = responses[Math.min(call++, responses.length - 1)];
      return Promise.resolve({ stream: simulateReadableStream({ chunks }) });
    },
  });
}

// Captures every doStream() call's options (notably `prompt`, which carries
// the system message as `prompt[0]` when a system prompt is set) so a test
// can assert on what the model actually received, not just what runTurn
// intended to send.
// deno-lint-ignore no-explicit-any
function capturingModel(...responses: any[][]) {
  let call = 0;
  // deno-lint-ignore no-explicit-any
  const calls: any[] = [];
  const model = new MockLanguageModelV3({
    // deno-lint-ignore no-explicit-any
    doStream: (options: any) => {
      calls.push(options);
      const chunks = responses[Math.min(call++, responses.length - 1)];
      return Promise.resolve({ stream: simulateReadableStream({ chunks }) });
    },
  });
  return { model, calls };
}

function memoryStoreCalls() {
  const calls: string[] = [];
  const fn = (sql: string) => {
    calls.push(sql.trim().split(/\s+/).slice(0, 4).join(" "));
    if (sql.includes("RETURNING id, seq")) return Promise.resolve({ rows: [{ id: "t-1", seq: 1 }] });
    if (sql.includes("RETURNING id")) return Promise.resolve({ rows: [{ id: "s-1" }] });
    if (sql.includes("RETURNING request_id")) return Promise.resolve({ rows: [{ request_id: "r-1" }] });
    return Promise.resolve({ rows: [] });
  };
  return { store: createStore(fn as never), calls };
}

// ---------------------------------------------------------------------------
// resolveModelForTurn (model.ts): resolution order, isolated from streamText.
// ---------------------------------------------------------------------------

Deno.test("resolveModelForTurn: no hook falls back to config.model via resolveModel", async () => {
  const env = (k: string) => ({ ANTHROPIC_API_KEY: "sk-a" } as Record<string, string>)[k];
  const m = await resolveModelForTurn({ model: "anthropic/claude-sonnet-5" }, fakeHookCtx({ env }));
  assertEquals(m.modelId, "claude-sonnet-5");
});

Deno.test("resolveModelForTurn: resolveModel hook returning a string wins over config.model", async () => {
  const env = (k: string) =>
    ({ ANTHROPIC_API_KEY: "sk-a", OPENAI_API_KEY: "sk-o" } as Record<string, string>)[k];
  const config = {
    model: "openai/gpt-5.4-mini",
    resolveModel: (_ctx: HookCtx) => Promise.resolve("anthropic/claude-sonnet-5"),
  };
  const m = await resolveModelForTurn(config, fakeHookCtx({ env }));
  assertEquals(m.modelId, "claude-sonnet-5"); // NOT gpt-5.4-mini — the hook wins
});

Deno.test("resolveModelForTurn: resolveModel hook returning a ModelSpec resolves via resolveModelSpec", async () => {
  const config = {
    model: "openai/gpt-5.4-mini",
    resolveModel: (_ctx: HookCtx) =>
      Promise.resolve({ provider: "anthropic" as const, modelId: "claude-opus-5", apiKey: "sk-spec" }),
  };
  // env has no anthropic key at all — proves the spec's own apiKey, not env,
  // is what construction succeeds with (a missing/undefined env key alone
  // wouldn't make provider construction throw either way, but the model
  // that gets built is the ModelSpec's, not config.model's).
  const m = await resolveModelForTurn(config, fakeHookCtx({ env: () => undefined }));
  assertEquals(m.modelId, "claude-opus-5");
});

Deno.test("resolveModelForTurn: throwing hook rejects and never falls back to config.model/env credentials", async () => {
  const env = (k: string) => ({ ANTHROPIC_API_KEY: "sk-a" } as Record<string, string>)[k];
  const config = {
    model: "anthropic/claude-sonnet-5", // would succeed if silently fallen back to
    resolveModel: (_ctx: HookCtx) => Promise.reject(new Error("no account bound to this tenant")),
  };
  await assertRejects(
    () => resolveModelForTurn(config, fakeHookCtx({ env })),
    Error,
    "no account bound to this tenant",
  );
});

// ---------------------------------------------------------------------------
// runTurn (runner.ts): buildInstructions honoring + userId sourcing.
// ---------------------------------------------------------------------------

Deno.test("runTurn: buildInstructions hook receives the instructions+skills base and its return reaches the model's system prompt", async () => {
  const agent = await loadAgent(TOY);
  assert(agent.skills.length > 0, "toy agent fixture must have at least one skill for this test to be meaningful");
  let seenBase = "";
  agent.config.buildInstructions = (base: string, _ctx: HookCtx) => {
    seenBase = base;
    return Promise.resolve(base + "\n\nEXTRA DIRECTIVE FROM HOOK");
  };
  const { store } = memoryStoreCalls();
  const { model, calls } = capturingModel(textChunks("hi"));
  const hookCtx = fakeHookCtx({ sessionId: "s-1" });
  await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    message: "hello", store, emit: () => {}, model, hookCtx,
  });
  // base handed to the hook is exactly buildSystemPrompt's output: the raw
  // instructions plus the "## Skills" section (no metadata block here).
  assert(seenBase.includes(agent.instructions));
  assert(seenBase.includes("## Skills"));
  assert(!seenBase.includes("<context>"));
  // The hook's return value — not the base — is what the model actually saw.
  assertEquals(calls.length, 1);
  const systemMsg = calls[0].prompt.find((m: { role: string }) => m.role === "system");
  assert(systemMsg, "expected a system message in the model's prompt");
  assert(systemMsg.content.includes("EXTRA DIRECTIVE FROM HOOK"));
});

Deno.test("runTurn: buildInstructions base includes the <context> metadata block when metadata is given", async () => {
  const agent = await loadAgent(TOY);
  let seenBase = "";
  agent.config.buildInstructions = (base: string) => {
    seenBase = base;
    return Promise.resolve(base);
  };
  const { store } = memoryStoreCalls();
  const model = sequencedModel(textChunks("hi"));
  await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    message: "hello", metadata: { tenant: "acme" }, store, emit: () => {}, model,
    hookCtx: fakeHookCtx({ metadata: { tenant: "acme" } }),
  });
  assert(seenBase.includes("<context>"));
  assert(seenBase.includes("acme"));
});

Deno.test("runTurn: a configured buildInstructions hook without a hookCtx fails loudly instead of silently skipping the hook", async () => {
  const agent = await loadAgent(TOY);
  agent.config.buildInstructions = (base: string) => Promise.resolve(base);
  const { store } = memoryStoreCalls();
  const model = sequencedModel(textChunks("hi"));
  await assertRejects(
    () =>
      runTurn({
        agent, sessionId: "s-1", turnId: "t-1", history: [],
        message: "hello", store, emit: () => {}, model, // no hookCtx
      }),
    Error,
    "hookCtx",
  );
});

Deno.test("runTurn: ToolContext.userId comes from the header-sourced opts.userId, never from metadata", async () => {
  const agent = await loadAgent(TOY);
  agent.tools.whoami = {
    description: "report the tool ctx", inputSchema: { type: "object", properties: {} },
    // deno-lint-ignore no-explicit-any
    execute: (_input: unknown, ctx?: any) =>
      Promise.resolve({ userId: ctx?.userId, metadataHadConflictingUserId: (ctx?.metadata as { userId?: string })?.userId }),
  };
  const { store } = memoryStoreCalls();
  const events: AgentEvent[] = [];
  await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    message: "who am I", store, emit: (e) => events.push(e),
    // metadata carries a DIFFERENT userId — must never leak into ToolContext.
    metadata: { userId: "attacker-supplied-id" },
    userId: "user-42",
    model: sequencedModel(toolCallChunks("whoami", {}), textChunks("done")),
  });
  const result = events.find(
    (e) => e.type === "action.result" && (e as { data: { result: { toolName: string } } }).data.result.toolName === "whoami",
  ) as { data: { result: { output: { userId?: string; metadataHadConflictingUserId?: string } } } };
  assert(result, "expected the whoami tool to have executed");
  assertEquals(result.data.result.output.userId, "user-42");
  assertEquals(result.data.result.output.metadataHadConflictingUserId, "attacker-supplied-id");
});

Deno.test("runTurn: ToolContext.sql is threaded from hookCtx.sql (task-v1 follow-up)", async () => {
  const agent = await loadAgent(TOY);
  agent.tools.query = {
    description: "run a query via ctx.sql", inputSchema: { type: "object", properties: {} },
    // deno-lint-ignore no-explicit-any
    execute: async (_input: unknown, ctx?: any) => ({ rows: (await ctx?.sql?.("SELECT 1"))?.rows }),
  };
  const { store } = memoryStoreCalls();
  const events: AgentEvent[] = [];
  const sql = (q: string) => Promise.resolve({ rows: [{ q }] });
  await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    message: "run a query", store, emit: (e) => events.push(e),
    model: sequencedModel(toolCallChunks("query", {}), textChunks("done")),
    hookCtx: fakeHookCtx({ sql }),
  });
  const result = events.find(
    (e) => e.type === "action.result" && (e as { data: { result: { toolName: string } } }).data.result.toolName === "query",
  ) as { data: { result: { output: { rows?: unknown[] } } } };
  assert(result, "expected the query tool to have executed");
  assertEquals(result.data.result.output.rows, [{ q: "SELECT 1" }]);
});

Deno.test("runTurn: ToolContext.sql is undefined (not a throw) when no hookCtx is wired", async () => {
  const agent = await loadAgent(TOY);
  agent.tools.query = {
    description: "run a query via ctx.sql", inputSchema: { type: "object", properties: {} },
    // deno-lint-ignore no-explicit-any
    execute: (_input: unknown, ctx?: any) => Promise.resolve({ hasSql: typeof ctx?.sql === "function" }),
  };
  const { store } = memoryStoreCalls();
  const events: AgentEvent[] = [];
  await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    message: "run a query", store, emit: (e) => events.push(e),
    model: sequencedModel(toolCallChunks("query", {}), textChunks("done")),
    // no hookCtx passed at all
  });
  const result = events.find(
    (e) => e.type === "action.result" && (e as { data: { result: { toolName: string } } }).data.result.toolName === "query",
  ) as { data: { result: { output: { hasSql?: boolean } } } };
  assert(result, "expected the query tool to have executed");
  assertEquals(result.data.result.output.hasSql, false);
});

// ---------------------------------------------------------------------------
// runSubagent (toolset.ts, via the built-in `agent` tool): a subagent's
// system prompt resolves through the same buildInstructions hook path as a
// top-level turn, not just the static buildSystemPrompt.
// ---------------------------------------------------------------------------

Deno.test("agent tool: a target subagent's buildInstructions hook runs and its return reaches the nested model's system prompt", async () => {
  const agent = await loadAgent(TOY);
  const shouter = agent.subagents.shouter;
  let seenBase = "";
  shouter.config.buildInstructions = (base: string, _ctx: HookCtx) => {
    seenBase = base;
    return Promise.resolve(base + "\n\nSUBAGENT HOOK MARKER");
  };
  const { model, calls } = capturingModel(textChunks("done"));
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, model, hookCtx: fakeHookCtx() });
  const result = await (tools.agent as { execute: (input: unknown) => Promise<{ text: string }> })
    .execute({ agent: "shouter", prompt: "shout banana" });
  assertEquals(result.text, "done");
  // base handed to the hook is exactly buildSystemPrompt's output for shouter.
  assert(seenBase.includes(shouter.instructions));
  assertEquals(calls.length, 1);
  const systemMsg = calls[0].prompt.find((m: { role: string }) => m.role === "system");
  assert(systemMsg, "expected a system message in the nested model's prompt");
  assert(systemMsg.content.includes("SUBAGENT HOOK MARKER"));
});

Deno.test("agent tool: a target subagent with no buildInstructions hook gets exactly buildSystemPrompt's output, unchanged", async () => {
  const agent = await loadAgent(TOY);
  const shouter = agent.subagents.shouter;
  const { model, calls } = capturingModel(textChunks("done"));
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, model, hookCtx: fakeHookCtx() });
  await (tools.agent as { execute: (input: unknown) => Promise<{ text: string }> })
    .execute({ agent: "shouter", prompt: "shout banana" });
  const systemMsg = calls[0].prompt.find((m: { role: string }) => m.role === "system");
  assert(systemMsg, "expected a system message in the nested model's prompt");
  assertEquals(systemMsg.content, buildSystemPrompt(shouter, undefined));
});

Deno.test("agent tool: a target subagent's buildInstructions hook without a hookCtx fails loudly instead of silently using the base prompt", async () => {
  const agent = await loadAgent(TOY);
  const shouter = agent.subagents.shouter;
  shouter.config.buildInstructions = (base: string) => Promise.resolve(base);
  const { model } = capturingModel(textChunks("done"));
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, model }); // no hookCtx
  await assertRejects(
    () =>
      (tools.agent as { execute: (input: unknown) => Promise<unknown> })
        .execute({ agent: "shouter", prompt: "shout banana" }),
    Error,
    "hookCtx",
  );
});

// ---------------------------------------------------------------------------
// runSubagent (toolset.ts): Task 4 — stream subagent progress via toolEmit
// instead of discarding the nested turn's steps until it finishes. See
// task-4-brief.md. No `makeAgent`/`makeToolBuildCtx`/`subagentScript`
// fixtures exist in this file — reuses the same loadAgent(TOY) + sequencedModel
// stub as the "agent tool" tests just above, driving the nested model through
// a tool-call step (shouter's own `shout` tool) then a final text step.
// ---------------------------------------------------------------------------

Deno.test("runSubagent emits subagent.start/tool/end progress under one runId, via toolEmit", async () => {
  const agent = await loadAgent(TOY);
  const events: Array<{ name: string; data: any }> = [];
  const model = sequencedModel(toolCallChunks("shout", { text: "hi" }), textChunks("found it"));
  const tools = await buildSdkTools({
    agent, sessionId: "s-1", depth: 0, model, hookCtx: fakeHookCtx(),
    toolEmit: (name: string, data: unknown) => events.push({ name, data: data as any }),
  });
  const result = await (tools.agent as { execute: (input: unknown) => Promise<{ text: string }> })
    .execute({ agent: "shouter", prompt: "shout hi" });

  assertEquals(result.text, "found it");
  const names = events.map((e) => e.name);
  assertEquals(names[0], "subagent.start");
  assertEquals(names[names.length - 1], "subagent.end");
  assert(names.includes("subagent.tool"));

  // One runId for the whole nested run.
  const runIds = new Set(events.map((e) => e.data.runId));
  assertEquals(runIds.size, 1);
  assertEquals(events[0].data.agent, "shouter");
  assertEquals(events[events.length - 1].data.text, "found it");
});

Deno.test("runSubagent's return value is unchanged ({ text }) when no toolEmit is wired", async () => {
  const agent = await loadAgent(TOY);
  const model = sequencedModel(toolCallChunks("shout", { text: "hi" }), textChunks("found it"));
  // No toolEmit in ctx at all — must not throw, must return the same shape.
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, model, hookCtx: fakeHookCtx() });
  const result = await (tools.agent as { execute: (input: unknown) => Promise<{ text: string }> })
    .execute({ agent: "shouter", prompt: "shout hi" });
  assertEquals(result, { text: "found it" });
});

// ---------------------------------------------------------------------------
// buildSdkTools (toolset.ts): H2 — filterTools hook + dynamic-tools.ts
// provider. See .superpowers/sdd/task-h2-brief.md.
// ---------------------------------------------------------------------------

Deno.test("buildSdkTools: filterTools drops a tool, INCLUDING the built-in skill/agent tools", async () => {
  const agent = await loadAgent(TOY);
  assert(agent.skills.length > 0, "toy agent fixture must have a skill for this test to be meaningful");
  agent.config.filterTools = (name) => name !== "echo" && name !== "skill";
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  assert(!("echo" in tools), "filterTools should have dropped the authored echo tool");
  assert(!("skill" in tools), "filterTools should have dropped the built-in skill tool too");
  assert("agent" in tools, "agent tool was not targeted by the filter and should remain");
  assert("propose_card" in tools, "propose_card was not targeted by the filter and should remain");
});

Deno.test("buildSdkTools: a configured filterTools hook without a hookCtx fails loudly", async () => {
  const agent = await loadAgent(TOY);
  agent.config.filterTools = () => true;
  await assertRejects(
    () => buildSdkTools({ agent, sessionId: "s-1", depth: 0 }), // no hookCtx
    Error,
    "hookCtx",
  );
});

Deno.test("buildSdkTools: dynamic-tools.ts provider merges tools in; authored tools win on name collision", async () => {
  const agent = await loadAgent(TOY);
  const seenCtx: HookCtx[] = [];
  agent.toolProvider = (ctx) => {
    seenCtx.push(ctx);
    return Promise.resolve({
      // Collides with the authored tools/echo.ts — the authored file must win.
      echo: {
        description: "dynamic echo (must be shadowed by the authored tool)",
        inputSchema: { type: "object" },
        execute: () => Promise.resolve({ from: "dynamic" }),
      },
      weather: {
        description: "dynamic-only tool",
        inputSchema: { type: "object" },
        execute: () => Promise.resolve({ from: "dynamic" }),
      },
    });
  };
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx({ sessionId: "s-99" }) });
  assert("weather" in tools, "the dynamic-only tool must be merged into the tool set");
  assertEquals(seenCtx.length, 1);
  assertEquals(seenCtx[0].sessionId, "s-99", "the provider must receive the real per-request hookCtx");
  const echoResult = await (tools.echo as { execute: (input: unknown) => Promise<unknown> }).execute({ text: "hi" });
  assertEquals(echoResult, { echoed: "hi" }, "the authored echo tool must run, not the shadowed dynamic one");
});

Deno.test("buildSdkTools: a throwing dynamic-tools.ts provider is logged and the turn continues with static tools only", async () => {
  const agent = await loadAgent(TOY);
  agent.toolProvider = () => Promise.reject(new Error("MCP server unreachable"));
  const logged: string[] = [];
  // H5 review nit: the provider-failure log uses console.error (matches the
  // file's other error-path logging), not console.log — intercept the right
  // stream or this test would pass vacuously.
  const origError = console.error;
  console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  let tools: Record<string, unknown>;
  try {
    tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  } finally {
    console.error = origError;
  }
  assert("echo" in tools, "static authored tools must still be present");
  assert("agent" in tools, "built-in tools must still be present");
  assert(logged.some((l) => l.includes("MCP server unreachable")), "the provider's failure must be logged, not swallowed silently");
});

Deno.test("buildSdkTools: dynamic-tools.ts provider is skipped (not called) when no hookCtx is available — logged, never thrown", async () => {
  const agent = await loadAgent(TOY);
  let providerCalls = 0;
  agent.toolProvider = () => {
    providerCalls++;
    return Promise.resolve({});
  };
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0 }); // no hookCtx
  assertEquals(providerCalls, 0);
  assert("echo" in tools, "static tools must still build fine with no hookCtx and no filterTools configured");
});

Deno.test("buildSdkTools: a subagent's own dynamic-tools.ts provider does NOT run at depth 1 (top-level-only), but its filterTools still does", async () => {
  const agent = await loadAgent(TOY);
  const shouter = agent.subagents.shouter;
  let providerCalls = 0;
  shouter.toolProvider = () => {
    providerCalls++;
    return Promise.resolve({ weather: { description: "d", inputSchema: { type: "object" }, execute: () => Promise.resolve({}) } });
  };
  let filterCalls = 0;
  shouter.config.filterTools = (name) => {
    filterCalls++;
    return name !== "shout";
  };
  const nested = await buildSdkTools({ agent: shouter, sessionId: "s-1", depth: 1, hookCtx: fakeHookCtx() });
  assertEquals(providerCalls, 0, "a subagent's own dynamic-tools.ts provider must not run — dynamic tools are a top-level-only concern");
  assert(filterCalls > 0, "filterTools must still run at subagent depth 1, unlike the provider");
  assert(!("weather" in nested), "the provider never ran, so its tool must be absent");
  assert(!("shout" in nested), "filterTools dropped the subagent's own shout tool");
});

// ---------------------------------------------------------------------------
// buildSdkTools (toolset.ts): Task 5 — the connection_search built-in. Gated
// to depth 0 and only when the agent has connections; an authored
// tools/connection_search wins (logged); the search surfaces the eagerly
// realized <conn>__<tool> names. The toy fixture ships an `echo` MCP
// connection, so a fake MCP connect stands in for the real transport.
// ---------------------------------------------------------------------------

const CONN_REMOTE_TOOLS = [
  { name: "ping", description: "Ping the echo server", inputSchema: { type: "object", properties: {} } },
  { name: "danger", description: "A destructive op", inputSchema: { type: "object", properties: {} } },
];

function fakeMcpConnect(tools = CONN_REMOTE_TOOLS): McpConnectFn {
  return () => {
    const client: McpClient = {
      listTools: () => Promise.resolve({ tools }),
      callTool: () => Promise.resolve({ content: [{ type: "text", text: "pong" }] }),
    };
    return Promise.resolve(client);
  };
}

Deno.test("buildSdkTools: connection_search is present at depth 0 and a query returns matching <conn>__<tool> entries", async () => {
  _resetMcpCache();
  const agent = await loadAgent(TOY); // ships the `echo` MCP connection fixture
  assert(Object.keys(agent.connections).length > 0, "toy fixture must have a connection for this test");
  const tools = await buildSdkTools({
    agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx(),
    connectionOpts: { connect: fakeMcpConnect() },
  });
  assert("connection_search" in tools, "connection_search must be present at depth 0 when the agent has connections");
  const res = await (tools.connection_search as { execute: (i: unknown) => Promise<{ matches: { name: string }[] }> })
    .execute({ query: "ping" });
  const names = res.matches.map((m) => m.name);
  assertEquals(names[0], "echo__ping", "the ping tool must rank first for a 'ping' query");
  assert(!names.includes("echo__danger"), "the unrelated danger tool must not match 'ping'");
});

Deno.test("buildSdkTools: connection_search is absent when the agent has no connections", async () => {
  const agent = await loadAgent(TOY);
  agent.connections = {};
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  assert(!("connection_search" in tools), "no connections → no connection_search built-in");
});

Deno.test("buildSdkTools: a subagent (depth 1) does not get connection_search even if it has connections", async () => {
  _resetMcpCache();
  const agent = await loadAgent(TOY);
  const shouter = agent.subagents.shouter;
  shouter.connections = agent.connections; // give the subagent a connection too
  const nested = await buildSdkTools({
    agent: shouter, sessionId: "s-1", depth: 1, hookCtx: fakeHookCtx(),
    connectionOpts: { connect: fakeMcpConnect() },
  });
  assert(!("connection_search" in nested), "connection_search is a top-level-only (depth 0) built-in");
});

Deno.test("buildSdkTools: an authored tools/connection_search wins over the built-in (logged)", async () => {
  _resetMcpCache();
  const agent = await loadAgent(TOY);
  agent.tools.connection_search = {
    description: "authored connection_search",
    inputSchema: { type: "object" },
    execute: () => Promise.resolve({ from: "authored" }),
  };
  const logged: string[] = [];
  const origLog = console.log;
  console.log = (...a: unknown[]) => logged.push(a.map(String).join(" "));
  let tools: Record<string, unknown>;
  try {
    tools = await buildSdkTools({
      agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx(),
      connectionOpts: { connect: fakeMcpConnect() },
    });
  } finally {
    console.log = origLog;
  }
  const result = await (tools.connection_search as { execute: (i: unknown) => Promise<unknown> }).execute({ query: "x" });
  assertEquals(result, { from: "authored" }, "the authored tool must run, not the built-in");
  assert(
    logged.some((l) => l.includes("overrides the built-in connection_search")),
    "the override must be logged, not silently dropped",
  );
});

// ---------------------------------------------------------------------------
// buildSdkTools / authoredTool (toolset.ts): Task 2 — onToolCall/onToolResult
// interception hooks. See task-2-brief.md. `makeAgent`/`makeToolBuildCtx`
// helpers named in the brief don't exist in this file — adapted to the
// loadAgent(TOY) + ad-hoc agent.tools/agent.config mutation + plain ctx
// object literal style every other test above already uses.
// ---------------------------------------------------------------------------

Deno.test("onToolCall can rewrite a tool's input before execute", async () => {
  const agent = await loadAgent(TOY);
  let seen: unknown = null;
  agent.tools.rewriteme = {
    description: "echo",
    inputSchema: { type: "object", properties: { v: { type: "string" } } },
    execute: (input: unknown) => {
      seen = input;
      return Promise.resolve("ok");
    },
  };
  agent.config.onToolCall = (call) =>
    Promise.resolve({ allow: true, input: { v: `${(call.input as { v: string }).v}!` } });
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  await (tools.rewriteme as { execute: (input: unknown) => Promise<unknown> }).execute({ v: "hi" });
  assertEquals(seen, { v: "hi!" });
});

Deno.test("onToolCall returning allow:false blocks execute and surfaces reason", async () => {
  const agent = await loadAgent(TOY);
  let ran = false;
  agent.tools.danger = {
    description: "d",
    inputSchema: { type: "object" },
    execute: () => {
      ran = true;
      return Promise.resolve("ok");
    },
  };
  agent.config.onToolCall = () => Promise.resolve({ allow: false, reason: "blocked by policy" });
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  const out = await (tools.danger as { execute: (input: unknown) => Promise<unknown> }).execute({});
  assertEquals(ran, false);
  assertEquals(out, { error: "blocked by policy" });
});

Deno.test("a throwing onToolCall denies the call without failing the turn", async () => {
  const agent = await loadAgent(TOY);
  let ran = false;
  agent.tools.danger = {
    description: "d",
    inputSchema: { type: "object" },
    execute: () => {
      ran = true;
      return Promise.resolve("ok");
    },
  };
  agent.config.onToolCall = () => Promise.reject(new Error("hook exploded"));
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  const out = await (tools.danger as { execute: (input: unknown) => Promise<unknown> }).execute({});
  assertEquals(ran, false);
  assert(String((out as { error: string }).error).includes("hook exploded"));
});

Deno.test("onToolResult rewrites the tool result", async () => {
  const agent = await loadAgent(TOY);
  agent.tools.rewriteme = {
    description: "echo",
    inputSchema: { type: "object" },
    execute: () => Promise.resolve("raw"),
  };
  agent.config.onToolResult = (call) => Promise.resolve(`wrapped(${call.result})`);
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  assertEquals(await (tools.rewriteme as { execute: (input: unknown) => Promise<unknown> }).execute({}), "wrapped(raw)");
});

// Ordering is a security property, not a preference: a hook that ran before
// the approval gate could approve on the user's behalf.
Deno.test("the approval gate runs BEFORE onToolCall", async () => {
  const agent = await loadAgent(TOY);
  const order: string[] = [];
  agent.tools.danger = {
    description: "d",
    inputSchema: { type: "object" },
    needsApproval: true,
    execute: () => Promise.resolve("ok"),
  };
  agent.config.onToolCall = () => {
    order.push("hook");
    return Promise.resolve({ allow: true });
  };
  // No store/turnId/emit wired -> the approval gate short-circuits with
  // "approval required", which must happen without the hook ever running.
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0, hookCtx: fakeHookCtx() });
  const out = await (tools.danger as { execute: (input: unknown) => Promise<unknown> }).execute({});
  assertEquals(out, { error: "approval required — use the session API" });
  assertEquals(order, []);
});

// Review fix (round 1, Finding 2): a configured onToolCall/onToolResult hook
// with no hookCtx wired must THROW, not silently skip the hook — that gap is
// a caller wiring bug, not a hook failure, and fail-open would defeat a
// control whose entire purpose is to deny. Same posture as buildInstructions'
// existing hookCtx check (resolveInstructions above).
Deno.test("a configured onToolCall hook with no hookCtx available throws instead of silently skipping", async () => {
  const agent = await loadAgent(TOY);
  let ran = false;
  agent.tools.danger = {
    description: "d",
    inputSchema: { type: "object" },
    execute: () => {
      ran = true;
      return Promise.resolve("ok");
    },
  };
  agent.config.onToolCall = () => Promise.resolve({ allow: true });
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0 }); // no hookCtx
  await assertRejects(
    () => (tools.danger as { execute: (input: unknown) => Promise<unknown> }).execute({}),
    Error,
    "onToolCall hook configured but no request context (hookCtx) available",
  );
  assertEquals(ran, false);
});

Deno.test("a configured onToolResult hook with no hookCtx available throws instead of silently skipping", async () => {
  const agent = await loadAgent(TOY);
  agent.tools.rewriteme = {
    description: "echo",
    inputSchema: { type: "object" },
    execute: () => Promise.resolve("raw"),
  };
  agent.config.onToolResult = (call) => Promise.resolve(`wrapped(${call.result})`);
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0 }); // no hookCtx
  await assertRejects(
    () => (tools.rewriteme as { execute: (input: unknown) => Promise<unknown> }).execute({}),
    Error,
    "onToolResult hook configured but no request context (hookCtx) available",
  );
});

// ---------------------------------------------------------------------------
// createHandler (handler.ts): end-to-end wiring for both the session API and
// /chat — x-user-id header sourcing, and a throwing resolveModel hook
// failing the turn instead of silently using env-configured credentials.
// ---------------------------------------------------------------------------

function inMemoryDb() {
  const sessions = new Map<string, { status: string }>();
  const turns: Array<{ id: string; session_id: string; seq: number; status: string; error: string | null }> = [];
  const steps: Array<{ turn_id: string; seq: number; kind: string; name: string | null; payload: unknown; usage: unknown }> = [];
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let n = 0;
  const query = (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes("INSERT INTO agents.sessions")) {
      const id = `s-${++n}`;
      sessions.set(id, { status: "active" });
      return Promise.resolve({ rows: [{ id }] });
    }
    if (sql.includes("SELECT id, status FROM agents.sessions")) {
      const s = sessions.get(params[0] as string);
      return Promise.resolve({ rows: s ? [{ id: params[0], status: s.status }] : [] });
    }
    if (sql.includes("INSERT INTO agents.turns")) {
      const seq = turns.filter((t) => t.session_id === params[0]).length + 1;
      const t = { id: `t-${++n}`, session_id: params[0] as string, seq, status: "running", error: null };
      turns.push(t);
      return Promise.resolve({ rows: [{ id: t.id, seq }] });
    }
    if (sql.includes("UPDATE agents.turns")) {
      const t = turns.find((t) => t.id === params[0]);
      if (t) {
        t.status = params[1] as string;
        t.error = (params[2] as string | null) ?? null;
      }
      return Promise.resolve({ rows: [] });
    }
    if (sql.includes("INSERT INTO agents.steps")) {
      steps.push({
        turn_id: params[0] as string, seq: params[1] as number, kind: params[2] as string,
        name: params[3] as string | null, payload: params[4], usage: params[5],
      });
      return Promise.resolve({ rows: [] });
    }
    if (sql.includes("FROM agents.steps")) {
      const sid = params[0] as string;
      const parse = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
      const rows = steps
        .filter((s) => turns.some((t) => t.id === s.turn_id && t.session_id === sid))
        .map((s) => ({ turn_id: s.turn_id, kind: s.kind, name: s.name, payload: parse(s.payload), usage: parse(s.usage) }));
      return Promise.resolve({ rows });
    }
    return Promise.resolve({ rows: [] });
  };
  return { query, turns, steps, calls };
}

async function until(cond: () => boolean, ms = 5000) {
  const deadline = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 25));
  }
}
const settled = (db: ReturnType<typeof inMemoryDb>) =>
  db.turns.length > 0 && db.turns.every((t) => t.status !== "running");

async function makeHandler(
  opts: { model?: unknown; noDefaultModel?: boolean; mutate?: (agent: LoadedAgent) => void } = {},
) {
  const agent = await loadAgent(TOY);
  opts.mutate?.(agent);
  const db = inMemoryDb();
  // noDefaultModel: true forces deps.model to stay undefined so
  // resolveModelForTurn's real (non-mock) resolution path actually runs —
  // `model: undefined` alone isn't enough, since `opts.model ?? <default>`
  // would still fall back to the default mock model.
  const model = opts.noDefaultModel ? undefined : (opts.model ?? sequencedModel(textChunks("hello from toy")));
  const handler = createHandler({
    agent, store: createStore(db.query as never),
    plugin: "toy-agent", agentName: "toy",
    basePath: "/plugins/trex/toy", model,
    sql: db.query as never,
  });
  return { handler, db };
}

Deno.test("handler /eve/v1/session: x-user-id header lands in ToolContext.userId, never from metadata", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("whoami", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.whoami = {
        description: "report the tool ctx", inputSchema: { type: "object", properties: {} },
        // deno-lint-ignore no-explicit-any
        execute: (_input: unknown, ctx?: any) => Promise.resolve({ userId: ctx?.userId }),
      };
    },
  });
  await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": "user-42" },
    // metadata carries a conflicting userId — must never win.
    body: JSON.stringify({ message: "who am I", metadata: { userId: "attacker-supplied-id" } }),
  }));
  await until(() => settled(db));
  const whoamiStep = db.steps.find((s) => s.kind === "tool-result" && s.name === "whoami");
  assert(whoamiStep, "expected the whoami tool-result step to be persisted");
  // addStep JSON.stringifies payload before "insert" (targets a jsonb column
  // on real Postgres) — parse it back, same as the FROM-agents.steps query
  // path does (see inMemoryDb's comment in handler.test.ts).
  const payload = JSON.parse(whoamiStep!.payload as string) as { output: { userId?: string } };
  assertEquals(payload.output.userId, "user-42");
});

Deno.test("handler /eve/v1/session: a throwing resolveModel hook fails the turn with turn.failed + session.failed, no fallback to env credentials", async () => {
  const { handler, db } = await makeHandler({
    // deno-lint-ignore no-explicit-any
    mutate: (agent: any) => {
      // config.model is set and WOULD resolve fine via env — proves the
      // failure is the hook's, not an incidental missing-model error, and
      // that runTurn does not fall back to it.
      agent.config.model = "anthropic/claude-sonnet-5";
      agent.config.resolveModel = () => Promise.reject(new Error("no account bound to this tenant"));
    },
    noDefaultModel: true, // force real resolution (deps.model would otherwise short-circuit the hook)
  });
  const live: AgentEvent[] = [];
  const unsub = subscribe("s-1", (e) => live.push(e)); // deterministic fake-DB id, see handler.test.ts
  const logged: string[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    const res = await handler(new Request(`${BASE}/eve/v1/session`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    }));
    assertEquals(res.status, 200); // the failure is async — session creation still succeeds
    await until(() => settled(db));
  } finally {
    console.error = origError;
    unsub();
  }
  assertEquals(db.turns[0].status, "failed");
  assert(db.turns[0].error && db.turns[0].error.includes("no account bound to this tenant"));
  assertEquals(live.filter((e) => e.type === "turn.failed").length, 1);
  assertEquals(live.filter((e) => e.type === "session.failed").length, 1);
});

Deno.test("handler /chat: buildInstructions hook applies to the /chat system prompt too", async () => {
  const { model, calls } = capturingModel(textChunks("hi"));
  const { handler } = await makeHandler({
    model,
    mutate: (agent) => {
      agent.config.buildInstructions = (base: string) => Promise.resolve(base + "\n\nCHAT HOOK MARKER");
    },
  });
  const res = await handler(new Request(`${BASE}/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
  }));
  assertEquals(res.status, 200);
  await res.text(); // drain the stream — see handler.test.ts's comment on leaked timers
  assertEquals(calls.length, 1);
  const systemMsg = calls[0].prompt.find((m: { role: string }) => m.role === "system");
  assert(systemMsg);
  assert(systemMsg.content.includes("CHAT HOOK MARKER"));
});

Deno.test("handler /chat: a throwing resolveModel hook fails the request instead of silently using env credentials", async () => {
  const { handler } = await makeHandler({
    noDefaultModel: true, // force real resolution
    // deno-lint-ignore no-explicit-any
    mutate: (agent: any) => {
      agent.config.model = "anthropic/claude-sonnet-5"; // would succeed if fallen back to
      agent.config.resolveModel = () => Promise.reject(new Error("no account bound to this tenant"));
    },
  });
  await assertRejects(
    () =>
      handler(new Request(`${BASE}/chat`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
      })),
    Error,
    "no account bound to this tenant",
  );
});
