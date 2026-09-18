-- The jwt plugin keeps its keys here, and the row id is the kid that goes into
-- every JWS header. The table is NOT new: V1 created it (unqualified, under
-- `SET search_path TO trexdb` at V1:17) with four columns and a nullable
-- "createdAt", back when nothing wrote to it. So CREATE TABLE IF NOT EXISTS is
-- a no-op here and every column the jwt plugin adds has to arrive by ALTER.
-- Since better-auth 1.7 a missing column is a SchemaMismatchError at boot, not
-- a warning, so an incomplete migration takes the whole server down.
CREATE TABLE IF NOT EXISTS trexdb.jwks (
  id           TEXT PRIMARY KEY,
  "publicKey"  TEXT NOT NULL,
  "privateKey" TEXT NOT NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL,
  "expiresAt"  TIMESTAMPTZ
);

ALTER TABLE trexdb.jwks ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ;
ALTER TABLE trexdb.jwks ADD COLUMN IF NOT EXISTS alg TEXT;
ALTER TABLE trexdb.jwks ADD COLUMN IF NOT EXISTS crv TEXT;

-- The plugin declares "createdAt" required. V1 left it nullable with a default,
-- so any row predating this migration could hold NULL; backfill before the
-- constraint, or SET NOT NULL fails on exactly the installations that have one.
UPDATE trexdb.jwks SET "createdAt" = now() WHERE "createdAt" IS NULL;
ALTER TABLE trexdb.jwks ALTER COLUMN "createdAt" SET NOT NULL;

COMMENT ON COLUMN trexdb.jwks.id IS
  'The kid. Relying parties select the verification key by it, so it is never regenerated for an imported key.';
