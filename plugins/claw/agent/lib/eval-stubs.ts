// Eval-mode tool stubs. claw's tools reach out — `fetchChannelHistory`/the
// post* tools hit the Discord API, `askCodeAgent` spawns a real coder turn — so
// a behavioral eval (eve eval has no tool mocking) would otherwise post to
// channels and run the coder. When a turn's metadata carries `claw_eval: true`
// (set only by the eval harness's driveClaw helper — production Discord traffic
// supplies no such flag; ctx.metadata is the client-supplied session metadata,
// see handler.ts), the external-call tools short-circuit to deterministic canned
// data so the facilitator's DECISION flow can be asserted in isolation.
//
// `awaitApproval` deliberately has NO stub: its needsApproval HITL round-trip
// runs natively in a raw eve session (no Discord render happens without a real
// channel), and the eval drives it via the session's respond().

interface EvalMeta {
  claw_eval?: boolean;
  evalDiscussion?: Array<{ author: string; content: string }>;
  evalApps?: Array<{ id: string; name: string }>;
}

export function evalMeta(ctx: { metadata?: unknown } | undefined): EvalMeta | undefined {
  const m = ctx?.metadata as EvalMeta | undefined;
  return m?.claw_eval === true ? m : undefined;
}

export function isEvalMode(ctx: { metadata?: unknown } | undefined): boolean {
  return evalMeta(ctx) !== undefined;
}

export const evalStubs = {
  fetchChannelHistory(ctx: { metadata?: unknown } | undefined) {
    const m = evalMeta(ctx);
    return {
      messages: m?.evalDiscussion ?? [
        { author: "alice", content: "/trex add server-side filtering to the sales dashboard" },
        { author: "bob", content: "filter by region and date; results should load under a second" },
      ],
    };
  },
  listApps(ctx: { metadata?: unknown } | undefined) {
    const m = evalMeta(ctx);
    return { apps: m?.evalApps ?? [{ id: "eval-app-1", name: "Sales Dashboard" }] };
  },
  // Canned coder reply keyed on the instruction so the gated flow stays coherent
  // (brainstorm -> options, writing-plans -> a plan, a review -> findings, finish
  // -> a PR link, otherwise -> implemented).
  askCodeAgent(message: string) {
    const m = String(message || "").toLowerCase();
    if (/brainstorm|option|design/.test(m)) {
      return {
        reply:
          "Two approaches:\n1. Server-side filter endpoint — fast on big data, more work.\n" +
          "2. Client-side virtualization — quick, struggles past ~50k rows.",
      };
    }
    if (/writing-plans|detailed plan|\bspec\b/.test(m)) {
      return {
        reply:
          "## Plan\n1. Add GET /api/sales/filter (region, date range).\n" +
          "2. Wire the dashboard filter bar to it.\n3. Tests for the endpoint + a load check.",
      };
    }
    if (/review|security|\bqa\b|\bchecks?\b/.test(m)) {
      return { reply: "Code review: no blocking findings. One nit: extract the date parser. Tests pass." };
    }
    if (/finishing-a-development-branch|commit|pull request|\bpr\b/.test(m)) {
      return { reply: "Committed on branch claw/eval and opened PR #42: https://example.test/pr/42" };
    }
    return { reply: "Implemented on the feature worktree. Build green, tests pass." };
  },
  postChoice() {
    return { posted: 0, stub: true };
  },
  postPlan() {
    return { posted: true, attached: null, truncated: false, stub: true };
  },
  postScreenshots() {
    return { posted: [], skipped: [], stub: true };
  },
};
