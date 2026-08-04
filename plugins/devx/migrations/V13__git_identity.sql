-- Per-user git author identity for commit signing (Settings -> Integrations -> Git).
-- The SSH signing key itself is NOT stored here: it lives in devx.integrations
-- (provider 'git_signing') encrypted with DEVX_ENCRYPTION_KEY, same as the
-- GitHub token.
ALTER TABLE devx.settings ADD COLUMN IF NOT EXISTS git_author_name TEXT;
ALTER TABLE devx.settings ADD COLUMN IF NOT EXISTS git_author_email TEXT;
