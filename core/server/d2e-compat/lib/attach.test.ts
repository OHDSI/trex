import { assertEquals } from "jsr:@std/assert";
import {
  ensureAttached,
  ensureCacheAttached,
  ensureSourceAttached,
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

Deno.test("attach request creates and attaches a missing cache catalog", async () => {
  const cacheId = `_${crypto.randomUUID().replace(/-/g, "_")}`;
  const calls: string[] = [];
  await ensureAttached(
    { cacheIds: [cacheId] },
    {
      cacheDir: "/usr/src/data/cache",
      createDbFileIfMissing: true,
      exec: (sql) => {
        calls.push(sql);
      },
    },
  );
  assertEquals(calls, [
    `ATTACH IF NOT EXISTS '/usr/src/data/cache/${cacheId}.db' AS ${cacheId}`,
  ]);
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
