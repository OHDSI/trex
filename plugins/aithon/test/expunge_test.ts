// @ts-nocheck
import { assertEquals, assertRejects } from "std/assert/mod.ts";
import {
  buildExpungeByIdSql,
  buildExpungeHistoryByIdSql,
  buildExpungeHistoryWhereSql,
  buildExpungeWhereSql,
  buildListTablesSql,
  buildPatientReferenceCondition,
  expungeResource,
  parseAllowFlag,
  parseCascade,
  PATIENT_CASCADE,
} from "../functions/handlers/expunge.ts";
import { parseRoute } from "../functions/router.ts";
import { FhirError } from "../functions/error.ts";

function makeState(knownTypes: string[] = ["Patient", "Observation", "Condition"]) {
  const registry = { isKnownResourceType: (rt: string) => knownTypes.includes(rt) } as any;
  return { registry, searchParams: {} as any, dbName: "memory" };
}

function fakeConn(handler: (sql: string) => any[] | Error) {
  const sqls: string[] = [];
  const conn = {
    async query(sql: string) {
      sqls.push(sql);
      const r = handler(sql);
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { conn, sqls };
}

Deno.test("parseAllowFlag", () => {
  assertEquals(parseAllowFlag("true"), true);
  assertEquals(parseAllowFlag(" TRUE "), true);
  assertEquals(parseAllowFlag("1"), true);
  assertEquals(parseAllowFlag("false"), false);
  assertEquals(parseAllowFlag(""), false);
  assertEquals(parseAllowFlag(undefined), false);
});

Deno.test("parseCascade", () => {
  assertEquals(parseCascade(null), false);
  assertEquals(parseCascade("delete"), true);
  try {
    parseCascade("yes");
    throw new Error("should have thrown");
  } catch (e) {
    assertEquals((e as FhirError).status, 400);
  }
});

Deno.test("sql builders match Rust", () => {
  assertEquals(
    buildPatientReferenceCondition("subject", "p.1"),
    "regexp_full_match(json_extract_string(_raw, '$.subject.reference'), '(.*/)?Patient/p\\.1(/_history/[^/]+)?')",
  );
  assertEquals(
    buildListTablesSql("FHIR", "my-ds"),
    "SELECT table_name FROM information_schema.tables WHERE table_catalog = 'FHIR' AND table_schema = 'my_ds'",
  );
  assertEquals(
    buildExpungeByIdSql('"db"."ds"', "Patient", "p1"),
    'DELETE FROM "db"."ds"."patient" WHERE _id = \'p1\' RETURNING _id',
  );
  assertEquals(
    buildExpungeHistoryByIdSql('"db"."ds"', "Patient", "p1"),
    "DELETE FROM \"db\".\"ds\"._history WHERE _resource_type = 'Patient' AND _id = 'p1' RETURNING _id",
  );
  assertEquals(
    buildExpungeHistoryWhereSql('"db"."ds"', "Observation", "COND"),
    "DELETE FROM \"db\".\"ds\"._history WHERE _resource_type = 'Observation' AND (_id IN (SELECT _id FROM \"db\".\"ds\".\"observation\" WHERE COND) OR COND) RETURNING _id",
  );
  assertEquals(
    buildExpungeWhereSql('"db"."ds"', "Observation", "COND"),
    'DELETE FROM "db"."ds"."observation" WHERE COND RETURNING _id',
  );
});

Deno.test("PATIENT_CASCADE matches the Rust list", async () => {
  const rs = await Deno.readTextFile(new URL("../../fhir/src/handlers/expunge.rs", import.meta.url));
  const rustPairs = [...rs.matchAll(/\("(\w+)", "(\w+)"\),/g)].map((m) => `${m[1]}.${m[2]}`);
  assertEquals(PATIENT_CASCADE.map(([t, e]) => `${t}.${e}`), rustPairs);
});

Deno.test("parseRoute recognises $expunge on POST only", () => {
  assertEquals(parseRoute("POST", "/ds1/Patient/p1/$expunge"), {
    kind: "expunge",
    datasetId: "ds1",
    resourceType: "Patient",
    id: "p1",
  });
  assertEquals(parseRoute("GET", "/ds1/Patient/p1/$expunge"), { kind: "notFound" });
});

Deno.test("expunge is forbidden unless enabled", async () => {
  const { conn, sqls } = fakeConn(() => []);
  const err = await assertRejects(
    () => expungeResource("ds1", "Patient", "p1", null, conn, makeState(), undefined),
    FhirError,
  );
  assertEquals(err.status, 403);
  assertEquals(sqls.length, 0);
});

Deno.test("expunge rejects cascade on non-Patient", async () => {
  const { conn } = fakeConn(() => []);
  const err = await assertRejects(
    () => expungeResource("ds1", "Observation", "o1", "delete", conn, makeState(), "true"),
    FhirError,
  );
  assertEquals(err.status, 400);
});

Deno.test("expunge returns 404 and rolls back when resource is missing", async () => {
  const { conn, sqls } = fakeConn(() => []);
  const err = await assertRejects(
    () => expungeResource("ds1", "Patient", "p1", null, conn, makeState(), "true"),
    FhirError,
  );
  assertEquals(err.status, 404);
  assertEquals(sqls.includes("ROLLBACK"), true);
  assertEquals(sqls.includes("COMMIT"), false);
});

Deno.test("expunge single resource deletes row and history then checkpoints", async () => {
  const { conn, sqls } = fakeConn((sql) => {
    if (sql.includes("._history WHERE")) return [{ _id: "o1" }, { _id: "o1" }];
    if (sql.startsWith("DELETE FROM")) return [{ _id: "o1" }];
    return [];
  });
  const res = await expungeResource("ds1", "Observation", "o1", null, conn, makeState(), "true");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.parameter[0], { name: "count", valueInteger: 1 });
  assertEquals(body.parameter[1], { name: "historyCount", valueInteger: 2 });
  assertEquals(sqls[0], "BEGIN TRANSACTION");
  assertEquals(sqls.at(-2), "COMMIT");
  assertEquals(sqls.at(-1), 'CHECKPOINT "memory"');
  assertEquals(sqls.some((s) => s.includes("information_schema")), false);
});

Deno.test("expunge cascade only touches existing tables in the compartment", async () => {
  const { conn, sqls } = fakeConn((sql) => {
    if (sql.includes("information_schema")) {
      return [{ table_name: "patient" }, { table_name: "observation" }, { table_name: "_history" }];
    }
    if (sql.includes('"patient" WHERE')) return [{ _id: "p1" }];
    if (sql.includes('"observation" WHERE regexp')) return [{ _id: "o1" }, { _id: "o2" }];
    return [];
  });
  const res = await expungeResource("ds1", "Patient", "p1", "delete", conn, makeState(), "true");
  const body = await res.json();
  assertEquals(body.parameter[0].valueInteger, 3);
  assertEquals(sqls.some((s) => s.includes('"condition"')), false);
  assertEquals(sqls.some((s) => s.includes("_resource_type = 'Observation'")), true);
});

Deno.test("expunge rolls back when a cascade delete fails", async () => {
  const { conn, sqls } = fakeConn((sql) => {
    if (sql.includes("information_schema")) return [{ table_name: "observation" }];
    if (sql.includes('"patient" WHERE')) return [{ _id: "p1" }];
    if (sql.includes('"observation" WHERE regexp')) return new Error("boom");
    return [];
  });
  const err = await assertRejects(
    () => expungeResource("ds1", "Patient", "p1", "delete", conn, makeState(), "true"),
    FhirError,
  );
  assertEquals(err.status, 500);
  assertEquals(sqls.includes("ROLLBACK"), true);
  assertEquals(sqls.includes("COMMIT"), false);
});
