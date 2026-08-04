// Unit tests for the shared approval-decision resolver (Task 17). The native
// routes (handler.test.ts) exercise it through HTTP; these pin its behavior
// directly so channel resume can rely on the same semantics.
import { assertEquals } from "jsr:@std/assert";
import { resolveApprovalDecision } from "./approvals.ts";
import type { AgentStore } from "./store.ts";

// Minimal in-memory approvals store matching the columns the resolver touches.
function fakeStore() {
  const approvals = new Map<string, { decision: string | null; sessionId: string; tool: string }>();
  const consents: Array<{ userId: string; plugin: string; agent: string; tool: string; consent: string }> = [];
  const store = {
    resolveApproval(requestId: string, decision: "approve" | "deny", sessionId: string) {
      const a = approvals.get(requestId);
      if (!a || a.decision !== null || a.sessionId !== sessionId) return Promise.resolve(false);
      a.decision = decision;
      return Promise.resolve(true);
    },
    getApprovalTool(requestId: string) {
      return Promise.resolve(approvals.get(requestId)?.tool ?? null);
    },
    setToolConsent(userId: string, plugin: string, agent: string, tool: string, consent: "always" | "never") {
      consents.push({ userId, plugin, agent, tool, consent });
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
  // unknown id
  assertEquals(await resolveApprovalDecision(store, "s1", { requestId: "nope", decision: "approve" }, CTX), { ok: false });
  // still pending (wrong-session/unknown must not have consumed it)
  assertEquals(approvals.get("r1")!.decision, null);
});

Deno.test("sticky 'always' persists as approve and upserts a consent (with userId)", async () => {
  const { store, approvals, consents } = fakeStore();
  approvals.set("r1", { decision: null, sessionId: "s1", tool: "danger" });
  const res = await resolveApprovalDecision(store, "s1", { requestId: "r1", decision: "always" }, { plugin: "p", agentName: "a", userId: "u1" });
  assertEquals(res, { ok: true });
  assertEquals(approvals.get("r1")!.decision, "approve");
  assertEquals(consents, [{ userId: "u1", plugin: "p", agent: "a", tool: "danger", consent: "always" }]);
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
