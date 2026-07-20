// Links a d2esupport channel session to its Slack thread and the claw session
// handling the task. The conversation itself lives in the replayed session
// history (same pattern as claw's lib/state.ts).
export type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

export interface SupportTaskState {
  sessionId: string;
  clawSessionId: string | null;
  // Position in the claw session's event stream already consumed — see
  // claw-session.ts's ClawTurnArgs.startCursor. 0 for a task that has never
  // called into claw yet.
  clawEventCursor: number;
  slackChannelId: string;
  slackThreadTs: string;
  status: string; // open | forwarded | answered
  brief: string | null;
}

interface Row {
  session_id: string;
  claw_session_id: string | null;
  claw_event_cursor: number | string;
  slack_channel_id: string;
  slack_thread_ts: string;
  status: string;
  brief: string | null;
}

export async function readTask(sql: QueryFn, sessionId: string): Promise<SupportTaskState | null> {
  const { rows } = await sql(
    `SELECT session_id, claw_session_id, claw_event_cursor, slack_channel_id, slack_thread_ts, status, brief
       FROM d2esupport.tasks WHERE session_id = $1`,
    [sessionId],
  );
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  return {
    sessionId: r.session_id,
    clawSessionId: r.claw_session_id,
    clawEventCursor: Number(r.claw_event_cursor) || 0,
    slackChannelId: r.slack_channel_id,
    slackThreadTs: r.slack_thread_ts,
    status: r.status,
    brief: r.brief,
  };
}

export async function upsertTask(sql: QueryFn, t: SupportTaskState): Promise<void> {
  await sql(
    `INSERT INTO d2esupport.tasks (session_id, claw_session_id, claw_event_cursor, slack_channel_id, slack_thread_ts, status, brief, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (session_id) DO UPDATE SET
       claw_session_id = EXCLUDED.claw_session_id,
       claw_event_cursor = EXCLUDED.claw_event_cursor,
       slack_channel_id = EXCLUDED.slack_channel_id,
       slack_thread_ts = EXCLUDED.slack_thread_ts,
       status = EXCLUDED.status,
       brief = EXCLUDED.brief,
       updated_at = now()`,
    [t.sessionId, t.clawSessionId, t.clawEventCursor, t.slackChannelId, t.slackThreadTs, t.status, t.brief],
  );
}

export function renderStateForPrompt(t: SupportTaskState | null): string {
  if (!t) {
    return "\n\n## Task state\nNo task filed for this conversation yet. Triage first; once the request is a valid data2evidence task, use forwardToClaw.";
  }
  return `\n\n## Task state\nThis conversation's task is status "${t.status}" (slack channel ${t.slackChannelId}, thread ${t.slackThreadTs}). ` +
    (t.status === "forwarded"
      ? "The dev team is working on it. Relay any user follow-ups with forwardToClaw; when an APPROVED_REPLY message arrives, deliver it with postSlackReply."
      : t.status === "answered"
      ? "The approved reply was already delivered. Handle follow-ups as a fresh triage in this same conversation."
      : "Continue triage; forward when valid.");
}
