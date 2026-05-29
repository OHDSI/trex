-- Multi-provider configuration: users can store credentials for multiple providers
-- and switch between them without losing settings.

CREATE TABLE IF NOT EXISTS devx.provider_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    provider VARCHAR(100) NOT NULL,
    model VARCHAR(200) NOT NULL,
    api_key TEXT,
    base_url TEXT,
    display_name VARCHAR(200),
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider, model)
);

CREATE INDEX IF NOT EXISTS idx_provider_configs_user_active
    ON devx.provider_configs (user_id, is_active) WHERE is_active = true;

-- Migrate existing single-provider settings into provider_configs
INSERT INTO devx.provider_configs (user_id, provider, model, api_key, base_url, is_active)
SELECT user_id, provider, model, api_key, base_url, true
FROM devx.settings
WHERE provider IS NOT NULL AND model IS NOT NULL
ON CONFLICT DO NOTHING;
