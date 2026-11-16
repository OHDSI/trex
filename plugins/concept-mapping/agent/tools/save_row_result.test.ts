import { assertEquals } from "jsr:@std/assert";
import { vocabSql } from "../lib/testing.ts";
import { createRun, runProgress } from "../lib/runs.ts";
import saveRowResult from "./save_row_result.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

async function setup() {
  Deno.env.delete("CONCEPT_MAPPING_VOCAB_DATABASE_URL");
  Deno.env.set("CONCEPT_MAPPING_VOCAB_SCHEMA", "vocab");
  const sql = await vocabSql();
  const runId = await createRun(sql, "s1", undefined, [
    { rowIndex: 0, sourceDataIdentifier: "1", sourceCode: "H08", originalSourceName: "x", sourceName: "Keyhole removal" },
  ]);
  return { sql, runId };
}

const base = {
  row_index: 0,
  predicate: "exactMatch",
  vote_agreement: 5,
  retrieval_confidence: "high",
  phase: 4,
  rationale: "unanimous",
};

Deno.test("save_row_result rejects a non-standard target and saves nothing", async () => {
  const { sql, runId } = await setup();
  const out: Any = await saveRowResult.execute!(
    { ...base, run_id: runId, target_concept_id: 2000001, target_concept_name: "Keyhole removal of test organ NOS" },
    { sessionId: "s1", sql },
  );
  assertEquals(out, { saved: false, reason: "target 2000001: not standard" });
  assertEquals((await runProgress(sql, runId)).done, 0);
});

Deno.test("save_row_result rejects a bad alternative even when the target is fine", async () => {
  const { sql, runId } = await setup();
  const out: Any = await saveRowResult.execute!(
    {
      ...base, run_id: runId, target_concept_id: 9000101, target_concept_name: "Keyhole removal of test organ",
      alternative_target_concept_id: 3000001, alternative_target_concept_name: "Old procedure",
    },
    { sessionId: "s1", sql },
  );
  assertEquals(out, { saved: false, reason: "alternative 3000001: invalid (D)" });
});

Deno.test("save_row_result saves a valid mapping with the vocabulary's own name", async () => {
  const { sql, runId } = await setup();
  const out: Any = await saveRowResult.execute!(
    { ...base, run_id: runId, target_concept_id: 9000101, target_concept_name: "keyhole removal of test organ" },
    { sessionId: "s1", sql },
  );
  assertEquals(out.saved, true);
  assertEquals(out.target_concept_name, "Keyhole removal of test organ");
  assertEquals((await runProgress(sql, runId)).done, 1);
});

Deno.test("save_row_result rejects an unknown predicate", async () => {
  const { sql, runId } = await setup();
  const out: Any = await saveRowResult.execute!(
    { ...base, predicate: "relatedMatch", run_id: runId, target_concept_id: 9000101, target_concept_name: "Keyhole removal of test organ" },
    { sessionId: "s1", sql },
  );
  assertEquals(out.saved, false);
});

Deno.test("save_row_result rejects a standard concept from a disallowed vocabulary", async () => {
  const { sql, runId } = await setup();
  const out: Any = await saveRowResult.execute!(
    { ...base, run_id: runId, target_concept_id: 9000103, target_concept_name: "Veterinary removal of test organ" },
    { sessionId: "s1", sql },
  );
  assertEquals(out, { saved: false, reason: "target 9000103: vocabulary Nebraska Lexicon is not allowed" });
});

Deno.test("save_row_result can mark a row unmapped with a reason", async () => {
  const { sql, runId } = await setup();
  const out: Any = await saveRowResult.execute!(
    { run_id: runId, row_index: 0, unmapped_reason: "no candidates retrieved" },
    { sessionId: "s1", sql },
  );
  assertEquals(out, { saved: true, unmapped: true });
  assertEquals((await runProgress(sql, runId)).unmapped, 1);
});

Deno.test("save_row_result refuses a run from another session", async () => {
  const { sql, runId } = await setup();
  const out: Any = await saveRowResult.execute!(
    { ...base, run_id: runId, target_concept_id: 9000101, target_concept_name: "Keyhole removal of test organ" },
    { sessionId: "other", sql },
  );
  assertEquals(out.error, `run ${runId} not found in this session`);
});
