-- Task 4 (claw-devx-reliability): "one turn at a time per session". A
-- message that arrives while a session's turn is still running is no longer
-- started as a second, concurrent turn (measured: 43 of 263 turns / 16%
-- started while the previous turn on the same session was still running,
-- including one case where two turns drove the same coding-agent chat 22s
-- apart with contradictory instructions and the coder answered the wrong
-- one). Instead it is queued here and folded into the next turn's message
-- once the current one finishes (see service/handler.ts's startTurn, which
-- checks store.getRunningTurn before creating a turn and drains this table
-- via store.takeFollowUps when it does create one).
--
-- No existing session-scoped scratch mechanism was found in this schema to
-- reuse (sessions/turns/steps/approvals/tool_consents/channel_sessions/
-- oauth_* all serve other purposes), so this is a new table, following the
-- same shape as agents.approvals/agents.tool_consents.
CREATE TABLE IF NOT EXISTS agents.turn_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES agents.sessions(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agents_turn_followups_session ON agents.turn_followups(session_id, created_at);
