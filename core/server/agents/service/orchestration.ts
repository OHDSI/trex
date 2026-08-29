// Limits are module constants, not per-agent config: a knob nobody has asked
// for is speculation. Add one when a real workload needs it.

/**
 * Turns in a row started by a child completing rather than by anyone asking.
 * Charged per TURN, in handler.ts's startTurn — the one place such a turn is
 * created — covering both a wake and the turn a parent chains for results
 * that were queued while it was busy. Never per delivered result: several
 * children draining into one chained turn are one turn, one model call, and
 * therefore one unit.
 *
 * NINE such turns actually run, not ten: startTurn bumps the counter first and
 * then refuses at `wakes >= MAX_CONSECUTIVE_WAKES`, so the tenth wake is the
 * one that trips the guard rather than the one after it. Left as-is (a bound
 * of "about ten", off by one in the safe direction) rather than renamed —
 * every log line and the operator-facing message quote this same number.
 */
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

// agents.turns' CHECK constraint only permits 'running' | 'completed' |
// 'failed' — there is no DB-level 'stopped'. agent_stop (Task 11) records a
// stop as an ordinary `failed` turn carrying this exact error string, and
// store.ts's status-deriving queries recognize that string to display
// 'stopped' instead of 'failed'. Both sides must use this constant, never a
// duplicated literal, or the derivation silently stops matching.
export const STOPPED_BY_PARENT_ERROR = "stopped by the agent that started it";

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
