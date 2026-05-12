-- Supabase-compat: auth.users + auth.identities views over Better Auth tables.
--
-- Studio (and any user-supplied SQL written against the Supabase schema —
-- RLS policy templates, ai-generated queries, examples) reads from
-- auth.users and auth.identities. Trex stores users in trex."user" (with
-- GoTrue-shaped columns bolted on by V2) and OAuth identities in
-- trex.account (Better Auth). This file bridges the two so the users-count
-- widget, RLS helpers like `auth.uid() in (select id from auth.users)`,
-- and the Authentication → Users page work without 42P01 / 42703.
--
-- Read-only. Better Auth owns writes — admin user creation goes through
-- the auth router, not these views. The `auth` schema is created in V2
-- for the helper functions.

DROP VIEW IF EXISTS auth.identities;
DROP VIEW IF EXISTS auth.users;

CREATE VIEW auth.users AS
SELECT
  u.id                            AS id,
  '00000000-0000-0000-0000-000000000000'::uuid AS instance_id,
  'authenticated'::text           AS aud,
  u.role                          AS role,
  u.email                         AS email,
  u.email_confirmed_at            AS email_confirmed_at,
  NULL::timestamptz               AS invited_at,
  NULL::timestamptz               AS confirmation_sent_at,
  -- Supabase's auth.users has an `encrypted_password` column; we deliberately
  -- expose NULL instead of trex's password_hash. Studio never reads it, and
  -- exposing real hashes via service_role's SELECT permission would leak
  -- every user's password hash to anyone holding the service-role key.
  NULL::text                      AS encrypted_password,
  u.last_sign_in_at               AS last_sign_in_at,
  u.app_metadata                  AS raw_app_meta_data,
  u.user_metadata                 AS raw_user_meta_data,
  (u.role = 'admin')              AS is_super_admin,
  u."createdAt"                   AS created_at,
  u."updatedAt"                   AS updated_at,
  u.phone                         AS phone,
  CASE WHEN u.phone IS NOT NULL THEN u."createdAt" END AS phone_confirmed_at,
  -- Supabase's `confirmed_at` is the earliest of email/phone confirmation.
  COALESCE(u.email_confirmed_at,
           CASE WHEN u.phone IS NOT NULL THEN u."createdAt" END) AS confirmed_at,
  u."banExpires"                  AS banned_until,
  u."deletedAt"                   AS deleted_at,
  false                           AS is_anonymous,
  false                           AS is_sso_user
FROM trex."user" u;

COMMENT ON VIEW auth.users IS
  'Read-only compatibility view exposing trex."user" under the Supabase auth schema. '
  'Writes must go through the auth router (Better Auth), not this view.';

-- auth.identities — OAuth/social linkage. Backed by Better Auth's `account`
-- table, which holds one row per (user, provider) link. Trex's password
-- credentials live in account too (providerId='credential') — exposing
-- those as identities is harmless; Studio filters by provider for the
-- "providers" column on the Users page.
CREATE VIEW auth.identities AS
SELECT
  a.id                            AS id,
  a."userId"                      AS user_id,
  a."providerId"                  AS provider,
  a."accountId"                   AS provider_id,
  jsonb_build_object(
    'sub', a."userId",
    'provider_id', a."accountId"
  )                               AS identity_data,
  NULL::timestamptz               AS last_sign_in_at,
  a."createdAt"                   AS created_at,
  a."updatedAt"                   AS updated_at,
  (SELECT u.email FROM trex."user" u WHERE u.id = a."userId") AS email
FROM trex.account a;

COMMENT ON VIEW auth.identities IS
  'Read-only compatibility view exposing trex.account under the Supabase auth schema.';

-- pg-meta connects as `postgres` (superuser) so it already sees everything,
-- but grant explicitly so PostgREST roles and curious clients can read too.
GRANT USAGE ON SCHEMA auth TO postgres, authenticator, anon, authenticated, service_role;
GRANT SELECT ON auth.users, auth.identities TO postgres, service_role;
