// Shared approval-decision resolver (Task 17). The native resolve routes in
// service/handler.ts (POST /eve/v1/session/:id with `inputResponses`, and
// .../approval with `{requestId, decision}`) AND the channel resume primitive
// (channels/layer.ts) all APPLY a HITL decision the same way: WRITE it to
// agents.approvals (which the parked `waitUntil`-alive poll loop consumes to
// continue the SAME turn) and, for a sticky "always"/"never", additionally
// upsert an agents.tool_consents row. This function extracts that write-logic so
// the native + channel paths cannot drift on what a decision means. It does NOT
// drive the turn — the parked isolate's poll loop does (see
// investigate-hitl-turns.md). agents.approvals.decision's CHECK stays
// approve/deny; the sticky verbs are folded to approve/deny before they hit it.
import type { AgentStore } from "./store.ts";
import { DEFAULT_ESCALATE_LIST, matchesEscalate } from "./approval-policy.ts";
import type { EscalateList } from "./approval-policy.ts";

export type ApprovalDecision = "approve" | "deny" | "always" | "never";

// The decision input the native routes accept, reused verbatim by channel
// resume: a single `{ requestId, decision }` and/or a batch of eve-style
// `inputResponses` (`{ requestId, optionId }`, `optionId` carrying the same verb
// vocabulary as `decision`). When both are present, `inputResponses` wins.
export interface ApprovalResolveInput {
  requestId?: string;
  decision?: ApprovalDecision;
  inputResponses?: Array<{ requestId?: string; optionId?: string }>;
}

// Identity/scope a sticky decision is keyed on. `userId` is the trex x-user-id
// (native) or the channel session's trex user (channels); `undefined` for an
// anonymous / platform-webhook caller, which may approve/deny but not stick a
// decision (an "always"/"never" without a userId is rejected).
export interface ApprovalConsentCtx {
  plugin: string;
  agentName: string;
  userId: string | undefined;
  // Caller-supplied escalate list; defaults to DEFAULT_ESCALATE_LIST so
  // tests can inject one without touching Deno.env (handler.ts owns that read).
  escalate?: EscalateList;
}

export interface ApprovalResolveResult {
  ok: boolean;
  error?: string;
}

const VERBS: ApprovalDecision[] = ["approve", "deny", "always", "never"];

// Normalize either input shape into a flat list of {requestId, decision}.
// Exported so the channel resume primitive (channels/layer.ts) can inspect the
// input to pick an addressing mode: every decision carrying a requestId → MODE A
// (by request id); otherwise → MODE B (by token, single pending).
export function normalizeApprovalDecisions(
  input: ApprovalResolveInput,
): Array<{ requestId?: string; decision?: string }> {
  if (Array.isArray(input.inputResponses)) {
    return input.inputResponses.map((r) => ({ requestId: r?.requestId, decision: r?.optionId }));
  }
  return [{ requestId: input.requestId, decision: input.decision }];
}

// Validate + write one or more approval decisions for `sessionId`. Returns
// `{ ok: false, error }` on a bad/underspecified input (never throws for those)
// and `{ ok: false }` when the write matched no pending row (unknown /
// already-decided / wrong-session request); `{ ok: true }` when every decision
// landed. The native routes pre-validate with their own (byte-identical) 400
// messages before calling this, so for them the error branch never fires and
// only `.ok` is read — behavior is unchanged from the pre-extraction inline
// helper. The channel resume path has no route-level validation, so it relies on
// the checks here.
export async function resolveApprovalDecision(
  store: AgentStore,
  sessionId: string,
  input: ApprovalResolveInput,
  consent: ApprovalConsentCtx,
): Promise<ApprovalResolveResult> {
  const decisions = normalizeApprovalDecisions(input);
  if (decisions.length === 0) {
    return { ok: false, error: "requestId and decision (approve|deny|always|never) required" };
  }
  // Validate the whole batch BEFORE resolving any, mirroring the native
  // inputResponses route (which 400s the batch before touching a request).
  for (const d of decisions) {
    if (!d.requestId || typeof d.decision !== "string" || !(VERBS as string[]).includes(d.decision)) {
      return { ok: false, error: "requestId and decision (approve|deny|always|never) required" };
    }
    if ((d.decision === "always" || d.decision === "never") && !consent.userId) {
      return { ok: false, error: "always/never decisions require an authenticated user" };
    }
  }
  // A decision write with no live turn to drive it is inert — worse, if it
  // happens to match gate vocabulary on a later plain-text reply, it silently
  // consumes that reply and starts nothing (see denyApprovalsForTurns's
  // comment for the incident this closes). Refuse the whole batch rather than
  // resolve some requests and silently no-op others.
  for (const d of decisions) {
    const status = await store.getApprovalTurnStatus(d.requestId!);
    if (status !== "running") {
      return {
        ok: false,
        error: status === null
          ? "unknown approval request"
          : `approval's turn is no longer running (${status}) — cannot resolve`,
      };
    }
  }
  // Refuse at write time rather than ignoring the row at read time: the person
  // clicking "always" must learn the grant did not stick. Under a shared bot
  // identity one such grant would disarm the floor for every user.
  // No env read here: handler.ts owns AGENTS_ESCALATE_TOOLS and passes the
  // parsed list in. This fallback is the same parsed-once default the gate uses.
  const escalate = consent.escalate ?? DEFAULT_ESCALATE_LIST;
  for (const d of decisions) {
    if (d.decision !== "always") continue;
    const scope = await store.getApprovalScope(d.requestId!);
    if (scope && matchesEscalate(escalate, scope.tool, scope.scopeKey)) {
      return { ok: false, error: `${scope.tool} cannot be granted 'always' — it requires approval every time` };
    }
  }
  let ok = true;
  for (const d of decisions) {
    const decision = d.decision as ApprovalDecision;
    const sticky = decision === "always" || decision === "never";
    const persisted: "approve" | "deny" = sticky ? (decision === "always" ? "approve" : "deny") : decision;
    const resolved = await store.resolveApproval(d.requestId!, persisted, sessionId);
    if (resolved && sticky) {
      // consent.userId is guaranteed present here — the batch validation above
      // rejects a sticky verb without one.
      const scope = await store.getApprovalScope(d.requestId!);
      if (scope) await store.setToolConsent(consent.userId!, consent.plugin, consent.agentName, scope.tool, scope.scopeKey, decision);
    }
    if (!resolved) ok = false;
  }
  return { ok };
}
