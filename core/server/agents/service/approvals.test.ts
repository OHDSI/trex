// Unit tests for the shared approval-decision resolver (Task 17). The native
// routes (handler.test.ts) exercise it through HTTP; these pin its behavior
// directly so channel resume can rely on the same semantics.
import { assert, assertEquals } from "jsr:@std/assert";
import { resolveApprovalDecision } from "./approvals.ts";
import type { EscalateList } from "./approval-policy.ts";
import type { AgentStore } from "./store.ts";

// Minimal in-memory approvals store matching the columns the resolver touches.
// turnStatus defaults to "running" when omitted, so existing tests that don't
// care about turn status keep behaving as before the guard was added.
function fakeStore() {
  const approvals = new Map<string, {
    decision: string | null; sessionId: string; tool: string;
    scopeKey?: string; turnStatus?: string;
  }>();
  const consents: Array<{ userId: string; plugin: string; agent: string; tool: string; scopeKey: string; consent: string }> = [];
  const store = {
    resolveApproval(requestId: string, decision: "approve" | "deny", sessionId: string) {
      const a = approvals.get(requestId);
      if (!a || a.decision !== null || a.sessionId !== sessionId) return Promise.resolve(false);
      a.decision = decision;
      return Promise.resolve(true);
    },
    getApprovalScope(requestId: string) {
      const a = approvals.get(requestId);
      return Promise.resolve(a ? { tool: a.tool, scopeKey: a.scopeKey ?? "" } : null);
    },
    getApprovalTurnStatus(requestId: string) {
      const a = approvals.get(requestId);
      if (!a) return Promise.resolve(null);
      return Promise.resolve(a.turnStatus ?? "running");
    },
    setToolConsent(userId: string, plugin: string, agent: string, tool: string, scopeKey: string, consent: "always" | "never") {
      consents.push({ userId, plugin, agent, tool, scopeKey, consent });
      return Promise.resolve();
    },
  } as unknown as AgentStore;
  return { store, approvals, consents };
}

const CTX = { plugin: "p", agentName: "a", userId: undefined as string | undefined };

Deno.test("approve resolves a pending request as approve, no consent", async () => {
  const { store, approvals, consents } = fakeStore();
  approvals.set("r1", { decision: null, sessionId: "s1", tool: "danger" });
  const res = await resolveApprovalDecision(store, "s1", { requestId: "r1", decision: "approve" }, CTX);
  assertEquals(res, { ok: true });
  assertEquals(approvals.get("r1")!.decision, "approve");
  assertEquals(consents.length, 0);
});

Deno.test("unknown / already-decided / wrong-session request -> ok:false, no throw", async () => {
  const { store, approvals } = fakeStore();
  approvals.set("r1", { decision: null, sessionId: "s1", tool: "danger" });
  // wrong session
  assertEquals(await resolveApprovalDecision(store, "other", { requestId: "r1", decision: "approve" }, CTX), { ok: false });
  // unknown id — now caught by the turn-status guard (Task 2 of the
  // never-stuck plan) before ever reaching resolveApproval, so it comes back
  // with the "unknown approval request" error rather than a bare ok:false.
  assertEquals(await resolveApprovalDecision(store, "s1", { requestId: "nope", decision: "approve" }, CTX), {
    ok: false,
    error: "unknown approval request",
  });
  // still pending (wrong-session/unknown must not have consumed it)
  assertEquals(approvals.get("r1")!.decision, null);
});

Deno.test("sticky 'always' persists as approve and upserts a consent (with userId)", async () => {
  const { store, approvals, consents } = fakeStore();
  approvals.set("r1", { decision: null, sessionId: "s1", tool: "danger" });
  const res = await resolveApprovalDecision(store, "s1", { requestId: "r1", decision: "always" }, { plugin: "p", agentName: "a", userId: "u1" });
  assertEquals(res, { ok: true });
  assertEquals(approvals.get("r1")!.decision, "approve");
  assertEquals(consents, [{ userId: "u1", plugin: "p", agent: "a", tool: "danger", scopeKey: "", consent: "always" }]);
});

Deno.test("sticky verb without a userId is rejected and does not resolve", async () => {
  const { store, approvals, consents } = fakeStore();
  approvals.set("r1", { decision: null, sessionId: "s1", tool: "danger" });
  const res = await resolveApprovalDecision(store, "s1", { requestId: "r1", decision: "never" }, CTX);
  assertEquals(res.ok, false);
  assertEquals(res.error, "always/never decisions require an authenticated user");
  assertEquals(approvals.get("r1")!.decision, null);
  assertEquals(consents.length, 0);
});

Deno.test("missing requestId / bad decision -> ok:false with a validation error", async () => {
  const { store } = fakeStore();
  assertEquals((await resolveApprovalDecision(store, "s1", {}, CTX)).ok, false);
  const bad = await resolveApprovalDecision(store, "s1", { requestId: "r1", decision: "maybe" as never }, CTX);
  assertEquals(bad.ok, false);
  assertEquals(bad.error, "requestId and decision (approve|deny|always|never) required");
});

Deno.test("inputResponses batch resolves each entry (optionId -> decision)", async () => {
  const { store, approvals } = fakeStore();
  approvals.set("r1", { decision: null, sessionId: "s1", tool: "t1" });
  approvals.set("r2", { decision: null, sessionId: "s1", tool: "t2" });
  const res = await resolveApprovalDecision(store, "s1", {
    inputResponses: [{ requestId: "r1", optionId: "approve" }, { requestId: "r2", optionId: "deny" }],
  }, CTX);
  assertEquals(res, { ok: true });
  assertEquals(approvals.get("r1")!.decision, "approve");
  assertEquals(approvals.get("r2")!.decision, "deny");
});

// Defense-in-depth (Task 2 of the never-stuck plan): a decision write with no
// live turn to drive it is inert, and worse, if it happens to match gate
// vocabulary on a later plain-text reply, it silently swallows that reply
// (see denyApprovalsForTurns's comment in store.ts for the incident this
// closes). These pin resolveApprovalDecision refusing to write when the
// approval's turn is no longer "running".

Deno.test("refuses to resolve an approval whose turn already finished", async () => {
  const { store, approvals } = fakeStore();
  approvals.set("r1", { decision: null, sessionId: "s1", tool: "danger", turnStatus: "failed" });
  const res = await resolveApprovalDecision(store, "s1", { requestId: "r1", decision: "approve" }, CTX);
  assertEquals(res.ok, false);
  assertEquals(res.error, "approval's turn is no longer running (failed) — cannot resolve");
  assertEquals(approvals.get("r1")!.decision, null);
});

Deno.test("refuses when the approval/turn doesn't exist at all", async () => {
  const { store } = fakeStore();
  const res = await resolveApprovalDecision(store, "s1", { requestId: "r-nope", decision: "approve" }, CTX);
  assertEquals(res.ok, false);
});

Deno.test("still resolves normally when the turn is running", async () => {
  const { store, approvals } = fakeStore();
  approvals.set("r1", { decision: null, sessionId: "s1", tool: "danger", turnStatus: "running" });
  const res = await resolveApprovalDecision(store, "s1", { requestId: "r1", decision: "approve" }, CTX);
  assertEquals(res, { ok: true });
  assertEquals(approvals.get("r1")!.decision, "approve");
});

Deno.test("a batch with one dead-turn decision fails the whole batch before writing any of it", async () => {
  const { store, approvals } = fakeStore();
  approvals.set("r1", { decision: null, sessionId: "s1", tool: "t1", turnStatus: "running" });
  approvals.set("r2", { decision: null, sessionId: "s1", tool: "t2", turnStatus: "completed" });
  const res = await resolveApprovalDecision(store, "s1", {
    inputResponses: [{ requestId: "r1", optionId: "approve" }, { requestId: "r2", optionId: "approve" }],
  }, CTX);
  assertEquals(res.ok, false);
  assertEquals(approvals.get("r1")!.decision, null); // nothing written — validated as a batch before any write
  assertEquals(approvals.get("r2")!.decision, null);
});

Deno.test("always is refused for an escalate-list tool and the request stays pending", async () => {
  const { store, approvals, consents } = fakeStore();
  approvals.set("r1", { decision: null, sessionId: "s1", tool: "GitPush" });
  const res = await resolveApprovalDecision(store, "s1", { requestId: "r1", decision: "always" }, {
    plugin: "p", agentName: "a", userId: "u1", escalate: [{ tool: "GitPush", scopes: [], tier: "hard" }],
  });
  assertEquals(res.ok, false);
  assert(res.error?.includes("GitPush"));
  // Refused at write time: nothing resolved, nothing stuck.
  assertEquals(approvals.get("r1")!.decision, null);
  assertEquals(consents.length, 0);
});

Deno.test("always still sticks for a tool that is not escalated", async () => {
  const { store, approvals, consents } = fakeStore();
  approvals.set("r1", { decision: null, sessionId: "s1", tool: "Write", scopeKey: "a.ts" });
  const res = await resolveApprovalDecision(store, "s1", { requestId: "r1", decision: "always" }, {
    plugin: "p", agentName: "a", userId: "u1", escalate: [{ tool: "GitPush", scopes: [], tier: "hard" }],
  });
  assertEquals(res, { ok: true });
  assertEquals(consents, [
    { userId: "u1", plugin: "p", agent: "a", tool: "Write", scopeKey: "a.ts", consent: "always" },
  ]);
});

Deno.test("a plain approve on an escalated tool is unaffected", async () => {
  const { store, approvals } = fakeStore();
  approvals.set("r1", { decision: null, sessionId: "s1", tool: "GitPush" });
  const res = await resolveApprovalDecision(store, "s1", { requestId: "r1", decision: "approve" }, {
    plugin: "p", agentName: "a", userId: "u1", escalate: [{ tool: "GitPush", scopes: [], tier: "hard" }],
  });
  assertEquals(res, { ok: true });
  assertEquals(approvals.get("r1")!.decision, "approve");
});

// A scoped entry must refuse only its own scope, not the whole tool.
Deno.test("a scoped escalate entry refuses always only for that scope", async () => {
  const esc: EscalateList = [{ tool: "Bash", scopes: ["rm"], tier: "hard" }];

  const dangerous = fakeStore();
  dangerous.approvals.set("r1", { decision: null, sessionId: "s1", tool: "Bash", scopeKey: "rm" });
  const refused = await resolveApprovalDecision(dangerous.store, "s1", { requestId: "r1", decision: "always" }, {
    plugin: "p", agentName: "a", userId: "u1", escalate: esc,
  });
  assertEquals(refused.ok, false);
  assertEquals(dangerous.consents.length, 0);

  const benign = fakeStore();
  benign.approvals.set("r1", { decision: null, sessionId: "s1", tool: "Bash", scopeKey: "npm" });
  const allowed = await resolveApprovalDecision(benign.store, "s1", { requestId: "r1", decision: "always" }, {
    plugin: "p", agentName: "a", userId: "u1", escalate: esc,
  });
  assertEquals(allowed, { ok: true });
  assertEquals(benign.consents.length, 1);
});

// Task 2 (2026-08-29-claw-safe-approvals): a soft tier never becomes a sticky
// grant either — only unattended execution yields, not the "always" refusal.
Deno.test("always is refused for a SOFT tool too, not just hard", async () => {
  const { store, approvals, consents } = fakeStore();
  approvals.set("r1", { decision: null, sessionId: "s1", tool: "Bash", scopeKey: "rm" });
  const res = await resolveApprovalDecision(store, "s1", { requestId: "r1", decision: "always" }, {
    plugin: "p", agentName: "a", userId: "u1",
    escalate: [{ tool: "Bash", scopes: ["rm"], tier: "soft" }],
  });
  assertEquals(res.ok, false);
  assertEquals(approvals.get("r1")!.decision, null);
  assertEquals(consents.length, 0);
});

// A refused batch must leave EVERY request pending, not resolve the ones it
// already walked past.
Deno.test("one escalated tool in a batch refuses the whole batch", async () => {
  const { store, approvals, consents } = fakeStore();
  approvals.set("r1", { decision: null, sessionId: "s1", tool: "Write", scopeKey: "a.ts" });
  approvals.set("r2", { decision: null, sessionId: "s1", tool: "GitPush" });
  const res = await resolveApprovalDecision(store, "s1", {
    inputResponses: [
      { requestId: "r1", optionId: "always" },
      { requestId: "r2", optionId: "always" },
    ],
  }, { plugin: "p", agentName: "a", userId: "u1", escalate: [{ tool: "GitPush", scopes: [], tier: "hard" }] });
  assertEquals(res.ok, false);
  assertEquals(approvals.get("r1")!.decision, null);
  assertEquals(approvals.get("r2")!.decision, null);
  assertEquals(consents.length, 0);
});
