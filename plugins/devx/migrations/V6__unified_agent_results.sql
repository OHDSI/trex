CREATE TABLE IF NOT EXISTS devx.agent_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES devx.apps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  run_id UUID REFERENCES devx.subagent_runs(id) ON DELETE SET NULL,
  result_type VARCHAR(50) NOT NULL,
  findings JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devx_agent_results_app ON devx.agent_results(app_id, result_type);
CREATE INDEX IF NOT EXISTS idx_devx_agent_results_run ON devx.agent_results(run_id);

-- Migrate existing data
INSERT INTO devx.agent_results (id, app_id, user_id, result_type, findings, created_at)
  SELECT id, app_id, user_id, 'code-review', findings, created_at FROM devx.code_reviews
  ON CONFLICT DO NOTHING;
INSERT INTO devx.agent_results (id, app_id, user_id, result_type, findings, created_at)
  SELECT id, app_id, user_id, 'security-review', findings, created_at FROM devx.security_reviews
  ON CONFLICT DO NOTHING;
INSERT INTO devx.agent_results (id, app_id, user_id, result_type, findings, created_at)
  SELECT id, app_id, user_id, 'qa-test', findings, created_at FROM devx.qa_reviews
  ON CONFLICT DO NOTHING;
INSERT INTO devx.agent_results (id, app_id, user_id, result_type, findings, created_at)
  SELECT id, app_id, user_id, 'design-review', findings, created_at FROM devx.design_reviews
  ON CONFLICT DO NOTHING;
