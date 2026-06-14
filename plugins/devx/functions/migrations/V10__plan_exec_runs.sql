-- Agent-driven plan execution: extend subagent_runs to carry the run kind,
-- a link to the originating plan, the isolation worktree/branch, and a
-- self-reference for nested subagents (Phase 3).
ALTER TABLE devx.subagent_runs ADD COLUMN IF NOT EXISTS run_kind VARCHAR(20) DEFAULT 'agent';
ALTER TABLE devx.subagent_runs ADD COLUMN IF NOT EXISTS plan_id UUID;
ALTER TABLE devx.subagent_runs ADD COLUMN IF NOT EXISTS branch VARCHAR(200);
ALTER TABLE devx.subagent_runs ADD COLUMN IF NOT EXISTS worktree_path TEXT;
ALTER TABLE devx.subagent_runs ADD COLUMN IF NOT EXISTS parent_run_id UUID;
