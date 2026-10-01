import { assertEquals } from "jsr:@std/assert";
import { redactSecrets } from "./redact.js";

const PEM = "-----BEGIN PRIVATE KEY-----\nMII\n-----END PRIVATE KEY-----\n";

Deno.test("a key=value password is redacted", () => {
  assertEquals(
    redactSecrets("ATTACH 'host=h user=u password=pw' AS x (TYPE postgres)"),
    "ATTACH 'host=h user=u password=[REDACTED]' AS x (TYPE postgres)",
  );
});

Deno.test("a bigquery secret's inline service-account key is redacted", () => {
  const json = JSON.stringify({ type: "service_account", private_key: PEM, client_email: "o'brien@x" })
    .replace(/'/g, "''");
  const out = redactSecrets(
    `CREATE OR REPLACE SECRET bq__srcdb_secret (TYPE bigquery, SERVICE_ACCOUNT_JSON '${json}', SCOPE 'bq://p')`,
  );
  assertEquals(out.includes("BEGIN PRIVATE KEY"), false);
  assertEquals(out.includes("SERVICE_ACCOUNT_JSON '[REDACTED]', SCOPE 'bq://p'"), true);
});

Deno.test("a snowflake secret's PEM and passphrase are redacted", () => {
  const out = redactSecrets(`CREATE SECRET s (TYPE snowflake, PRIVATE_KEY '${PEM}', PRIVATE_KEY_PASSPHRASE 'pp')`);
  assertEquals(out.includes("BEGIN PRIVATE KEY"), false);
  assertEquals(out.includes("'pp'"), false);
});
