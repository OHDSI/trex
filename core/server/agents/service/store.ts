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

    async getSession(id: string) {
      const r = await query(`SELECT id, status FROM agents.sessions WHERE id = $1`, [id]);
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

    // H4: looks up the tool an approval request was raised for, so a sticky
    // (always/never) decision on that request can be recorded against the
    // right (user, plugin, agent, tool) key — see handler.ts's approval
    // routes, which call this only after resolveApproval succeeds.
    async getApprovalTool(requestId: string): Promise<string | null> {
      const r = await query(`SELECT tool FROM agents.approvals WHERE request_id = $1`, [requestId]);
      return r.rows[0]?.tool ?? null;
    },

    // H4: sticky tool-consent decisions (task-h4-brief.md). Checked by
    // toolset.ts's authoredTool BEFORE creating a one-shot approval request
    // — "always" executes immediately, "never" denies immediately, and a
    // miss (null) falls through to the existing per-call approval flow.
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
