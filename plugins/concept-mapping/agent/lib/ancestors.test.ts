import { assertEquals } from "jsr:@std/assert";
import { ancestorCandidates } from "./ancestors.ts";
import { execAll, HIERARCHY_FIXTURE, vocabSql } from "./testing.ts";

async function setup() {
  const sql = await vocabSql();
  await execAll(sql, HIERARCHY_FIXTURE);
  return sql;
}

const opts = { maxLevels: 2, minSupport: 0.3, cap: 5, minDepth: 1 };

Deno.test("an ancestor shared by two top candidates ranks above one shared by a single candidate", async () => {
  const sql = await setup();
  const out = await ancestorCandidates(sql, "vocab", [{ conceptId: 9000101, rank: 1 }, { conceptId: 9000104, rank: 2 }], opts);
  assertEquals(out[0].conceptId, 9000102);
  assertEquals(out[0].support, 1);
});

Deno.test("the root, non-standard and disallowed-vocabulary ancestors are never offered", async () => {
  const sql = await setup();
  const out = await ancestorCandidates(sql, "vocab", [{ conceptId: 9000101, rank: 1 }], opts);
  const ids = out.map((c) => c.conceptId);
  assertEquals(ids.includes(9000100), false);
  assertEquals(ids.includes(9000105), false);
  assertEquals(ids.includes(9000103), false);
});

Deno.test("only the most specific of a parent and grandparent is kept", async () => {
  const sql = await setup();
  const out = await ancestorCandidates(sql, "vocab", [{ conceptId: 9000101, rank: 1 }], { ...opts, minDepth: 0 });
  assertEquals(out.map((c) => c.conceptId).sort(), [9000102, 9000106]);
});

Deno.test("concepts already among the candidates are not repeated", async () => {
  const sql = await setup();
  const out = await ancestorCandidates(sql, "vocab", [{ conceptId: 9000101, rank: 1 }, { conceptId: 9000102, rank: 2 }], opts);
  assertEquals(out.map((c) => c.conceptId).includes(9000102), false);
});

Deno.test("support below the threshold is dropped and the cap is applied", async () => {
  const sql = await setup();
  const top = [{ conceptId: 9000101, rank: 1 }, { conceptId: 9000201, rank: 2 }, { conceptId: 9000104, rank: 3 }];
  const strict = await ancestorCandidates(sql, "vocab", top, { ...opts, minSupport: 0.9 });
  assertEquals(strict, []);
  const capped = await ancestorCandidates(sql, "vocab", top, { ...opts, cap: 1 });
  assertEquals(capped.length, 1);
});
