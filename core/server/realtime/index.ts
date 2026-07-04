import express from "express";
import type { Express, Request, Response } from "express";
import { BASE_PATH } from "../config.ts";
import { handleUpgrade } from "./socket.ts";
import { verifyAccessToken } from "../auth/jwt.ts";
import { broadcastToTopic } from "./broadcast.ts";
import { checkAuthorization } from "./authz.ts";
import { applyRealtimeMigrations } from "./migrations.ts";
import { clearAllSubscriptions } from "./subscriptions.ts";
import { ReplicationPipeline } from "./replication.ts";
import { fanOutTransaction } from "./walrus.ts";
import { sockets } from "./socket.ts";

// Side-effect imports: loading these registers every phx_join/leave, broadcast,
// presence, authz and subscription onJoin/onLeave hook. Task 11 is the first place
// the running server imports the realtime module, so these must load its handlers.
import "./channel.ts";
import "./broadcast.ts";
import "./presence.ts";
import "./authz.ts";
import "./subscriptions.ts";

export function realtimeEnabled(): boolean {
  return Deno.env.get("TREX_REALTIME_DISABLED") !== "true";
}

/** Mount HTTP routes. WS upgrade + service startup are wired in later tasks. */
export function mountRealtime(app: Express): void {
  app.get(`${BASE_PATH}/realtime/v1/health`, (_req: Request, res: Response) => {
    if (!realtimeEnabled()) return res.status(503).json({ error: "realtime disabled" });
    res.json({ status: "ok" });
  });

  app.post(`${BASE_PATH}/realtime/v1/api/broadcast`, express.json(), async (req: Request, res: Response) => {
    if (!realtimeEnabled()) return res.status(503).json({ error: "realtime disabled" });
    const authHeader = req.headers["authorization"] as string | undefined;
    const apikey = req.headers["apikey"] as string | undefined;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : apikey ?? "";
    const claims = await verifyAccessToken(token);
    if (!claims) return res.status(401).json({ error: "unauthorized" });
    const messages = req.body?.messages;
    if (!Array.isArray(messages)) return res.status(422).json({ error: "messages array required" });
    for (const m of messages) {
      // Private topics require write authorization (an INSERT policy on
      // realtime.messages matching realtime.topic()); unauthorized messages are
      // silently dropped (Elixir returns 202 regardless). Public topics broadcast freely.
      if (m.private === true) {
        // Fail closed: a transient authz error (e.g. DB blip) DROPS the message —
        // never broadcast on error — while the batch still returns 202. Unwrapped,
        // an async rejection would hang the Express 4 request with no response.
        let write = false;
        try {
          ({ write } = await checkAuthorization(claims, m.topic));
        } catch {
          continue;
        }
        if (!write) continue;
      }
      broadcastToTopic(`realtime:${m.topic}`, "broadcast", { type: "broadcast", event: m.event, payload: m.payload });
    }
    res.status(202).json({});
  });
}

export function handleRealtimeUpgrade(req: unknown, socket: unknown, head: unknown): boolean {
  if (!realtimeEnabled()) return false;
  return handleUpgrade(req, socket, head, `${BASE_PATH}/realtime/v1/websocket`);
}

// Singleton pipeline handle so stop() can halt the stream started by start().
let pipeline: ReplicationPipeline | null = null;

/**
 * Boot the realtime service (called once after the HTTP server listens):
 * apply the WALRUS migrations, clear stale subscription rows, prune old
 * realtime.messages, then open the logical-replication pipeline and fan every
 * committed transaction out to subscribed channels. Idempotent — a second call
 * while a pipeline is live is a no-op. Skips entirely when realtime is disabled.
 */
export async function startRealtimeService(): Promise<void> {
  if (!realtimeEnabled() || pipeline) return;
  await applyRealtimeMigrations();
  await clearAllSubscriptions();
  // Best-effort janitor: drop broadcast-from-DB rows older than 3 days. A failure
  // here (e.g. table not yet present) must not block the pipeline from starting.
  // db.ts is imported lazily (it throws at import when DATABASE_URL is unset) so
  // realtime unit tests that import this module stay DB-less — mirrors the lazy
  // pool pattern in subscriptions.ts / walrus.ts / replication.ts.
  const { pool } = await import("../db.ts");
  await pool
    .query("DELETE FROM realtime.messages WHERE inserted_at < now() - interval '3 days'")
    .catch(() => {});
  // Only publish the singleton handle AFTER start() succeeds. If start() throws
  // (the transient boot-time DB failure the non-blocking startRealtimeService().catch
  // in index.ts tolerates), leaving `pipeline` non-null would wedge the singleton
  // guard above and permanently disable replication until restart. Reset to null on
  // any throw so a later retry/boot can recover.
  const p = new ReplicationPipeline();
  p.onTransaction = fanOutTransaction;
  try {
    await p.start();
  } catch (e) {
    pipeline = null;
    throw e;
  }
  pipeline = p;
  console.log("[realtime] service started (slot trex_realtime)");
}

/**
 * Shut the realtime service down: close every live socket with a going-away
 * frame, stop the replication pipeline (which drops the slot) and release the
 * handle. Idempotent — safe to call when nothing was started.
 */
export async function stopRealtimeService(): Promise<void> {
  for (const s of sockets) s.close(1001, "server shutting down");
  await pipeline?.stop();
  pipeline = null;
}
