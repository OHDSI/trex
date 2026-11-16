import { defineTool } from "eve/tools";
import { conceptRefIds, renderConceptRefs } from "../lib/conceptrefs.ts";
import { examplesFor, type GoldExample, loadExamples } from "../lib/fewshot.ts";
import { resolveConceptMappingModel } from "../lib/model.ts";
import { seededPermutations } from "../lib/shuffle.ts";
import { majorityVote, type VoteResult } from "../lib/votes.ts";
import { type ConceptDetails, conceptDetails, vocabQuery, vocabSchema } from "../lib/vocab.ts";
import { type Ctx, envGet, guarded, requireSql } from "../lib/ctx.ts";

// Self-consistency judging: N independent model calls, each seeing the same
// candidates in a different order plus the institution's gold examples, then
// a majority vote. Run as parallel model calls inside one tool (not as
// subagents) because trex caps subagent spawns per session.

export interface JudgeRow {
  source_data_identifier: string;
  source_code: string;
  original_source_name: string;
  source_name: string;
}

export interface Candidate {
  concept_id: number;
  concept_name: string;
  [k: string]: unknown;
}

export interface JudgeInput {
  row: JudgeRow;
  candidates: Candidate[];
  coding_system?: string;
  judges?: number;
}

export interface JudgeVote {
  judge: number;
  concept_id: number | null;
  predicate: string | null;
  alternative_target_concept_id?: number | null;
  confidence?: string;
  definition?: string;
  error?: string;
}

export interface JudgeDeps {
  generate: (system: string, prompt: string, signal: AbortSignal) => Promise<string>;
  details: (ids: number[]) => Promise<ConceptDetails[]>;
  /** Deployment-supplied calibration examples (default: CONCEPT_MAPPING_EXAMPLES_FILE). */
  examples?: GoldExample[];
  /** Per judge call; default 3 minutes. */
  timeoutMs?: number;
}

const DEFAULT_JUDGE_TIMEOUT_MS = 180_000;

async function withTimeout(
  run: (signal: AbortSignal) => Promise<string>,
  ms: number,
): Promise<string> {
  const ctrl = new AbortController();
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error(`judge call timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
  });
  try {
    return await Promise.race([run(ctrl.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const JUDGE_PROMPT = new URL("../prompts/judge.md", import.meta.url);
let judgeTemplate: string | undefined;
// Names for the prompt's concept references and the examples' targets. The
// vocabulary doesn't change while a worker runs, so each id is looked up once.
const refNames = new Map<number, string>();

/** The last top-level JSON object in a reply (fenced or bare), or null. */
export function parseJudgeReply(text: string): Record<string, unknown> | null {
  const ends: number[] = [];
  for (let i = text.length - 1; i >= 0; i--) if (text[i] === "}") ends.push(i);
  for (const end of ends) {
    let depth = 0;
    for (let i = end; i >= 0; i--) {
      if (text[i] === "}") depth++;
      else if (text[i] === "{") depth--;
      if (depth === 0) {
        try {
          const v = JSON.parse(text.slice(i, end + 1));
          if (v && typeof v === "object" && "target_concept_id" in v) return v;
        } catch { /* keep scanning */ }
        break;
      }
    }
  }
  return null;
}

/**
 * Shared, cacheable part: the judge rules plus the institution's gold
 * examples, with concept names filled in from the deployment's vocabulary.
 * Byte-identical for every judge and every row of an institution, so the
 * provider's prompt cache serves it after the first call.
 */
function buildSystem(
  rules: string,
  shots: { matchedInstitution: boolean; examples: GoldExample[] },
  names: Map<number, string>,
): string {
  if (shots.examples.length === 0) return rules;
  const examples = shots.examples.map((e) => ({ ...e, target_concept_name: names.get(e.target_concept_id) }));
  return [
    rules,
    `## Gold examples (${shots.matchedInstitution ? "this institution" : "all institutions"})`,
    JSON.stringify(examples, null, 1),
  ].join("\n\n");
}

/** Per-row part: the source row, its coding system and this judge's candidate order. */
function buildPrompt(input: JudgeInput, order: Candidate[], details: Map<number, ConceptDetails>): string {
  const candidates = order.map((c) => {
    const d = details.get(c.concept_id);
    return JSON.stringify({
      concept_id: c.concept_id,
      concept_name: c.concept_name,
      vocabulary_id: c.vocabulary_id ?? d?.vocabularyId,
      domain_id: c.domain_id ?? d?.domainId,
      concept_class_id: c.concept_class_id ?? d?.conceptClassId,
      sources: c.sources,
      synonyms: (d?.synonyms ?? []).slice(0, 8),
      parents: d?.parents ?? [],
      children: d?.children ?? [],
    });
  });
  return [
    "## Source row",
    JSON.stringify(input.row, null, 2),
    "## Coding system",
    input.coding_system?.trim() || "(not identified)",
    "## Candidates",
    candidates.join("\n"),
  ].join("\n\n");
}

async function oneJudge(i: number, system: string, prompt: string, ids: Set<number>, deps: JudgeDeps): Promise<JudgeVote> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string;
    try {
      text = await withTimeout((signal) => deps.generate(system, prompt, signal), deps.timeoutMs ?? DEFAULT_JUDGE_TIMEOUT_MS);
    } catch (e) {
      return { judge: i, concept_id: null, predicate: null, error: e instanceof Error ? e.message : String(e) };
    }
    const parsed = parseJudgeReply(text);
    if (!parsed) {
      lastError = "reply had no JSON verdict";
      continue;
    }
    const id = parsed.target_concept_id === null ? null : Number(parsed.target_concept_id);
    const vote: JudgeVote = {
      judge: i,
      concept_id: id,
      predicate: typeof parsed.predicate === "string" ? parsed.predicate : null,
      alternative_target_concept_id: parsed.alternative_target_concept_id ? Number(parsed.alternative_target_concept_id) : null,
      confidence: typeof parsed.confidence === "string" ? parsed.confidence : undefined,
      definition: typeof parsed.definition === "string" ? parsed.definition : undefined,
    };
    if (id !== null && !ids.has(id)) {
      return { ...vote, concept_id: null, predicate: null, error: `picked ${id}, which is not among the candidates` };
    }
    return vote;
  }
  return { judge: i, concept_id: null, predicate: null, error: lastError };
}

export async function judgeCandidates(
  input: JudgeInput,
  deps: JudgeDeps,
): Promise<{ result: VoteResult; votes: JudgeVote[] }> {
  judgeTemplate ??= await Deno.readTextFile(JUDGE_PROMPT);
  const shots = examplesFor(deps.examples ?? await loadExamples(envGet), input.row.source_data_identifier);
  const n = Math.min(Math.max(input.judges ?? 5, 1), 9);
  const ids = new Set(input.candidates.map((c) => Number(c.concept_id)));
  const missing = [...conceptRefIds(judgeTemplate), ...shots.examples.map((e) => e.target_concept_id)]
    .filter((id) => !refNames.has(id));
  const details = new Map((await deps.details([...ids, ...missing])).map((d) => [d.conceptId, d]));
  for (const id of missing) refNames.set(id, details.get(id)?.conceptName ?? `concept ${id}`);
  const system = buildSystem(renderConceptRefs(judgeTemplate, refNames), shots, refNames);
  const orders = seededPermutations(input.candidates, input.row.source_code, n);
  const votes = await Promise.all(
    orders.map((order, i) => oneJudge(i, system, buildPrompt(input, order, details), ids, deps)),
  );
  return { result: majorityVote(votes), votes };
}

export const JUDGE_CACHE_KEY = "concept-mapping-judge";

interface CacheHelpers {
  // deno-lint-ignore no-explicit-any
  withSystemCachePoint: (model: any, system: string) => unknown;
  // deno-lint-ignore no-explicit-any
  cacheProviderOptions: (model: any, key: string) => Record<string, unknown>;
}

/**
 * generateText arguments with prompt caching: a cache marker on the system
 * prompt for Anthropic and Anthropic-on-Bedrock, a stable cache key for
 * OpenAI's automatic caching, nothing for other providers (the runtime's own
 * helpers decide, exactly as for agent turns).
 */
export function generateArgs(
  // deno-lint-ignore no-explicit-any
  model: any,
  system: string,
  prompt: string,
  abortSignal: AbortSignal,
  h: CacheHelpers,
) {
  return {
    model,
    system: h.withSystemCachePoint(model, system),
    prompt,
    abortSignal,
    providerOptions: h.cacheProviderOptions(model, JUDGE_CACHE_KEY),
  };
}

async function defaultGenerate(): Promise<JudgeDeps["generate"]> {
  // Resolved lazily: only the staged worker has eve/core and the providers.
  const { generateText } = await import("ai");
  const core = await import("eve/core/service/model.ts");
  const modelString = envGet("CONCEPT_MAPPING_JUDGE_MODEL")?.trim() || resolveConceptMappingModel(envGet);
  const model = core.resolveModel(modelString);
  return async (system, prompt, abortSignal) =>
    // deno-lint-ignore no-explicit-any
    (await generateText(generateArgs(model, system, prompt, abortSignal, core) as any)).text;
}

export default defineTool({
  description:
    "Judge one row's retrieved candidates with five independent judges (each sees the candidates in a different order, " +
    "with the institution's gold examples and each candidate's synonyms, parents and children) and take a majority " +
    "vote. Returns the winning concept and predicate, the agreement (0-5), and each judge's vote and definition. " +
    "Pass the candidates exactly as retrieve_candidates returned them and the factual coding-system description.",
  inputSchema: {
    type: "object",
    properties: {
      row: {
        type: "object",
        properties: {
          source_data_identifier: { type: "string" },
          source_code: { type: "string" },
          original_source_name: { type: "string" },
          source_name: { type: "string" },
        },
        required: ["source_data_identifier", "source_code", "original_source_name", "source_name"],
      },
      candidates: { type: "array", items: { type: "object" }, minItems: 1, maxItems: 40 },
      coding_system: { type: "string", description: "1-2 factual sentences on the source coding system; no judgment hints." },
      judges: { type: "integer", minimum: 1, maximum: 9, description: "Default 5. Use 1 for low-confidence re-evaluation only if asked." },
    },
    required: ["row", "candidates"],
  },
  execute: (input, ctx?: Ctx) =>
    guarded(async () => {
      const sql = requireSql(ctx);
      const q = vocabQuery(envGet, sql);
      const schema = vocabSchema(envGet);
      return await judgeCandidates(input as JudgeInput, {
        generate: await defaultGenerate(),
        details: (ids) => conceptDetails(q, schema, ids),
      });
    }),
});
