import { test, expect } from 'bun:test';
import { getPostgresSchema } from '../src/core/postgres-engine.ts';

test('default (no schema) pins triggers to public', () => {
  const sql = getPostgresSchema();
  expect(sql).toContain('SET search_path = pg_catalog, public AS $func$'); // bump fn
  expect(sql).not.toContain('__MEMORY_SEARCH_PATH__');
});

test('schema arg repoints trigger search_path', () => {
  const sql = getPostgresSchema(undefined, undefined, 'memory_research');
  expect(sql).toContain('SET search_path = pg_catalog, memory_research AS $func$');
  expect(sql).not.toContain('__MEMORY_SEARCH_PATH__');
  // Scoped to the specific converted trigger rather than a blanket substring
  // check: `bump_page_generation_fn` (no `_clock_`) is a distinct, intentionally
  // still-static-pinned trigger (see Task 2 / schema-triggers-templatable.test.ts)
  // that also ends in "pg_catalog, public AS $func$" — a bare substring check
  // would false-fail against it even though it's untouched by design.
  expect(sql).not.toContain(
    'bump_page_generation_clock_fn() RETURNS trigger SET search_path = pg_catalog, public',
  ); // no leaky pin remains on the converted trigger
});
