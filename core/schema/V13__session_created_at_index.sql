-- PostGraphile (Amber preset) only generates `<COL>_ASC/<COL>_DESC` entries
-- in a table's OrderBy enum for indexed columns. Without this index, the
-- admin Sessions page's GraphQL query — `orderBy: [CREATED_AT_DESC]` —
-- fails validation with "Value CREATED_AT_DESC does not exist in
-- SessionOrderBy". Sorting by creation time is the natural admin view, so
-- the index is both correctness and a perf win.

CREATE INDEX IF NOT EXISTS idx_session_created_at ON trex.session ("createdAt" DESC);
