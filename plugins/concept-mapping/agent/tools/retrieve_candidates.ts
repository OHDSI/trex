import { defineTool } from "eve/tools";
import { hecateSearch } from "../lib/hecate.ts";
import { type Fused, type RankedList, retrievalConfidence, rrf } from "../lib/rrf.ts";
import { type Concept, conceptsByIds, type Env, verbatimMatch, vocabQuery, vocabSchema } from "../lib/vocab.ts";
import type { QueryFn } from "../lib/runs.ts";
import { type Ctx, envGet, guarded, requireSql } from "../lib/ctx.ts";

export interface RetrieveInput {
  queries: string[];
  limit?: number;
}

export interface RetrieveDeps {
  sql: QueryFn;
  env: Env;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface RetrieveOutput {
  candidates: Array<{
    rank: number;
    concept_id: number;
    concept_name: string;
    vocabulary_id: string;
    domain_id: string;
    concept_class_id: string;
    sources: string[];
  }>;
  retrieval_confidence: "high" | "medium" | "low";
  semantic_error?: string;
}

const HECATE_DELAY_MS = 300;
const MAX_QUERIES = 12;

export async function retrieveCandidates(input: RetrieveInput, deps: RetrieveDeps): Promise<RetrieveOutput> {
  const queries = [...new Set(input.queries.map((q) => q.trim()).filter(Boolean))].slice(0, MAX_QUERIES);
  const limit = input.limit === 30 ? 30 : Math.min(Math.max(input.limit ?? 10, 1), 30);
  const q = vocabQuery(deps.env, deps.sql);
  const schema = vocabSchema(deps.env);
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  const lists: RankedList[] = [{ source: "verbatim", concepts: await verbatimMatch(q, schema, queries, limit) }];

  let semanticError: string | undefined;
  const hecateUrl = deps.env("HECATE_URL")?.trim();
  if (!hecateUrl || hecateUrl === "off") {
    semanticError = "semantic search disabled";
  } else {
    const semantic: RankedList[] = [];
    for (const [i, query] of queries.entries()) {
      if (i > 0) await sleep(HECATE_DELAY_MS);
      try {
        semantic.push({ source: `semantic:${query}`, concepts: await hecateSearch(hecateUrl, query, limit, deps.fetchFn) });
      } catch (e) {
        // Fail fast: an unreachable or timing-out service would otherwise
        // cost the full timeout for every remaining query.
        const skipped = queries.length - i - 1;
        semanticError = `${query}: ${e instanceof Error ? e.message : String(e)}` +
          (skipped ? `; skipped ${skipped} remaining queries` : "");
        break;
      }
    }
    // Keep only semantic hits that exist as valid standard concepts in the local vocabulary,
    // so every candidate is mappable and carries the local name.
    const ids = semantic.flatMap((l) => l.concepts.map((c) => c.conceptId));
    const local = new Map<number, Concept>(
      (await conceptsByIds(q, schema, ids))
        .filter((c) => c.standardConcept === "S" && !c.invalidReason)
        .map((c) => [c.conceptId, c]),
    );
    for (const l of semantic) {
      lists.push({ source: l.source, concepts: l.concepts.flatMap((c) => local.has(c.conceptId) ? [local.get(c.conceptId)!] : []) });
    }
  }

  const fused: Fused[] = rrf(lists).slice(0, limit);
  return {
    candidates: fused.map((f, i) => ({
      rank: i + 1,
      concept_id: f.conceptId,
      concept_name: f.conceptName,
      vocabulary_id: f.vocabularyId,
      domain_id: f.domainId,
      concept_class_id: f.conceptClassId,
      sources: f.sources,
    })),
    // Without (complete) semantic search only an exact verbatim hit is trustworthy.
    retrieval_confidence: semanticError && !fused[0]?.sources.includes("verbatim") ? "low" : retrievalConfidence(fused),
    ...(semanticError ? { semantic_error: semanticError } : {}),
  };
}

export default defineTool({
  description:
    "Retrieve candidate standard concepts for one source term. Runs exact name/synonym matching (non-standard matches " +
    "are followed to their standard 'Maps to' target) and semantic search for every query, then merges the lists by " +
    "reciprocal rank fusion. Pass the source name, the reformulated term and its synonyms as queries. Use limit 10 " +
    "normally and 30 for low-confidence re-retrieval. Returns retrieval_confidence (high/medium/low).",
  inputSchema: {
    type: "object",
    properties: {
      queries: { type: "array", items: { type: "string" }, minItems: 1, maxItems: MAX_QUERIES },
      limit: { type: "integer", enum: [10, 30] },
    },
    required: ["queries"],
  },
  execute: (input, ctx?: Ctx) =>
    guarded(() => retrieveCandidates(input as RetrieveInput, { sql: requireSql(ctx), env: envGet })),
});
