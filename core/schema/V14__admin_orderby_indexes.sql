-- Indexes required for PostGraphile's CREATED_AT_DESC OrderBy enum (see V13).

CREATE INDEX IF NOT EXISTS idx_oauth_application_created_at ON trex.oauth_application ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_database_created_at          ON trex.database          ("createdAt" DESC);
