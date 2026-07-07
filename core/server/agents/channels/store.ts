// Persistence for the channels layer: the continuation-token -> session mapping
// in agents.channel_sessions plus the principal columns on agents.sessions.
// Takes an injected query function (pg Pool.query-compatible) so unit tests run
// without Postgres, mirroring agents/service/store.ts.
// deno-lint-ignore-file no-explicit-any

import type { ChannelAuth } from "./types.ts";

export type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;

export function createChannelStore(query: QueryFn) {
  return {
    // Resolve a (channel, token) to a session: on a hit, resume the existing
    // session (created:false); on a miss, create a session carrying the channel
    // principal (auth) and record the token -> session mapping (created:true).
    // `createdBy` is the trex x-user-id, distinct from the channel principal
    // (spec §4.3): it is set only for a JWT-authed channel that has a real trex
    // user (the eve-web channel, authenticator "trex"), and null for every
    // platform-webhook channel (Discord/Slack/…), which has no trex user. This
    // populates agents.sessions.created_by so the native approval-ownership
    // check (handler.ts) protects eve-web sessions like a native session.
    //
    // Race-safe: the SELECT-then-INSERT is a TOCTOU window — two inbound
    // messages with the same (channel, token) can both miss the SELECT. We let
    // both create a session but arbitrate on the channel_sessions PK via
    // ON CONFLICT DO NOTHING RETURNING: the winner's mapping INSERT returns a
    // row; the loser gets no row, deletes its now-orphaned session, and adopts
    // the winner's session (created:false).
    async resolveOrCreateSession(
      channel: string,
      token: string,
      plugin: string,
      agent: string,
      principal: ChannelAuth | null,
      createdBy: string | null,
    ): Promise<{ sessionId: string; created: boolean }> {
      const existing = await query(
        `SELECT session_id FROM agents.channel_sessions WHERE channel = $1 AND continuation_token = $2`,
        [channel, token],
      );
      if (existing.rows.length > 0) {
        return { sessionId: existing.rows[0].session_id, created: false };
      }

      const created = await query(
        `INSERT INTO agents.sessions (plugin, agent, created_by, principal_type, principal_id, authenticator)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          plugin,
          agent,
          createdBy,
          principal?.principalType ?? null,
          principal?.principalId ?? null,
          principal?.authenticator ?? null,
        ],
      );
      const sessionId = created.rows[0].id;

      const mapped = await query(
        `INSERT INTO agents.channel_sessions (channel, continuation_token, session_id) VALUES ($1, $2, $3)
         ON CONFLICT (channel, continuation_token) DO NOTHING RETURNING session_id`,
        [channel, token, sessionId],
      );
      if (mapped.rows.length > 0) {
        return { sessionId, created: true };
      }

      // Lost the race: a concurrent caller already mapped this token. Drop our
      // orphaned session and adopt the winner's mapping.
      await query(`DELETE FROM agents.sessions WHERE id = $1`, [sessionId]);
      const winner = await query(
        `SELECT session_id FROM agents.channel_sessions WHERE channel = $1 AND continuation_token = $2`,
        [channel, token],
      );
      return { sessionId: winner.rows[0].session_id, created: false };
    },

    // Resolve a (channel, namespacedToken) to its session id without creating
    // one — the read half of resolveOrCreateSession, used by the channel HITL
    // resume primitive (channels/layer.ts) to turn an inbound continuation token
    // back into the parked session whose approval it applies. `token` is already
    // namespaced (`${channel}:<raw>`) by the caller. Returns null on a miss (the
    // resume path treats that as "no session for token", not an error).
    async getSessionByToken(channel: string, token: string): Promise<string | null> {
      const r = await query(
        `SELECT session_id FROM agents.channel_sessions WHERE channel = $1 AND continuation_token = $2`,
        [channel, token],
      );
      return r.rows[0]?.session_id ?? null;
    },

    // Re-keys a parked session under a (channel, token): idempotently points
    // that token at sessionId, updating the mapping if the token was already in
    // use (spec §4.1 "session.setContinuationToken re-keys a parked session").
    // Re-key seam reserved for the (deferred-v1.1) channel HITL token->session
    // resume primitive — defined but currently unused by the runtime.
    async setContinuationToken(channel: string, token: string, sessionId: string): Promise<void> {
      await query(
        `INSERT INTO agents.channel_sessions (channel, continuation_token, session_id) VALUES ($1, $2, $3)
         ON CONFLICT (channel, continuation_token) DO UPDATE SET session_id = EXCLUDED.session_id`,
        [channel, token, sessionId],
      );
    },
  };
}

export type ChannelStore = ReturnType<typeof createChannelStore>;
