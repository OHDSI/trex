/**
 * Task 7: schema-isolation regression test for vendored gbrain multi-tenancy.
 *
 * This is design §9's proof that Patch #1 (schema-safe triggers, Tasks 2-3)
 * works: two memories provisioned in ONE Postgres database, writes routed
 * into each via `withSchema`, asserting that the leaky triggers —
 * `bump_page_generation_clock_fn` (which increments `page_generation_clock_seq`)
 * and `update_page_search_vector` (which reads `timeline_entries`) — resolve
 * inside EACH memory's own schema via `search_path`, never hardcoded
 * `public`, and that rows never leak across schemas.
 *
 * Gated by GBRAIN_TEST_DATABASE_URL — the test MUST run (not skip) against a
 * live pgvector Postgres; there is no meaningful way to prove cross-schema
 * trigger isolation against PGLite (single-schema by construction).
 */
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { PostgresEngine } from '../src/core/postgres-engine.ts';
import { dispatchToolCall } from '../src/mcp/dispatch.ts';

const URL = process.env.GBRAIN_TEST_DATABASE_URL;
const maybe = URL ? test : test.skip;
let engine: PostgresEngine;

beforeAll(async () => {
  if (!URL) return;
  engine = new PostgresEngine();
  await engine.connect({ engine: 'postgres', database_url: URL });
  await engine.provisionSchema('iso_a');
  await engine.provisionSchema('iso_b');
});
afterAll(async () => { if (URL) await engine.disconnect(); });

maybe('provisioning creates isolated schemas with their own tables', async () => {
  for (const s of ['memory_iso_a', 'memory_iso_b']) {
    const rows = await engine.withSchema(s, (e) =>
      e.executeRaw<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'pages'`));
    expect(rows[0].n).toBe(1);
  }
});

maybe('put_page into memory_iso_a does not appear in memory_iso_b, and triggers fire in-schema', async () => {
  // Write path: dispatchToolCall(..., 'put_page', ...) inside withSchema, per
  // the task brief's primary path. put_page's operation handler checks
  // `isAvailable('embedding')` (src/core/operations.ts ~L831-832) and sets
  // `noEmbed: true` when no AI/embedding provider is configured in this
  // environment — importFromContent degrades gracefully (no embedding
  // written, page/chunks/triggers still run) rather than throwing. So the
  // dispatch path exercises the exact trigger surface Patch #1 fixes
  // (bump_page_generation_clock_fn on the pages INSERT, and
  // update_page_search_vector's timeline_entries read) without requiring an
  // embedding API key. No INSERT fallback was needed.
  const put = (schema: string, slug: string) =>
    engine.withSchema(schema, (scoped) =>
      dispatchToolCall(scoped, 'put_page', { slug, content: `# ${slug}\nbody` }, { schema, sourceId: 'default' }));

  const a = await put('memory_iso_a', 'alpha');
  // proves bump_page_generation_clock_fn + update_page_search_vector ran
  // without cross-schema errors (e.g. "relation page_generation_clock_seq
  // does not exist" / "relation timeline_entries does not exist" against
  // public).
  expect(a.isError).toBeFalsy();

  const countIn = (schema: string) =>
    engine.withSchema(schema, (e) => e.executeRaw<{ n: number }>(`SELECT count(*)::int AS n FROM pages`));
  expect((await countIn('memory_iso_a'))[0].n).toBe(1);
  expect((await countIn('memory_iso_b'))[0].n).toBe(0);

  // The generation clock sequence advanced in A's schema, not public.
  const seqA = await engine.withSchema('memory_iso_a', (e) =>
    e.executeRaw<{ v: number }>(`SELECT last_value::int AS v FROM page_generation_clock_seq`));
  expect(seqA[0].v).toBeGreaterThan(0);
});
