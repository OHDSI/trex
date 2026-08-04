import { test, expect } from 'bun:test';
import { PostgresEngine } from '../src/core/postgres-engine.ts';

const URL = process.env.GBRAIN_TEST_DATABASE_URL;
const maybe = URL ? test : test.skip;

maybe('withSchema pins search_path for the duration of fn', async () => {
  const engine = new PostgresEngine();
  await engine.connect({ engine: 'postgres', database_url: URL! });
  await engine.executeRaw('CREATE SCHEMA IF NOT EXISTS memory_wstest');
  const got = await engine.withSchema('memory_wstest', async (e) => {
    const rows = await e.executeRaw<{ sp: string }>('SELECT current_schema() AS sp');
    return rows[0].sp;
  });
  expect(got).toBe('memory_wstest');
  await engine.disconnect();
});
