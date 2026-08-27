// Limits are module constants, not per-agent config: a knob nobody has asked
// for is speculation. Add one when a real workload needs it.

/** Turns in a row started by a child completing rather than by anyone asking. */
export const MAX_CONSECUTIVE_WAKES = 10;
/** Children running at once under one parent. */
export const MAX_LIVE_CHILDREN = 8;
/** Children ever spawned by one parent session. */
export const MAX_CHILDREN_PER_SESSION = 50;

export interface ChildAgent {
  agentId: string;
  nickname: string;
  subagent: string | null;
  status: "running" | "completed" | "failed" | "stopped";
  startedAt: Date;
  detached: boolean;
}

export function checkSpawnAllowed(
  opts: { live: number; total: number },
): { allowed: true } | { allowed: false; reason: string } {
  if (opts.live >= MAX_LIVE_CHILDREN) {
    return {
      allowed: false,
      reason: `agent limit reached: ${MAX_LIVE_CHILDREN} children already running. ` +
        `Wait for one to finish (agent_wait) or stop one (agent_stop).`,
    };
  }
  if (opts.total >= MAX_CHILDREN_PER_SESSION) {
    return {
      allowed: false,
      reason: `agent limit reached: ${MAX_CHILDREN_PER_SESSION} children spawned on this session.`,
    };
  }
  return { allowed: true };
}
