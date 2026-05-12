-- PostGraphile (Amber) only emits a CREATED_AT_DESC OrderBy enum value when the column is indexed.

CREATE INDEX IF NOT EXISTS idx_session_created_at ON trex.session ("createdAt" DESC);
