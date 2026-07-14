-- Backing tables for the agent-facing Task/Cron tools
-- (plugins/devx/functions/tools/task_tools.ts, cron.ts) — both files were
-- introduced referencing devx.agent_todos / devx.scheduled_tasks but no
-- prior migration ever created them (discovered live, devx-agent evals
-- plan Task 8: TaskCreate/TaskList raised "relation does not exist" against
-- a live dx stack; CronList silently degraded to its caught-error string).

CREATE TABLE IF NOT EXISTS devx.agent_todos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES devx.chats(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devx_agent_todos_chat_id ON devx.agent_todos(chat_id);

CREATE TABLE IF NOT EXISTS devx.scheduled_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES devx.chats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    schedule VARCHAR(200) NOT NULL,
    prompt TEXT NOT NULL,
    name VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devx_scheduled_tasks_user_id ON devx.scheduled_tasks(user_id);
