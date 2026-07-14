CREATE TABLE IF NOT EXISTS claw.orchestrations (
    session_id      UUID PRIMARY KEY,
    code_session_id UUID,
    plan            TEXT,
    status          TEXT NOT NULL DEFAULT 'awaiting_plan_approval',
    event_cursor    INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
