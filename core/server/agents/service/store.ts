// Thin persistence layer over the agents.* tables. Takes an injected query
// function (pg Pool.query-compatible) so unit tests run without Postgres.
// deno-lint-ignore-file no-explicit-any

import type { ChildAgent } from "./orchestration.ts";
import { STOPPED_BY_PARENT_ERROR } from "./orchestration.ts";

export type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;

/**
 * One drained row of agents.turn_followups. `originChildSessionId` names the
 * child whose completion caused this followup to be queued, or null for a
 * message nobody asked for on a child's behalf (a human or channel message
 * that arrived while a turn was running). See V10__followup_origin.sql.
 */
export interface FollowUp {
  message: string;
  originChildSessionId: string | null;
}

// ChildAgent.status is a DISPLAY value derived from the child's latest turn —
// it is never a value written to a DB column (agents.turns' CHECK constraint
// only permits running/completed/failed; there is no 'stopped'). A child with
// no turns yet (turn_status null, e.g. between createChildSession and its
// first startChildTurn) derives to 'running'; a failed turn carrying the
// agent_stop marker derives to 'stopped'; anything else passes through as-is.
function deriveChildStatus(turnStatus: unknown, turnError: unknown): ChildAgent["status"] {
  if (turnStatus == null) return "running";
  if (turnStatus === "failed" && turnError === STOPPED_BY_PARENT_ERROR) return "stopped";
  return turnStatus as ChildAgent["status"];
}

function toChildAgent(row: Record<string, unknown>): ChildAgent {
  return {
    agentId: String(row.id),
    nickname: String(row.nickname ?? ""),
    subagent: (row.subagent as string | null) ?? null,
    status: deriveChildStatus(row.turn_status, row.turn_error),
    startedAt: row.created_at as Date,
    detached: Boolean(row.detached),
  };
}

// Latest turn (by seq) for a session, joined via LATERAL so a session with no
// turns yet still produces one row (turn_status/turn_error both NULL) rather
// than disappearing from the outer query — a plain JOIN would drop it.
const LATEST_TURN_JOIN = `
  LEFT JOIN LATERAL (
    SELECT t.status, t.error FROM agents.turns t
     WHERE t.session_id = s.id
     ORDER BY t.seq DESC LIMIT 1
  ) lt ON true`;

// The SQL half of deriveChildStatus's `"running"` case, over LATEST_TURN_JOIN's
// `lt`. Kept as one shared fragment because two callers depend on agreeing
// with it exactly: countChildren (whose `live` figure enforces
// MAX_LIVE_CHILDREN) and listChildren's liveOnly filter (what agent_list
// shows). NULL is included on purpose — that is a child between
// createChildSession and its first addTurn, which deriveChildStatus reports as
// "running" and which the cap must therefore also count. `stopped` needs no
// case of its own: it derives from a `failed` turn, which this excludes
// already.
const LIVE_CHILD_PREDICATE = `(lt.status IS NULL OR lt.status = 'running')`;

// Denies (WHERE decision IS NULL — never overwrites an already-decided row)
// every approval belonging to the given turns. Exported standalone so a
// caller reaping turns any other way (there is only reapStaleTurns today,
// but the coupling shouldn't be implicit) can reuse it, and so it's
// independently testable. See reapStaleTurns's own comment for why this
// exists: a turn reaped without also denying its approval leaves a
// `decision IS NULL` row that a LATER message matching gate vocabulary
// (e.g. "continue" — literally in gate-text.ts's APPROVE list) can still
// resolve, silently discarding that message and starting nothing, because
// resolveApprovalDecision only writes a decision — it never drives a turn.
export async function denyApprovalsForTurns(turnIds: string[], query: QueryFn): Promise<number> {
  if (turnIds.length === 0) return 0;
  const r = await query(
    `UPDATE agents.approvals
        SET decision = 'deny', decided_at = NOW()
      WHERE turn_id = ANY($1) AND decision IS NULL
      RETURNING request_id`,
    [turnIds],
  );
  return r.rows.length;
}

// The partial unique index V9 adds on agents.turns(session_id) WHERE
// status = 'running'. Named here (rather than matched on generic
// "duplicate key" wording) so addTurn can tell "another turn is already
// running on this session" — a durable state — apart from the seq race its
// retry loop was written for. Exported so handler.ts can recognise the same
// rejection.
export const RUNNING_TURN_INDEX = "idx_agents_turns_one_running_per_session";

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
    //
    // parent_session_id/detached/nickname are additive (Task 8,
    // deliverChildResult): the only other read of a child's own row,
    // getChild(agentId, parentSessionId), requires the parent id already
    // known — useless from a child's own terminal path, which knows only its
    // OWN session id and must discover whether it even HAS a parent, and
    // whether that parent should be woken.
    async getSession(id: string) {
      const r = await query(
        `SELECT id, status, created_by, parent_session_id, detached, nickname FROM agents.sessions WHERE id = $1`,
        [id],
      );
      return r.rows[0] ?? null;
    },

    async addTurn(sessionId: string, message: unknown, metadata?: unknown) {
      // Next seq is computed in SQL; the UNIQUE (session_id, seq) constraint
      // plus a small retry loop provides the no-duplicate-seq guarantee under
      // concurrent turns on the same session.
      //
      // The retry is deliberately NOT "retry any unique violation". Since V9
      // there are TWO unique constraints an INSERT here can hit, and they
      // mean opposite things:
      //   - (session_id, seq): two turns raced for the same sequence number.
      //     Recomputing MAX(seq) on the next attempt genuinely resolves it.
      //   - idx_agents_turns_one_running_per_session: another turn on this
      //     session IS ALREADY RUNNING. That is a durable state, not a race
      //     to lose — retrying burns two more round trips and then rethrows
      //     the identical error. Rethrow immediately so the caller (see
      //     handler.ts's addTurn guard, which requeues the drained message)
      //     can act on it while the drained text is still in hand.
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await query(
            // heartbeat_at is stamped at insert, not left NULL for the first
            // ticker beat to fill in: a worker that dies inside the first
            // interval would otherwise leave a NULL-heartbeat row, which falls
            // back to the two-hour started_at cutoff — the exact wait this
            // column exists to remove.
            `INSERT INTO agents.turns (session_id, seq, message, metadata, heartbeat_at)
             SELECT $1, COALESCE(MAX(seq), 0) + 1, $2, $3, NOW() FROM agents.turns WHERE session_id = $1
             RETURNING id, seq`,
            [sessionId, JSON.stringify(message), metadata == null ? null : JSON.stringify(metadata)],
          );
          return { id: r.rows[0].id, seq: r.rows[0].seq };
        } catch (e) {
          lastError = e;
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes(RUNNING_TURN_INDEX)) throw e;
          if (!msg.includes("duplicate key") && !msg.includes("unique")) throw e;
        }
      }
      throw lastError;
    },

    // Scoped to `status = 'running'` (same pattern as heartbeatTurn,
    // reapStaleTurns, and failTurnsForSession below — this was the one
    // unscoped mutator among the four). Returns whether THIS call actually
    // won the running->{completed,failed} transition: a caller that lost the
    // race (a reap already flipped the row to `failed` first) gets `false`
    // and must not act as if it owns the turn's outcome — see handler.ts's
    // two call sites, which gate their follow-up chain and deliverChildResult
    // on this. Without the scope, a worker that merely stalled (a GC pause,
    // event-loop starvation) past the heartbeat cutoff — not actually died —
    // could resurface after a reap already marked its turn `failed` and
    // silently overwrite that row back to `completed`, and then (pre-fix)
    // call deliverChildResult a second time with a contradictory outcome.
    async finishTurn(turnId: string, status: "completed" | "failed", error?: string): Promise<boolean> {
      const r = await query(
        `UPDATE agents.turns SET status = $2, error = $3, finished_at = NOW()
          WHERE id = $1 AND status = 'running' RETURNING id`,
        [turnId, status, error ?? null],
      );
      return r.rows.length > 0;
    },

    // Liveness stamp for a running turn (service/heartbeat.ts drives the
    // ticker). Scoped to `status = 'running'` so a beat that races finishTurn
    // cannot re-stamp a turn that already ended, and so a turn the sweep just
    // reaped is not marked alive again by its own dying worker.
    async heartbeatTurn(turnId: string): Promise<void> {
      await query(
        `UPDATE agents.turns SET heartbeat_at = NOW() WHERE id = $1 AND status = 'running'`,
        [turnId],
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
        `SELECT t.id, t.seq, t.message, t.metadata,
                COALESCE(jsonb_agg(jsonb_build_object('kind', s.kind, 'name', s.name, 'payload', s.payload)
                         ORDER BY s.seq) FILTER (WHERE s.id IS NOT NULL), '[]') AS steps
         FROM agents.turns t LEFT JOIN agents.steps s ON s.turn_id = t.id
         WHERE t.session_id = $1 GROUP BY t.id, t.seq ORDER BY t.seq`,
        [sessionId],
      );
      return r.rows;
    },

    // The most recently persisted turn's observed context size, used by
    // compact.ts's maybeCompact to judge context pressure from what the
    // provider actually counted rather than the char/4 estimateTokens
    // heuristic (budget.ts).
    //
    // Reads `lastStepInputTokens` — the FINAL step's prefill — and never
    // `inputTokens`, which runner.ts persists as ai@6's `totalUsage`: the SUM
    // of every step's usage. A summed counter is not a context size (a
    // 20-step turn over a 30k context sums to ~600k), and using it tripped
    // the compaction threshold on almost every turn, replacing history with
    // a fresh summary each time without ever converging.
    //
    // Null when the session has no completed turn yet, or when the finish
    // step carries no usable lastStepInputTokens — a turn persisted before
    // this field existed, or a mocked/partial usage object in a test. The
    // caller then falls back to estimateTokens, which is conservative and
    // correct; silently substituting the summed total would not be.
    async getLastTurnUsage(sessionId: string): Promise<{ inputTokens: number } | null> {
      const r = await query(
        `SELECT s.usage FROM agents.steps s
           JOIN agents.turns t ON t.id = s.turn_id
          WHERE t.session_id = $1 AND s.kind = 'finish'
          ORDER BY t.seq DESC, s.seq DESC LIMIT 1`,
        [sessionId],
      );
      const usage = r.rows[0]?.usage as { lastStepInputTokens?: unknown } | null | undefined;
      return usage && typeof usage.lastStepInputTokens === "number"
        ? { inputTokens: usage.lastStepInputTokens }
        : null;
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
    //
    // Two independent cutoffs, because they answer different questions.
    // `heartbeat_at` says when the turn's worker was last demonstrably alive,
    // so a lapsed heartbeat is positive evidence the worker is gone and can be
    // acted on in minutes. `started_at` only says how long the turn has been
    // running, which for a live turn is not evidence of anything — long turns
    // are legitimate — so it stays the slow two-hour fallback, used only for
    // rows with no heartbeat at all (written before V7__turn_heartbeat.sql).
    // A NULL-heartbeat row is never reaped on the heartbeat cutoff: absence of
    // a stamp is not absence of a worker.
    //
    // Returns the reaped rows (not just a count) so the caller can notify the
    // channel the turn came from — service/reap-notify.ts needs each turn's
    // metadata to find the channel, and by reap time the row is the only place
    // that still holds it.
    async reapStaleTurns(
      sessionId: string,
      olderThanMs: number,
      heartbeatStaleMs?: number,
    ): Promise<Array<{ id: string; metadata: unknown }>> {
      const cutoff = new Date(Date.now() - olderThanMs);
      const minutes = Math.round(olderThanMs / 60000);
      // Off (never matches) when the caller passes no heartbeat cutoff, so a
      // caller that has not opted in keeps exactly the old started_at behaviour.
      const beatCutoff = heartbeatStaleMs == null ? null : new Date(Date.now() - heartbeatStaleMs);
      const beatMinutes = heartbeatStaleMs == null ? 0 : Math.round(heartbeatStaleMs / 60000);
      const r = await query(
        `UPDATE agents.turns
            SET status = 'failed',
                error = CASE
                  WHEN $4::timestamptz IS NOT NULL AND heartbeat_at IS NOT NULL AND heartbeat_at < $4
                  THEN $5 ELSE $3 END,
                finished_at = NOW()
          WHERE status = 'running' AND session_id = $1
            AND (
              ($4::timestamptz IS NOT NULL AND heartbeat_at IS NOT NULL AND heartbeat_at < $4)
              OR (heartbeat_at IS NULL AND started_at < $2)
            )
          RETURNING id, metadata`,
        [
          sessionId,
          cutoff,
          `turn abandoned (no completion within ${minutes} minutes)`,
          beatCutoff,
          `turn abandoned (its worker stopped responding — no heartbeat for over ${beatMinutes} minutes)`,
        ],
      );
      const turnIds = r.rows.map((row: { id: string }) => row.id);
      // Deliberately isolated from the turns UPDATE above, which has already
      // committed by the time we get here (there is no surrounding
      // transaction). If denyApprovalsForTurns throws (e.g. a DB blip), that
      // must not propagate out of reapStaleTurns: on the lazy path
      // (handler.ts's busy-session branch) the caller's catch deliberately
      // degrades to "treat the session as busy" and skips re-reading
      // getRunningTurn, so a thrown reapStaleTurns would strand the incoming
      // message behind a turn that no longer exists — precisely the
      // silently-stranded-message failure this branch exists to eliminate;
      // on the sweep path the same throw would skip onReap and suppress the
      // notification for turns that WERE successfully reaped. Swallowing the
      // failure here and still returning r.rows.length is safe by design: an
      // approval left un-denied is exactly the orphan case
      // getApprovalTurnStatus's "turn not running" guard (see
      // resolveApprovalDecision) already exists to catch, so a later
      // gate-vocabulary message still can't silently resolve it.
      try {
        await denyApprovalsForTurns(turnIds, query);
      } catch (e) {
        console.error(
          `agents: reapStaleTurns reaped ${r.rows.length} turn(s) on session ${sessionId} but failed to deny their approvals (will remain orphaned until resolveApprovalDecision's turn-status guard catches them):`,
          e,
        );
      }
      return r.rows.map((row: { id: string; metadata: unknown }) => ({ id: row.id, metadata: row.metadata }));
    },

    // The set of sessions with at least one turn stuck `running` past the
    // cutoff, for the periodic sweep (service/sweep.ts) to reap individually
    // through the existing, unchanged, session-scoped reapStaleTurns — kept
    // session-scoped on purpose (see reapStaleTurns's own header comment: an
    // earlier unscoped reap caused a worse bug by failing a DIFFERENT session's
    // genuinely live turn).
    //
    // Scoped to the calling worker's own (plugin, agent) via a join against
    // agents.sessions — agents.turns itself carries no plugin/agent column.
    // Without this, with multiple agents deployed (claw, devx-coder,
    // d2esupport, ...) every worker's sweep would list every OTHER agent's
    // stale sessions too. The reap itself stays race-safe (whichever worker's
    // UPDATE lands first wins, so no duplicate reap), but that winning worker
    // is also the one that publishes turn.reaped — and for a foreign session
    // it has no subscriber, so the notification is silently lost even in
    // cases where it would otherwise have been delivered.
    //
    // The two cutoffs mirror reapStaleTurns's exactly — they must, or the sweep
    // would list sessions the reap then declines to touch (a busy no-op every
    // tick) or, worse, skip sessions the reap would have cleared.
    async listSessionsWithStaleRunningTurns(
      olderThanMs: number,
      plugin: string,
      agent: string,
      heartbeatStaleMs?: number,
    ): Promise<string[]> {
      const cutoff = new Date(Date.now() - olderThanMs);
      const beatCutoff = heartbeatStaleMs == null ? null : new Date(Date.now() - heartbeatStaleMs);
      const r = await query(
        `SELECT DISTINCT t.session_id FROM agents.turns t
           JOIN agents.sessions s ON s.id = t.session_id
          WHERE t.status = 'running' AND s.plugin = $2 AND s.agent = $3
            AND (
              ($4::timestamptz IS NOT NULL AND t.heartbeat_at IS NOT NULL AND t.heartbeat_at < $4)
              OR (t.heartbeat_at IS NULL AND t.started_at < $1)
            )`,
        [cutoff, plugin, agent, beatCutoff],
      );
      return r.rows.map((row: { session_id: string }) => row.session_id);
    },

    // The follow-up queue a busy session's new message folds into instead of
    // racing the turn already running (service/handler.ts's startTurn checks
    // getRunningTurn, and queues here rather than starting a second concurrent
    // turn). No existing session-scoped scratch mechanism exists in this schema
    // (checked: sessions/turns/steps/approvals/
    // tool_consents/channel_sessions/oauth_* — none fit), so this is a new
    // table (migrations/V6__turn_followups.sql), following the same pattern as
    // agents.approvals/agents.tool_consents.
    // `originChildSessionId` names the child this followup exists BECAUSE of
    // (V10__followup_origin.sql). Omitted — the common case — means nobody
    // asked for it on a child's behalf: a human or channel message that
    // arrived while a turn was running. Whatever eventually drains this row
    // reads the origin back off it and decides from that, rather than from a
    // session-wide stamp that could belong to any of several siblings.
    async queueFollowUp(sessionId: string, text: string, originChildSessionId?: string): Promise<void> {
      await query(
        `INSERT INTO agents.turn_followups (session_id, message, origin_child_session_id)
         VALUES ($1, $2, $3)`,
        [sessionId, text, originChildSessionId ?? null],
      );
    },

    // Drains (deletes and returns) every follow-up queued for the session,
    // oldest-first, so startTurn can fold them into the next turn's message
    // in the order they arrived. The DELETE...RETURNING is wrapped in a CTE
    // because Postgres does not support ORDER BY directly on a DELETE.
    //
    // Returns rows, not bare strings, because the caller has to answer two
    // separate questions from one drain: what text drives the next turn, and
    // whether that turn is child-caused (and so must not reset the wake
    // budget). Collapsing them to strings is what forced the session-level
    // approximation V10 replaces.
    async takeFollowUps(sessionId: string): Promise<FollowUp[]> {
      const r = await query(
        `WITH taken AS (
           DELETE FROM agents.turn_followups WHERE session_id = $1
           RETURNING message, origin_child_session_id, created_at
         )
         SELECT message, origin_child_session_id FROM taken ORDER BY created_at`,
        [sessionId],
      );
      return r.rows.map((row: { message: string; origin_child_session_id: string | null }) => ({
        message: row.message,
        originChildSessionId: row.origin_child_session_id ?? null,
      }));
    },

    // Looks up the tool an approval request was raised for, so a sticky
    // (always/never) decision on that request can be recorded against the
    // right (user, plugin, agent, tool) key — see handler.ts's approval
    // routes, which call this only after resolveApproval succeeds.
    async getApprovalTool(requestId: string): Promise<string | null> {
      const r = await query(`SELECT tool FROM agents.approvals WHERE request_id = $1`, [requestId]);
      return r.rows[0]?.tool ?? null;
    },

    // Read-only: the current status of the turn an approval belongs to, or null
    // if the approval doesn't exist. Used by approvals.ts's resolveApprovalDecision
    // to refuse resolving an approval whose turn is no longer running — a decision
    // write with no live turn to drive is inert, and (see denyApprovalsForTurns's
    // comment) a later message matching gate vocabulary would otherwise silently
    // resolve it and discard that message.
    async getApprovalTurnStatus(requestId: string): Promise<string | null> {
      const r = await query(
        `SELECT t.status FROM agents.approvals a JOIN agents.turns t ON t.id = a.turn_id WHERE a.request_id = $1`,
        [requestId],
      );
      return r.rows[0]?.status ?? null;
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

    // Task 15: persists a ToolSearch match onto agents.sessions.activated_tools
    // (TEXT[], migration V7) so it stays visible for every later turn of
    // this session, not just the one it was found in — toolset.ts's
    // buildSdkTools reads it back via handler.ts's getActivatedTools call in
    // startTurn. Deduplicating with a DISTINCT unnest rather than a plain
    // array_cat: a session re-searching the same tool must not grow the
    // column unboundedly. A no-op (no query) on an empty `names` — nothing to
    // add, and an empty $2::text[] would otherwise turn a NULL column into an
    // empty (but non-null) array for no reason.
    async activateTools(sessionId: string, names: string[]): Promise<void> {
      if (names.length === 0) return;
      await query(
        `UPDATE agents.sessions
            SET activated_tools = (
              SELECT ARRAY(
                SELECT DISTINCT unnest(COALESCE(activated_tools, ARRAY[]::text[]) || $2::text[])
              )
            )
          WHERE id = $1`,
        [sessionId, names],
      );
    },

    // The session's activated deferred-tool names so far (possibly empty) —
    // read fresh per turn (never cached) and threaded into buildSdkTools as
    // ToolBuildCtx.activatedTools, see handler.ts's startTurn.
    async getActivatedTools(sessionId: string): Promise<string[]> {
      const r = await query(`SELECT activated_tools FROM agents.sessions WHERE id = $1`, [sessionId]);
      return (r.rows[0]?.activated_tools as string[] | null | undefined) ?? [];
    },

    // --- child sessions (V9__orchestration.sql / 2026-08-27 orchestration) --

    // Depth, derived from DURABLE STATE rather than a threaded parameter —
    // see toolset.ts's ToolBuildCtx.depth and handler.ts's startTurn, which
    // calls this once per turn (both the top-level and child cases; it has
    // no cheaper way to tell them apart) to decide whether the `agent`/
    // `agent_spawn`/... built-ins are offered. A parameter passed only at
    // spawn time would be forgotten by any future spawn call site, and is
    // lost entirely once a reaped child turn is restarted by a different
    // worker with no memory of how the session was created; parent_session_id
    // is already in the row and cannot drift from the truth. One indexed
    // lookup by primary key — the same cost class as getRunningTurn, which
    // every turn already pays.
    async isChildSession(sessionId: string): Promise<boolean> {
      const r = await query(`SELECT parent_session_id FROM agents.sessions WHERE id = $1`, [sessionId]);
      return r.rows[0]?.parent_session_id != null;
    },

    async createChildSession(opts: {
      plugin: string;
      agent: string;
      createdBy?: string;
      parentSessionId: string;
      parentTurnId: string | null;
      subagent: string | null;
      nickname: string;
      detached: boolean;
    }): Promise<string> {
      const r = await query(
        `INSERT INTO agents.sessions
           (plugin, agent, created_by, parent_session_id, parent_turn_id, subagent, nickname, detached)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          opts.plugin,
          opts.agent,
          opts.createdBy ?? null,
          opts.parentSessionId,
          opts.parentTurnId,
          opts.subagent,
          opts.nickname,
          opts.detached,
        ],
      );
      return r.rows[0].id as string;
    },

    // Ownership is enforced in the WHERE clause, never by filtering in JS: an
    // agent_id reaches this straight from the model (agent_wait/agent_send/
    // agent_stop), and a child of another session must be invisible, not
    // merely rejected downstream.
    async getChild(agentId: string, parentSessionId: string): Promise<ChildAgent | null> {
      const r = await query(
        `SELECT s.id, s.nickname, s.subagent, s.detached, s.created_at,
                lt.status AS turn_status, lt.error AS turn_error
           FROM agents.sessions s
           ${LATEST_TURN_JOIN}
          WHERE s.id = $1 AND s.parent_session_id = $2`,
        [agentId, parentSessionId],
      );
      const row = r.rows[0];
      return row ? toChildAgent(row) : null;
    },

    // `liveOnly` filters in SQL, not in JS, so a session that has spawned its
    // full MAX_CHILDREN_PER_SESSION allowance never ships 50 mostly-finished
    // rows across the wire just to drop them. It defaults to FALSE: this is
    // the store's general-purpose child listing, and its two internal callers
    // both need every child — spawn.ts's nickname picker (a finished
    // sibling's nickname still appears in the parent's transcript, so reusing
    // it would make two different children indistinguishable there) and
    // waitForChildren's no-ids path (which exists precisely to notice
    // children that have already reached a TERMINAL state). Only the
    // `agent_list` tool opts in — see toolset.ts.
    //
    // "Live" is defined by the same latest-turn derivation deriveChildStatus
    // uses, not by an independent EXISTS probe, so the two can never disagree
    // about which children are running.
    async listChildren(
      parentSessionId: string,
      opts: { liveOnly?: boolean } = {},
    ): Promise<ChildAgent[]> {
      const r = await query(
        `SELECT s.id, s.nickname, s.subagent, s.detached, s.created_at,
                lt.status AS turn_status, lt.error AS turn_error
           FROM agents.sessions s
           ${LATEST_TURN_JOIN}
          WHERE s.parent_session_id = $1
            AND ($2::boolean IS NOT TRUE OR ${LIVE_CHILD_PREDICATE})
          ORDER BY s.created_at`,
        [parentSessionId, opts.liveOnly === true],
      );
      return r.rows.map(toChildAgent);
    },

    // `live` counts exactly the children deriveChildStatus would report as
    // "running", via the shared LIVE_CHILD_PREDICATE — including a child
    // between createChildSession and its first addTurn, which has no turn row
    // at all. An earlier version probed `EXISTS (... status='running')`
    // instead, which reported such a child as NOT live while agent_list
    // showed it running; a burst of spawns could then admit more than
    // MAX_LIVE_CHILDREN, because each spawn's own admission check could not
    // yet see the children spawned microseconds before it. Counting a
    // turnless child as live can only admit FEWER children than the cap, and
    // for a resource limit that is the safe direction to be wrong in.
    //
    // `total` is unchanged and deliberately counts every child ever spawned:
    // MAX_CHILDREN_PER_SESSION bounds the session's whole lifetime, not what
    // is running right now.
    async countChildren(parentSessionId: string): Promise<{ live: number; total: number }> {
      const r = await query(
        `SELECT
           count(*) FILTER (WHERE ${LIVE_CHILD_PREDICATE})::int AS live,
           count(*)::int AS total
         FROM agents.sessions s
         ${LATEST_TURN_JOIN}
         WHERE s.parent_session_id = $1`,
        [parentSessionId],
      );
      return { live: r.rows[0]?.live ?? 0, total: r.rows[0]?.total ?? 0 };
    },

    async bumpConsecutiveWakes(sessionId: string): Promise<number> {
      const r = await query(
        `UPDATE agents.sessions SET consecutive_wakes = consecutive_wakes + 1
         WHERE id = $1 RETURNING consecutive_wakes`,
        [sessionId],
      );
      return r.rows[0]?.consecutive_wakes ?? 0;
    },

    // Zeroes the wake budget on any turn NOT caused by a child, so a session
    // legitimately woken many times over a long life — with real messages in
    // between — never creeps toward MAX_CONSECUTIVE_WAKES.
    //
    // No longer touches agents.sessions.pending_wake_child_id: that stamp was
    // a session-level approximation of "was this chained turn caused by a
    // child?", and V10__followup_origin.sql replaced it with the origin
    // recorded on each queued followup ROW, which the chaining turn reads back
    // off exactly what it drained. The column is left in the schema (see V10)
    // but is neither read nor written any more.
    async resetConsecutiveWakes(sessionId: string): Promise<void> {
      await query(`UPDATE agents.sessions SET consecutive_wakes = 0 WHERE id = $1`, [sessionId]);
    },

    // Marks a session's still-`running` turns `failed` with the given error —
    // used by agent_stop (an intentional stop) and by the sweep (a parent
    // being torn down should not leave its children's turns running forever).
    // Mirrors reapStaleTurns: also denies any still-pending approval on the
    // turns it fails, for the same reason denyApprovalsForTurns exists there
    // — an approval left un-denied is an orphaned `decision IS NULL` row a
    // later message could still resolve, against a turn that no longer runs.
    async failTurnsForSession(sessionId: string, error: string): Promise<number> {
      const r = await query(
        `UPDATE agents.turns SET status = 'failed', error = $2, finished_at = NOW()
          WHERE session_id = $1 AND status = 'running'
          RETURNING id`,
        [sessionId, error],
      );
      const turnIds = r.rows.map((row: { id: string }) => row.id);
      try {
        await denyApprovalsForTurns(turnIds, query);
      } catch (e) {
        console.error(
          `agents: failTurnsForSession failed session ${sessionId}'s turns but could not deny their approvals ` +
            `(will remain orphaned until resolveApprovalDecision's turn-status guard catches them):`,
          e,
        );
      }
      return r.rows.length;
    },
  };
}

export type AgentStore = ReturnType<typeof createStore>;
