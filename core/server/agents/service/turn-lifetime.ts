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

/**
 * How often a running turn stamps `agents.turns.heartbeat_at`.
 *
 * One tiny UPDATE per turn per interval — negligible next to the model round
 * trips a turn is already making, and it bounds how long a dead worker's turn
 * can keep looking alive.
 */
export const HEARTBEAT_INTERVAL_MS = 30 * 1000;

/**
 * How long a turn's heartbeat may lapse before the turn is treated as
 * abandoned. Six missed beats: long enough that a GC pause, a slow query or a
 * brief DB blip cannot fake a dead worker; short enough that a genuinely dead
 * worker's turn clears in minutes rather than the two hours STALE_TURN_MS
 * allows.
 *
 * This is what actually catches a dropped worker. `workerTimeoutMs` cannot:
 * the runtime terminates a worker at HALF its configured lifetime with
 * `reason: "EarlyDrop"` (measured — devx booted 01:48:08.544 and was shut down
 * 02:03:08.555 under a 30-minute cap; the agents worker booted 02:21:50.066 and
 * was shut down 03:21:50.073 under the 2-hour cap), so raising the cap only
 * moves the kill, it never removes it.
 *
 * STALE_TURN_MS stays at 2h and is deliberately NOT reduced now that this
 * exists. It is the fallback for turns with no heartbeat at all (rows predating
 * the column), and for those the only available clock is `started_at` — which
 * measures how long a turn has been RUNNING, not how long it has been silent.
 * Long turns are legitimate (a claw coding turn makes several askCodeAgent
 * hand-offs at 5-12 minutes each), so shortening it would fail live work.
 */
export const HEARTBEAT_STALE_MS = 6 * HEARTBEAT_INTERVAL_MS;
