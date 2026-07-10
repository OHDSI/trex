// SQL builders for the Agent Runs dashboard resolvers. Pure functions so the
// query shapes are unit-testable without a PostGraphile context or live DB.
// All values parameterized; read-only.

export interface SessionsFilter {
  limit?: number;
  offset?: number;
  agent?: string;
  status?: string;
}

export function sessionsQuery(f: SessionsFilter): { sql: string; params: unknown[] } {
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const offset = Math.max(f.offset ?? 0, 0);
  const params: unknown[] = [limit, offset];
  const where: string[] = [];
  if (f.agent) {
    params.push(f.agent);
    where.push(`s.agent = $${params.length}`);
  }
  if (f.status) {
    params.push(f.status);
    where.push(`s.status = $${params.length}`);
  }
  const sql = `
    SELECT s.id, s.plugin, s.agent, s.created_by, s.status, s.created_at, s.updated_at,
           COUNT(t.id)::int AS turn_count, MAX(t.started_at) AS last_activity
    FROM agents.sessions s
    LEFT JOIN agents.turns t ON t.session_id = s.id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    GROUP BY s.id
    ORDER BY s.updated_at DESC
    LIMIT $1 OFFSET $2`;
  return { sql, params };
}

export function sessionDetailQueries(id: string) {
  return {
    session: {
      sql: `SELECT s.id, s.plugin, s.agent, s.created_by, s.status, s.created_at, s.updated_at,
                   (SELECT COUNT(*)::int FROM agents.turns t WHERE t.session_id = s.id) AS turn_count,
                   (SELECT MAX(t.started_at) FROM agents.turns t WHERE t.session_id = s.id) AS last_activity
            FROM agents.sessions s WHERE s.id = $1`,
      params: [id],
    },
    turns: {
      sql: `SELECT t.id, t.seq, t.message, t.status, t.error, t.started_at, t.finished_at
            FROM agents.turns t WHERE t.session_id = $1 ORDER BY t.seq`,
      params: [id],
    },
    steps: {
      sql: `SELECT s.turn_id, s.seq, s.kind, s.name, s.payload, s.usage, s.started_at, s.finished_at
            FROM agents.steps s JOIN agents.turns t ON t.id = s.turn_id
            WHERE t.session_id = $1 ORDER BY t.seq, s.seq`,
      params: [id],
    },
  };
}
