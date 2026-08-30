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
