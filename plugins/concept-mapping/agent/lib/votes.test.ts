import { assertEquals } from "jsr:@std/assert";
import { majorityVote } from "./votes.ts";

const v = (concept_id: number | null, predicate: string | null = "exactMatch") => ({ concept_id, predicate });

Deno.test("majority on concept, then on predicate among its voters", () => {
  assertEquals(
    majorityVote([v(1), v(1), v(1, "broadMatch"), v(2), v(null, null)]),
    { concept_id: 1, predicate: "exactMatch", agreement: 3, tie: false },
  );
});

Deno.test("a predicate tie resolves to broadMatch", () => {
  assertEquals(majorityVote([v(1), v(1, "broadMatch"), v(2)]).predicate, "broadMatch");
});

Deno.test("a concept tie is flagged and resolved by first-vote order", () => {
  assertEquals(
    majorityVote([v(2), v(1), v(1), v(2), v(null, null)]),
    { concept_id: 2, predicate: "exactMatch", agreement: 2, tie: true },
  );
});

Deno.test("all-null votes produce no winner", () => {
  assertEquals(majorityVote([v(null, null), v(null, null)]), { concept_id: null, predicate: null, agreement: 0, tie: false });
});
