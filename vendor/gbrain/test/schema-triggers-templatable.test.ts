import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8');
const embedded = readFileSync(new URL('../src/core/schema-embedded.ts', import.meta.url), 'utf8');

test('leaky trigger headers are templatable', () => {
  for (const fn of ['bump_page_generation_clock_fn', 'update_page_search_vector']) {
    const re = new RegExp(`FUNCTION ${fn}\\(\\) RETURNS trigger SET search_path = __MEMORY_SEARCH_PATH__`);
    expect(schema).toMatch(re);
    expect(embedded).toMatch(re);
  }
});

test('safe trigger headers keep the static pin', () => {
  for (const fn of ['update_chunk_search_vector', 'notify_minion_job_change']) {
    const re = new RegExp(`FUNCTION ${fn}\\(\\) RETURNS (trigger|TRIGGER) SET search_path = pg_catalog, public`);
    expect(schema).toMatch(re);
  }
});

test('placeholder never leaks into a running DB literal', () => {
  // The placeholder must only appear in trigger headers, never elsewhere.
  const count = (schema.match(/__MEMORY_SEARCH_PATH__/g) || []).length;
  expect(count).toBe(2);
});
