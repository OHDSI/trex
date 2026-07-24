-- Instance-global support settings (deliberately NOT user-scoped): who may file
-- Slack support tasks, and how GitHub logins map to Discord ids for dev pings.
CREATE TABLE IF NOT EXISTS devx.user_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_login VARCHAR(200) NOT NULL UNIQUE,
    discord_user_id VARCHAR(64) NOT NULL,
    display_name VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devx.slack_allowlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slack_user_id VARCHAR(64) NOT NULL UNIQUE,
    note VARCHAR(400),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
