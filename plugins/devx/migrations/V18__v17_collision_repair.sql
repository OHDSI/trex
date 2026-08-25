-- Repair for the duplicate V17 version number.
--
-- Two migrations shipped as version 17:
--   V17__agent_model_selection.sql  (creates devx.agent_model_selection)
--   V17__loop_default_agents.sql    (flips devx.settings.loop to 'agents')
--
-- The runner keys applied migrations on version, so a deployment may have
-- recorded only one of them and silently skipped the other. Which one won
-- depends on file ordering and cannot be determined from the repository.
--
-- Neither V17 may be edited or renumbered — the checksum verifier hard-fails
-- deployments that already applied one (same rule V17__loop_default_agents.sql
-- itself cites about V11). So this forward migration re-applies BOTH bodies.
-- Every statement below is idempotent (the original files were already written
-- that way), which is what makes this safe in all three possible states:
-- both applied, one applied, or neither.
--
-- The duplicate-version guard in functions/migrations.test.ts grandfathers
-- version 17 explicitly and rejects any new collision.

-- From V17__agent_model_selection.sql
CREATE TABLE IF NOT EXISTS devx.agent_model_selection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    agent VARCHAR(20) NOT NULL CHECK (agent IN ('devx', 'claw', 'd2esupport')),
    provider_config_id UUID NOT NULL REFERENCES devx.provider_configs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, agent)
);

INSERT INTO devx.agent_model_selection (user_id, agent, provider_config_id)
SELECT user_id, 'devx', id FROM devx.provider_configs WHERE is_active = true
ON CONFLICT DO NOTHING;

-- From V17__loop_default_agents.sql
ALTER TABLE devx.settings ALTER COLUMN loop SET DEFAULT 'agents';

UPDATE devx.settings SET loop = 'agents' WHERE loop = 'legacy';
