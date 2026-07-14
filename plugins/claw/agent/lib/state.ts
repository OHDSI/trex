export type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

export type Status =
  | "awaiting_plan_approval"
  | "implementing"
  | "awaiting_ship"
  | "done"
  | "failed";

export interface Orchestration {
  sessionId: string;
  codeSessionId: string | null;
  plan: string | null;
  status: Status | null;
  eventCursor: number;
}

interface Row {
  session_id: string;
  code_session_id: string | null;
  plan: string | null;
  status: Status | null;
  event_cursor: number | string;
}

export async function readOrchestration(sql: QueryFn, sessionId: string): Promise<Orchestration | null> {
  const { rows } = await sql(
    `SELECT session_id, code_session_id, plan, status, event_cursor
       FROM claw.orchestrations WHERE session_id = $1`,
    [sessionId],
  );
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  return {
    sessionId: r.session_id,
    codeSessionId: r.code_session_id,
    plan: r.plan,
    status: r.status,
    eventCursor: Number(r.event_cursor) || 0,
  };
}

export async function upsertOrchestration(sql: QueryFn, o: Orchestration): Promise<void> {
  await sql(
    `INSERT INTO claw.orchestrations (session_id, code_session_id, plan, status, event_cursor, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (session_id) DO UPDATE SET
       code_session_id = EXCLUDED.code_session_id,
       plan = EXCLUDED.plan,
       status = EXCLUDED.status,
       event_cursor = EXCLUDED.event_cursor,
       updated_at = now()`,
    [o.sessionId, o.codeSessionId, o.plan, o.status, o.eventCursor],
  );
}

export function renderStateForPrompt(o: Orchestration | null): string {
  if (!o || !o.status) {
    return "\n\n## Orchestration state\nNo active coding task for this conversation.";
  }
  return [
    "\n\n## Orchestration state",
    `- status: ${o.status}`,
    `- code session: ${o.codeSessionId ?? "(none yet)"}`,
    o.plan ? `- current plan:\n${o.plan}` : "- current plan: (none yet)",
  ].join("\n");
}
