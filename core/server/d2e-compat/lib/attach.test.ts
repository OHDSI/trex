import { assertEquals } from "jsr:@std/assert";
import { ensureSourceAttached, type SourceCredential } from "./attach.ts";

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
