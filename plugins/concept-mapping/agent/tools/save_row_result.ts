import { defineTool } from "eve/tools";
import type { RowResult } from "../lib/csv.ts";
import { assertRunInSession, markUnmapped, saveRowResult } from "../lib/runs.ts";
import { checkMappable, vocabQuery, vocabSchema } from "../lib/vocab.ts";
import { type Ctx, envGet, guarded, requireSession, requireSql } from "../lib/ctx.ts";

interface Input {
  run_id: string;
  row_index: number;
  target_concept_id?: number;
  target_concept_name?: string;
  alternative_target_concept_id?: number;
  alternative_target_concept_name?: string;
  predicate?: string;
  vote_agreement?: number;
  retrieval_confidence?: RowResult["retrievalConfidence"];
  phase?: 4 | 5;
  rationale?: string;
  unmapped_reason?: string;
}

export default defineTool({
  description:
    "Save the final mapping for one row of a run. The target (and the alternative, if given) must be a valid standard " +
    "concept from an allowed vocabulary whose name matches the vocabulary; otherwise nothing is saved and `reason` says " +
    "what is wrong, so you can pick again. Only when no candidate exists at all (even after wide retrieval), pass " +
    "`unmapped_reason` instead of a target to close the row as unmapped.",
  inputSchema: {
    type: "object",
    properties: {
      run_id: { type: "string" },
      row_index: { type: "integer" },
      target_concept_id: { type: "integer" },
      target_concept_name: { type: "string" },
      alternative_target_concept_id: { type: "integer" },
      alternative_target_concept_name: { type: "string" },
      predicate: { type: "string", enum: ["exactMatch", "broadMatch"] },
      vote_agreement: { type: "integer", minimum: 0, maximum: 5, description: "Judges agreeing with the target (0 if not voted)." },
      retrieval_confidence: { type: "string", enum: ["high", "medium", "low"] },
      phase: { type: "integer", enum: [4, 5], description: "4 = decided by the vote, 5 = decided by low-confidence re-evaluation." },
      rationale: { type: "string" },
      unmapped_reason: { type: "string", description: "Use instead of a target only when there is no candidate at all." },
    },
    required: ["run_id", "row_index"],
  },
  execute: (input, ctx?: Ctx) =>
    guarded(async () => {
      const i = input as Input;
      const sql = requireSql(ctx);
      await assertRunInSession(sql, i.run_id, requireSession(ctx));
      if (i.target_concept_id === undefined) {
        if (!i.unmapped_reason?.trim()) {
          return { saved: false, reason: "pass target_concept_id (with name and predicate) or unmapped_reason" };
        }
        await markUnmapped(sql, i.run_id, i.row_index, i.unmapped_reason.trim());
        return { saved: true, unmapped: true };
      }
      if (i.predicate !== "exactMatch" && i.predicate !== "broadMatch") {
        return { saved: false, reason: `predicate must be exactMatch or broadMatch, got ${JSON.stringify(i.predicate)}` };
      }
      const q = vocabQuery(envGet, sql);
      const schema = vocabSchema(envGet);
      const target = await checkMappable(q, schema, i.target_concept_id, i.target_concept_name ?? "");
      if (!target.ok) return { saved: false, reason: `target ${i.target_concept_id}: ${target.reason}` };
      let alternativeName: string | undefined;
      if (i.alternative_target_concept_id !== undefined) {
        const alt = await checkMappable(q, schema, i.alternative_target_concept_id, i.alternative_target_concept_name ?? "");
        if (!alt.ok) return { saved: false, reason: `alternative ${i.alternative_target_concept_id}: ${alt.reason}` };
        alternativeName = alt.concept.conceptName;
      }
      await saveRowResult(sql, i.run_id, i.row_index, {
        targetConceptId: target.concept.conceptId,
        targetConceptName: target.concept.conceptName,
        alternativeTargetConceptId: i.alternative_target_concept_id,
        alternativeTargetConceptName: alternativeName,
        predicate: i.predicate,
        voteAgreement: i.vote_agreement ?? 0,
        retrievalConfidence: i.retrieval_confidence ?? "medium",
        phase: i.phase ?? 4,
        rationale: i.rationale ?? "",
      });
      return { saved: true, target_concept_name: target.concept.conceptName };
    }),
});
