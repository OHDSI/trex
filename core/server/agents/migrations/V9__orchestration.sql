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
    ADD COLUMN IF NOT EXISTS consecutive_wakes INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_agents_sessions_parent
    ON agents.sessions (parent_session_id) WHERE parent_session_id IS NOT NULL;

-- Closes the check-then-act race handler.ts documents and names this exact
-- index as the fix for. Wake makes concurrent turn-start routine rather than a
-- rare double-submit: several children finishing within milliseconds each
-- check "is a turn running?" independently. The loser of the race falls back
-- to queueing its followup, which is already correct.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_turns_one_running_per_session
    ON agents.turns (session_id) WHERE status = 'running';
