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
  expect(parseMemoryPath('/memory')).toBeNull();          // no name segment
  expect(parseMemoryPath('/notmemory/x/mcp')).toBeNull(); // unrelated prefix
});
test('rejects hyphenated names (schema idents are hyphen-free)', () => {
  expect(parseMemoryPath('/memory/foo-bar/mcp')).toBeNull();
});

test('allow-list gates provisioning/routing to declared memory names', () => {
  // Declared name, in the allow-list: matches through as before.
  expect(parseMemoryPath('/memory/research/mcp', new Set(['research']))).toEqual({
    name: 'research',
    schema: 'memory_research',
    rest: '/mcp',
  });
  // Undeclared name, not in the allow-list: null (falls through to 404), even
  // though the name is otherwise well-formed.
  expect(parseMemoryPath('/memory/research/mcp', new Set(['other']))).toBeNull();
  // No allow-list argument at all: back-compat, current (ungated) behavior.
  expect(parseMemoryPath('/memory/research/mcp')).toEqual({
    name: 'research',
    schema: 'memory_research',
    rest: '/mcp',
  });
});
