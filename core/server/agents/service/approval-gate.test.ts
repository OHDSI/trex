import { assertEquals } from "jsr:@std/assert";
import { type ApprovalGateStore, runApprovalGate } from "./approval-gate.ts";
import type { AgentEvent } from "./events.ts";

// The gate is shared by toolset.ts's authoredTool and the external-engine
// path, so it is tested here against its own inputs rather than only through
// a built tool set — an engine has no ToolDef to hang a test on.
function fakeStore(
  opts: { consent?: "always" | "never" | null; decisions?: Array<string | null> } = {},
): ApprovalGateStore & { created: Array<{ tool: string; scopeKey: string; turnId: string }> } {
  const created: Array<{ tool: string; scopeKey: string; turnId: string }> = [];
  const decisions = [...(opts.decisions ?? [])];
  return {
    created,
    getToolConsent: () => Promise.resolve(opts.consent ?? null),
    createApproval: (_sessionId, turnId, tool, _input, scopeKey) => {
      created.push({ tool, scopeKey, turnId });
      return Promise.resolve(`r-${created.length}`);
    },
    getApprovalDecision: () => Promise.resolve(decisions.length > 0 ? decisions.shift() ?? null : null),
  };
}

const base = (store: ApprovalGateStore, events: AgentEvent[]) => ({
  toolName: "Bash",
  input: { command: "ls" },
  scopeKey: "/w+bash:ls",
  sessionId: "s-1",
  turnId: "t-1",
  store,
  emit: (e: AgentEvent) => void events.push(e),
  userId: "u-1",
  plugin: "devx",
  agentName: "coder",
  approvalPollMs: 1,
  approvalTimeoutMs: 200,
});

Deno.test("approval gate: a sticky 'always' allows without opening a request", async () => {
  const store = fakeStore({ consent: "always" });
  const events: AgentEvent[] = [];
  assertEquals(await runApprovalGate(base(store, events)), null);
  assertEquals(store.created.length, 0);
  assertEquals(events.length, 0);
});

Deno.test("approval gate: a sticky 'never' denies without opening a request", async () => {
  const store = fakeStore({ consent: "never" });
  const events: AgentEvent[] = [];
  assertEquals(await runApprovalGate(base(store, events)), { error: "denied by user" });
  assertEquals(store.created.length, 0);
});

Deno.test("approval gate: an approved request lets the call proceed and announces itself once", async () => {
  const store = fakeStore({ decisions: [null, "approve"] });
  const events: AgentEvent[] = [];
  assertEquals(await runApprovalGate(base(store, events)), null);
  assertEquals(store.created, [{ tool: "Bash", scopeKey: "/w+bash:ls", turnId: "t-1" }]);
  assertEquals(events.length, 1);
  assertEquals(events[0].type, "input.requested");
});

Deno.test("approval gate: a denied request refuses the call", async () => {
  const store = fakeStore({ decisions: ["deny"] });
  const events: AgentEvent[] = [];
  assertEquals(await runApprovalGate(base(store, events)), { error: "denied by user" });
});

Deno.test("approval gate: no decision inside the window times out rather than waiting forever", async () => {
  const store = fakeStore({});
  const events: AgentEvent[] = [];
  assertEquals(await runApprovalGate({ ...base(store, events), approvalTimeoutMs: 20 }), {
    error: "approval timed out",
  });
});

Deno.test("approval gate: an aborted turn stops waiting instead of parking for the full window", async () => {
  const store = fakeStore({});
  const events: AgentEvent[] = [];
  const controller = new AbortController();
  controller.abort();
  assertEquals(
    await runApprovalGate({ ...base(store, events), approvalTimeoutMs: 60_000, signal: controller.signal }),
    { error: "turn aborted" },
  );
});

Deno.test("approval gate: a caller with no store/turn/emit cannot gate and says so", async () => {
  assertEquals(
    await runApprovalGate({ toolName: "Bash", input: {}, scopeKey: "/w+bash:ls", sessionId: "s-1" }),
    { error: "approval required — use the session API" },
  );
});

// ---------------------------------------------------------------------------
// The consent-key migration. Giving Bash keys a subcommand (`<ws>+git:push`
// where it used to be `<ws>+git`) orphans every stored row, and store.ts
// matches scope_key EXACTLY. An orphaned `always` is fail-safe — the user is
// asked again. An orphaned `never` is FAIL-OPEN, and that is what these pin.
// ---------------------------------------------------------------------------

// Records what was looked up, so "did it fall back at all" is observable
// rather than inferred from the verdict.
function keyedStore(rows: Record<string, "always" | "never">): ApprovalGateStore & { lookups: string[] } {
  const lookups: string[] = [];
  return {
    lookups,
    getToolConsent: (_u, _p, _a, _t, scopeKey) => {
      lookups.push(scopeKey);
      return Promise.resolve(rows[scopeKey] ?? null);
    },
    createApproval: () => Promise.resolve("r-1"),
    getApprovalDecision: () => Promise.resolve(null),
  };
}

Deno.test("consent keys: a 'never' recorded under the old coarse key still refuses", async () => {
  const store = keyedStore({ "/w+git": "never" });
  const events: AgentEvent[] = [];
  const push = {
    ...base(store, events),
    toolName: "Bash",
    input: { command: "git push origin main" },
    scopeKey: "/w+git:push",
  };
  assertEquals(await runApprovalGate(push), { error: "denied by user" });
  // Exact first, coarse only on a miss.
  assertEquals(store.lookups, ["/w+git:push", "/w+git"]);
});

Deno.test("consent keys: an 'always' recorded under the old coarse key does NOT grant the subcommand", async () => {
  const store = keyedStore({ "/w+git": "always" });
  const events: AgentEvent[] = [];
  // A subcommand in no escalate tier, so an honoured coarse `always` would show
  // up as an immediate allow. It reaches the gate and times out instead: the
  // coarse row was read and deliberately ignored.
  const soft = {
    ...base(store, events),
    toolName: "Bash",
    input: { command: "git clean -fdx" },
    scopeKey: "/w+git:clean",
    approvalTimeoutMs: 20,
  };
  assertEquals(await runApprovalGate(soft), { error: "approval timed out" });
  assertEquals(store.lookups, ["/w+git:clean", "/w+git"]);
});

Deno.test("consent keys: an exact row wins outright and no coarse lookup happens", async () => {
  const store = keyedStore({ "/w+git:clean": "never", "/w+git": "always" });
  const events: AgentEvent[] = [];
  const exact = {
    ...base(store, events),
    toolName: "Bash",
    input: { command: "git clean" },
    scopeKey: "/w+git:clean",
  };
  assertEquals(await runApprovalGate(exact), { error: "denied by user" });
  assertEquals(store.lookups, ["/w+git:clean"]);
});

Deno.test("consent keys: a key with nothing to coarsen issues no second query", async () => {
  const store = keyedStore({});
  const events: AgentEvent[] = [];
  await runApprovalGate({ ...base(store, events), approvalTimeoutMs: 20 });
  assertEquals(store.lookups, ["/w+bash:ls"]);
});
