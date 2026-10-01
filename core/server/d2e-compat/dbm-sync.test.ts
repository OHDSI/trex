import { assertEquals } from "jsr:@std/assert";
import { applyBigQueryPlan, planBigQueryCredentials } from "./dbm-sync.ts";

const key = (email: string) => ({
  type: "service_account",
  private_key: "-----BEGIN PRIVATE KEY-----\nMII\n-----END PRIVATE KEY-----\n",
  client_email: email,
});

Deno.test("one secret per bigquery source; postgres untouched", () => {
  const plan = planBigQueryCredentials([
    { id: "pg", host: "db", dialect: "postgres", extra: {} },
    { id: "bq1", host: "proj-a", dialect: "bigquery", extra: { Internal: key("a@x") } },
  ]);
  assertEquals(plan.secrets.length, 1);
  assertEquals(plan.secrets[0].startsWith("CREATE OR REPLACE SECRET bq1__srcdb_secret"), true);
  assertEquals(plan.adcKey, key("a@x"));
  assertEquals(plan.warnings, []);
});

Deno.test("two different keys on one project are flagged", () => {
  const plan = planBigQueryCredentials([
    { id: "bq1", host: "proj-a", dialect: "bigquery", extra: key("a@x") },
    { id: "bq2", host: "proj-a", dialect: "bigquery", extra: key("b@x") },
  ]);
  assertEquals(plan.warnings.some((w) => w.includes("proj-a")), true);
});

Deno.test("different keys across sources: WebAPI's single ADC file is flagged", () => {
  const plan = planBigQueryCredentials([
    { id: "bq1", host: "proj-a", dialect: "bigquery", extra: key("a@x") },
    { id: "bq2", host: "proj-b", dialect: "bigquery", extra: key("b@x") },
  ]);
  assertEquals(plan.warnings.some((w) => w.includes("GOOGLE_APPLICATION_CREDENTIALS")), true);
});

Deno.test("a bigquery source without a key is reported, not fatal", () => {
  const plan = planBigQueryCredentials([{ id: "bq1", host: "p", dialect: "bigquery", extra: {} }]);
  assertEquals(plan.secrets, []);
  assertEquals(plan.adcKey, undefined);
  assertEquals(plan.warnings.length, 1);
});

Deno.test("a bigquery id DuckDB cannot name is skipped, not fatal to the rest", () => {
  const plan = planBigQueryCredentials([
    { id: "2024_bq", host: "proj-a", dialect: "bigquery", extra: key("a@x") },
    { id: "bq2", host: "proj-b", dialect: "bigquery", extra: key("a@x") },
  ]);
  assertEquals(plan.secrets.length, 1);
  assertEquals(plan.secrets[0].startsWith("CREATE OR REPLACE SECRET bq2__srcdb_secret"), true);
  assertEquals(plan.warnings.some((w) => w.includes("2024_bq")), true);
});

function fakeConn(fail: (sql: string) => boolean) {
  const ran: string[] = [];
  let closed = false;
  return {
    ran,
    closed: () => closed,
    open: () => ({
      execute: (sql: string) => {
        if (fail(sql)) throw new Error(`boom: ${sql}`);
        ran.push(sql);
      },
      close: () => { closed = true; },
    }),
  };
}

Deno.test("one failing secret does not stop the others or the ADC write", async () => {
  const plan = planBigQueryCredentials([
    { id: "bq1", host: "proj-a", dialect: "bigquery", extra: key("a@x") },
    { id: "bq2", host: "proj-b", dialect: "bigquery", extra: key("a@x") },
  ]);
  const conn = fakeConn((sql) => sql.includes("bq1__srcdb_secret"));
  let written: unknown;
  await applyBigQueryPlan(plan, conn.open, { write: (k) => { written = k; }, remove: () => {} });
  assertEquals(conn.ran.some((s) => s.includes("bq2__srcdb_secret")), true);
  assertEquals(written, key("a@x"));
  assertEquals(conn.closed(), true);
});

Deno.test("the ADC file is written even when the bigquery extension cannot load", async () => {
  const plan = planBigQueryCredentials([
    { id: "bq1", host: "proj-a", dialect: "bigquery", extra: key("a@x") },
  ]);
  const conn = fakeConn((sql) => /LOAD|INSTALL/.test(sql));
  let written: unknown;
  await applyBigQueryPlan(plan, conn.open, { write: (k) => { written = k; }, remove: () => {} });
  assertEquals(written, key("a@x"));
  assertEquals(conn.closed(), true);
});

Deno.test("WebAPI's key is chosen by source id, not by row order", () => {
  const a = { id: "bq_a", host: "proj-a", dialect: "bigquery", extra: key("a@x") };
  const b = { id: "bq_b", host: "proj-b", dialect: "bigquery", extra: key("b@x") };
  assertEquals(planBigQueryCredentials([a, b]).adcKey, key("a@x"));
  assertEquals(planBigQueryCredentials([b, a]).adcKey, key("a@x"));
});

Deno.test("the ADC file is removed once no bigquery source has a key", async () => {
  const plan = planBigQueryCredentials([{ id: "pg", host: "db", dialect: "postgres", extra: {} }]);
  let removed = false;
  await applyBigQueryPlan(plan, fakeConn(() => false).open, {
    write: () => { throw new Error("must not write"); },
    remove: () => { removed = true; },
  });
  assertEquals(removed, true);
});
