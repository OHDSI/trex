import { test, expect } from 'bun:test';
import { parseMemoryPath } from '../src/core/multi-tenant.ts';

test('parses /memory/<name>/mcp', () => {
  expect(parseMemoryPath('/memory/research/mcp')).toEqual({ name: 'research', schema: 'memory_research', rest: '/mcp' });
});
test('rejects bad names', () => {
  expect(parseMemoryPath('/memory/Bad Name/mcp')).toBeNull();
  expect(parseMemoryPath('/memory//mcp')).toBeNull();
});
test('ignores non-memory paths', () => {
  expect(parseMemoryPath('/mcp')).toBeNull();
  expect(parseMemoryPath('/health')).toBeNull();
});
test('rejects hyphenated names (schema idents are hyphen-free)', () => {
  expect(parseMemoryPath('/memory/foo-bar/mcp')).toBeNull();
});
