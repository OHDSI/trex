-- plugins/devx/migrations/V16__settings_key_encryption.sql
-- Store devx.settings' provider API key encrypted (AES-256-GCM,
-- DEVX_ENCRYPTION_KEY) the way devx.provider_configs already does. Additive
-- and nullable: the plaintext api_key column stays so deployments without an
-- encryption key keep working, and rows migrate when next written or via the
-- backfill.
ALTER TABLE devx.settings
  ADD COLUMN IF NOT EXISTS api_key_encrypted text,
  ADD COLUMN IF NOT EXISTS api_key_iv        text;
