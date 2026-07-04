-- H4 (sticky tool-consent decisions — task-h4-brief.md): "always"/"never"
-- decisions on a needsApproval tool's approval request are, in addition to
-- resolving that one pending request, persisted per (user, plugin, agent,
-- tool) so future calls to the SAME tool by the SAME user skip the one-shot
-- approval flow entirely (see toolset.ts's authoredTool needsApproval
-- branch: getToolConsent is checked BEFORE creating a new approval request).
--
-- New file (V3), not an addition to V2__custom_steps.sql: H3's V2 migration
-- landed and was committed first (see task-h3-report.md), so appending to it
-- here would edit an already-applied migration in some environments.
--
-- No FK to agents.sessions/turns/approvals: a consent is scoped to
-- (user, plugin, agent, tool), not any particular session/turn/approval
-- request, and must outlive all of them.
CREATE TABLE IF NOT EXISTS agents.tool_consents (
  user_id VARCHAR(200) NOT NULL,
  plugin VARCHAR(200) NOT NULL,
  agent VARCHAR(200) NOT NULL,
  tool VARCHAR(200) NOT NULL,
  consent VARCHAR(10) NOT NULL CHECK (consent IN ('always','never')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, plugin, agent, tool)
);
