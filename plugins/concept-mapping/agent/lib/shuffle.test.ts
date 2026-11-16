import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import { seededPermutations } from "./shuffle.ts";

const items = Array.from({ length: 10 }, (_, i) => i);

Deno.test("the same seed gives the same permutations", () => {
  assertEquals(seededPermutations(items, "NGA10", 5), seededPermutations(items, "NGA10", 5));
});

Deno.test("permutation 0 is the original order and every permutation keeps all items", () => {
  const perms = seededPermutations(items, "NGA10", 5);
  assertEquals(perms.length, 5);
  assertEquals(perms[0], items);
  for (const p of perms) assertEquals([...p].sort((a, b) => a - b), items);
});

Deno.test("permutations put different candidates first", () => {
  const firsts = new Set(seededPermutations(items, "NGA10", 5).map((p) => p[0]));
  assertEquals(firsts.size >= 4, true);
});

Deno.test("different seeds give different orders", () => {
  assertNotEquals(seededPermutations(items, "A", 5)[1], seededPermutations(items, "B", 5)[1]);
});
