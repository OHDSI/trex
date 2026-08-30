// Per-conversation link between a claw channel session and the shared Code
// agent session it is facilitating. claw is a facilitator, not a state machine:
// it needs only enough to keep talking to the SAME Code session across the
// parked Discord turns — the Code session id and the stream cursor. All the
// conversational memory (the discussion, clarifications, decisions) lives in
// claw's own replayed session history, not here.
export type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

// A single settled decision, so a hand-off carries what the channel already
// agreed instead of re-opening it. Append-only: a reversal is recorded as a
// NEW entry, never an edit of an earlier one (see renderDecisionLedger).
export interface Decision {
  at: string; // ISO timestamp, set by appendDecision
  question: string;
  decision: string;
}

export interface Orchestration {
  sessionId: string; // claw session id (PK)
  codeSessionId: string | null; // the shared Code agent session, once opened
  eventCursor: number; // position in the Code session's event stream
  appId: string | null; // devx app the Code session is scoped to (fixed per task)
  // The devx chat id used to mirror an eve-transport turn into
  // devx.chats/devx.messages for UI visibility — a DIFFERENT identifier from
  // codeSessionId (which, on the eve transport, holds the eve session id, not
  // a devx chat). Optional like `decisions` below: upsertOrchestration never
  // writes this column (see setDevxChatId, which touches ONLY this column),
  // so callers building an Orchestration to upsert don't need to supply it.
  // readOrchestration always populates it (null when unset).
  devxChatId?: string | null;
  // Optional, not required — upsertOrchestration never writes this column
  // (see below), so callers building an Orchestration to upsert don't need
  // to supply it. readOrchestration always populates it (with
  // [] when there are none) so claw's own instructions (agent.ts's
  // buildInstructions -> renderStateForPrompt) can see the ledger too, not just
  // the coder hand-off in askCore.
  decisions?: Decision[];
}

interface Row {
  session_id: string;
  code_session_id: string | null;
  event_cursor: number | string;
  app_id: string | null;
  devx_chat_id?: string | null;
  decisions?: Decision[] | null;
}

export async function readOrchestration(sql: QueryFn, sessionId: string): Promise<Orchestration | null> {
  const { rows } = await sql(
    `SELECT session_id, code_session_id, event_cursor, app_id, decisions, devx_chat_id
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
    devxChatId: r.devx_chat_id ?? null,
    decisions: Array.isArray(r.decisions) ? r.decisions : [],
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

// Sets the devx chat id used to mirror an eve-transport turn into
// devx.chats/devx.messages, in isolation — same ON-CONFLICT-touches-only-this-
// column shape as appendDecision, so this can never clobber the live coder
// session id/app/cursor the main upsertOrchestration write owns.
export async function setDevxChatId(sql: QueryFn, sessionId: string, devxChatId: string): Promise<void> {
  await sql(
    `INSERT INTO claw.orchestrations (session_id, code_session_id, event_cursor, app_id, devx_chat_id, updated_at)
       VALUES ($1, NULL, 0, NULL, $2, now())
     ON CONFLICT (session_id) DO UPDATE
       SET devx_chat_id = EXCLUDED.devx_chat_id, updated_at = now()`,
    [sessionId, devxChatId],
  );
}

export async function readDecisions(sql: QueryFn, sessionId: string): Promise<Decision[]> {
  const { rows } = await sql(`SELECT decisions FROM claw.orchestrations WHERE session_id = $1`, [sessionId]);
  const r = rows[0] as { decisions?: Decision[] } | undefined;
  return Array.isArray(r?.decisions) ? r!.decisions : [];
}

// Renders the ledger oldest-first: it is append-only, so the LAST line is
// whatever is currently true — a reversal shows up as a new line below the
// decision it reverses, never as an edit in place. Whitespace in
// question/decision is collapsed to a single space so a multi-line value
// (e.g. a decision string with an embedded newline) can never break the
// one-bullet-per-line rendering.
const collapseWhitespace = (s: string): string => s.replace(/\s+/g, " ").trim();

export function renderDecisionLedger(ds: Decision[]): string {
  if (ds.length === 0) return "";
  const lines = ds.map((d) => `- ${collapseWhitespace(d.question)}: ${collapseWhitespace(d.decision)}`).join("\n");
  return `Already settled by the team (do NOT re-open these — for the same question, the LATEST entry below is the current answer):\n${lines}\n\n`;
}

export function renderStateForPrompt(o: Orchestration | null): string {
  const session = !o || !o.codeSessionId
    ? "\n\n## Coding-agent session\nNo coding-agent session yet — you have not delegated anything for this conversation. Once the ask is clear, use askCodeAgent to open one."
    : "\n\n## Coding-agent session\nA coding-agent session is active for this conversation (askCodeAgent continues the SAME one). Keep facilitating: relay the team's clarified answers to it and post its replies back to the channel.";
  // claw's OWN instructions need the ledger too, not just the coder
  // hand-off in askCore — otherwise claw is
  // told to "check the decisions already settled" (facilitate-coding-task.md)
  // with no way to actually see them. Reuses renderDecisionLedger rather than
  // a second renderer; unchanged (byte-identical) when there are no decisions.
  const ledger = renderDecisionLedger(o?.decisions ?? []);
  return ledger ? `${session}\n\n${ledger}` : session;
}
