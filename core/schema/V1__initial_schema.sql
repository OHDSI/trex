-- TrexSQL Core Schema
--
-- Consolidated end-state of the previous V1..V16 incremental migrations.
-- Creates the `trexdb` schema and all control-plane tables, RLS policies,
-- functions, roles, and auth/realtime/storage compatibility surface.
--
-- BREAKING: this commit also renames the `trex` schema to `trexdb` and drops
-- the `import_legacy_migrations` shim that previously seeded refinery history
-- with the old V1..V15 checksums. In-place upgrade from a pre-`trexdb`
-- deployment is NOT supported: such a database will retain its old `trex`
-- schema untouched and the consolidated V1 here will run against a fresh
-- empty `trexdb` schema, leaving two parallel schemas with no migration
-- path. Operators upgrading an existing deployment must dump/reload
-- manually. Fresh deployments are unaffected.

CREATE SCHEMA IF NOT EXISTS trexdb;
SET search_path TO trexdb;

-- ── Auth tables (Better Auth + GoTrue-compatible columns) ────────────────────

CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN DEFAULT false,
  image TEXT,
  role TEXT DEFAULT 'user',
  banned BOOLEAN DEFAULT false,
  "banReason" TEXT,
  "banExpires" TIMESTAMPTZ,
  "mustChangePassword" BOOLEAN DEFAULT false,
  "deletedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  password_hash TEXT,
  email_confirmed_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  phone TEXT,
  user_metadata JSONB DEFAULT '{}',
  app_metadata JSONB DEFAULT '{"provider":"email","providers":["email"]}'
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  scope TEXT,
  "idToken" TEXT,
  password TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("providerId", "accountId")
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jwks (
  id TEXT PRIMARY KEY,
  "publicKey" TEXT NOT NULL,
  "privateKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_application (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  metadata TEXT,
  "clientId" TEXT NOT NULL UNIQUE,
  "clientSecret" TEXT NOT NULL,
  "redirectURLs" TEXT NOT NULL,
  type TEXT DEFAULT 'web',
  disabled BOOLEAN DEFAULT false,
  "userId" TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_access_token (
  id TEXT PRIMARY KEY,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ NOT NULL,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "clientId" TEXT NOT NULL,
  "userId" TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  scopes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_consent (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "clientId" TEXT NOT NULL,
  scopes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_authorization_code (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  scopes TEXT,
  "redirectURI" TEXT NOT NULL,
  "codeChallenge" TEXT,
  "codeChallengeMethod" TEXT,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_token (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  revoked BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_email ON "user"(email);
CREATE INDEX IF NOT EXISTS idx_user_deleted_at ON "user"("deletedAt") WHERE "deletedAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_account_user_id ON account("userId");
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_provider ON account("providerId", "accountId");
CREATE INDEX IF NOT EXISTS idx_session_user_id ON session("userId");
CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);
CREATE INDEX IF NOT EXISTS idx_session_expires_at ON session("expiresAt");
CREATE INDEX IF NOT EXISTS idx_session_created_at ON session ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_application_created_at ON oauth_application ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_token(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_token_user ON refresh_token("userId");

-- ── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE account ENABLE ROW LEVEL SECURITY;
ALTER TABLE session ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_token ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_users ON "user"
  FOR ALL
  USING (current_setting('app.user_role', true) = 'admin')
  WITH CHECK (current_setting('app.user_role', true) = 'admin');

CREATE POLICY user_own_row ON "user"
  FOR ALL
  USING (id = nullif(current_setting('app.user_id', true), ''))
  WITH CHECK (id = nullif(current_setting('app.user_id', true), ''));

CREATE POLICY admin_all_accounts ON account
  FOR ALL
  USING (current_setting('app.user_role', true) = 'admin')
  WITH CHECK (current_setting('app.user_role', true) = 'admin');

CREATE POLICY user_own_accounts ON account
  FOR SELECT
  USING ("userId" = nullif(current_setting('app.user_id', true), ''));

CREATE POLICY admin_all_sessions ON session
  FOR ALL
  USING (current_setting('app.user_role', true) = 'admin')
  WITH CHECK (current_setting('app.user_role', true) = 'admin');

CREATE POLICY user_own_sessions ON session
  FOR ALL
  USING ("userId" = nullif(current_setting('app.user_id', true), ''))
  WITH CHECK ("userId" = nullif(current_setting('app.user_id', true), ''));

CREATE POLICY admin_all_refresh_tokens ON refresh_token
  FOR ALL
  USING (current_setting('app.user_role', true) = 'admin')
  WITH CHECK (current_setting('app.user_role', true) = 'admin');

CREATE POLICY user_own_refresh_tokens ON refresh_token
  FOR ALL
  USING ("userId" = nullif(current_setting('app.user_id', true), ''))
  WITH CHECK ("userId" = nullif(current_setting('app.user_id', true), ''));

-- ── Functions ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION current_user_id() RETURNS TEXT AS $$
  SELECT nullif(current_setting('app.user_id', true), '');
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION current_user_is_admin() RETURNS BOOLEAN AS $$
  SELECT current_setting('app.user_role', true) = 'admin';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION soft_delete_user(target_user_id TEXT) RETURNS "user" AS $$
  UPDATE "user"
  SET "deletedAt" = NOW(), banned = true, "updatedAt" = NOW()
  WHERE id = target_user_id AND "deletedAt" IS NULL
  RETURNING *;
$$ LANGUAGE SQL VOLATILE STRICT SECURITY DEFINER SET search_path = trexdb;

CREATE OR REPLACE FUNCTION restore_user(target_user_id TEXT) RETURNS "user" AS $$
  UPDATE "user"
  SET "deletedAt" = NULL, banned = false, "banReason" = NULL, "updatedAt" = NOW()
  WHERE id = target_user_id AND "deletedAt" IS NOT NULL
  RETURNING *;
$$ LANGUAGE SQL VOLATILE STRICT SECURITY DEFINER SET search_path = trexdb;

CREATE OR REPLACE FUNCTION search_users(query TEXT)
RETURNS SETOF "user" AS $$
  SELECT * FROM "user"
  WHERE "deletedAt" IS NULL
    AND (name ILIKE '%' || query || '%' OR email ILIKE '%' || query || '%')
  ORDER BY "createdAt" DESC;
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = trexdb;

CREATE OR REPLACE FUNCTION purge_deleted_users() RETURNS INTEGER AS $$
  WITH deleted AS (
    DELETE FROM "user"
    WHERE "deletedAt" IS NOT NULL
      AND "deletedAt" < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER FROM deleted;
$$ LANGUAGE SQL VOLATILE SECURITY DEFINER SET search_path = trexdb;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Smart comments ───────────────────────────────────────────────────────────

COMMENT ON COLUMN "user"."mustChangePassword" IS E'@omit update';
COMMENT ON COLUMN account.password IS E'@omit';
COMMENT ON COLUMN account."accessToken" IS E'@omit';
COMMENT ON COLUMN account."refreshToken" IS E'@omit';
COMMENT ON COLUMN account."idToken" IS E'@omit';
COMMENT ON TABLE verification IS E'@omit';
COMMENT ON TABLE jwks IS E'@omit';
COMMENT ON TABLE oauth_access_token IS E'@omit';
COMMENT ON TABLE oauth_authorization_code IS E'@omit';
COMMENT ON TABLE oauth_consent IS E'@omit';
COMMENT ON COLUMN oauth_application."clientSecret" IS E'@omit';
COMMENT ON TABLE refresh_token IS E'@omit';

DROP TRIGGER IF EXISTS trg_refresh_token_updated_at ON refresh_token;
CREATE TRIGGER trg_refresh_token_updated_at
  BEFORE UPDATE ON refresh_token
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Database management ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS database (
  id TEXT PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_]+$'),
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 5432,
  "databaseName" TEXT NOT NULL,
  dialect TEXT NOT NULL DEFAULT 'postgresql',
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  "vocabSchemas" JSONB,
  extra JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS database_credential (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "databaseId" TEXT NOT NULL REFERENCES database(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  password TEXT,
  password_encrypted TEXT,
  "userScope" TEXT,
  "serviceScope" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("databaseId", username)
);

CREATE INDEX IF NOT EXISTS idx_database_credential_database_id ON database_credential("databaseId");
CREATE INDEX IF NOT EXISTS idx_database_created_at ON database ("createdAt" DESC);

ALTER TABLE database ENABLE ROW LEVEL SECURITY;
ALTER TABLE database_credential ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_databases ON database
  FOR ALL
  USING (current_setting('app.user_role', true) = 'admin')
  WITH CHECK (current_setting('app.user_role', true) = 'admin');

CREATE POLICY admin_all_database_credentials ON database_credential
  FOR ALL
  USING (current_setting('app.user_role', true) = 'admin')
  WITH CHECK (current_setting('app.user_role', true) = 'admin');

COMMENT ON COLUMN database_credential.password IS E'@omit\nLegacy plaintext column; the bootstrap encrypt step nulls this out after copying into password_encrypted. Do not write directly.';
COMMENT ON COLUMN database_credential.password_encrypted IS E'@omit\nAES-256-GCM ciphertext (base64 iv||ct). Decrypt via core/server/auth/crypto.ts decryptSecret().';

CREATE OR REPLACE FUNCTION search_databases(query TEXT)
RETURNS SETOF database AS $$
  SELECT * FROM database
  WHERE id ILIKE '%' || query || '%'
    OR host ILIKE '%' || query || '%'
    OR "databaseName" ILIKE '%' || query || '%'
    OR description ILIKE '%' || query || '%'
  ORDER BY "createdAt" DESC;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION save_database_credential(
  p_database_id TEXT,
  p_username TEXT,
  p_password TEXT,
  p_user_scope TEXT DEFAULT NULL,
  p_service_scope TEXT DEFAULT NULL
) RETURNS database_credential AS $$
  INSERT INTO database_credential ("databaseId", username, password, "userScope", "serviceScope")
  VALUES (p_database_id, p_username, p_password, p_user_scope, p_service_scope)
  ON CONFLICT ("databaseId", username) DO UPDATE SET
    password = EXCLUDED.password,
    "userScope" = EXCLUDED."userScope",
    "serviceScope" = EXCLUDED."serviceScope",
    "updatedAt" = NOW()
  RETURNING *;
$$ LANGUAGE SQL VOLATILE STRICT SECURITY DEFINER SET search_path = trexdb;

DROP TRIGGER IF EXISTS trg_database_updated_at ON database;
CREATE TRIGGER trg_database_updated_at
  BEFORE UPDATE ON database
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_database_credential_updated_at ON database_credential;
CREATE TRIGGER trg_database_credential_updated_at
  BEFORE UPDATE ON database_credential
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Roles (application-level role table, distinct from Postgres roles) ───────

CREATE TABLE IF NOT EXISTS role (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_role (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "roleId" TEXT NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("userId", "roleId")
);

CREATE INDEX IF NOT EXISTS idx_user_role_user_id ON user_role("userId");
CREATE INDEX IF NOT EXISTS idx_user_role_role_id ON user_role("roleId");

ALTER TABLE role ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_roles ON role
  FOR ALL
  USING (current_setting('app.user_role', true) = 'admin')
  WITH CHECK (current_setting('app.user_role', true) = 'admin');

CREATE POLICY admin_all_user_roles ON user_role
  FOR ALL
  USING (current_setting('app.user_role', true) = 'admin')
  WITH CHECK (current_setting('app.user_role', true) = 'admin');

CREATE POLICY user_own_user_roles ON user_role
  FOR SELECT
  USING ("userId" = nullif(current_setting('app.user_id', true), ''));

CREATE OR REPLACE FUNCTION search_roles(query TEXT)
RETURNS SETOF role AS $$
  SELECT * FROM role
  WHERE name ILIKE '%' || query || '%'
    OR description ILIKE '%' || query || '%'
  ORDER BY "createdAt" DESC;
$$ LANGUAGE SQL STABLE;

DROP TRIGGER IF EXISTS trg_role_updated_at ON role;
CREATE TRIGGER trg_role_updated_at
  BEFORE UPDATE ON role
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── SSO providers ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sso_provider (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]*$'),
  "displayName" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "clientSecret" TEXT NOT NULL,
  enabled BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sso_provider ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_sso_providers ON sso_provider
  FOR ALL
  USING (current_setting('app.user_role', true) = 'admin')
  WITH CHECK (current_setting('app.user_role', true) = 'admin');

COMMENT ON COLUMN sso_provider."clientSecret" IS E'@omit';

CREATE OR REPLACE FUNCTION save_sso_provider(
  p_id TEXT,
  p_display_name TEXT,
  p_client_id TEXT,
  p_client_secret TEXT,
  p_enabled BOOLEAN DEFAULT false
) RETURNS sso_provider AS $$
  INSERT INTO trexdb.sso_provider (id, "displayName", "clientId", "clientSecret", enabled)
  VALUES (p_id, p_display_name, p_client_id, p_client_secret, p_enabled)
  ON CONFLICT (id) DO UPDATE SET
    "displayName" = EXCLUDED."displayName",
    "clientId" = EXCLUDED."clientId",
    "clientSecret" = CASE
      WHEN EXCLUDED."clientSecret" = '' THEN trexdb.sso_provider."clientSecret"
      ELSE EXCLUDED."clientSecret"
    END,
    enabled = EXCLUDED.enabled,
    "updatedAt" = NOW()
  RETURNING *;
$$ LANGUAGE SQL VOLATILE SECURITY DEFINER SET search_path = trexdb;

CREATE OR REPLACE FUNCTION enabled_sso_providers()
RETURNS TABLE(id TEXT, "displayName" TEXT) AS $$
  SELECT id, "displayName" FROM trexdb.sso_provider WHERE enabled = true ORDER BY id;
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = trexdb;

CREATE OR REPLACE FUNCTION search_sso_providers(query TEXT)
RETURNS SETOF sso_provider AS $$
  SELECT * FROM trexdb.sso_provider
  WHERE id ILIKE '%' || query || '%'
    OR "displayName" ILIKE '%' || query || '%'
    OR "clientId" ILIKE '%' || query || '%'
  ORDER BY "createdAt" DESC;
$$ LANGUAGE SQL STABLE;

DROP TRIGGER IF EXISTS trg_sso_provider_updated_at ON sso_provider;
CREATE TRIGGER trg_sso_provider_updated_at
  BEFORE UPDATE ON sso_provider
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Event log ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL DEFAULT 'Log',
  level VARCHAR(20) NOT NULL DEFAULT 'Info',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_log_created_at ON event_log (created_at DESC);
CREATE INDEX idx_event_log_level ON event_log (level);

-- ── API keys ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_key (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "lastUsedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ,
  "revokedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_key_user_id ON api_key("userId");
CREATE INDEX IF NOT EXISTS idx_api_key_key_hash ON api_key(key_hash);

ALTER TABLE api_key ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_api_keys ON api_key
  FOR ALL
  USING (current_setting('app.user_role', true) = 'admin')
  WITH CHECK (current_setting('app.user_role', true) = 'admin');

CREATE POLICY user_own_api_key ON api_key
  USING ("userId" = nullif(current_setting('app.user_id', true), ''))
  WITH CHECK ("userId" = nullif(current_setting('app.user_id', true), ''));

COMMENT ON TABLE api_key IS E'@omit';

-- ── Subscriptions (LISTEN/NOTIFY) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscription (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL UNIQUE CHECK (name ~ '^[a-z][a-z0-9_]*$'),
  topic TEXT NOT NULL,
  "sourceTable" TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{INSERT,UPDATE,DELETE}',
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_subscriptions ON subscription
  FOR ALL
  USING (current_setting('app.user_role', true) = 'admin')
  WITH CHECK (current_setting('app.user_role', true) = 'admin');

COMMENT ON TABLE subscription IS E'@name notifySubscription\n@omit create,update,delete';

DROP TRIGGER IF EXISTS trg_subscription_updated_at ON subscription;
CREATE TRIGGER trg_subscription_updated_at
  BEFORE UPDATE ON subscription
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION search_subscriptions(query TEXT)
RETURNS SETOF subscription AS $$
  SELECT * FROM trexdb.subscription
  WHERE name ILIKE '%' || query || '%'
    OR topic ILIKE '%' || query || '%'
    OR "sourceTable" ILIKE '%' || query || '%'
    OR description ILIKE '%' || query || '%'
  ORDER BY "createdAt" DESC;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION save_subscription(
  p_name TEXT,
  p_topic TEXT,
  p_source_table TEXT,
  p_events TEXT[],
  p_description TEXT DEFAULT NULL,
  p_enabled BOOLEAN DEFAULT true
) RETURNS subscription AS $$
DECLARE
  v_event TEXT;
  v_trigger_name TEXT;
  v_event_clause TEXT;
  v_table_oid regclass;
  v_result trexdb.subscription;
BEGIN
  FOREACH v_event IN ARRAY p_events LOOP
    IF v_event NOT IN ('INSERT', 'UPDATE', 'DELETE') THEN
      RAISE EXCEPTION 'Invalid event: %. Must be INSERT, UPDATE, or DELETE.', v_event;
    END IF;
  END LOOP;

  v_table_oid := p_source_table::regclass;

  v_trigger_name := 'trg_sub_' || p_name;

  BEGIN
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', v_trigger_name, v_table_oid::TEXT);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  BEGIN
    PERFORM 1 FROM trexdb.subscription WHERE name = p_name AND "sourceTable" != p_source_table;
    IF FOUND THEN
      DECLARE
        v_old_table regclass;
      BEGIN
        SELECT "sourceTable"::regclass INTO v_old_table FROM trexdb.subscription WHERE name = p_name;
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', v_trigger_name, v_old_table::TEXT);
      EXCEPTION WHEN undefined_table OR invalid_text_representation THEN
        NULL;
      END;
    END IF;
  END;

  EXECUTE format('DROP FUNCTION IF EXISTS %I.%I() CASCADE', 'trexdb', 'trex_sub_notify_' || p_name);

  IF p_enabled THEN
    EXECUTE format(
      $fn$
      CREATE OR REPLACE FUNCTION %I.%I() RETURNS TRIGGER AS $trg$
      DECLARE
        v_payload JSONB;
        v_id TEXT;
      BEGIN
        IF TG_OP = 'DELETE' THEN
          v_id := OLD.id::TEXT;
        ELSE
          v_id := NEW.id::TEXT;
        END IF;

        v_payload := jsonb_build_object(
          'event', TG_OP,
          'table', TG_TABLE_NAME,
          'schema', TG_TABLE_SCHEMA,
          'id', v_id
        );

        PERFORM pg_notify('postgraphile:' || %L, v_payload::TEXT);

        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        ELSE
          RETURN NEW;
        END IF;
      END;
      $trg$ LANGUAGE plpgsql
      $fn$,
      'trexdb', 'trex_sub_notify_' || p_name, p_topic
    );

    v_event_clause := array_to_string(p_events, ' OR ');

    EXECUTE format(
      'CREATE TRIGGER %I AFTER %s ON %s FOR EACH ROW EXECUTE FUNCTION %I.%I()',
      v_trigger_name, v_event_clause, v_table_oid::TEXT, 'trexdb', 'trex_sub_notify_' || p_name
    );
  END IF;

  INSERT INTO trexdb.subscription (name, topic, "sourceTable", events, description, enabled)
  VALUES (p_name, p_topic, p_source_table, p_events, p_description, p_enabled)
  ON CONFLICT (name) DO UPDATE SET
    topic = EXCLUDED.topic,
    "sourceTable" = EXCLUDED."sourceTable",
    events = EXCLUDED.events,
    description = EXCLUDED.description,
    enabled = EXCLUDED.enabled,
    "updatedAt" = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = trexdb;

CREATE OR REPLACE FUNCTION remove_subscription(p_name TEXT) RETURNS subscription AS $$
DECLARE
  v_sub trexdb.subscription;
  v_trigger_name TEXT;
  v_table_oid regclass;
BEGIN
  SELECT * INTO v_sub FROM trexdb.subscription WHERE name = p_name;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription "%" not found.', p_name;
  END IF;

  v_trigger_name := 'trg_sub_' || p_name;

  BEGIN
    v_table_oid := v_sub."sourceTable"::regclass;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', v_trigger_name, v_table_oid::TEXT);
  EXCEPTION WHEN undefined_table OR invalid_text_representation THEN
    NULL;
  END;

  EXECUTE format('DROP FUNCTION IF EXISTS %I.%I() CASCADE', 'trexdb', 'trex_sub_notify_' || p_name);

  DELETE FROM trexdb.subscription WHERE name = p_name;

  RETURN v_sub;
END;
$$ LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path = trexdb;

-- ── Transform deployments ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transform_deployment (
  plugin_name TEXT NOT NULL,
  dest_db TEXT NOT NULL,
  dest_schema TEXT NOT NULL,
  deployed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (plugin_name)
);

-- ── Dashboards ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dashboard (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('python', 'r', 'markdown')),
  code TEXT NOT NULL DEFAULT '',
  "userId" TEXT NOT NULL DEFAULT nullif(current_setting('app.user_id', true), '') REFERENCES "user"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_user_id ON dashboard("userId");

ALTER TABLE dashboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_dashboards ON dashboard
  FOR ALL
  USING (current_setting('app.user_role', true) = 'admin')
  WITH CHECK (current_setting('app.user_role', true) = 'admin');

CREATE POLICY user_own_dashboards ON dashboard
  FOR ALL
  USING ("userId" = nullif(current_setting('app.user_id', true), ''))
  WITH CHECK ("userId" = nullif(current_setting('app.user_id', true), ''));

COMMENT ON COLUMN dashboard."userId" IS E'@omit create,update';

DROP TRIGGER IF EXISTS trg_dashboard_updated_at ON dashboard;
CREATE TRIGGER trg_dashboard_updated_at
  BEFORE UPDATE ON dashboard
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION search_dashboards(query TEXT)
RETURNS SETOF dashboard AS $$
  SELECT * FROM dashboard
  WHERE name ILIKE '%' || query || '%'
    OR language ILIKE '%' || query || '%'
  ORDER BY "createdAt" DESC;
$$ LANGUAGE SQL STABLE;

-- ── Settings ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS setting (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-zA-Z0-9_.]*$'),
  value JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE setting ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_settings ON setting
  FOR ALL
  USING (current_setting('app.user_role', true) = 'admin')
  WITH CHECK (current_setting('app.user_role', true) = 'admin');

-- Holds anonKey / serviceRoleKey / jwtSecret / authenticator_password — hide
-- from auto-generated PostGraphile schema (PostGraphile pool bypasses RLS).
COMMENT ON TABLE setting IS E'@omit';

DROP TRIGGER IF EXISTS trg_setting_updated_at ON setting;
CREATE TRIGGER trg_setting_updated_at
  BEFORE UPDATE ON setting
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION save_setting(
  p_key TEXT,
  p_value JSONB
) RETURNS setting AS $$
  INSERT INTO trexdb.setting (key, value)
  VALUES (p_key, p_value)
  ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    "updatedAt" = NOW()
  RETURNING *;
$$ LANGUAGE SQL VOLATILE STRICT SECURITY DEFINER SET search_path = trexdb;

CREATE OR REPLACE FUNCTION get_setting(
  p_key TEXT,
  p_default JSONB DEFAULT 'null'::JSONB
) RETURNS JSONB AS $$
  SELECT COALESCE(
    (SELECT value FROM trexdb.setting WHERE key = p_key),
    p_default
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = trexdb;

INSERT INTO setting (key, value) VALUES
  ('auth.selfRegistration', 'false'::JSONB),
  ('runtime.functionLogging', '"console"'::JSONB)
ON CONFLICT (key) DO NOTHING;

-- Generate a random per-deploy authenticator password and stash it under
-- auth.authenticator_password. PostgREST still consumes the V3-era hardcoded
-- password via PGRST_DB_URI; this value is ready for a future operator-driven
-- ALTER ROLE rotation.
DO $$
DECLARE
  v_pass TEXT;
BEGIN
  SELECT (value #>> '{}')::TEXT INTO v_pass
  FROM trexdb.setting WHERE key = 'auth.authenticator_password';

  IF v_pass IS NULL THEN
    v_pass := replace(gen_random_uuid()::text, '-', '') ||
              replace(gen_random_uuid()::text, '-', '');
    INSERT INTO trexdb.setting (key, value)
    VALUES ('auth.authenticator_password', to_jsonb(v_pass))
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW();
  END IF;
END $$;

-- ── Secrets (edge-function environment variables) ────────────────────────────

CREATE TABLE IF NOT EXISTS secret (
  name TEXT PRIMARY KEY CHECK (name ~ '^[A-Za-z_][A-Za-z0-9_]*$'),
  value_encrypted TEXT NOT NULL,
  value_hash TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE secret ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_secret ON secret
  USING (current_setting('app.user_role', true) = 'admin')
  WITH CHECK (current_setting('app.user_role', true) = 'admin');

-- ── Wrapped Data Encryption Key for trexdb.secret / database_credential ──────
-- Wrapped with AES-256-GCM using a KEK derived from TREX_ROOT_KEY
-- (HKDF label "trex.dek.wrap.v1"). One row per version; active=true picks the
-- write key. Decryption picks the row matching the version tag in the envelope.

CREATE TABLE IF NOT EXISTS kek_wrapped_dek (
  version    INTEGER PRIMARY KEY,
  wrapped    TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS kek_wrapped_dek_one_active
  ON kek_wrapped_dek ((1)) WHERE active;

-- ── PostgREST roles ──────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'authenticator_pass';
  END IF;
END $$;

ALTER ROLE authenticator LOGIN PASSWORD 'authenticator_pass';

GRANT anon, authenticated, service_role TO authenticator;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- Storage worker switches role mid-transaction and issues unqualified
-- `buckets` queries; per-role search_path survives the SET ROLE.
ALTER ROLE service_role  SET search_path TO storage, public, extensions;
ALTER ROLE authenticated SET search_path TO storage, public, extensions;
ALTER ROLE anon          SET search_path TO storage, public, extensions;
ALTER ROLE authenticator SET search_path TO storage, public, extensions;

-- storage schema is created by the storage worker's own migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA storage TO service_role, authenticated, anon, authenticator';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role';
  END IF;
END $$;

-- Pre-request function: bridges PostgREST JWT claims into app.* session vars
-- so RLS policies (which check app.user_id / app.user_role) work.
CREATE OR REPLACE FUNCTION public.postgrest_pre_request() RETURNS void AS $$
DECLARE
  claims JSON;
BEGIN
  claims := current_setting('request.jwt.claims', true)::json;
  IF claims IS NOT NULL THEN
    PERFORM set_config('app.user_id', coalesce(claims->>'sub', ''), true);
    PERFORM set_config('app.user_role',
      CASE
        WHEN claims->>'role' = 'service_role' THEN 'admin'
        WHEN claims->'app_metadata'->>'trex_role' = 'admin' THEN 'admin'
        ELSE 'user'
      END, true);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ── GoTrue-compatible auth helpers (auth.uid / auth.jwt / auth.role) ─────────

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS TEXT AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claims', true)::json->>'sub', ''),
    nullif(current_setting('app.user_id', true), '')
  );
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSON AS $$
  SELECT current_setting('request.jwt.claims', true)::json;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claims', true)::json->>'role', ''),
    nullif(current_setting('app.user_role', true), '')
  );
$$ LANGUAGE SQL STABLE;

-- Supabase-compat read-only views over Better Auth tables.
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
FROM trexdb."user" u;

COMMENT ON VIEW auth.users IS
  'Read-only compatibility view exposing trexdb."user" under the Supabase auth schema. '
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
  (SELECT u.email FROM trexdb."user" u WHERE u.id = a."userId") AS email
FROM trexdb.account a;

COMMENT ON VIEW auth.identities IS
  'Read-only compatibility view exposing trexdb.account under the Supabase auth schema.';

GRANT USAGE ON SCHEMA auth TO postgres, authenticator, anon, authenticated, service_role;
GRANT SELECT ON auth.users, auth.identities TO postgres, service_role;

-- ── Realtime role + _realtime schema ─────────────────────────────────────────
-- Supabase Realtime needs REPLICATION + CREATEDB privs to manage its own
-- logical replication slot and bootstrap _realtime. Default password is the
-- docker-compose placeholder; operators must override REALTIME_DB_PASSWORD.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin WITH LOGIN PASSWORD 'realtime_admin_pass'
      REPLICATION CREATEDB CREATEROLE;
  END IF;
END $$;

-- Grant on the ACTUAL database, not a hardcoded `testdb` (which breaks on any
-- deployment whose database has another name, e.g. d2e's `alp`).
DO $$ BEGIN
  EXECUTE format('GRANT ALL PRIVILEGES ON DATABASE %I TO supabase_admin', current_database());
END $$;

-- Realtime issues `SET search_path TO _realtime` before its first DDL, so the
-- schema must already exist.
CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin;
GRANT ALL ON SCHEMA _realtime TO supabase_admin;
