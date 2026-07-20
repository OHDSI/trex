-- Bridges a headless SUPPORT_TASK session (from d2esupport) to the Discord dev
-- thread where the proposed reply is reviewed. thread_id is the Discord thread
-- (= claw conversation) id; support_session_id addresses the d2esupport session
-- the approved reply is sent back to.
CREATE TABLE IF NOT EXISTS claw.support_tasks (
    thread_id          VARCHAR(64) PRIMARY KEY,
    support_session_id UUID NOT NULL,
    kind               VARCHAR(32) NOT NULL,
    brief              TEXT NOT NULL,
    proposed_reply     TEXT,
    github_logins      JSONB NOT NULL DEFAULT '[]',
    status             VARCHAR(32) NOT NULL DEFAULT 'awaiting_review',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
