-- Skills, Commands, Hooks, and Agents for DevX
-- Inspired by Claude Code's plugin architecture concepts

-- Skills: knowledge injection (auto-triggered by intent or /slug)
CREATE TABLE IF NOT EXISTS devx.skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,                               -- NULL for built-in
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100),                          -- optional /slash trigger
    description TEXT NOT NULL,                  -- intent matching source
    version VARCHAR(20) NOT NULL DEFAULT '0.1.0',
    body TEXT NOT NULL,                         -- markdown knowledge content
    allowed_tools TEXT[],                       -- optional tool whitelist
    mode VARCHAR(20),                           -- optional mode override
    is_builtin BOOLEAN NOT NULL DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_devx_skills_user_name
    ON devx.skills(user_id, name) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_devx_skills_builtin_name
    ON devx.skills(name) WHERE is_builtin = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_devx_skills_user_slug
    ON devx.skills(user_id, slug) WHERE user_id IS NOT NULL AND slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_devx_skills_builtin_slug
    ON devx.skills(slug) WHERE is_builtin = true AND slug IS NOT NULL;

-- Commands: user-invoked /slash-commands
CREATE TABLE IF NOT EXISTS devx.commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,                               -- NULL for built-in
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    body TEXT NOT NULL,                         -- prompt template ($ARGUMENTS)
    allowed_tools TEXT[],
    model VARCHAR(200),                        -- optional model override
    argument_hint VARCHAR(200),
    is_builtin BOOLEAN NOT NULL DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_devx_commands_user_slug
    ON devx.commands(user_id, slug) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_devx_commands_builtin_slug
    ON devx.commands(slug) WHERE is_builtin = true;

-- Hooks: pre/post tool event handlers
CREATE TABLE IF NOT EXISTS devx.hooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,                               -- NULL for built-in
    event VARCHAR(30) NOT NULL
        CHECK (event IN ('PreToolUse', 'PostToolUse', 'Stop')),
    matcher VARCHAR(500),                      -- regex for tool names, e.g. "Write|Edit"
    hook_type VARCHAR(20) NOT NULL
        CHECK (hook_type IN ('command', 'prompt')),
    command TEXT,                               -- shell command (type=command)
    prompt TEXT,                                -- AI prompt (type=prompt)
    timeout_ms INTEGER NOT NULL DEFAULT 10000,
    is_builtin BOOLEAN NOT NULL DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devx_hooks_user_event
    ON devx.hooks(user_id, event);

-- Agents: autonomous subagent definitions
CREATE TABLE IF NOT EXISTS devx.agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,                               -- NULL for built-in
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    body TEXT NOT NULL,                         -- agent system prompt
    allowed_tools TEXT[],
    model VARCHAR(200) NOT NULL DEFAULT 'inherit',
    max_steps INTEGER NOT NULL DEFAULT 15,
    is_builtin BOOLEAN NOT NULL DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_devx_agents_user_name
    ON devx.agents(user_id, name) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_devx_agents_builtin_name
    ON devx.agents(name) WHERE is_builtin = true;

-- Track subagent executions
CREATE TABLE IF NOT EXISTS devx.subagent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_chat_id UUID NOT NULL REFERENCES devx.chats(id) ON DELETE CASCADE,
    agent_name VARCHAR(200) NOT NULL,
    task TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed')),
    result TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_devx_subagent_runs_chat
    ON devx.subagent_runs(parent_chat_id);
