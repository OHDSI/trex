import { assertEquals } from "jsr:@std/assert";
import { buildHanaExecuteSql, buildHanaScanSql } from "./hana_sql.js";

Deno.test("HANA scan SQL carries session id and escaped session variables", () => {
  assertEquals(
    buildHanaScanSql("select 'x'", "hdbsql://user:pass@host/db", 42, {
      APPLICATION: "WIZARD_o'hare",
      APPLICATIONUSER: "alice",
    }),
    "select * from trex_hana_scan('select ''x''', 'hdbsql://user:pass@host/db', session_id = '42', session_vars_json = '{\"APPLICATION\":\"WIZARD_o''hare\",\"APPLICATIONUSER\":\"alice\"}')",
  );
});

Deno.test("HANA execute SQL carries session id and session variables", () => {
  assertEquals(
    buildHanaExecuteSql("hdbsql://user:pass@host/db", "drop table 'x'", 7, {
      APPLICATION: "WIZARD_test",
    }),
    "select trex_hana_execute('hdbsql://user:pass@host/db', 'drop table ''x''', '7', '{\"APPLICATION\":\"WIZARD_test\"}')",
  );
});

Deno.test("HANA SQL treats null session variables as an empty object", () => {
  assertEquals(
    buildHanaScanSql("select 1", "url", 9, null),
    "select * from trex_hana_scan('select 1', 'url', session_id = '9', session_vars_json = '{}')",
  );
});
