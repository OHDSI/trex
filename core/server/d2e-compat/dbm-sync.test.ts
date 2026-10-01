import { assertEquals } from "jsr:@std/assert";
import { planBigQueryCredentials } from "./dbm-sync.ts";

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
