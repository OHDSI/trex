// Turn/worker lifetime constants, in a dependency-free leaf module.
//
// Deliberately NOT in handler.ts: plugin/agents.ts (control server) needs this
// value to size the agent worker's lifetime, and importing it from handler.ts
// would drag that module's whole graph — `ai`, the loader, the runner, the
// stream layer — into the control server for the sake of one number.

/**
 * How long a turn may stay `running` before the system treats it as abandoned.
 *
 * Consumed by two places that MUST agree:
 *  - service/handler.ts's lazy reap and service/sweep.ts's periodic sweep, which
 *    mark turns older than this `failed`.
 *  - plugin/agents.ts, which sizes the agent worker's `workerTimeoutMs` to it.
 *
 * A worker outliving this could only keep alive a turn the sweep has already
 * reaped; a worker dying before it gets killed mid-turn, and since a dropped
 * worker never runs finishTurn, the turn would sit `running` with every later
 * message on that session queued behind it. Observed at 30 minutes: turns
 * killed at 29m01s and 23m25s with the runtime logging `reason: "EarlyDrop"`.
 */
export const STALE_TURN_MS = 2 * 60 * 60 * 1000;
