// A cheap liveness probe for the coder API, so claw can say WHY it cannot start
// (and notice when the workspace comes back) instead of failing inside a
// minutes-long hand-off and leaving the channel to type "retry".
import { defineTool } from "eve/tools";
import { apiBase, mintToken } from "../lib/code-stream.ts";
import { effectiveUserId } from "./askCodeAgent.ts";

export interface ProbeResult { ok: boolean; status?: number; detail?: string }

export function healthFromResponse(r: ProbeResult): { ok: boolean; detail: string } {
  if (r.ok) return { ok: true, detail: "The workspace is reachable." };
  if (r.status === 401 || r.status === 403) {
    return {
      ok: false,
      detail: "The workspace rejected my credentials (401). Someone needs to re-authenticate the devx workspace.",
    };
  }
  if (r.status) return { ok: false, detail: `The workspace answered ${r.status}, so it is not usable right now.` };
  return { ok: false, detail: `The workspace is not reachable: ${r.detail ?? "no detail"}.` };
}

export async function probeCodeApi(userId: string): Promise<ProbeResult> {
  try {
    const token = await mintToken(userId);
    const res = await fetch(`${apiBase()}/settings`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

export default defineTool({
  description:
    "Check whether the coding workspace is reachable before starting or retrying work. Returns " +
    "{ok, detail}; on failure the detail names what is broken and who can fix it. Call it before " +
    "the FIRST hand-off of a task and after any hand-off failure — never guess at availability.",
  inputSchema: { type: "object", properties: {} },
  execute: async (_input, ctx) => {
    const userId = effectiveUserId(ctx?.userId, (k) => Deno.env.get(k));
    if (!userId) return { ok: false, detail: "No coder identity is configured (CLAW_CODE_USER_ID is unset)." };
    return healthFromResponse(await probeCodeApi(userId));
  },
});
