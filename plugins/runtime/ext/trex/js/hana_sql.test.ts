import { assertEquals } from "jsr:@std/assert";
import {
  buildHanaEvictSessionSql,
  buildHanaExecuteSql,
  buildHanaScanSql,
} from "./hana_sql.js";

Deno.test("scan SQL pins the HANA session and escapes quotes", () => {
  assertEquals(
    buildHanaScanSql("select 'x'", "hdbsql://user:pass@host/db", "42"),
    "select * from trex_hana_scan('select ''x''', 'hdbsql://user:pass@host/db', session_id = '42')",
  );
});

Deno.test("execute SQL pins the HANA session and escapes quotes", () => {
  assertEquals(
    buildHanaExecuteSql(
      "hdbsql://user:pass@host/db",
      "SET 'APPLICATION' = 'w'",
      "7",
    ),
    "select trex_hana_execute('hdbsql://user:pass@host/db', 'SET ''APPLICATION'' = ''w''', '7')",
  );
});

Deno.test("evict SQL targets the session id", () => {
  assertEquals(
    buildHanaEvictSessionSql("9"),
    "select trex_hana_evict_session('9')",
  );
});
