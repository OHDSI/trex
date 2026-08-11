-- plugins/d2esupport/migrations/V1__initial_schema.sql
-- One row per support conversation: links the d2esupport channel session to the
-- claw session handling it and to the Slack thread the final reply goes to.
CREATE TABLE IF NOT EXISTS d2esupport.tasks (
    session_id        UUID PRIMARY KEY,
    claw_session_id   UUID,
    -- Position in the claw session's event stream already consumed by this
    -- task's last runClawTurn call. /stream replays ALL persisted steps, so
    -- resuming from 0 on a follow-up turn would replay a past turn's
    -- finish/error step as a fresh turn.completed/turn.failed. See
    -- claw-session.ts.
    claw_event_cursor INTEGER NOT NULL DEFAULT 0,
    slack_channel_id  VARCHAR(64) NOT NULL,
    slack_thread_ts   VARCHAR(32) NOT NULL,
    status            VARCHAR(32) NOT NULL DEFAULT 'open',
    brief             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
