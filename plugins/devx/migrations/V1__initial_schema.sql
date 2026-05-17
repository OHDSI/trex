-- DevX schema

-- Chats
CREATE TABLE IF NOT EXISTS devx.chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title VARCHAR(500) NOT NULL DEFAULT 'New Chat',
    mode VARCHAR(20) NOT NULL DEFAULT 'build'
        CHECK (mode IN ('build', 'ask', 'agent', 'plan')),
    app_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devx_chats_user_id ON devx.chats(user_id);
CREATE INDEX IF NOT EXISTS idx_devx_chats_updated_at ON devx.chats(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_devx_chats_app_id ON devx.chats(app_id);

-- Messages
CREATE TABLE IF NOT EXISTS devx.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES devx.chats(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    model VARCHAR(200),
    token_input INT,
    token_output INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devx_messages_chat_id ON devx.messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_devx_messages_created_at ON devx.messages(chat_id, created_at);

-- Settings
CREATE TABLE IF NOT EXISTS devx.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    provider VARCHAR(100) NOT NULL DEFAULT 'anthropic',
    model VARCHAR(200) NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    api_key TEXT,
    base_url TEXT,
    ai_rules TEXT,
    theme VARCHAR(20) DEFAULT 'system',
    auto_approve BOOLEAN NOT NULL DEFAULT false,
    max_steps INTEGER NOT NULL DEFAULT 25,
    max_tool_steps INTEGER NOT NULL DEFAULT 10,
    auto_fix_problems BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Todos
CREATE TABLE IF NOT EXISTS devx.todos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES devx.chats(id) ON DELETE CASCADE,
    todo_id VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(chat_id, todo_id)
);
CREATE INDEX IF NOT EXISTS idx_devx_todos_chat_id ON devx.todos(chat_id);

-- Tool consents
CREATE TABLE IF NOT EXISTS devx.tool_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    tool_name VARCHAR(100) NOT NULL,
    consent VARCHAR(20) NOT NULL DEFAULT 'ask'
        CHECK (consent IN ('always', 'ask', 'never')),
    UNIQUE(user_id, tool_name)
);

-- Apps
CREATE TABLE IF NOT EXISTS devx.apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name VARCHAR(500) NOT NULL,
    path VARCHAR(1000) NOT NULL,
    tech_stack VARCHAR(100),
    dev_command VARCHAR(500) DEFAULT 'npm run dev',
    install_command VARCHAR(500) DEFAULT 'npm install',
    build_command VARCHAR(500) DEFAULT 'npm run build',
    dev_port INTEGER,
    git_remote_url TEXT,
    git_default_branch VARCHAR(100) DEFAULT 'main',
    supabase_project_id TEXT,
    supabase_target VARCHAR(20) DEFAULT 'local',
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devx_apps_user_id ON devx.apps(user_id);

-- Add FK from chats to apps
ALTER TABLE devx.chats ADD CONSTRAINT fk_devx_chats_app
    FOREIGN KEY (app_id) REFERENCES devx.apps(id) ON DELETE SET NULL;

-- Integrations
CREATE TABLE IF NOT EXISTS devx.integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    provider VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    encrypted_token TEXT,
    token_iv TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider, name)
);
CREATE INDEX IF NOT EXISTS idx_devx_integrations_user ON devx.integrations(user_id, provider);

-- MCP servers
CREATE TABLE IF NOT EXISTS devx.mcp_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    transport VARCHAR(20) NOT NULL CHECK (transport IN ('stdio', 'http')),
    command TEXT,
    args JSONB DEFAULT '[]',
    env JSONB DEFAULT '{}',
    url TEXT,
    headers JSONB DEFAULT '{}',
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- MCP tool consents
CREATE TABLE IF NOT EXISTS devx.mcp_tool_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    server_name VARCHAR(200) NOT NULL,
    tool_name VARCHAR(200) NOT NULL,
    consent VARCHAR(20) NOT NULL DEFAULT 'ask'
        CHECK (consent IN ('always', 'ask', 'never')),
    UNIQUE(user_id, server_name, tool_name)
);

-- App databases
CREATE TABLE IF NOT EXISTS devx.app_databases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES devx.apps(id) ON DELETE CASCADE,
    schema_name VARCHAR(200) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Plans
CREATE TABLE IF NOT EXISTS devx.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES devx.chats(id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(chat_id)
);
CREATE INDEX IF NOT EXISTS idx_devx_plans_chat ON devx.plans(chat_id);

-- Compacted contexts
CREATE TABLE IF NOT EXISTS devx.compacted_contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES devx.chats(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    messages_before INT NOT NULL,
    last_message_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devx_compacted_chat ON devx.compacted_contexts(chat_id);

-- Prompt templates
CREATE TABLE IF NOT EXISTS devx.prompt_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100) DEFAULT 'general',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_devx_prompts_user ON devx.prompt_templates(user_id);

-- Custom providers
CREATE TABLE IF NOT EXISTS devx.custom_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT,
    models JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- Attachments
CREATE TABLE IF NOT EXISTS devx.attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES devx.messages(id) ON DELETE CASCADE,
    chat_id UUID NOT NULL,
    filename VARCHAR(500) NOT NULL,
    content_type VARCHAR(200) NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devx_attachments_msg ON devx.attachments(message_id);

-- Deployments
CREATE TABLE IF NOT EXISTS devx.deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES devx.apps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    target VARCHAR(20) NOT NULL,
    target_project_id TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    steps JSONB DEFAULT '[]',
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Security reviews
CREATE TABLE IF NOT EXISTS devx.security_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES devx.apps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    findings JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Code reviews
CREATE TABLE IF NOT EXISTS devx.code_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES devx.apps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    findings JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pending responses (cross-worker blocking requests)
CREATE TABLE IF NOT EXISTS devx.pending_responses (
    request_id TEXT PRIMARY KEY,
    chat_id UUID NOT NULL REFERENCES devx.chats(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    answer JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_responses_chat ON devx.pending_responses(chat_id);
