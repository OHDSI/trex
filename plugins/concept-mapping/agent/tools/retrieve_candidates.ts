import { defineTool } from "eve/tools";
import { ancestorCandidates } from "../lib/ancestors.ts";
import { type Embedder, resolveEmbedder } from "../lib/embeddings.ts";
import { hecateSearch } from "../lib/hecate.ts";
import { denseSearch, indexSchema, indexStatus, type IndexStatus, lexicalSearch, normalizedMatch } from "../lib/searchindex.ts";
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
  /** Query embedder; default resolves CONCEPT_MAPPING_EMBEDDING_MODEL. */
  embed?: Embedder;
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
    /** For `ancestor` candidates: rank-weighted share of the top candidates below it. */
    support?: number;
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

  // Exact matching; with a local index also after normalization (formatting-tolerant).
  const exact: Concept[] = await verbatimMatch(q, schema, queries, limit);
  const idx = indexSchema(deps.env);
  if ((await cachedStatus(q, idx)).exists) {
    const seen = new Set(exact.map((c) => c.conceptId));
    for (const c of await normalizedMatch(q, schema, idx, queries, limit)) {
      if (!seen.has(c.conceptId)) exact.push(c);
    }
  }
  const lists: RankedList[] = [{ source: "verbatim", concepts: exact.slice(0, limit) }];

  let semanticError: string | undefined;
  const mode = (deps.env("CONCEPT_MAPPING_SEMANTIC_SEARCH")?.trim().toLowerCase() || "local");
  if (mode === "off") {
    semanticError = "semantic search disabled";
  } else if (mode === "hecate") {
    const r = await hecateLists(queries, limit, deps, sleep);
    semanticError = r.error;
    lists.push(...await localOnly(q, schema, r.lists));
  } else if (mode === "local") {
    const r = await localLists(queries, limit, deps, q, schema);
    semanticError = r.error;
    lists.push(...r.lists);
  } else {
    semanticError = `unknown CONCEPT_MAPPING_SEMANTIC_SEARCH ${JSON.stringify(mode)} (use local, hecate or off)`;
  }

  const fused: Fused[] = rrf(lists).slice(0, limit);
  const candidates: RetrieveOutput["candidates"] = fused.map((f, i) => ({
    rank: i + 1,
    concept_id: f.conceptId,
    concept_name: f.conceptName,
    vocabulary_id: f.vocabularyId,
    domain_id: f.domainId,
    concept_class_id: f.conceptClassId,
    sources: f.sources,
  }));
  if ((deps.env("CONCEPT_MAPPING_ANCESTOR_CANDIDATES")?.trim().toLowerCase() || "on") !== "off" && fused.length) {
    const num = (k: string, d: number) => {
      const v = Number(deps.env(k));
      return Number.isFinite(v) && deps.env(k)?.trim() ? v : d;
    };
    const ancestors = await ancestorCandidates(q, schema, fused.slice(0, 5).map((f, i) => ({ conceptId: f.conceptId, rank: i + 1 })), {
      maxLevels: num("CONCEPT_MAPPING_ANCESTOR_MAX_LEVELS", 2),
      minSupport: num("CONCEPT_MAPPING_ANCESTOR_MIN_SUPPORT", 0.3),
      cap: num("CONCEPT_MAPPING_ANCESTOR_CAP", 5),
      minDepth: num("CONCEPT_MAPPING_ANCESTOR_MIN_DEPTH", 3),
    });
    const seen = new Set(candidates.map((c) => c.concept_id));
    for (const a of ancestors) {
      if (seen.has(a.conceptId)) continue;
      candidates.push({
        rank: candidates.length + 1,
        concept_id: a.conceptId,
        concept_name: a.conceptName,
        vocabulary_id: a.vocabularyId,
        domain_id: a.domainId,
        concept_class_id: a.conceptClassId,
        sources: ["ancestor"],
        support: a.support,
      });
    }
  }
  return {
    candidates,
    // Without (complete) semantic search only an exact verbatim hit is trustworthy.
    retrieval_confidence: semanticError && !fused[0]?.sources.includes("verbatim") ? "low" : retrievalConfidence(fused),
    ...(semanticError ? { semantic_error: semanticError } : {}),
  };
}

async function hecateLists(
  queries: string[],
  limit: number,
  deps: RetrieveDeps,
  sleep: (ms: number) => Promise<void>,
): Promise<{ lists: RankedList[]; error?: string }> {
  const url = deps.env("HECATE_URL")?.trim();
  if (!url) return { lists: [], error: "CONCEPT_MAPPING_SEMANTIC_SEARCH=hecate but HECATE_URL is not set" };
  const lists: RankedList[] = [];
  for (const [i, query] of queries.entries()) {
    if (i > 0) await sleep(HECATE_DELAY_MS);
    try {
      lists.push({ source: `hecate:${query}`, concepts: await hecateSearch(url, query, limit, deps.fetchFn) });
    } catch (e) {
      // Fail fast: an unreachable service would otherwise cost the full
      // timeout for every remaining query.
      const skipped = queries.length - i - 1;
      return {
        lists,
        error: `${query}: ${e instanceof Error ? e.message : String(e)}` + (skipped ? `; skipped ${skipped} remaining queries` : ""),
      };
    }
  }
  return { lists };
}

/** Keeps only hits that exist as valid standard concepts in the local vocabulary, with local names. */
async function localOnly(q: QueryFn, schema: string, lists: RankedList[]): Promise<RankedList[]> {
  const local = new Map<number, Concept>(
    (await conceptsByIds(q, schema, lists.flatMap((l) => l.concepts.map((c) => c.conceptId))))
      .filter((c) => c.standardConcept === "S" && !c.invalidReason)
      .map((c) => [c.conceptId, c]),
  );
  return lists.map((l) => ({ source: l.source, concepts: l.concepts.flatMap((c) => local.has(c.conceptId) ? [local.get(c.conceptId)!] : []) }));
}

const STATUS_TTL_MS = 60_000;
// Per database connection and schema; a missing index is re-checked every call
// so a freshly built index is picked up without restarting the worker.
const statusCache = new WeakMap<QueryFn, Map<string, { at: number; status: IndexStatus }>>();

async function cachedStatus(q: QueryFn, idx: string): Promise<IndexStatus> {
  const perDb = statusCache.get(q) ?? new Map();
  statusCache.set(q, perDb);
  const hit = perDb.get(idx);
  if (hit && hit.status.exists && Date.now() - hit.at < STATUS_TTL_MS) return hit.status;
  const status = await indexStatus(q, idx);
  perDb.set(idx, { at: Date.now(), status });
  return status;
}

async function localLists(
  queries: string[],
  limit: number,
  deps: RetrieveDeps,
  q: QueryFn,
  schema: string,
): Promise<{ lists: RankedList[]; error?: string }> {
  const idx = indexSchema(deps.env);
  const status = await cachedStatus(q, idx);
  if (!status.exists || status.terms === 0) {
    return { lists: [], error: `local search index ${idx} is not built (run plugins/concept-mapping/scripts/build-index.ts)` };
  }
  const lists: RankedList[] = [];
  for (const query of queries) lists.push({ source: `lexical:${query}`, concepts: await lexicalSearch(q, schema, idx, query, limit) });

  const model = deps.env("CONCEPT_MAPPING_EMBEDDING_MODEL")?.trim();
  if (!model || status.embedded === 0) return { lists };
  if (status.model && status.model !== model) {
    return { lists, error: `dense search skipped: index was embedded with ${status.model}, not ${model}` };
  }
  try {
    const embed = deps.embed ?? await resolveEmbedder(model, deps.env, status.dims ?? 0);
    const vectors = await embed(queries);
    for (const [i, query] of queries.entries()) {
      lists.push({ source: `dense:${query}`, concepts: await denseSearch(q, schema, idx, vectors[i], limit) });
    }
    return { lists };
  } catch (e) {
    return { lists, error: `dense search failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export default defineTool({
  description:
    "Retrieve candidate standard concepts for one source term. Runs exact name/synonym matching (non-standard matches " +
    "are followed to their standard 'Maps to' target) and, per query, the configured search (local lexical + dense " +
    "index, or Hecate), then merges the lists by " +
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
