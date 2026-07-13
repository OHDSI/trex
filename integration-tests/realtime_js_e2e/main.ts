/**
 * realtime-js reference-client E2E for trex's native "realtime" feature
 * (Supabase-Realtime-compatible: Phoenix-protocol WebSocket channels,
 * broadcast, presence, postgres_changes).
 *
 * This is the DEFINITIVE compatibility oracle: unlike
 * `integration-tests/test_realtime_standalone.py` (which speaks the Phoenix
 * wire protocol directly via `websockets`), this script drives the REAL
 * `@supabase/realtime-js` v2 client library against trex. If a unit test and
 * this reference client ever disagree, the client wins — see
 * `specs/2026-07-04-realtime-design.md`.
 *
 * DEFERRED-RUN NOTICE
 * --------------------
 * This script requires a FULLY RUNNING trex stack (`docker compose up`, or
 * equivalent) reachable at its `realtime/v1` WebSocket endpoint, plus a valid
 * trex JWT (an "authenticated" or "anon" role token minted by trex's own
 * auth — see `POST /trex/auth/v1/token?grant_type=password`, or the anon key
 * stored in `trexdb.setting` under `auth.anonKey`, exactly like
 * `test_realtime_standalone.py`'s `anon_token` fixture fetches it). It was
 * authored WITHOUT such a stack available in this environment: only
 * `deno check main.ts` (resolves the real `@supabase/realtime-js` types from
 * npm and type-checks this file against them) was possible here. Running it
 * for real is the deferred full-stack pass.
 *
 * Run (once a stack + key are available), via the `run.sh` wrapper which
 * also prepares/tears down the `public.rt_e2e` table:
 *
 *   TREX_ANON_KEY=<jwt> ./run.sh
 *
 * or directly (table must already exist + be published, see run.sh):
 *
 *   TREX_ANON_KEY=<jwt> deno run --allow-net --allow-env main.ts
 *
 * Env vars:
 *   TREX_WS_URL     realtime WebSocket base endpoint, defaults to
 *                    ws://localhost:8001/trex/realtime/v1 (matching
 *                    docker-compose.yml's trex-server port 8001 and
 *                    BASE_PATH=/trex). realtime-js appends "/websocket"
 *                    itself (see RealtimeClient's endPoint construction) —
 *                    do NOT include it here.
 *   TREX_ANON_KEY   required: a valid trex JWT sent as the `apikey` query
 *                    param and as the channel `access_token`.
 */
import {
  RealtimeClient,
  type RealtimePostgresInsertPayload,
} from "@supabase/realtime-js";

const WS_URL = Deno.env.get("TREX_WS_URL") ??
  "ws://localhost:8001/trex/realtime/v1";
const ANON_KEY = Deno.env.get("TREX_ANON_KEY");

if (!ANON_KEY) {
  console.error(
    "FAIL - setup: TREX_ANON_KEY is not set (a valid trex JWT is required)",
  );
  Deno.exit(1);
}

const failures: string[] = [];

function ok(name: string, cond: boolean): void {
  if (!cond) failures.push(name);
  console.log(cond ? `ok - ${name}` : `FAIL - ${name}`);
}

/** Resolves `false` after `ms` milliseconds — races against a real check so
 * nothing in this script can hang forever waiting on a frame that never
 * arrives. */
function timeout(ms: number): Promise<boolean> {
  return new Promise((resolve) => setTimeout(() => resolve(false), ms));
}

async function main(): Promise<void> {
  const client = new RealtimeClient(WS_URL, { params: { apikey: ANON_KEY! } });
  client.connect();

  try {
    await runBroadcastAndPresence(client);
    await runPostgresChanges(client);
  } finally {
    client.disconnect();
  }

  console.log(
    failures.length ? `FAILURES: ${failures.join(", ")}` : "ALL OK",
  );
  Deno.exit(failures.length ? 1 : 0);
}

/**
 * Feature families 1 + 3 (broadcast, presence): a single channel configured
 * with `broadcast.self: true` (so the sender also receives its own
 * broadcast) and `presence.key: "tester"`. Verifies subscribe resolves,
 * self-broadcast delivery, and presence sync fire after `track()`.
 */
async function runBroadcastAndPresence(client: RealtimeClient): Promise<void> {
  const room = client.channel("e2e-room", {
    config: {
      broadcast: { self: true },
      presence: { key: "tester" },
    },
  });

  const gotBroadcast = new Promise<boolean>((resolve) => {
    room.on("broadcast", { event: "ping" }, () => resolve(true));
  });
  const gotPresence = new Promise<boolean>((resolve) => {
    room.on("presence", { event: "sync" }, () => resolve(true));
  });

  try {
    await new Promise<void>((resolve, reject) => {
      room.subscribe((status, err) => {
        if (status === "SUBSCRIBED") resolve();
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(err ?? new Error(`channel status: ${status}`));
        }
      });
    });
  } catch (err) {
    ok("e2e-room subscribe", false);
    console.error("subscribe failed:", err);
    return;
  }
  ok("e2e-room subscribe", true);

  await room.track({ online: true });
  await room.send({ type: "broadcast", event: "ping", payload: { n: 1 } });

  ok(
    "broadcast self-delivery",
    await Promise.race([gotBroadcast, timeout(5000)]),
  );
  ok("presence sync", await Promise.race([gotPresence, timeout(5000)]));
}

/**
 * Feature family 2 (postgres_changes): a second channel subscribed to
 * INSERTs on `public.rt_e2e`. The table itself is prepared out-of-band (see
 * run.sh: CREATE TABLE + ALTER PUBLICATION supabase_realtime ADD TABLE)
 * because DDL/publication management is not something the realtime-js
 * client does — it only consumes change events. After SUBSCRIBED, this
 * prints the READY_FOR_INSERT sentinel so a wrapper script can insert the
 * row at the right moment, then waits for the typed INSERT callback.
 */
async function runPostgresChanges(client: RealtimeClient): Promise<void> {
  const db = client.channel("e2e-db", { config: {} });

  const gotInsert = new Promise<boolean>((resolve) => {
    db.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "rt_e2e" },
      (payload: RealtimePostgresInsertPayload<{ id: number }>) => {
        resolve(payload.new?.id === 1);
      },
    );
  });

  try {
    await new Promise<void>((resolve, reject) => {
      db.subscribe((status, err) => {
        if (status === "SUBSCRIBED") resolve();
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(err ?? new Error(`channel status: ${status}`));
        }
      });
    });
  } catch (err) {
    ok("e2e-db subscribe", false);
    console.error("subscribe failed:", err);
    return;
  }
  ok("e2e-db subscribe", true);

  // Wrapper (run.sh) watches stdout for this exact line and inserts (1) into
  // public.rt_e2e right after it appears.
  console.log("READY_FOR_INSERT");

  ok(
    "postgres_changes INSERT with typed new record",
    await Promise.race([gotInsert, timeout(15000)]),
  );
}

await main();
