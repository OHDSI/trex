import { assertEquals } from "jsr:@std/assert";
import {
  ensureCacheAttached,
  ensureSourceAttached,
  MAX_ATTACH_IDS,
  normalizeCacheDir,
  normalizeDialect,
  parseAttachBody,
  redactSecrets,
  snowflakeExtrasFromRow,
  type SourceCredential,
} from "./attach.ts";

function captureSql(c: SourceCredential): Promise<string[]> {
  const calls: string[] = [];
  const exec = (sql: string) => {
    calls.push(sql);
  };
  return ensureSourceAttached(c, { exec }).then(() => calls);
}

const bqBase: SourceCredential = {
  id: "bq",
  dialect: "bigquery",
  host: "my-proj",
  name: "my_dataset",
  adminUsername: "",
  adminPassword: "",
};

Deno.test("bigquery with dataset pins the single dataset", async () => {
  const calls = await captureSql(bqBase);
  assertEquals(calls, [
    "ATTACH IF NOT EXISTS 'project=my-proj dataset=my_dataset' AS bq__srcdb (TYPE bigquery, READ_ONLY)",
  ]);
});

Deno.test("bigquery with blank dataset attaches project-level (all schemas)", async () => {
  const calls = await captureSql({ ...bqBase, name: "" });
  assertEquals(calls, [
    "ATTACH IF NOT EXISTS 'project=my-proj' AS bq__srcdb (TYPE bigquery, READ_ONLY)",
  ]);
});

Deno.test("bigquery with whitespace-only dataset attaches project-level", async () => {
  const calls = await captureSql({ ...bqBase, name: "   " });
  assertEquals(calls, [
    "ATTACH IF NOT EXISTS 'project=my-proj' AS bq__srcdb (TYPE bigquery, READ_ONLY)",
  ]);
});

Deno.test("bigquery quote-escapes interpolated values", async () => {
  const calls = await captureSql({ ...bqBase, host: "pro'j", name: "da'ta" });
  assertEquals(calls, [
    "ATTACH IF NOT EXISTS 'project=pro''j dataset=da''ta' AS bq__srcdb (TYPE bigquery, READ_ONLY)",
  ]);
});

// PR #2835: the HANA boot block attaches a `${code}_cache` catalog and creates
// the .db file if it is missing.
Deno.test("cache attach with createDbFileIfMissing attaches the _cache catalog", async () => {
  const calls: string[] = [];
  await ensureCacheAttached("myds_cache", {
    cacheDir: "/usr/src/data/cache",
    createDbFileIfMissing: true,
    exec: (sql) => {
      calls.push(sql);
    },
  });
  assertEquals(calls, [
    "ATTACH IF NOT EXISTS '/usr/src/data/cache/myds_cache.db' AS myds_cache",
  ]);
});

Deno.test("cache attach without the flag skips a missing file", async () => {
  const calls: string[] = [];
  await ensureCacheAttached("myds_cache", {
    cacheDir: "/nonexistent-cache-dir-xyz",
    exec: (sql) => {
      calls.push(sql);
    },
  });
  assertEquals(calls, []);
});

Deno.test("parseAttachBody accepts cache and connection ids", () => {
  assertEquals(parseAttachBody({ cacheIds: ["cache_a"], connectionIds: ["source_a"] }), {
    cacheIds: ["cache_a"],
    connectionIds: ["source_a"],
  });
});

Deno.test("parseAttachBody defaults the absent field to an empty array", () => {
  // The production call shape: one cacheId, no connectionIds.
  assertEquals(parseAttachBody({ cacheIds: ["cache_a"] }), {
    cacheIds: ["cache_a"],
    connectionIds: [],
  });
});

Deno.test("parseAttachBody rejects missing fields, wrong types, and malformed ids", () => {
  // Each case asserts the MESSAGE, so a TypeError from a coding mistake (e.g. a
  // sparse array reaching isValidIdentifier) can't masquerade as validation.
  const cases: Array<[unknown, string]> = [
    [{}, "request body must include cacheIds or connectionIds"],
    [null, "request body must be an object"],
    [[], "request body must be an object"],
    ["cache_a", "request body must be an object"],
    [{ cacheIds: "cache_a" }, "cacheIds must be an array of strings"],
    [{ cacheIds: [1] }, "cacheIds[0] must be a string"],
    [{ cacheIds: ["a", undefined] }, "cacheIds[1] must be a string"],
    [{ cacheIds: ["bad-id"] }, 'invalid cacheIds entry "bad-id"'],
    [{ connectionIds: [""] }, 'invalid connectionIds entry ""'],
    [{ cacheIds: ["../etc/passwd"] }, "invalid cacheIds entry"],
    [{ cacheIds: ["a' AS x"] }, "invalid cacheIds entry"],
    // Both lists empty attaches nothing; answering 200 would look like success.
    [{ cacheIds: [] }, "cacheIds and connectionIds are both empty"],
    [{ cacheIds: null }, "cacheIds and connectionIds are both empty"],
    [{ cacheIds: [], connectionIds: [] }, "cacheIds and connectionIds are both empty"],
  ];
  for (const [body, expected] of cases) {
    let message = "<did not throw>";
    try {
      parseAttachBody(body);
    } catch (e) {
      assertEquals(e instanceof Error, true, `${JSON.stringify(body)} threw a non-Error`);
      message = (e as Error).message;
    }
    assertEquals(
      message.includes(expected),
      true,
      `body ${JSON.stringify(body)}: expected "${expected}", got "${message}"`,
    );
  }
});

Deno.test("parseAttachBody enforces the length reservations per field", () => {
  const cache128 = "c".repeat(128);
  const conn121 = "s".repeat(121);
  assertEquals(parseAttachBody({ cacheIds: [cache128] }).cacheIds, [cache128]);
  // `${id}__srcdb` must still fit in 128 chars.
  assertEquals(parseAttachBody({ connectionIds: [conn121] }).connectionIds, [conn121]);
  for (const body of [{ cacheIds: ["c".repeat(129)] }, { connectionIds: ["s".repeat(122)] }]) {
    let threw = false;
    try {
      parseAttachBody(body);
    } catch {
      threw = true;
    }
    assertEquals(threw, true, `${JSON.stringify(body).slice(0, 40)} should be rejected`);
  }
});

Deno.test("parseAttachBody dedupes and caps the number of ids", () => {
  assertEquals(parseAttachBody({ cacheIds: ["a", "a", "b", "a"] }).cacheIds, ["a", "b"]);
  let message = "<did not throw>";
  try {
    parseAttachBody({ cacheIds: Array.from({ length: MAX_ATTACH_IDS + 1 }, (_, i) => `c_${i}`) });
  } catch (e) {
    message = (e as Error).message;
  }
  assertEquals(message.includes(`max ${MAX_ATTACH_IDS} per request`), true, message);
});

Deno.test("normalizeDialect maps the stored spelling onto the attach branches", () => {
  // trexdb.database.dialect defaults to "postgresql"; ensureSourceAttached
  // matches "postgres". Mirrors nativeDialect()/flowDialect().
  assertEquals(normalizeDialect("postgresql"), "postgres");
  assertEquals(normalizeDialect("PostgreSQL"), "postgres");
  assertEquals(normalizeDialect("  postgres  "), "postgres");
  assertEquals(normalizeDialect("hana"), "hana");
  assertEquals(normalizeDialect(null), "");
  assertEquals(normalizeDialect(undefined), "");
});

Deno.test("a postgresql source attaches instead of being silently skipped", async () => {
  const calls = await captureSql({
    id: "pg",
    dialect: "postgresql", // the value the schema and POST /trex/db/ actually store
    host: "db",
    port: 5432,
    name: "app",
    adminUsername: "u",
    adminPassword: "p",
  });
  assertEquals(calls, [
    "ATTACH IF NOT EXISTS 'host=db port=5432 dbname=app user=u password=p' AS pg__srcdb (TYPE postgres)",
  ]);
});

Deno.test("ensureSourceAttached reports whether it attached anything", async () => {
  const pg: SourceCredential = {
    id: "pg",
    dialect: "postgresql",
    host: "db",
    port: 5432,
    name: "app",
    adminUsername: "u",
    adminPassword: "p",
  };
  assertEquals(await ensureSourceAttached(pg, { exec: () => {} }), true);
  // HANA is queried directly — there is no source attach, and the caller must
  // not report the skip as "attached".
  assertEquals(await ensureSourceAttached({ ...pg, dialect: "hana" }, { exec: () => {} }), false);
});

Deno.test("redactSecrets strips the password DuckDB echoes back from a failed ATTACH", () => {
  const real =
    `IO Error: Unable to connect to Postgres at "host=db port=5432 dbname=app user=alice password=SUPERSECRET123": connection refused`;
  const out = redactSecrets(real);
  assertEquals(out.includes("SUPERSECRET123"), false, out);
  assertEquals(out.includes("password=[REDACTED]"), true, out);
  // Non-secret context is preserved so the error is still diagnosable.
  assertEquals(out.includes("host=db"), true, out);
  assertEquals(out.includes("connection refused"), true, out);
});

Deno.test("redactSecrets strips the snowflake PEM and passphrase clauses", () => {
  const sql =
    `CREATE OR REPLACE SECRET s (TYPE snowflake, PRIVATE_KEY '-----BEGIN PRIVATE KEY-----abc', PRIVATE_KEY_PASSPHRASE 'pp')`;
  const out = redactSecrets(sql);
  assertEquals(out.includes("BEGIN PRIVATE KEY"), false, out);
  assertEquals(out.includes("'pp'"), false, out);
});

Deno.test("normalizeCacheDir falls back for a set-but-empty env var", () => {
  // Deno.env.get returns "" for `TREX__CACHE_DIR=`; `??` would keep that ""
  // and resolve every cache file against the filesystem root.
  assertEquals(normalizeCacheDir(""), "/usr/src/data/cache");
  assertEquals(normalizeCacheDir(undefined), "/usr/src/data/cache");
  assertEquals(normalizeCacheDir("/mnt/cache/"), "/mnt/cache");
  assertEquals(normalizeCacheDir("/mnt/cache//"), "/mnt/cache");
  assertEquals(normalizeCacheDir("/mnt/cache"), "/mnt/cache");
});

Deno.test("postgres branch is unchanged", async () => {
  const calls = await captureSql({
    id: "pg",
    dialect: "postgres",
    host: "db",
    port: 5432,
    name: "app",
    adminUsername: "u",
    adminPassword: "p",
  });
  assertEquals(calls, [
    "ATTACH IF NOT EXISTS 'host=db port=5432 dbname=app user=u password=p' AS pg__srcdb (TYPE postgres)",
  ]);
});

Deno.test("snowflake creates a SECRET then ATTACHes read-only", async () => {
  const calls = await captureSql({
    id: "sf_alpha",
    dialect: "snowflake",
    host: "myorg-myaccount",
    name: "OMOP_DB",
    adminUsername: "SVC_USER",
    adminPassword: "",
    warehouse: "COMPUTE_WH",
    schema: "CDM",
    role: "D2E_READER",
    privateKey: "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----",
  });
  assertEquals(calls, [
    "LOAD snowflake",
    "CREATE OR REPLACE SECRET sf_alpha__srcdb_secret (TYPE snowflake, ACCOUNT 'myorg-myaccount', USER 'SVC_USER', AUTH_TYPE 'key_pair', PRIVATE_KEY '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----', WAREHOUSE 'COMPUTE_WH', DATABASE 'OMOP_DB', SCHEMA 'CDM', ROLE 'D2E_READER')",
    "ATTACH IF NOT EXISTS '' AS sf_alpha__srcdb (TYPE snowflake, SECRET sf_alpha__srcdb_secret, READ_ONLY)",
  ]);
});

Deno.test("snowflake omits optional clauses when unset", async () => {
  const calls = await captureSql({
    id: "sf_min",
    dialect: "snowflake",
    host: "acct",
    name: "DB",
    adminUsername: "U",
    adminPassword: "",
    privateKey: "KEY",
  });
  assertEquals(calls, [
    "LOAD snowflake",
    "CREATE OR REPLACE SECRET sf_min__srcdb_secret (TYPE snowflake, ACCOUNT 'acct', USER 'U', AUTH_TYPE 'key_pair', PRIVATE_KEY 'KEY', DATABASE 'DB')",
    "ATTACH IF NOT EXISTS '' AS sf_min__srcdb (TYPE snowflake, SECRET sf_min__srcdb_secret, READ_ONLY)",
  ]);
});

Deno.test("snowflake without a private key throws a clear error", async () => {
  const calls: string[] = [];
  let threw = false;
  try {
    await ensureSourceAttached(
      { id: "sf_bad", dialect: "snowflake", host: "acct", name: "DB", adminUsername: "U", adminPassword: "" },
      { exec: (sql) => { calls.push(sql); } },
    );
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message.includes("snowflake key-pair"), true);
  }
  assertEquals(threw, true);
  assertEquals(calls.length, 0);
});

Deno.test("snowflakeExtrasFromRow — reads extras directly off extra, tolerates missing", () => {
  assertEquals(
    snowflakeExtrasFromRow({ warehouse: "WH", schema: "CDM", role: "R", privateKey: "PEM", privateKeyPassphrase: "pp" }),
    { warehouse: "WH", schema: "CDM", role: "R", privateKey: "PEM", privateKeyPassphrase: "pp" },
  );
  assertEquals(
    snowflakeExtrasFromRow(null),
    { warehouse: undefined, schema: undefined, role: undefined, privateKey: undefined, privateKeyPassphrase: undefined },
  );
});
