import { defineTool } from "eve/tools";
import type { QueryFn } from "../lib/runs.ts";
import { RETRIEVAL_VOCABULARIES, vocabQuery, vocabSchema } from "../lib/vocab.ts";
import { type Ctx, envGet, guarded, requireSql } from "../lib/ctx.ts";

export interface CodeLookup {
  code: string;
  found: boolean;
  concept?: { concept_id: number; concept_name: string; standard_concept: string | null; invalid_reason: string | null };
  /** Valid standard concepts in allowed vocabularies: the concept itself if standard, else its "Maps to" targets. */
  targets: Array<{ concept_id: number; concept_name: string; vocabulary_id: string; domain_id: string }>;
}

const ph = (from: number, n: number) => Array.from({ length: n }, (_, i) => `$${from + i}`).join(", ");

export async function lookupSourceCodes(q: QueryFn, schema: string, vocabularyId: string, codes: string[]): Promise<CodeLookup[]> {
  const wanted = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
  if (wanted.length === 0) return [];
  const { rows: found } = await q(
    `SELECT concept_id, concept_code, concept_name, standard_concept, invalid_reason
       FROM ${schema}.concept WHERE vocabulary_id = $1 AND concept_code IN (${ph(2, wanted.length)})`,
    [vocabularyId, ...wanted],
  );
  type Found = { concept_id: number; concept_code: string; concept_name: string; standard_concept: string | null; invalid_reason: string | null };
  const byCode = new Map((found as Found[]).map((r) => [r.concept_code, r]));
  const ids = (found as Found[]).map((r) => Number(r.concept_id));
  const targets = new Map<number, CodeLookup["targets"]>();
  if (ids.length) {
    const v0 = ids.length + 1;
    const { rows } = await q(
      `SELECT s.concept_id AS source_id, t.concept_id, t.concept_name, t.vocabulary_id, t.domain_id
         FROM ${schema}.concept s
         LEFT JOIN ${schema}.concept_relationship r
           ON r.concept_id_1 = s.concept_id AND r.relationship_id = 'Maps to' AND r.invalid_reason IS NULL
         JOIN ${schema}.concept t
           ON t.concept_id = CASE WHEN s.standard_concept = 'S' THEN s.concept_id ELSE r.concept_id_2 END
        WHERE s.concept_id IN (${ph(1, ids.length)})
          AND t.standard_concept = 'S' AND t.invalid_reason IS NULL
          AND t.vocabulary_id IN (${ph(v0, RETRIEVAL_VOCABULARIES.length)})
        ORDER BY s.concept_id, t.concept_id`,
      [...ids, ...RETRIEVAL_VOCABULARIES],
    );
    for (const r of rows as Array<{ source_id: number; concept_id: number; concept_name: string; vocabulary_id: string; domain_id: string }>) {
      const list = targets.get(Number(r.source_id)) ?? [];
      if (!list.some((t) => t.concept_id === Number(r.concept_id))) {
        list.push({ concept_id: Number(r.concept_id), concept_name: r.concept_name, vocabulary_id: r.vocabulary_id, domain_id: r.domain_id });
      }
      targets.set(Number(r.source_id), list);
    }
  }
  return wanted.map((code) => {
    const c = byCode.get(code);
    if (!c) return { code, found: false, targets: [] };
    return {
      code,
      found: true,
      concept: {
        concept_id: Number(c.concept_id),
        concept_name: c.concept_name,
        standard_concept: c.standard_concept,
        invalid_reason: c.invalid_reason,
      },
      targets: targets.get(Number(c.concept_id)) ?? [],
    };
  });
}

export default defineTool({
  description:
    "Look up source codes directly in a vocabulary that Athena contains (e.g. CPT4, HCPCS, ICD10PCS, ICD9Proc, OPCS4, " +
    "SNOMED, LOINC) when phase 1 identified the source as using it. Returns each code's concept and its valid standard " +
    "targets (the concept itself if standard, else its 'Maps to' targets). Add the targets to the candidates you judge.",
  inputSchema: {
    type: "object",
    properties: {
      vocabulary_id: { type: "string", description: "Athena vocabulary_id, e.g. ICD10PCS." },
      codes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 50 },
    },
    required: ["vocabulary_id", "codes"],
  },
  execute: (input, ctx?: Ctx) =>
    guarded(async () => {
      const { vocabulary_id, codes } = input as { vocabulary_id: string; codes: string[] };
      return { results: await lookupSourceCodes(vocabQuery(envGet, requireSql(ctx)), vocabSchema(envGet), vocabulary_id, codes) };
    }),
});
