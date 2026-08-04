-- claw keeps only the link from a claw channel session to the shared Code
-- agent session it is facilitating (plus the event-stream cursor). The
-- conversation itself lives in claw's replayed agent session history.
CREATE TABLE IF NOT EXISTS claw.orchestrations (
    session_id      UUID PRIMARY KEY,
    code_session_id UUID,
    event_cursor    INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
