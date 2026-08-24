// Edge-runtime worker entry for an agents-type plugin. One worker per agent;
// the control server proxies all HTTP for the agent's base path here.
// npm: specifier on purpose — a bare "pg" entry in core/server's import map
// would remap existing production imports of "pg" (e.g. plugin/function.ts's
// dynamic import resolving via node_modules), which is off-limits. The worker
// resolves npm: specifiers natively, same convention as devx functions.
import pg from "npm:pg@^8";
import { loadAgent } from "../loader.ts";
import { createStore } from "./store.ts";
import { createChannelStore } from "../channels/store.ts";
import { createHandler, STALE_TURN_MS, type OAuthBrokerDeps } from "./handler.ts";
import { createOAuthStore } from "../connections/oauth/store.ts";
import { decryptWithDek, encryptWithDek, initDek } from "../../auth/dek.ts";
import { deriveSubkeyBase64, LABELS } from "../../auth/keys.ts";
import { startStaleTurnSweep } from "./sweep.ts";
import { publish } from "./stream.ts";

const agentDir = Deno.env.get("TREX_AGENT_DIR");
if (!agentDir) throw new Error("agents: TREX_AGENT_DIR not set");

const pool = new pg.Pool({ connectionString: Deno.env.get("DATABASE_URL") });
// Shared with the store AND handed to createHandler as `sql` so a
// resolveModel/buildInstructions hook's `hookCtx.sql` runs against the same
// pool the rest of the worker uses (H1) — not a second connection.
const query = (sql: string, params?: unknown[]) => pool.query(sql, params as never);
const agent = await loadAgent(agentDir);
const basePath = Deno.env.get("TREX_AGENT_BASE") || "";

// OAuth broker (Task 7) — wired only when the worker has a root key (needed to
// unwrap the DEK for token encryption-at-rest and to derive the state secret).
// Kept opt-in so a deployment without TREX_ROOT_KEY still boots every non-oauth
// agent; a kind:"oauth" connection there simply reports it's not configured
// rather than crashing the worker at boot.
let oauth: OAuthBrokerDeps | undefined;
if (Deno.env.get("TREX_ROOT_KEY")) {
  try {
    await initDek({ query: (sql, params) => pool.query(sql, params as never) });
    const secret = await deriveSubkeyBase64(LABELS.agentsOAuthState);
    const store = createOAuthStore(query, { encrypt: encryptWithDek, decrypt: decryptWithDek });
    oauth = { store, secret, startUrlBase: `${basePath}/eve/v1/oauth`, basePath };
  } catch (e) {
    // A DEK/key failure must not take the whole agent worker down — log and
    // leave oauth unwired (its routes 404, oauth connections skip).
    console.error(`agents: OAuth broker init failed — oauth connections disabled: ${e instanceof Error ? e.message : e}`);
  }
}

const store = createStore(query);

const handler = createHandler({
  agent,
  store,
  channelStore: createChannelStore(query),
  plugin: Deno.env.get("TREX_PLUGIN_NAME") || "unknown",
  agentName: Deno.env.get("TREX_AGENT_NAME") || "agent",
  basePath,
  sql: query,
  oauth,
});

// Periodic sweep for turns stuck `running` past STALE_TURN_MS — the same
// recovery handler.ts's startTurn performs lazily on-message, but this
// worker's per-process one-time init, so it also catches a session nobody
// ever messages again after it gets stuck (that session's lazy path in
// startTurn never fires — no new message ever lands on it). See sweep.ts's
// header for the incident this closes.
startStaleTurnSweep(store, {
  // Same env vars createHandler above is keyed on, so the sweep only ever
  // lists/reaps sessions for THIS worker's own agent — see sweep.ts's
  // SweepOptions comment for why an unscoped sweep is the bug (with multiple
  // agents deployed, every worker would otherwise sweep every OTHER agent's
  // sessions too).
  plugin: Deno.env.get("TREX_PLUGIN_NAME") || "unknown",
  agent: Deno.env.get("TREX_AGENT_NAME") || "agent",
  staleMs: STALE_TURN_MS,
  onReap: (sessionId, count) => {
    publish(sessionId, { type: "turn.reaped", data: { count, reason: "stale" } });
  },
});

Deno.serve((req) => handler(req));
