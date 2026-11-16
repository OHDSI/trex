import { assertEquals, assertMatch } from "jsr:@std/assert";
import { execAll, pgSql } from "../lib/testing.ts";
import startRun from "./start_run.ts";
import nextRows from "./next_rows.ts";
import saveCodingSystems from "./save_coding_systems.ts";
import exportRun from "./export_run.ts";
import { saveRowResult } from "../lib/runs.ts";

const CSV = "source_data_identifier,source_code,original_source_name,source_name\n" +
  "1,C0,a,A\n1,C1,b,B\n2,C2,c,C\n";

// deno-lint-ignore no-explicit-any
type Any = any;

Deno.test("start_run stores rows and summarizes institutions", async () => {
  const sql = await pgSql();
  const out: Any = await startRun.execute!({ csv: CSV }, { sessionId: "s1", userId: "u1", sql });
  assertEquals(out.rows, 3);
  assertEquals(out.institutions, { "1": 2, "2": 1 });
  assertEquals(out.errors, []);
});

Deno.test("start_run refuses input with errors and stores nothing", async () => {
  const sql = await pgSql();
  const out: Any = await startRun.execute!({ csv: "source_code\nX\n" }, { sessionId: "s1", sql });
  assertEquals(out.run_id, undefined);
  assertMatch(out.errors[0], /missing required column/);
});

Deno.test("next_rows without run_id resumes the session's latest run and includes briefings", async () => {
  const sql = await pgSql();
  const ctx = { sessionId: "s1", sql };
  const { run_id }: Any = await startRun.execute!({ csv: CSV }, ctx);
  await saveCodingSystems.execute!({ run_id, source_data_identifier: "1", briefing: { systems: ["X"] } }, ctx);
  await saveRowResult(sql, run_id, 0, {
    targetConceptId: 1, targetConceptName: "n", predicate: "exactMatch", voteAgreement: 5,
    retrievalConfidence: "high", phase: 4, rationale: "r",
  });
  const out: Any = await nextRows.execute!({ limit: 1 }, ctx);
  assertEquals(out.run_id, run_id);
  assertEquals(out.rows.map((r: Any) => r.rowIndex), [1]);
  assertEquals(out.coding_systems, { "1": { systems: ["X"] } });
  assertEquals(out.progress, { total: 3, done: 1, unmapped: 0, pending: 2 });
});

Deno.test("export_run emits the CSV and lists unfinished rows", async () => {
  const sql = await pgSql();
  const emitted: unknown[] = [];
  const ctx = { sessionId: "s1", sql, emit: (n: string, d: unknown) => emitted.push([n, d]) };
  const { run_id }: Any = await startRun.execute!({ csv: CSV }, ctx);
  const out: Any = await exportRun.execute!({ run_id }, ctx);
  assertEquals(out.unfinished, [0, 1, 2]);
  assertEquals((emitted[0] as Any)[0], "run_export");
  assertEquals(emitted.length, 1);
});

Deno.test("export_run keeps the full CSV out of the model context unless asked", async () => {
  const sql = await pgSql();
  const ctx = { sessionId: "s1", sql, emit: () => {} };
  const { run_id }: Any = await startRun.execute!({ csv: CSV }, ctx);
  const brief: Any = await exportRun.execute!({ run_id }, ctx);
  assertEquals(brief.csv, undefined);
  assertEquals(brief.csv_delivered_as_event, true);
  assertEquals(brief.preview.split("\n").length, 4); // header + 3 rows (preview cap is 5)
  const full: Any = await exportRun.execute!({ run_id, include_csv: true }, ctx);
  assertMatch(full.csv, /^source_data_identifier,/);
});

Deno.test("tools report a clear error when no database is available", async () => {
  const out: Any = await nextRows.execute!({}, { sessionId: "s1" });
  assertMatch(out.error, /database/);
});

Deno.test("runs belong to their session: another session cannot read, export or change them", async () => {
  const sql = await pgSql();
  const { run_id }: Any = await startRun.execute!({ csv: CSV }, { sessionId: "s1", sql });
  const other = { sessionId: "s2", sql };
  for (const out of [
    await nextRows.execute!({ run_id }, other),
    await exportRun.execute!({ run_id }, other),
    await saveCodingSystems.execute!({ run_id, source_data_identifier: "1", briefing: {} }, other),
  ] as Any[]) assertMatch(out.error, /not found in this session/);
});

Deno.test("start_run without csv reads the CSV from the user's latest message", async () => {
  const sql = await pgSql();
  await execAll(sql, `CREATE SCHEMA agents; CREATE TABLE agents.turns (session_id text, seq int, message jsonb)`);
  await sql("INSERT INTO agents.turns VALUES ($1, 1, $2)", ["s1", JSON.stringify("hello")]);
  await sql("INSERT INTO agents.turns VALUES ($1, 2, $2)", [
    "s1",
    JSON.stringify({ role: "user", parts: [{ type: "text", text: "Please map:\n\n```csv\n" + CSV + "```\nthanks" }] }),
  ]);
  const out: Any = await startRun.execute!({}, { sessionId: "s1", sql });
  assertEquals(out.errors, []);
  assertEquals(out.rows, 3);
});

Deno.test("start_run without csv explains when no CSV is in the message", async () => {
  const sql = await pgSql();
  await execAll(sql, `CREATE SCHEMA agents; CREATE TABLE agents.turns (session_id text, seq int, message jsonb)`);
  await sql("INSERT INTO agents.turns VALUES ($1, 1, $2)", ["s1", JSON.stringify("map my file please")]);
  const out: Any = await startRun.execute!({}, { sessionId: "s1", sql });
  assertMatch(out.errors[0], /no CSV with a source_data_identifier header/);
});
