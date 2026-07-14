// Per-conversation link between a claw channel session and the shared Code
// agent session it is facilitating. claw is a facilitator, not a state machine:
// it needs only enough to keep talking to the SAME Code session across the
// parked Discord turns — the Code session id and the stream cursor. All the
// conversational memory (the discussion, clarifications, decisions) lives in
// claw's own replayed session history, not here.
export type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

export interface Orchestration {
  sessionId: string; // claw session id (PK)
  codeSessionId: string | null; // the shared Code agent session, once opened
  eventCursor: number; // position in the Code session's event stream
}

interface Row {
  session_id: string;
  code_session_id: string | null;
  event_cursor: number | string;
}

export async function readOrchestration(sql: QueryFn, sessionId: string): Promise<Orchestration | null> {
  const { rows } = await sql(
    `SELECT session_id, code_session_id, event_cursor
       FROM claw.orchestrations WHERE session_id = $1`,
    [sessionId],
  );
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  return {
    sessionId: r.session_id,
    codeSessionId: r.code_session_id,
    eventCursor: Number(r.event_cursor) || 0,
  };
}

export async function upsertOrchestration(sql: QueryFn, o: Orchestration): Promise<void> {
  await sql(
    `INSERT INTO claw.orchestrations (session_id, code_session_id, event_cursor, updated_at)
       VALUES ($1, $2, $3, now())
     ON CONFLICT (session_id) DO UPDATE SET
       code_session_id = EXCLUDED.code_session_id,
       event_cursor = EXCLUDED.event_cursor,
       updated_at = now()`,
    [o.sessionId, o.codeSessionId, o.eventCursor],
  );
}

export function renderStateForPrompt(o: Orchestration | null): string {
  if (!o || !o.codeSessionId) {
    return "\n\n## Coding-agent session\nNo coding-agent session yet — you have not delegated anything for this conversation. Once the ask is clear, use askCodeAgent to open one.";
  }
  return "\n\n## Coding-agent session\nA coding-agent session is active for this conversation (askCodeAgent continues the SAME one). Keep facilitating: relay the team's clarified answers to it and post its replies back to the channel.";
}
