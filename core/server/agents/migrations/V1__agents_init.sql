-- Agents runtime schema (spec 006 §5): sessions -> turns -> steps, plus
-- approval requests for needsApproval tools. Designed to also back a later
-- Workflow DevKit integration (turns carry a nullable workflow_run_id).

CREATE TABLE IF NOT EXISTS agents.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin VARCHAR(200) NOT NULL,
    agent VARCHAR(200) NOT NULL,
    created_by VARCHAR(200),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'failed', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agents_sessions_agent ON agents.sessions(plugin, agent, updated_at DESC);

CREATE TABLE IF NOT EXISTS agents.turns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES agents.sessions(id) ON DELETE CASCADE,
    seq INT NOT NULL,
    message JSONB NOT NULL,
    metadata JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed')),
    error TEXT,
    workflow_run_id VARCHAR(200),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    UNIQUE (session_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_agents_turns_session ON agents.turns(session_id, seq);

CREATE TABLE IF NOT EXISTS agents.steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turn_id UUID NOT NULL REFERENCES agents.turns(id) ON DELETE CASCADE,
    seq INT NOT NULL,
    kind VARCHAR(30) NOT NULL
        CHECK (kind IN ('model', 'text', 'tool-call', 'tool-result', 'client-tool-call', 'approval-request', 'error', 'finish')),
    name VARCHAR(200),
    payload JSONB,
    usage JSONB,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    UNIQUE (turn_id, seq)
);

CREATE TABLE IF NOT EXISTS agents.approvals (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES agents.sessions(id) ON DELETE CASCADE,
    turn_id UUID NOT NULL REFERENCES agents.turns(id) ON DELETE CASCADE,
    tool VARCHAR(200) NOT NULL,
    input JSONB,
    decision VARCHAR(10) CHECK (decision IN ('approve', 'deny')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agents_approvals_pending ON agents.approvals(session_id) WHERE decision IS NULL;
