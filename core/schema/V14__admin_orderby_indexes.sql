-- The admin pages in the trex web shell query PostGraphile with
-- `orderBy: [CREATED_AT_DESC]`. PostGraphile (Amber preset) only generates
-- a CREATED_AT_* enum value when the column is indexed, so these queries
-- 400 on unindexed `createdAt` columns. Add the missing indexes for every
-- admin-facing table that has a `createdAt` column.
--
-- V13 already covered session. Only the two tables below are currently
-- queried with that order — other tables either default to natural order,
-- use PRIMARY_KEY_DESC, or sort by name. Keeping the index set tight
-- avoids paying write amplification on tables nothing reads chronologically.
-- Add more indexes here when a new admin page surfaces a 400.

CREATE INDEX IF NOT EXISTS idx_oauth_application_created_at ON trex.oauth_application ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_database_created_at          ON trex.database          ("createdAt" DESC);
