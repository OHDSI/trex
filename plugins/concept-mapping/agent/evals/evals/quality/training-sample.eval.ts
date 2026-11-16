import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { parseCsvRecords, SUBMISSION_HEADER } from "../../../lib/csv.ts";
import { type GoldRow, score } from "../../score.ts";

// Maps a sample of a gold-standard set as a CSV run and scores the export.
// The gold file is supplied by the operator (nothing is bundled): a CSV in
// the submission format, EVAL_GOLD_CSV=<path>; EVAL_SAMPLE_ROWS limits the
// sample (default 12). If the same rows are also configured as judge
// examples, the score is optimistic.
// deno-lint-ignore no-explicit-any
const env = (globalThis as any).process?.env ?? {};
// deno-lint-ignore no-explicit-any
const fs = await import("node:fs") as any;

function loadGold(): { csv: string; gold: GoldRow[] } {
  const records = parseCsvRecords(fs.readFileSync(env.EVAL_GOLD_CSV, "utf8"));
  const header = records[0];
  const at = (r: string[], c: string) => r[header.indexOf(c)] ?? "";
  const rows = records.slice(1, 1 + Number(env.EVAL_SAMPLE_ROWS ?? 12));
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
  const cols = ["source_data_identifier", "source_code", "original_source_name", "source_name"];
  return {
    csv: [cols.join(","), ...rows.map((r) => cols.map((c) => q(at(r, c))).join(","))].join("\n"),
    gold: rows.map((r) => ({
      source_data_identifier: at(r, "source_data_identifier"),
      source_code: at(r, "source_code"),
      accepted: [at(r, "target_concept_id"), at(r, "alternative_target_concept_id")].map(Number).filter((n) => n > 0),
    })),
  };
}

export default defineEval({
  description: "maps a gold-standard sample with at least 60% agreement (needs EVAL_GOLD_CSV)",
  async test(t) {
    if (!env.EVAL_GOLD_CSV) throw new Error("set EVAL_GOLD_CSV to a gold-standard CSV in the submission format");
    const { csv, gold } = loadGold();
    await t.send(`Map this CSV. When the run is complete, reply with only the export CSV.\n\n${csv}`);
    for (let i = 0; i < 6 && !String(t.reply).includes(SUBMISSION_HEADER); i++) await t.send("continue");
    t.succeeded();
    t.calledTool("start_run");
    t.calledTool("export_run");
    const result = score(String(t.reply), gold);
    t.check(result.accuracy, satisfies((v) => Number(v) >= 0.6, `accuracy ${result.correct}/${result.n} >= 0.6`));
  },
});
