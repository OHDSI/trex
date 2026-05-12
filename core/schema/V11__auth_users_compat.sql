-- Supabase-compat: read-only auth.users + auth.identities views over Better Auth tables.

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
  -- Deliberately NULL: exposing real hashes via service_role SELECT would leak every password hash.
  NULL::text                      AS encrypted_password,
  u.last_sign_in_at               AS last_sign_in_at,
  u.app_metadata                  AS raw_app_meta_data,
  u.user_metadata                 AS raw_user_meta_data,
  (u.role = 'admin')              AS is_super_admin,
  u."createdAt"                   AS created_at,
  u."updatedAt"                   AS updated_at,
  u.phone                         AS phone,
  CASE WHEN u.phone IS NOT NULL THEN u."createdAt" END AS phone_confirmed_at,
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

GRANT USAGE ON SCHEMA auth TO postgres, authenticator, anon, authenticated, service_role;
GRANT SELECT ON auth.users, auth.identities TO postgres, service_role;
