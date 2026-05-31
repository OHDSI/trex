-- Seed a default admin account for local development.
--
--   email:    admin@trex.local
--   password: password
--   role:     admin
--
-- The password_hash is scrypt (N=16384, r=16, p=1, dkLen=64) in the
-- `saltHex:hashHex` format produced by core/server/auth/password.ts. Its
-- verifyPassword() accepts both r=8 and r=16, so this hash validates the
-- literal password "password".
--
-- SECURITY: this is a well-known default credential intended for local/dev
-- stacks only. For any shared or production deployment, change the password
-- immediately (or delete this user). A previous incarnation of this seed was
-- removed for exactly that reason (see the old V10__remove_default_admin).
--
-- Idempotent: only inserts when no user with this email exists, so re-running
-- migrations (or running against a DB where an admin was already created) is a
-- no-op.

INSERT INTO trexdb."user" (
  id, name, email, "emailVerified", email_confirmed_at, role,
  password_hash, "mustChangePassword", user_metadata
)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'Admin',
  'admin@trex.local',
  true,
  NOW(),
  'admin',
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6:0c219b9e9260518faacd40f6bbaf04d86622631a745d5a177a0f8ff18363b52ed0f56a940c02a8bf0bb314b293d8ccfd5383e537bd18f445bb31f5bc979a020f',
  false,
  '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM trexdb."user" WHERE email = 'admin@trex.local'
);
