// Thin persistence layer over the agents.* tables. Takes an injected query
// function (pg Pool.query-compatible) so unit tests run without Postgres.
// deno-lint-ignore-file no-explicit-any

export type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;

export function createStore(query: QueryFn) {
  return {
    async createSession(plugin: string, agent: string, createdBy?: string): Promise<string> {
      const r = await query(
        `INSERT INTO agents.sessions (plugin, agent, created_by) VALUES ($1, $2, $3) RETURNING id`,
        [plugin, agent, createdBy ?? null],
      );
      return r.rows[0].id;
    },

    // created_by is read back here (not just written by createSession) so
    // handler.ts's approval routes can enforce session ownership — see
    // resolveApprovalDecision's caller-side check.
    async getSession(id: string) {
      const r = await query(`SELECT id, status, created_by FROM agents.sessions WHERE id = $1`, [id]);
      return r.rows[0] ?? null;
    },

    async addTurn(sessionId: string, message: unknown, metadata?: unknown) {
      // Next seq is computed in SQL; the UNIQUE (session_id, seq) constraint
      // plus a small retry loop provides the no-duplicate-seq guarantee under
      // concurrent turns on the same session.
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await query(
            `INSERT INTO agents.turns (session_id, seq, message, metadata)
             SELECT $1, COALESCE(MAX(seq), 0) + 1, $2, $3 FROM agents.turns WHERE session_id = $1
             RETURNING id, seq`,
            [sessionId, JSON.stringify(message), metadata == null ? null : JSON.stringify(metadata)],
          );
          return { id: r.rows[0].id, seq: r.rows[0].seq };
        } catch (e) {
          lastError = e;
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.includes("duplicate key") && !msg.includes("unique")) throw e;
        }
      }
      throw lastError;
    },

    async finishTurn(turnId: string, status: "completed" | "failed", error?: string) {
      await query(
        `UPDATE agents.turns SET status = $2, error = $3, finished_at = NOW() WHERE id = $1`,
        [turnId, status, error ?? null],
      );
    },

    async addStep(turnId: string, seq: number, kind: string, name: string | null, payload: unknown, usage?: unknown) {
      await query(
        `INSERT INTO agents.steps (turn_id, seq, kind, name, payload, usage, finished_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [turnId, seq, kind, name, payload == null ? null : JSON.stringify(payload), usage == null ? null : JSON.stringify(usage)],
      );
    },

    async listEvents(sessionId: string) {
      const r = await query(
        `SELECT s.turn_id, s.kind, s.name, s.payload, s.usage FROM agents.steps s
         JOIN agents.turns t ON t.id = s.turn_id
         WHERE t.session_id = $1 ORDER BY t.seq, s.seq`,
        [sessionId],
      );
      return r.rows;
    },

    async getHistory(sessionId: string) {
      const r = await query(
        `SELECT t.message, t.metadata,
                COALESCE(jsonb_agg(jsonb_build_object('kind', s.kind, 'name', s.name, 'payload', s.payload)
                         ORDER BY s.seq) FILTER (WHERE s.id IS NOT NULL), '[]') AS steps
         FROM agents.turns t LEFT JOIN agents.steps s ON s.turn_id = t.id
         WHERE t.session_id = $1 GROUP BY t.id ORDER BY t.seq`,
        [sessionId],
      );
      return r.rows;
    },

    async createApproval(sessionId: string, turnId: string, tool: string, input: unknown): Promise<string> {
      const r = await query(
        `INSERT INTO agents.approvals (session_id, turn_id, tool, input) VALUES ($1, $2, $3, $4) RETURNING request_id`,
        [sessionId, turnId, tool, input == null ? null : JSON.stringify(input)],
      );
      return r.rows[0].request_id;
    },

    // sessionId-scoped: without it, a requestId leaked or guessed from
    // another session could resolve a pending approval it doesn't own —
    // request_id alone is not treated as a capability token anywhere else
    // in this API (session ownership is always checked first via
    // getSession). A wrong-session requestId is indistinguishable from an
    // unknown one to the caller (both return false / 404 upstream).
    async resolveApproval(requestId: string, decision: "approve" | "deny", sessionId: string): Promise<boolean> {
      const r = await query(
        `UPDATE agents.approvals SET decision = $2, decided_at = NOW()
         WHERE request_id = $1 AND session_id = $3 AND decision IS NULL RETURNING request_id`,
        [requestId, decision, sessionId],
      );
      return r.rows.length > 0;
    },

    async getApprovalDecision(requestId: string): Promise<string | null> {
      const r = await query(`SELECT decision FROM agents.approvals WHERE request_id = $1`, [requestId]);
      return r.rows[0]?.decision ?? null;
    },

    // Channel HITL resume — MODE A (by request id, channels/layer.ts). The
    // session an approval belongs to, so a widget callback that already carries
    // the requestId can resolve it after a channel-ownership check
    // (channelStore.sessionInChannel). Null for an unknown request id.
    async getApprovalSession(requestId: string): Promise<string | null> {
      const r = await query(`SELECT session_id FROM agents.approvals WHERE request_id = $1`, [requestId]);
      return r.rows[0]?.session_id ?? null;
    },

    // Channel HITL resume — MODE B (by token, single pending). The session's
    // SOLE still-undecided approval, or null when there are zero or more than
    // one. A text reply carries a decision but no requestId, so it can only be
    // applied unambiguously when exactly one approval is pending; >1 is
    // ambiguous (never guess which the reply answers) and 0 means the reply is
    // an ordinary message. Widened from a bare requestId to {requestId, tool,
    // options?} — the plain-text gate matcher needs the tool name and, for
    // postChoice-style gates, the option id/label pairs (read from
    // `input.options`, tolerating id|value|label key variants) to resolve a
    // reply against the pending gate.
    async getSinglePendingApproval(
      sessionId: string,
    ): Promise<{ requestId: string; tool: string; options?: Array<{ id: string; label: string }> } | null> {
      const r = await query(
        `SELECT request_id, tool, input FROM agents.approvals WHERE session_id = $1 AND decision IS NULL`,
        [sessionId],
      );
      if (r.rows.length !== 1) return null;
      const row = r.rows[0] as { request_id: string; tool: string; input: Record<string, unknown> | null };
      const rawOptions = (row.input as { options?: Array<{ id?: string; value?: string; label?: string }> } | null)
        ?.options;
      const options = Array.isArray(rawOptions)
        ? rawOptions
          .map((o) => ({ id: String(o.id ?? o.value ?? ""), label: String(o.label ?? o.value ?? o.id ?? "") }))
          .filter((o) => o.id !== "")
        : undefined;
      return { requestId: row.request_id, tool: row.tool, ...(options && options.length ? { options } : {}) };
    },

    // "One turn at a time per session". The
    // session's in-flight turn (there should be at most one — see
    // service/handler.ts's startTurn, which checks this before creating a new
    // turn), or null when idle. seq DESC LIMIT 1 is defensive: normally there's
    // exactly one running row, but if a race ever lets two exist, the most
    // recently started one is the one a fresh message should fold against.
    async getRunningTurn(sessionId: string): Promise<{ id: string; seq: number; startedAt: Date } | null> {
      const r = await query(
        `SELECT id, seq, started_at FROM agents.turns
          WHERE session_id = $1 AND status = 'running'
          ORDER BY seq DESC LIMIT 1`,
        [sessionId],
      );
      const row = r.rows[0] as { id: string; seq: number; started_at: Date } | undefined;
      return row ? { id: row.id, seq: Number(row.seq), startedAt: row.started_at } : null;
    },

    // 21 of 263 turns were observed stuck `running` forever because
    // nothing ever ended an abandoned turn (a worker crash/redeploy mid-turn
    // leaves no other signal). Marks every `running` turn older than the
    // cutoff, ON THE GIVEN SESSION, `failed`, so a hung turn stops blocking
    // that session's getRunningTurn/folding forever, and returns how many it
    // reaped (for logging/metrics by the caller). `error` carries the fixed
    // message the plan specifies, with the cutoff restated in minutes for a
    // human reading the row.
    //
    // Session-scoped on purpose. handler.ts's startTurn calls this lazily
    // whenever a message lands on a BUSY session, to unwedge a zombie turn on
    // THAT session — it never needed to touch any other session. An unscoped
    // reap marked every running turn deployment-wide, so one session's message
    // could fail another session's genuinely live turn (long turns are
    // plausible: the channel step floor was raised to 200 and streamTurn has no
    // timeout); getRunningTurn on the victim session then returned null, so ITS
    // next message started a second concurrent turn — the exact defect this
    // reap-scoping fix exists to remove — and when the real turn finished
    // later, finishTurn(id, "completed") flipped the row back, erasing the
    // evidence the reap ever ran.
    //
    // The cutoff is computed HERE in JS (`new Date(Date.now() -
    // olderThanMs)`) and passed as a plain parameter — the SQL then does a
    // trivial `started_at < $1` comparison instead of `NOW() - (...
    // )::interval` arithmetic inline in the query string. This isn't just
    // style: with the arithmetic in SQL, a get-the-sign-wrong bug (`NOW() -
    // ...` vs `NOW() + ...`) is invisible to any test that only asserts the
    // SQL *text*. With the cutoff computed in JS, store.test.ts can assert
    // the exact Date value passed for a given olderThanMs (proving the
    // JS-side sign is right) and a fake that evaluates `started_at < cutoff`
    // against seeded rows can prove the query's comparison direction against
    // that same real value — both directions, without a live Postgres.
    async reapStaleTurns(sessionId: string, olderThanMs: number): Promise<number> {
      const cutoff = new Date(Date.now() - olderThanMs);
      const minutes = Math.round(olderThanMs / 60000);
      const r = await query(
        `UPDATE agents.turns
            SET status = 'failed',
                error = $3,
                finished_at = NOW()
          WHERE status = 'running' AND session_id = $1 AND started_at < $2
          RETURNING id`,
        [sessionId, cutoff, `turn abandoned (no completion within ${minutes} minutes)`],
      );
      return r.rows.length;
    },

    // The follow-up queue a busy session's new message folds into instead of
    // racing the turn already running (service/handler.ts's startTurn checks
    // getRunningTurn, and queues here rather than starting a second concurrent
    // turn). No existing session-scoped scratch mechanism exists in this schema
    // (checked: sessions/turns/steps/approvals/
    // tool_consents/channel_sessions/oauth_* — none fit), so this is a new
    // table (migrations/V6__turn_followups.sql), following the same pattern as
    // agents.approvals/agents.tool_consents.
    async queueFollowUp(sessionId: string, text: string): Promise<void> {
      await query(
        `INSERT INTO agents.turn_followups (session_id, message) VALUES ($1, $2)`,
        [sessionId, text],
      );
    },

    // Drains (deletes and returns) every follow-up queued for the session,
    // oldest-first, so startTurn can fold them into the next turn's message
    // in the order they arrived. The DELETE...RETURNING is wrapped in a CTE
    // because Postgres does not support ORDER BY directly on a DELETE.
    async takeFollowUps(sessionId: string): Promise<string[]> {
      const r = await query(
        `WITH taken AS (
           DELETE FROM agents.turn_followups WHERE session_id = $1 RETURNING message, created_at
         )
         SELECT message FROM taken ORDER BY created_at`,
        [sessionId],
      );
      return r.rows.map((row: { message: string }) => row.message);
    },

    // Looks up the tool an approval request was raised for, so a sticky
    // (always/never) decision on that request can be recorded against the
    // right (user, plugin, agent, tool) key — see handler.ts's approval
    // routes, which call this only after resolveApproval succeeds.
    async getApprovalTool(requestId: string): Promise<string | null> {
      const r = await query(`SELECT tool FROM agents.approvals WHERE request_id = $1`, [requestId]);
      return r.rows[0]?.tool ?? null;
    },

    // Sticky tool-consent decisions. Checked by toolset.ts's authoredTool
    // BEFORE creating a one-shot approval request — "always" executes
    // immediately, "never" denies immediately, and a miss (null) falls through
    // to the existing per-call approval flow.
    async getToolConsent(userId: string, plugin: string, agent: string, tool: string): Promise<"always" | "never" | null> {
      const r = await query(
        `SELECT consent FROM agents.tool_consents WHERE user_id = $1 AND plugin = $2 AND agent = $3 AND tool = $4`,
        [userId, plugin, agent, tool],
      );
      return (r.rows[0]?.consent as "always" | "never" | undefined) ?? null;
    },

    // Upserts on the table's (user_id, plugin, agent, tool) primary key —
    // a user changing their mind (always -> never or vice versa) replaces
    // the prior verb rather than erroring or accumulating rows.
    async setToolConsent(userId: string, plugin: string, agent: string, tool: string, consent: "always" | "never"): Promise<void> {
      await query(
        `INSERT INTO agents.tool_consents (user_id, plugin, agent, tool, consent) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, plugin, agent, tool) DO UPDATE SET consent = EXCLUDED.consent`,
        [userId, plugin, agent, tool, consent],
      );
    },
  };
}

export type AgentStore = ReturnType<typeof createStore>;
