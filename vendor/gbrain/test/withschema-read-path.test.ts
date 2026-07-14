/**
 * Task 7b: proves the READ path (searchKeyword) — and other raw
 * `this.sql.begin(...)` sites — work when dispatched inside `withSchema`.
 *
 * Task 7 fixed `transaction()` and `setPageAliases()` for the
 * `this.sql.begin is not a function` bug (postgres.js exposes `.savepoint()`,
 * not `.begin()`, on a tx-scoped `sql`). But `searchKeyword`,
 * `searchKeywordChunks`, `searchVector`, `insertFact`, `insertFacts`, and
 * `supersedeTake` still called `this.sql.begin(...)` directly. Since EVERY
 * multi-tenant MCP call runs inside `engine.withSchema(...)` (so `this.sql`
 * is already a tx), the first `search`/`query` against a memory would throw
 * before Task 7b's fix routed all of these through the shared
 * `beginOrSavepoint()` helper.
 *
 * Gated by GBRAIN_TEST_DATABASE_URL — the bug only reproduces against a real
 * postgres.js tx-scoped `sql` (PGLite has no `.begin`/`.savepoint`
 * distinction to get wrong).
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
  await engine.provisionSchema('rp_test');
});
afterAll(async () => { if (URL) await engine.disconnect(); });

maybe('put_page + searchKeyword both run inside withSchema without "sql.begin is not a function"', async () => {
  // Write path (Task 7's fix): put_page dispatched through withSchema. Degrades
  // gracefully with no embedding provider configured (noEmbed, see
  // multi-tenant-isolation.test.ts's comment) — page/chunks/triggers still run.
  const put = await engine.withSchema('memory_rp_test', (scoped) =>
    dispatchToolCall(scoped, 'put_page', { slug: 'readpath-fixture', content: '# readpath-fixture\nthe quokka guards the archive' }, { schema: 'memory_rp_test', sourceId: 'default' }));
  expect(put.isError).toBeFalsy();

  // Read path (Task 7b's fix): searchKeyword is a raw full-text search —
  // needs no embedding — and (pre-fix) called `this.sql.begin(...)` directly
  // at postgres-engine.ts ~L1842, unguarded. Dispatched inside withSchema,
  // `this.sql` there is the withSchema tx, so a raw `.begin()` call throws
  // `TypeError: sql.begin is not a function` there. Asserting this resolves
  // (not throws) is the crux of this test.
  const results = await engine.withSchema('memory_rp_test', (e) => e.searchKeyword('quokka archive'));
  expect(Array.isArray(results)).toBe(true);
  expect(results.some(r => r.slug === 'readpath-fixture')).toBe(true);

  // Also exercise the `query` op's dispatch path (routes through hybridSearch,
  // which calls searchKeyword/searchVector internally) to prove the fix holds
  // for the actual MCP-facing tool, not just the bare engine method.
  const queryResult = await engine.withSchema('memory_rp_test', (e) =>
    dispatchToolCall(e, 'query', { query: 'quokka archive', expand: false }, { schema: 'memory_rp_test', sourceId: 'default' }));
  expect(queryResult.isError).toBeFalsy();
});
