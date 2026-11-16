import { assertEquals } from "jsr:@std/assert";
import type { RowResult, SourceRow } from "./csv.ts";
import { createRun, exportRun, markUnmapped, pendingRows, runProgress, saveRowResult } from "./runs.ts";
import { pgSql } from "./testing.ts";

const ROWS: SourceRow[] = [0, 1, 2].map((i) => ({
  rowIndex: i,
  sourceDataIdentifier: "1",
  sourceCode: `C${i}`,
  originalSourceName: `orig ${i}`,
  sourceName: `name ${i}`,
}));

const RESULT: RowResult = {
  targetConceptId: 9000201,
  targetConceptName: "Solo talk therapy",
  predicate: "exactMatch",
  voteAgreement: 5,
  retrievalConfidence: "high",
  phase: 4,
  rationale: "unanimous",
};

Deno.test("pending rows exclude saved rows and progress counts them", async () => {
  const sql = await pgSql();
  const runId = await createRun(sql, "s1", "u1", ROWS);
  await saveRowResult(sql, runId, 1, RESULT);
  assertEquals((await pendingRows(sql, runId, 10)).map((r) => r.rowIndex), [0, 2]);
  assertEquals(await runProgress(sql, runId), { total: 3, done: 1, unmapped: 0, pending: 2 });
});

Deno.test("pendingRows honours the limit", async () => {
  const sql = await pgSql();
  const runId = await createRun(sql, "s1", "u1", ROWS);
  assertEquals((await pendingRows(sql, runId, 2)).map((r) => r.rowIndex), [0, 1]);
});

Deno.test("export lists unfinished rows and writes saved results", async () => {
  const sql = await pgSql();
  const runId = await createRun(sql, "s1", "u1", ROWS);
  await saveRowResult(sql, runId, 1, RESULT);
  const { csv, unfinished } = await exportRun(sql, runId);
  assertEquals(unfinished, [0, 2]);
  const lines = csv.trimEnd().split("\n");
  assertEquals(lines.length, 4);
  assertEquals(lines[2], "1,C1,orig 1,name 1,9000201,Solo talk therapy,,,exactMatch");
  assertEquals(lines[1], "1,C0,orig 0,name 0,,,,,");
});

Deno.test("unmapped rows leave the pending queue and are listed by export", async () => {
  const sql = await pgSql();
  const runId = await createRun(sql, "s1", "u1", ROWS);
  await markUnmapped(sql, runId, 0, "no candidate in the vocabulary");
  await saveRowResult(sql, runId, 1, RESULT);
  assertEquals((await pendingRows(sql, runId, 10)).map((r) => r.rowIndex), [2]);
  assertEquals(await runProgress(sql, runId), { total: 3, done: 1, unmapped: 1, pending: 1 });
  const out = await exportRun(sql, runId);
  assertEquals(out.unfinished, [2]);
  assertEquals(out.unmapped, [{ rowIndex: 0, reason: "no candidate in the vocabulary" }]);
});
