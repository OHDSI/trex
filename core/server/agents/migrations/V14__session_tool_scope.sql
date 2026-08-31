-- Two scopes a session declares AT CREATION and an agent config enforces per
-- turn: a tool allowlist (AgentConfig.filterTools) and an explicit workspace
-- (AgentConfig.resolveWorkspace). Both live on the session row, never in
-- per-turn metadata — the rule V13's approver_reachable set, for the same
-- reason: a value re-read from each turn's metadata is a value the model can
-- talk its way into widening. devx reads them in
-- plugins/devx/agent/lib/session_scope.ts.
--
-- Three columns, not two: an EMPTY allowlist means "no tools", so "declared
-- empty" and "never declared" must not share a representation. Every column
-- is NOT NULL DEFAULT, like V13/V11, so a row written before this migration
-- reads back as "nothing declared" — i.e. exactly today's behaviour.
--
-- workspace_path: '' is "not declared". A declared path is honoured only when
-- it is one the plugin could itself have produced (devx checks it against
-- getRunWorktreePath) — the workspace is half of every consent scope key
-- (service/scope-key.ts), so an unchecked one re-points stored consents.
ALTER TABLE agents.sessions
    ADD COLUMN IF NOT EXISTS tool_allowlist TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS tool_allowlist_declared BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS workspace_path TEXT NOT NULL DEFAULT '';
