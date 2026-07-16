import type { EveEvalContext, EveEvalSession } from "eve/evals";

// One eval-scenario input: optional per-scenario data the stubs read back — the
// "channel discussion" fetchChannelHistory returns, the apps listApps returns
// (lib/eval-stubs.ts). `claw_eval: true` (added below) flips claw's
// external-call tools to canned data.
export interface ClawEvalMeta {
  evalDiscussion?: Array<{ author: string; content: string }>;
  evalApps?: Array<{ id: string; name: string }>;
}

// Drive one claw facilitator turn against the live agent's eve endpoint with
// tool-stub mode on, and attach to the resulting session so
// succeeded()/calledTool()/notCalledTool() work. Mirrors the devx suite's
// sendWithMode (modes/helpers.ts): t.target.fetch carries EVE_EVAL_AUTH_TOKEN;
// attachSession wires the assertion collector. With `claw_eval: true`,
// fetchChannelHistory / askCodeAgent / the post* tools return canned data
// instead of hitting Discord or spawning a coder, so the facilitator's decisions
// are asserted with no side effects (awaitApproval's HITL still runs natively).
export async function driveClaw(
  t: EveEvalContext,
  message: string,
  meta: ClawEvalMeta = {},
): Promise<EveEvalSession> {
  const res = await t.target.fetch("/eve/v1/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, metadata: { claw_eval: true, ...meta } }),
    signal: t.signal,
  });
  if (!res.ok) throw new Error(`claw session create failed: ${res.status} ${await res.text()}`);
  const { sessionId } = (await res.json()) as { sessionId: string };
  return t.target.attachSession(sessionId);
}
