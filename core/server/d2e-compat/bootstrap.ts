// d2e-compat/bootstrap.ts
// Replaces the d2e `alp-minerva-pg-mgmt-init` container: provisions the login
// users, supabase roles, schemas and grants that d2e's services expect, using
// trex's superuser DATABASE_URL connection. Every statement is idempotent, so
// this re-runs harmlessly on every boot and against databases the retired
// container already provisioned.

export interface ManageConfig {
  databases: Record<string, { schemas?: Record<string, unknown> }>;
}

export interface ManageUsersEntry {
  manager?: string;
  managerPassword?: string;
  reader?: string;
  readerPassword?: string;
  writer?: string;
  writerPassword?: string;
  logtoManager?: string;
  logtoManagerPassword?: string;
}

export type ManageUsers = Record<string, ManageUsersEntry>;

export interface BootstrapConfig {
  manageConfig: ManageConfig;
  manageUsers: ManageUsers;
  grantRolesUsers: Record<string, string[]>;
}

const NAME_RE = /^[A-Za-z0-9_-]+$/;

/** Quote a Postgres identifier, rejecting anything not name-shaped. Config is
 *  operator-supplied, but a typo must fail loudly rather than splice SQL. */
export function quoteIdent(name: string): string {
  if (!NAME_RE.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}

/** Quote a Postgres string literal. Passwords cannot be bound as parameters in
 *  CREATE ROLE, so they are escaped here. */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** `+name` / `-name` prefixes mark create/drop intent in d2e's config. */
function stripMarker(name: string): string {
  return name.startsWith("+") || name.startsWith("-") ? name.slice(1) : name;
}

function createLoginRole(user: string, password: string, extra = ""): string {
  const attrs = `NOSUPERUSER ${extra}LOGIN ENCRYPTED PASSWORD ${quoteLiteral(password)}`;
  return `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${
    quoteLiteral(user)
  }) THEN CREATE ROLE ${quoteIdent(user)} ${attrs}; END IF; END $$`;
}

function createGroupRole(role: string, attrs: string): string {
  return `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${
    quoteLiteral(role)
  }) THEN CREATE ROLE ${role} ${attrs}; END IF; END $$`;
}

export function parseBootstrapConfigFromEnv(
  env: Record<string, string | undefined>,
): BootstrapConfig | null {
  const rawConfig = env.POSTGRES_MANAGE_CONFIG;
  const rawUsers = env.POSTGRES_MANAGE_USERS;
  if (!rawConfig || !rawUsers) return null;
  return {
    manageConfig: JSON.parse(rawConfig) as ManageConfig,
    manageUsers: JSON.parse(rawUsers) as ManageUsers,
    grantRolesUsers: JSON.parse(env.POSTGRES_MANAGE_ROLES_USERS || "{}"),
  };
}

export function buildBootstrapStatements(cfg: BootstrapConfig): string[] {
  const out: string[] = [];

  // ── Supabase roles (PostGraphile connects as authenticator and SET ROLEs) ──
  out.push(createGroupRole("anon", "NOLOGIN INHERIT"));
  out.push(createGroupRole("authenticated", "NOLOGIN INHERIT"));
  out.push(createGroupRole("service_role", "NOLOGIN INHERIT BYPASSRLS"));

  for (const dbKey of Object.keys(cfg.manageConfig.databases)) {
    if (!dbKey.startsWith("+")) continue; // only creation scenarios
    const dbName = stripMarker(dbKey).toLowerCase();
    const users = cfg.manageUsers[dbName];
    if (!users) continue;

    // ── Login roles ──────────────────────────────────────────────────────────
    const logins: Array<[string | undefined, string | undefined, string]> = [
      [users.manager, users.managerPassword, ""],
      [users.reader, users.readerPassword, ""],
      [users.writer, users.writerPassword, ""],
      [users.logtoManager, users.logtoManagerPassword, "CREATEROLE "],
    ];
    const seen = new Set<string>();
    for (const [user, password, extra] of logins) {
      if (!user || password === undefined || seen.has(user)) continue;
      seen.add(user);
      out.push(createLoginRole(user, password, extra));
    }

    // ── Role membership: manager gets service_role, reader anon, writer authenticated ──
    if (users.manager) out.push(`GRANT service_role TO ${quoteIdent(users.manager)}`);
    if (users.reader) out.push(`GRANT anon TO ${quoteIdent(users.reader)}`);
    if (users.writer) out.push(`GRANT authenticated TO ${quoteIdent(users.writer)}`);

    // ── Schemas + grants ─────────────────────────────────────────────────────
    const schemas = cfg.manageConfig.databases[dbKey].schemas || {};
    for (const schemaKey of Object.keys(schemas)) {
      if (!schemaKey.startsWith("+")) continue;
      const schema = stripMarker(schemaKey).toLowerCase();
      const s = quoteIdent(schema);
      out.push(`CREATE SCHEMA IF NOT EXISTS ${s}`);

      if (users.writer) {
        const w = quoteIdent(users.writer);
        out.push(`GRANT USAGE ON SCHEMA ${s} TO ${w}`);
        out.push(`GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA ${s} TO ${w}`);
        out.push(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${s} TO ${w}`);
        out.push(`GRANT USAGE, UPDATE, SELECT ON ALL SEQUENCES IN SCHEMA ${s} TO ${w}`);
        out.push(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO ${w}`);
        out.push(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT USAGE, UPDATE, SELECT ON SEQUENCES TO ${w}`);
        out.push(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT EXECUTE ON FUNCTIONS TO ${w}`);
      }
      if (users.reader && users.reader !== users.writer) {
        out.push(`GRANT USAGE ON SCHEMA ${s} TO ${quoteIdent(users.reader)}`);
      }
      if (users.manager) {
        out.push(`GRANT ALL ON SCHEMA ${s} TO ${quoteIdent(users.manager)}`);
      }
    }
  }

  // ── Extra role→user grants from POSTGRES_MANAGE_ROLES_USERS ───────────────
  for (const [role, targets] of Object.entries(cfg.grantRolesUsers)) {
    for (const target of targets) {
      out.push(`GRANT ${quoteIdent(role)} TO ${quoteIdent(target)}`);
    }
  }

  return out;
}
