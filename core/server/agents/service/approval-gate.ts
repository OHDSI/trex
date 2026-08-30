// The one-shot approval gate a needsApproval tool call passes before it may
// execute: sticky-consent lookup, escalate verdict, and — when the verdict is
// `gate` — the approval row, the `input.requested` event and the poll that
// waits for a human. Lifted verbatim out of toolset.ts's authoredTool so the
// external-engine path (service/engine/delegate.ts's engine runs its OWN
// tools and never reaches authoredTool) gates through the same code rather
// than a second copy that can drift on what "gated" means.
import type { AgentStore } from "./store.ts";
import type { AgentEvent } from "./events.ts";
import { DEFAULT_ESCALATE_LIST, type EscalateList, resolveApproval } from "./approval-policy.ts";
import { coarseScopeKey } from "./scope-key.ts";

// Exported for tests. An explicit approvalPollMs stays flat (tests depend on a
// deterministic cadence); the default doubles to a 5s ceiling, cutting a
// 30-minute park from ~3600 round-trips to ~370.
export const INITIAL_POLL_MS = 500;
export function nextPollDelay(current: number, flat: number | undefined): number {
  // A non-positive flat value (e.g. approvalPollMs: 0) is not a valid flat
  // cadence — busy-looping getApprovalDecision for up to 30 minutes — so it
  // falls back to the default backoff schedule instead.
  return flat !== undefined && flat > 0 ? flat : Math.min(current * 2, 5_000);
}

// Only the three store calls the gate makes, so a caller outside handler.ts's
// Deps (a test, an engine) can supply what it has — same posture as
// DelegatedTurnOpts.store.
export type ApprovalGateStore = Pick<AgentStore, "getToolConsent" | "createApproval" | "getApprovalDecision">;

export interface ApprovalGateOpts {
  toolName: string;
  input: unknown;
  // Already derived by the caller (deriveScopeKey), because the engine path
  // must map the SDK's argument names onto devx's first (engine/tool-input.ts).
  scopeKey: string;
  sessionId: string;
  store?: ApprovalGateStore;
  turnId?: string;
  emit?: (e: AgentEvent) => void;
  userId?: string;
  plugin?: string;
  agentName?: string;
  unattended?: boolean;
  channelBound?: boolean;
  escalate?: EscalateList;
  approvalPollMs?: number;
  approvalTimeoutMs?: number;
  // An aborted turn stops waiting for a decision that can no longer drive
  // anything. Unused by authoredTool (whose execute has no signal); the
  // engine path passes the turn's.
  signal?: AbortSignal;
}

// `null` means the call may proceed; `{ error }` is the refusal to hand back
// to the caller as the tool's result.
export async function runApprovalGate(o: ApprovalGateOpts): Promise<{ error: string } | null> {
  const { store, turnId, emit, userId, plugin, agentName, toolName, input, scopeKey } = o;
  // A sticky decision short-circuits the one-shot flow entirely.
  // Only consulted when there's an identity to key it on — an
  // anonymous session (no userId, e.g. no x-user-id header) has no
  // consent to look up and always goes through the per-call approval
  // flow below, same as when there is no sticky consent at all.
  let consent: "always" | "never" | null = null;
  if (store && userId && plugin && agentName) {
    consent = await store.getToolConsent(userId, plugin, agentName, toolName, scopeKey);
    if (consent === null) {
      // A stored row is matched by EXACT scope_key (store.ts's getToolConsent),
      // so giving Bash keys a subcommand orphaned every consent recorded under
      // the old coarse key. Honouring a `never` from it keeps a standing
      // refusal refusing; an `always` is deliberately NOT honoured, because a
      // grant on `git` never covered `git push` and must not silently widen
      // into it. Fail-safe in both directions, so no rows need deleting.
      const coarse = coarseScopeKey(scopeKey);
      if (coarse !== undefined) {
        const prior = await store.getToolConsent(userId, plugin, agentName, toolName, coarse);
        if (prior === "never") consent = "never";
      }
    }
  }
  const verdict = resolveApproval({
    toolName,
    scopeKey,
    consent,
    unattended: o.unattended === true,
    channelBound: o.channelBound === true,
    escalate: o.escalate ?? DEFAULT_ESCALATE_LIST,
  });
  if (verdict.outcome === "deny") {
    return verdict.reason === "consent-never"
      ? { error: "denied by user" }
      : { error: "requires approval but this session has no approver" };
  }
  if (verdict.outcome === "gate") {
    if (!store || !turnId || !emit) {
      return { error: "approval required — use the session API" };
    }
    const requestId = await store.createApproval(o.sessionId, turnId, toolName, input, scopeKey);
    emit({
      type: "input.requested",
      data: { turnId, requests: [{ requestId, action: { kind: "tool-call", callId: requestId, toolName, input } }] },
    });
    // 7 of 43 real gates were clicked after the 5-minute poll window had
    // already given up (median human response was ~15 minutes). Raised to
    // 30 minutes; caller override (tests, other callers) is unchanged.
    // plugins/devx/fn-claude-code/server.js's PERMISSION_WAIT_MS is this plus a
    // one-minute margin: on the delegated path the sidecar polls for the
    // decision file in parallel and its timer starts FIRST, so the margin is
    // what makes this gate — not that one — the side that decides. Raising
    // this number means raising that one too.
    const deadline = Date.now() + (o.approvalTimeoutMs ?? 1_800_000);
    // An explicit approvalPollMs stays flat — tests depend on a
    // deterministic cadence. The default backs off 500ms -> 5s, cutting
    // a 30-minute park from ~3600 round-trips to ~370.
    const flat = o.approvalPollMs;
    // A non-positive flat (approvalPollMs: 0) must not seed the loop at
    // 0ms either — see nextPollDelay's own guard above.
    let wait = flat !== undefined && flat > 0 ? flat : INITIAL_POLL_MS;
    let decision: string | null = null;
    while (Date.now() < deadline) {
      // Checked at the top of the tick rather than racing the sleep: one
      // poll interval of lateness is cheaper than a second timer per wait.
      if (o.signal?.aborted) return { error: "turn aborted" };
      decision = await store.getApprovalDecision(requestId);
      if (decision) break;
      await new Promise((r) => setTimeout(r, wait));
      wait = nextPollDelay(wait, flat);
    }
    if (decision !== "approve") {
      return { error: decision === "deny" ? "denied by user" : "approval timed out" };
    }
  }
  // verdict.outcome === "allow" falls through to execute.
  return null;
}
