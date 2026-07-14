import { assertEquals, assertThrows } from "jsr:@std/assert";
import { mergeMemoryEntries, type SourceOwners } from "./memory-merge.ts";
import type { MemoryEntry } from "./memory.ts";

Deno.test("mergeMemoryEntries: two plugins, same memory, disjoint sources — merged", () => {
  const acc: MemoryEntry[] = [];
  const owners: SourceOwners = new Map();

  mergeMemoryEntries(acc, [
    { name: "research", sources: [{ name: "clinical-notes", dir: "pages/" }] },
  ], "plugin-a", owners);

  mergeMemoryEntries(acc, [
    { name: "research", sources: [{ name: "handbook", dir: "docs/" }] },
  ], "plugin-b", owners);

  assertEquals(acc.length, 1);
  assertEquals(acc[0].name, "research");
  assertEquals(acc[0].sources.map((s) => s.name).sort(), [
    "clinical-notes",
    "handbook",
  ]);
});

Deno.test("mergeMemoryEntries: two plugins, same memory, colliding source name — throws naming both plugins", () => {
  const acc: MemoryEntry[] = [];
  const owners: SourceOwners = new Map();

  mergeMemoryEntries(acc, [
    { name: "research", sources: [{ name: "handbook", dir: "docs/" }] },
  ], "plugin-a", owners);

  assertThrows(
    () =>
      mergeMemoryEntries(acc, [
        { name: "research", sources: [{ name: "handbook", dir: "other/" }] },
      ], "plugin-b", owners),
    Error,
    'source "handbook" already contributed by plugin "plugin-a"',
  );
});

Deno.test("mergeMemoryEntries: per-source pluginDir is preserved through merge", () => {
  const acc: MemoryEntry[] = [];
  const owners: SourceOwners = new Map();

  mergeMemoryEntries(acc, [
    {
      name: "research",
      sources: [
        { name: "clinical-notes", dir: "pages/", pluginDir: "/plugins/a" },
      ],
    },
  ], "plugin-a", owners);

  mergeMemoryEntries(acc, [
    {
      name: "research",
      sources: [{ name: "handbook", dir: "docs/", pluginDir: "/plugins/b" }],
    },
  ], "plugin-b", owners);

  const byName = Object.fromEntries(
    acc[0].sources.map((s) => [s.name, s.pluginDir]),
  );
  assertEquals(byName["clinical-notes"], "/plugins/a");
  assertEquals(byName["handbook"], "/plugins/b");
});

Deno.test("mergeMemoryEntries: distinct memory names never collide", () => {
  const acc: MemoryEntry[] = [];
  const owners: SourceOwners = new Map();

  mergeMemoryEntries(acc, [
    { name: "research", sources: [{ name: "handbook", dir: "docs/" }] },
  ], "plugin-a", owners);
  mergeMemoryEntries(acc, [
    { name: "support", sources: [{ name: "handbook", dir: "docs/" }] },
  ], "plugin-b", owners);

  assertEquals(acc.length, 2);
});

Deno.test("mergeMemoryEntries: same plugin re-registering the same source name also collides", () => {
  const acc: MemoryEntry[] = [];
  const owners: SourceOwners = new Map();

  mergeMemoryEntries(acc, [
    { name: "research", sources: [{ name: "handbook", dir: "docs/" }] },
  ], "plugin-a", owners);

  assertThrows(
    () =>
      mergeMemoryEntries(acc, [
        { name: "research", sources: [{ name: "handbook", dir: "docs2/" }] },
      ], "plugin-a", owners),
    Error,
  );
});
