-- Channels layer (spec 008 §4.1, §4.3): continuation-token -> session
-- addressing plus the channel-principal columns on agents.sessions.
--
-- agents.channel_sessions maps a (channel, namespaced continuation_token) to
-- the agents.session it addresses. The framework prepends the channel id to the
-- adapter's raw token (see channels/continuation.ts), so (channel,
-- continuation_token) is unique -> composite primary key. ON DELETE CASCADE so
-- a purged session takes its channel mappings with it.
CREATE TABLE IF NOT EXISTS agents.channel_sessions (
    channel VARCHAR(200) NOT NULL,
    continuation_token TEXT NOT NULL,
    session_id UUID NOT NULL REFERENCES agents.sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (channel, continuation_token)
);

-- The channel principal that initiated a session (Discord user id, etc.). This
-- is distinct from agents.sessions.created_by, which is the trex x-user-id;
-- channel routes authenticate by platform signature, not the trex JWT (§4.3).
-- IF NOT EXISTS on each column so re-applying the migration is a no-op.
ALTER TABLE agents.sessions
    ADD COLUMN IF NOT EXISTS principal_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS principal_id VARCHAR(200),
    ADD COLUMN IF NOT EXISTS authenticator VARCHAR(100);
