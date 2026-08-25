-- Make the eve/agents loop the default. V11 is deliberately NOT edited: the
-- checksum verifier hard-fails deployments that have already applied it.
--
-- Every row moves, including claude-code and IAM-shaped bedrock users. That is
-- intentional, not an oversight: useEffectiveLoop.ts resolves those providers
-- to the legacy loop regardless of this flag (the sidecar is a separate
-- execution engine, and agent.ts's resolveModel throws for it), so they keep
-- the sidecar. Storing 'agents' uniformly means that if such a user later
-- switches to an API-key provider they land on eve with no second migration.
--
-- The CHECK constraint from V11 is retained, so a user or operator can move a
-- row back to 'legacy' without a schema change; rolling the default back is a
-- one-line V18.
ALTER TABLE devx.settings ALTER COLUMN loop SET DEFAULT 'agents';

UPDATE devx.settings SET loop = 'agents' WHERE loop = 'legacy';
