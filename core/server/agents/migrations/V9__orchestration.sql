-- A subagent becomes a real nested session (2026-08-27 orchestration design).
-- Children then inherit heartbeats, stale-turn reaping, history assembly,
-- compaction and approvals from the machinery top-level turns already use.
ALTER TABLE agents.sessions
    ADD COLUMN IF NOT EXISTS parent_session_id UUID REFERENCES agents.sessions(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS parent_turn_id    UUID REFERENCES agents.turns(id)    ON DELETE SET NULL,
    -- Which subagents/<name> dir drives this child. Denormalized from the
    -- loader on purpose: a worker picking up a child turn has no other way to
    -- find out which LoadedAgent to use. NULL = a top-level session, or a
    -- child that is a copy of its parent.
    ADD COLUMN IF NOT EXISTS subagent          VARCHAR(200),
    ADD COLUMN IF NOT EXISTS nickname          VARCHAR(50),
    -- false: the parent is awaiting this child directly, so completion must
    -- NOT queue a followup — that would spawn a redundant parent turn.
    ADD COLUMN IF NOT EXISTS detached          BOOLEAN NOT NULL DEFAULT false,
    -- On the PARENT row: how many turns in a row were started by a child
    -- completing rather than by anyone asking. Reset by any external turn.
    ADD COLUMN IF NOT EXISTS consecutive_wakes INT NOT NULL DEFAULT 0,
    -- On the PARENT row: the child whose result was queued while the parent
    -- already had a turn running. That parent's own turn drains the queue and
    -- CHAINS a further turn when it ends; without this marker the chained turn
    -- looks like an ordinary one and resets consecutive_wakes, so the runaway
    -- guard can never fire for the one loop shape it exists to bound. Read
    -- and cleared in a single UPDATE ... RETURNING (store.ts's
    -- takePendingWake). Not a foreign key: the marker must survive the child
    -- row being deleted, and it is only ever compared for NULL-ness.
    ADD COLUMN IF NOT EXISTS pending_wake_child_id UUID;

CREATE INDEX IF NOT EXISTS idx_agents_sessions_parent
    ON agents.sessions (parent_session_id) WHERE parent_session_id IS NOT NULL;

-- Data remediation, and it MUST run before the index below. `CREATE UNIQUE
-- INDEX IF NOT EXISTS` is idempotent against a re-run, but it is NOT
-- idempotent against violating ROWS: on a database that already contains two
-- turns left `running` on one session, it fails outright and wedges the
-- deploy. That is not hypothetical — the very defect this index exists to
-- close means 43 of 263 real turns (16%) started while a previous turn on the
-- same session was still running, and any pair of those never reaped is
-- enough. A later migration cannot clean up after a failed V9, because a
-- failed V9 means no later migration ever runs.
--
-- Keeps the NEWEST running turn per session (the one a live worker is most
-- likely still driving) and marks every older one failed, with an error
-- string that says exactly what happened rather than looking like a model
-- failure. Idempotent by construction: run a second time, no session has a
-- second running turn left to match.
WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY session_id ORDER BY started_at DESC, seq DESC
           ) AS rn
      FROM agents.turns
     WHERE status = 'running'
)
UPDATE agents.turns t
   SET status      = 'failed',
       error       = 'agents: abandoned — a second turn was already running on this session when the '
                     || 'one-running-turn constraint was introduced (V9 orchestration backfill)',
       finished_at = NOW()
  FROM ranked r
 WHERE t.id = r.id
   AND r.rn > 1;

-- Approvals parked on a turn the backfill just failed would otherwise stay
-- `decision IS NULL` forever, and a later message matching gate vocabulary
-- could still resolve one — silently discarding that message and starting
-- nothing (see store.ts's denyApprovalsForTurns for the same reasoning on the
-- reap path). Deny them alongside the turns they belong to.
UPDATE agents.approvals a
   SET decision = 'deny', decided_at = NOW()
  FROM agents.turns t
 WHERE a.turn_id = t.id
   AND a.decision IS NULL
   AND t.status = 'failed'
   AND t.error LIKE 'agents: abandoned — a second turn was already running%';

-- Closes the check-then-act race handler.ts documents and names this exact
-- index as the fix for. Wake makes concurrent turn-start routine rather than a
-- rare double-submit: several children finishing within milliseconds each
-- check "is a turn running?" independently. The loser of the race falls back
-- to queueing its followup, which is already correct.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_turns_one_running_per_session
    ON agents.turns (session_id) WHERE status = 'running';
