// Persistence for the channels layer: the continuation-token -> session mapping
// in agents.channel_sessions plus the principal columns on agents.sessions.
// Takes an injected query function (pg Pool.query-compatible) so unit tests run
// without Postgres, mirroring agents/service/store.ts.
// deno-lint-ignore-file no-explicit-any

import type { ChannelAuth } from "./types.ts";

export type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;

export function createChannelStore(query: QueryFn) {
  return {
    // Looks up the session a (channel, token) pair already addresses, or null
    // when the token has never been seen. `token` is expected to be the
    // channel-namespaced token (see continuation.ts's namespacedToken).
    async getSessionByToken(channel: string, token: string): Promise<string | null> {
      const r = await query(
        `SELECT session_id FROM agents.channel_sessions WHERE channel = $1 AND continuation_token = $2`,
        [channel, token],
      );
      return r.rows[0]?.session_id ?? null;
    },

    // Resolve a (channel, token) to a session: on a hit, resume the existing
    // session (created:false); on a miss, create a session carrying the channel
    // principal (auth) and record the token -> session mapping (created:true).
    // created_by is null — that column is the trex x-user-id, distinct from the
    // channel principal (spec §4.3); a channel-initiated session has no trex user.
    async resolveOrCreateSession(
      channel: string,
      token: string,
      plugin: string,
      agent: string,
      principal: ChannelAuth | null,
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
          null,
          principal?.principalType ?? null,
          principal?.principalId ?? null,
          principal?.authenticator ?? null,
        ],
      );
      const sessionId = created.rows[0].id;

      await query(
        `INSERT INTO agents.channel_sessions (channel, continuation_token, session_id) VALUES ($1, $2, $3)`,
        [channel, token, sessionId],
      );
      return { sessionId, created: true };
    },

    // Re-keys a parked session under a (channel, token): idempotently points
    // that token at sessionId, updating the mapping if the token was already in
    // use (spec §4.1 "session.setContinuationToken re-keys a parked session").
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
