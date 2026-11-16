import { assertEquals } from "jsr:@std/assert";
import { hecateSearch } from "./hecate.ts";

Deno.test("hecateSearch calls search_standard and keeps only retrieval vocabularies", async () => {
  let called = "";
  const fetchFn = (url: string | URL | Request) => {
    called = String(url);
    return Promise.resolve(new Response(JSON.stringify([
      { score: 0.9, concepts: [
        { concept_id: 9000101, concept_name: "Keyhole removal of test organ", vocabulary_id: "SNOMED", domain_id: "Procedure", concept_class_id: "Procedure" },
        { concept_id: 9000103, concept_name: "Veterinary removal of test organ", vocabulary_id: "Nebraska Lexicon", domain_id: "Procedure" },
      ] },
      { score: 0.5, concepts: [
        { concept_id: 9000101, concept_name: "Keyhole removal of test organ", vocabulary_id: "SNOMED", domain_id: "Procedure" },
      ] },
    ])));
  };
  const out = await hecateSearch("https://h.example/", "keyhole removal", 30, fetchFn as typeof fetch);
  assertEquals(called, "https://h.example/api/search_standard?q=keyhole+removal&limit=30&standard_concept=S");
  assertEquals(out.map((c) => c.conceptId), [9000101]);
});

Deno.test("hecateSearch throws on a non-200 response", async () => {
  const fetchFn = () => Promise.resolve(new Response("nope", { status: 503 }));
  let msg = "";
  try {
    await hecateSearch("https://h.example", "x", 10, fetchFn as typeof fetch);
  } catch (e) {
    msg = (e as Error).message;
  }
  assertEquals(msg, "Hecate returned HTTP 503");
});
