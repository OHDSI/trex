ALTER TABLE devx.skills ADD COLUMN IF NOT EXISTS aliases text[] DEFAULT NULL;

CREATE TABLE IF NOT EXISTS devx.pending_consents (
  request_id text PRIMARY KEY,
  chat_id text NOT NULL,
  user_id uuid NOT NULL,
  decision text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE devx.subagent_runs ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE devx.subagent_runs ADD COLUMN IF NOT EXISTS app_id uuid;
ALTER TABLE devx.subagent_runs ADD COLUMN IF NOT EXISTS skill_name varchar(200);

CREATE TABLE IF NOT EXISTS devx.subagent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES devx.subagent_runs(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL DEFAULT '',
  tool_name VARCHAR(200),
  tool_call_id VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devx_subagent_messages_run ON devx.subagent_messages(run_id);
