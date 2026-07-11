-- Per-user coexistence flag: which chat loop devx routes a user's turns
-- through. 'legacy' (default) keeps the existing AI-SDK loop (functions/
-- index.ts's chat handler) completely untouched; 'agents' opts a user into
-- the new eve/agents runtime (plugins/devx/agent/), exercised directly via
-- /plugins/trex/devx-agent/chat + eve/v1 routes until Phase 3 wires the UI.
ALTER TABLE devx.settings ADD COLUMN IF NOT EXISTS loop VARCHAR(10) NOT NULL DEFAULT 'legacy'
    CHECK (loop IN ('legacy', 'agents'));
