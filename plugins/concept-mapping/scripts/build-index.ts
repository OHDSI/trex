// Builds the concept-mapper's local hybrid search index in the vocabulary
// database: full-text terms for every standard concept name, English synonym
// and mapped source name, then (unless --lexical-only) embeddings for dense
// search, then the vector index. Safe to re-run: existing terms are kept and
// only missing embeddings are computed, so an interrupted run resumes.
//
//   deno run -A --no-config --import-map plugins/concept-mapping/importmap.json \
//     plugins/concept-mapping/scripts/build-index.ts [--lexical-only] [--dims 1024] [--batch 256]
//
// Env: CONCEPT_MAPPING_VOCAB_DATABASE_URL (or DATABASE_URL),
// CONCEPT_MAPPING_VOCAB_SCHEMA (default vocab), CONCEPT_MAPPING_INDEX_SCHEMA
// (default concept_mapping_search), CONCEPT_MAPPING_EMBEDDING_MODEL plus that
// provider's credentials. The agent must use the same embedding model.
import pg from "pg";
import { resolveEmbedder } from "../agent/lib/embeddings.ts";
import { buildIndex, createVectorIndex, embedPending, indexSchema, indexStatus } from "../agent/lib/searchindex.ts";
import { type Env, vocabSchema } from "../agent/lib/vocab.ts";

export interface Args {
  embed: boolean;
  dims: number;
  batch: number;
  model: string;
}

export function parseArgs(argv: string[], env: Env): Args {
  const value = (flag: string, dflt: number) => {
    const i = argv.indexOf(flag);
    if (i === -1) return dflt;
    const n = Number(argv[i + 1]);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} needs a positive integer`);
    return n;
  };
  const embed = !argv.includes("--lexical-only");
  const model = embed ? env("CONCEPT_MAPPING_EMBEDDING_MODEL")?.trim() ?? "" : "";
  if (embed && !model) throw new Error("set CONCEPT_MAPPING_EMBEDDING_MODEL or pass --lexical-only");
  return { embed, dims: value("--dims", 1024), batch: value("--batch", 256), model };
}

async function main() {
  const env: Env = (k) => Deno.env.get(k);
  const args = parseArgs(Deno.args, env);
  const url = env("CONCEPT_MAPPING_VOCAB_DATABASE_URL") || env("DATABASE_URL");
  if (!url) throw new Error("set CONCEPT_MAPPING_VOCAB_DATABASE_URL or DATABASE_URL");
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const q = async (sql: string, params?: unknown[]) => ({ rows: (await pool.query(sql, params ?? [])).rows });
  const v = vocabSchema(env);
  const x = indexSchema(env);
  try {
    console.log(`building terms in ${x} from ${v} ...`);
    const terms = await buildIndex(q, { vocabSchema: v, indexSchema: x, dims: args.dims, model: args.model });
    console.log(`${terms} terms`);
    if (args.embed) {
      const embed = await resolveEmbedder(args.model, env, args.dims);
      const before = (await indexStatus(q, x)).embedded;
      const t0 = Date.now();
      await embedPending(q, x, embed, args.batch, (n) => {
        const rate = n / ((Date.now() - t0) / 1000);
        console.log(`embedded ${before + n}/${terms} (${rate.toFixed(0)}/s)`);
      });
      console.log("creating vector index ...");
      await createVectorIndex(q, x);
    }
    console.log(JSON.stringify(await indexStatus(q, x)));
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    Deno.exit(1);
  }
}
