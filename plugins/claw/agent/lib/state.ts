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
  appId: string | null; // devx app the Code session is scoped to (fixed per task)
}

interface Row {
  session_id: string;
  code_session_id: string | null;
  event_cursor: number | string;
  app_id: string | null;
}

export async function readOrchestration(sql: QueryFn, sessionId: string): Promise<Orchestration | null> {
  const { rows } = await sql(
    `SELECT session_id, code_session_id, event_cursor, app_id
       FROM claw.orchestrations WHERE session_id = $1`,
    [sessionId],
  );
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  return {
    sessionId: r.session_id,
    codeSessionId: r.code_session_id,
    eventCursor: Number(r.event_cursor) || 0,
    appId: r.app_id ?? null,
  };
}

export async function upsertOrchestration(sql: QueryFn, o: Orchestration): Promise<void> {
  await sql(
    `INSERT INTO claw.orchestrations (session_id, code_session_id, event_cursor, app_id, updated_at)
       VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (session_id) DO UPDATE SET
       code_session_id = EXCLUDED.code_session_id,
       event_cursor = EXCLUDED.event_cursor,
       app_id = EXCLUDED.app_id,
       updated_at = now()`,
    [o.sessionId, o.codeSessionId, o.eventCursor, o.appId],
  );
}

// A single settled decision, so a hand-off carries what the channel already
// agreed instead of re-opening it. Append-only: a reversal is recorded as a
// NEW entry, never an edit of an earlier one (see renderDecisionLedger).
export interface Decision {
  at: string; // ISO timestamp, set by appendDecision
  question: string;
  decision: string;
}

// Appends one decision to the ledger. Uses the same upsert-on-conflict shape
// as upsertOrchestration so a decision can be recorded even before a coder
// session exists (code_session_id/app_id start NULL) — but unlike
// upsertOrchestration, the ON CONFLICT branch touches ONLY decisions and
// updated_at. It must NEVER also write code_session_id/app_id: those columns
// hold the live coder-chat link, and a concurrent/later appendDecision must
// not be able to wipe it back to NULL.
export async function appendDecision(
  sql: QueryFn,
  sessionId: string,
  d: Omit<Decision, "at">,
): Promise<void> {
  await sql(
    `INSERT INTO claw.orchestrations (session_id, code_session_id, event_cursor, app_id, decisions, updated_at)
       VALUES ($1, NULL, 0, NULL, jsonb_build_array($2::jsonb), now())
     ON CONFLICT (session_id) DO UPDATE
       SET decisions = claw.orchestrations.decisions || $2::jsonb, updated_at = now()`,
    [sessionId, JSON.stringify({ at: new Date().toISOString(), ...d })],
  );
}

export async function readDecisions(sql: QueryFn, sessionId: string): Promise<Decision[]> {
  const { rows } = await sql(`SELECT decisions FROM claw.orchestrations WHERE session_id = $1`, [sessionId]);
  const r = rows[0] as { decisions?: Decision[] } | undefined;
  return Array.isArray(r?.decisions) ? r!.decisions : [];
}

// Renders the ledger oldest-first: it is append-only, so the LAST line is
// whatever is currently true — a reversal shows up as a new line below the
// decision it reverses, never as an edit in place.
export function renderDecisionLedger(ds: Decision[]): string {
  if (ds.length === 0) return "";
  const lines = ds.map((d) => `- ${d.question}: ${d.decision}`).join("\n");
  return `Already settled by the team (do NOT re-open these; if one is reversed it appears again lower down):\n${lines}\n\n`;
}

export function renderStateForPrompt(o: Orchestration | null): string {
  if (!o || !o.codeSessionId) {
    return "\n\n## Coding-agent session\nNo coding-agent session yet — you have not delegated anything for this conversation. Once the ask is clear, use askCodeAgent to open one.";
  }
  return "\n\n## Coding-agent session\nA coding-agent session is active for this conversation (askCodeAgent continues the SAME one). Keep facilitating: relay the team's clarified answers to it and post its replies back to the channel.";
}
