-- plugins/devx/migrations/V15__provider_config_key_encryption.sql
-- Store the provider API key encrypted (AES-256-GCM, DEVX_ENCRYPTION_KEY) the
-- way devx.integrations already stores its tokens. Additive and nullable: the
-- plaintext api_key column stays so deployments without an encryption key keep
-- working, and rows migrate when they are next written or via the backfill.
ALTER TABLE devx.provider_configs
  ADD COLUMN IF NOT EXISTS api_key_encrypted text,
  ADD COLUMN IF NOT EXISTS api_key_iv        text;
