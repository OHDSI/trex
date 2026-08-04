import { assertEquals } from "jsr:@std/assert";
import {
  CDW_DUCKDB_FILE_DATABASE_CODE,
  resolveDialect,
  resolveFirstPublication,
} from "./db_resolve.js";

// A cache_id looks exactly like any other alias but has no credential row:
// dataset caches are attached as `ATTACH '<dir>/<cacheId>.db' AS <cacheId>`
// (core/server/d2e-compat/lib/attach.ts), so the alias IS the duckdb catalog.
const CACHE_ID = "bf972262_c919_434a_be89_5fb69a8e2cba";

const CREDENTIALS = [
  { id: "demo_database", dialect: "postgres", publications: [{ publication: "pub1" }] },
  { id: "hana_db", dialect: "hana", publications: [] },
  { id: "plain_duck", dialect: "duckdb" },
];

Deno.test("resolveDialect returns the credential's dialect when one exists", () => {
  assertEquals(resolveDialect(CREDENTIALS, "demo_database"), "postgres");
  assertEquals(resolveDialect(CREDENTIALS, "hana_db"), "hana");
});

Deno.test("resolveDialect falls back to duckdb for a cache_id with no credential row", () => {
  assertEquals(resolveDialect(CREDENTIALS, CACHE_ID), "duckdb");
});

Deno.test("resolveDialect never throws on absent/degenerate credential lists", () => {
  assertEquals(resolveDialect([], CACHE_ID), "duckdb");
  assertEquals(resolveDialect(undefined, CACHE_ID), "duckdb");
  assertEquals(resolveDialect(null, "memory"), "duckdb");
  // A credential row missing `dialect` must not resolve to undefined.
  assertEquals(resolveDialect([{ id: "odd" }], "odd"), "duckdb");
});

Deno.test("resolveDialect short-circuits the built-in cdw_config_svc database", () => {
  assertEquals(resolveDialect(CREDENTIALS, CDW_DUCKDB_FILE_DATABASE_CODE), "duckdb");
});

Deno.test("resolveFirstPublication qualifies a credentialed db with its first publication", () => {
  assertEquals(resolveFirstPublication(CREDENTIALS, "demo_database"), "demo_database_pub1");
});

Deno.test("resolveFirstPublication passes a cache_id through as its own catalog name", () => {
  assertEquals(resolveFirstPublication(CREDENTIALS, CACHE_ID), CACHE_ID);
});

Deno.test("resolveFirstPublication passes through when publications are absent or empty", () => {
  assertEquals(resolveFirstPublication(CREDENTIALS, "hana_db"), "hana_db");
  assertEquals(resolveFirstPublication(CREDENTIALS, "plain_duck"), "plain_duck");
  assertEquals(resolveFirstPublication([], "anything"), "anything");
  assertEquals(resolveFirstPublication(undefined, "anything"), "anything");
});
