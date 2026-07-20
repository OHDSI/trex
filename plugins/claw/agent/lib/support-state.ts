// Support-task bridge state (see V3__support_tasks.sql). Same discipline as
// lib/state.ts: only what a later thread turn cannot recover from its own
// session history.
import type { QueryFn } from "./state.ts";

export interface SupportTask {
  threadId: string;
  supportSessionId: string;
  kind: string;
  brief: string;
  proposedReply: string | null;
  githubLogins: string[];
  status: string; // awaiting_review | sent | discarded
}

interface Row {
  thread_id: string;
  support_session_id: string;
  kind: string;
  brief: string;
  proposed_reply: string | null;
  github_logins: unknown;
  status: string;
}

export async function readSupportTask(sql: QueryFn, threadId: string): Promise<SupportTask | null> {
  const { rows } = await sql(
    `SELECT thread_id, support_session_id, kind, brief, proposed_reply, github_logins, status
       FROM claw.support_tasks WHERE thread_id = $1`,
    [threadId],
  );
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  const logins = Array.isArray(r.github_logins)
    ? r.github_logins.map(String)
    : JSON.parse(String(r.github_logins ?? "[]"));
  return {
    threadId: r.thread_id,
    supportSessionId: r.support_session_id,
    kind: r.kind,
    brief: r.brief,
    proposedReply: r.proposed_reply,
    githubLogins: logins,
    status: r.status,
  };
}

export async function upsertSupportTask(sql: QueryFn, t: SupportTask): Promise<void> {
  await sql(
    `INSERT INTO claw.support_tasks (thread_id, support_session_id, kind, brief, proposed_reply, github_logins, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (thread_id) DO UPDATE SET
       proposed_reply = EXCLUDED.proposed_reply,
       github_logins = EXCLUDED.github_logins,
       status = EXCLUDED.status,
       updated_at = now()`,
    [t.threadId, t.supportSessionId, t.kind, t.brief, t.proposedReply, JSON.stringify(t.githubLogins), t.status],
  );
}
