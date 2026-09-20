// V17 as a migration, over a population that already exists.
//
// Every other suite here runs against a database where V17 has ALREADY been
// applied, so none of them can see what V17 does to rows that were there when
// it arrived — which is the only thing a migration is for. These build a
// database at V16, seed the shapes an installation really holds, run V17 as one
// simple query (the way the migration runner submits it), and read the result.
//
// V17 is the WHOLE cutover: the five phases were folded into one
// V17__better_auth.sql, so what goes in here is what a real installation
// applies, in one transaction, rather than the first fifth of it. schemaFiles()
// finds it by version like any other, so nothing below had to change.
//
// Gated on DATABASE_URL. Creates and drops its own database per test, named
// after the run, so it never touches the one the rest of the suite uses.
import { assertEquals } from "jsr:@std/assert";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

// deno-lint-ignore no-explicit-any
type PgClient = any;

const SCHEMA_DIR = new URL("../../schema/", import.meta.url);

/** Version-ordered, so V11 does not sort before V2. V10 does not exist. */
async function schemaFiles(): Promise<{ version: number; sql: string }[]> {
  const out: { version: number; sql: string }[] = [];
  for await (const entry of Deno.readDir(SCHEMA_DIR)) {
    const m = entry.name.match(/^V(\d+)__/);
    if (!m) continue;
    out.push({
      version: Number(m[1]),
      sql: await Deno.readTextFile(new URL(entry.name, SCHEMA_DIR)),
    });
  }
  return out.sort((a, b) => a.version - b.version);
}

function maintenanceUrl(): string {
  const u = new URL(DATABASE_URL!);
  u.pathname = "/postgres";
  return u.toString();
}

function scratchUrl(name: string): string {
  const u = new URL(DATABASE_URL!);
  u.pathname = `/${name}`;
  return u.toString();
}

/**
 * A database at V16 — every migration except the one under test — with `seed`
 * applied, then V17 run over it.
 *
 * V17 goes in as ONE query on purpose. `plugins/migration/src/lib.rs`'s
 * `execute_migrations_in_schema` hands the file to the session whole and issues
 * no BEGIN, leaving atomicity to Postgres's implicit transaction over a single
 * simple query. Splitting it here would test something the runner never does.
 */
async function atV17(
  seed: (db: PgClient) => Promise<void>,
  read: (db: PgClient) => Promise<void>,
) {
  const { Client } = await import("npm:pg");
  const name = `trex_v17_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

  const files = await schemaFiles();
  const db = new Client({ connectionString: scratchUrl(name) });

  // CREATE DATABASE is INSIDE the try whose finally drops it. Outside, anything
  // that threw between the create and the try — including the schema read, or
  // simply connecting to the new database — left the database behind on the
  // server with nothing to clean it up, and a test that leaks a database on
  // failure leaks one every time it fails.
  try {
    const admin = new Client({ connectionString: maintenanceUrl() });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE ${name}`);
    } finally {
      await admin.end();
    }

    await db.connect();
    for (const f of files) {
      if (f.version >= 17) continue;
      await db.query(f.sql);
    }
    await seed(db);
    const v17 = files.find((f) => f.version === 17);
    if (!v17) throw new Error("V17 is missing from core/schema");
    await db.query(v17.sql);
    await read(db);
  } finally {
    await db.end().catch(() => {});
    const dropper = new Client({ connectionString: maintenanceUrl() });
    await dropper.connect();
    try {
      await dropper.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    } finally {
      await dropper.end();
    }
  }
}

const v17Test = (name: string, seed: (db: PgClient) => Promise<void>, read: (db: PgClient) => Promise<void>) =>
  Deno.test({ name: `[db] ${name}`, ignore: !DATABASE_URL, fn: () => atV17(seed, read) });

// ── C1: the seventh address-writing door ───────────────────────────────────
//
// V17's placeholder backfill flags what it mints, and it mints only for a row
// whose email IS NULL. An installation that has already run d2e's IdP migration
// does not have those rows: its users arrive holding <username>@d2e.local as an
// ordinary address, and used to pass through V17 untouched — unflagged,
// verified, and a candidate for any upstream asserting the address.
//
// Not something the rehearsal could find: it ran V17 first, against a trexdb
// holding one user, and drove the link API afterwards. Real installations meet
// V17 in the opposite order.

v17Test(
  "V17 flags a pre-existing row already on the placeholder domain",
  async (db) => {
    await db.query(
      `INSERT INTO trexdb."user" (id, name, email, "emailVerified", email_confirmed_at, role)
       VALUES ('pre-migrated', 'Alice', 'alice@d2e.local', true, NOW(), 'user')`,
    );
  },
  async (db) => {
    const { rows } = await db.query(
      `SELECT "emailVerified", is_placeholder_email, email_confirmed_at IS NULL AS unconfirmed
         FROM trexdb."user" WHERE id = 'pre-migrated'`,
    );
    assertEquals(rows, [{
      emailVerified: false,
      is_placeholder_email: true,
      unconfirmed: true,
    }]);
  },
);

// Narrowness. A sweep that flagged everything would satisfy the test above and
// mark every genuine account on the installation unverified.
v17Test(
  "V17 leaves a row on an ordinary domain alone",
  async (db) => {
    await db.query(
      `INSERT INTO trexdb."user" (id, name, email, "emailVerified", email_confirmed_at, role)
       VALUES ('ordinary', 'Bob', 'bob@example.test', true, NOW(), 'user')`,
    );
  },
  async (db) => {
    const { rows } = await db.query(
      `SELECT "emailVerified", is_placeholder_email, email_confirmed_at IS NULL AS unconfirmed
         FROM trexdb."user" WHERE id = 'ordinary'`,
    );
    assertEquals(rows, [{
      emailVerified: true,
      is_placeholder_email: false,
      unconfirmed: false,
    }]);
  },
);

// The domain is taken after the LAST '@' and compared case-insensitively, the
// same rule emailDomain applies, so neither a subdomain nor a quoted local part
// can be mistaken for it.
v17Test(
  "V17's sweep matches the domain exactly, and case-insensitively",
  async (db) => {
    await db.query(
      `INSERT INTO trexdb."user" (id, name, email, "emailVerified", role) VALUES
         ('upper',  'A', 'a@D2E.Local',          true, 'user'),
         ('sub',    'B', 'b@sub.d2e.local',      true, 'user'),
         ('lookal', 'C', 'c@evil-d2e.local',     true, 'user'),
         ('suffix', 'D', 'd@d2e.local.evil.test', true, 'user')`,
    );
  },
  async (db) => {
    const { rows } = await db.query(
      `SELECT id, is_placeholder_email FROM trexdb."user"
        WHERE id IN ('upper', 'sub', 'lookal', 'suffix') ORDER BY id`,
    );
    assertEquals(rows, [
      { id: "lookal", is_placeholder_email: false },
      { id: "sub", is_placeholder_email: false },
      { id: "suffix", is_placeholder_email: false },
      { id: "upper", is_placeholder_email: true },
    ]);
  },
);

// ── I2: the credential develop's PUT /user abandoned ───────────────────────
//
// develop writes trexdb.account before the trexdb."user" UPDATE, so a request
// that changed both password and address and collided on the unique index
// answered 500 with the credential already rotated. Those rows are in
// production databases now. Before the cutover the abandoned credential is
// inert, because user.password_hash is what signs the account in; after it, the
// abandoned one becomes the working password and the holder's real one is
// refused. V17 is the moment that can be repaired.

v17Test(
  "V17 reconciles a credential that disagrees with the user column",
  async (db) => {
    await db.query(
      `INSERT INTO trexdb."user" (id, name, email, "emailVerified", role, password_hash)
       VALUES ('diverged', 'Carol', 'carol@example.test', true, 'user', 'the-real-password')`,
    );
    await db.query(
      `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId", password)
       VALUES ('acct-diverged', 'diverged', 'diverged', 'credential', 'abandoned-by-a-500')`,
    );
  },
  async (db) => {
    const { rows } = await db.query(
      `SELECT password FROM trexdb.account WHERE id = 'acct-diverged'`,
    );
    // user.password_hash wins: pre-cutover it is the column every successful
    // change wrote last, and nothing legitimate makes account.password newer.
    assertEquals(rows, [{ password: "the-real-password" }]);
  },
);

// The case the old `AND a.password IS NULL` guard was written for still works —
// an account row with no credential is filled from the user column.
v17Test(
  "V17 still fills an empty credential from the user column",
  async (db) => {
    await db.query(
      `INSERT INTO trexdb."user" (id, name, email, "emailVerified", role, password_hash)
       VALUES ('empty', 'Dan', 'dan@example.test', true, 'user', 'dans-password')`,
    );
    await db.query(
      `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId")
       VALUES ('acct-empty', 'empty', 'empty', 'credential')`,
    );
  },
  async (db) => {
    const { rows } = await db.query(`SELECT password FROM trexdb.account WHERE id = 'acct-empty'`);
    assertEquals(rows, [{ password: "dans-password" }]);
  },
);

// And a federated account with no password anywhere must not have NULL copied
// over it, nor gain a credential it never had.
v17Test(
  "V17 does not invent a credential for a user with no password",
  async (db) => {
    await db.query(
      `INSERT INTO trexdb."user" (id, name, email, "emailVerified", role)
       VALUES ('federated', 'Erin', 'erin@example.test', true, 'user')`,
    );
  },
  async (db) => {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM trexdb.account WHERE "userId" = 'federated'`,
    );
    assertEquals(rows, [{ n: 0 }]);
  },
);
