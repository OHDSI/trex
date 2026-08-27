-- Which stored provider_configs row each LLM-backed agent (devx's own coder,
-- claw, d2esupport) runs on. Separate from provider_configs.is_active (which
-- remains devx's own single-row selection, mirrored into this table under
-- agent='devx' by the route layer so the two never drift) because claw and
-- d2esupport need independent selections from the same credential pool.
CREATE TABLE IF NOT EXISTS devx.agent_model_selection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    agent VARCHAR(20) NOT NULL CHECK (agent IN ('devx', 'claw', 'd2esupport')),
    provider_config_id UUID NOT NULL REFERENCES devx.provider_configs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, agent)
);

-- Seed today's devx selection (if any) into the unified table so the new UI
-- shows a consistent picture from the first load, without changing which
-- column devx's own resolution path reads (still provider_configs.is_active).
INSERT INTO devx.agent_model_selection (user_id, agent, provider_config_id)
SELECT user_id, 'devx', id FROM devx.provider_configs WHERE is_active = true
ON CONFLICT DO NOTHING;
