-- The devx app a task's Code session is scoped to (devx.apps.id). Sent as
-- metadata.appId on every Code turn so the coder works in that app's
-- workspace and loads its project rules; chosen on the FIRST askCodeAgent
-- call of a task and fixed for the session afterwards.
ALTER TABLE claw.orchestrations ADD COLUMN IF NOT EXISTS app_id UUID;
