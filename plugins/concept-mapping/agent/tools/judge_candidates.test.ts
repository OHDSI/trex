import { assert, assertEquals, assertMatch } from "jsr:@std/assert";
import { generateArgs, judgeCandidates, parseJudgeReply } from "./judge_candidates.ts";

const candidates = Array.from({ length: 6 }, (_, i) => ({ concept_id: 100 + i, concept_name: `Concept ${i}` }));
const row = { source_data_identifier: "hosp-a", source_code: "C1", original_source_name: "orig", source_name: "SOLO TALK THERAPY" };
const details = (ids: number[]) =>
  Promise.resolve(ids.map((id) => ({
    conceptId: id, conceptName: `Name ${id}`, vocabularyId: "SNOMED", domainId: "Procedure", conceptClassId: "Procedure",
    standardConcept: "S", invalidReason: null, synonyms: [], parents: [], children: [],
  })));
const examples = [
  { source_data_identifier: "hosp-a", source_code: "A1", original_source_name: "x", source_name: "Test scope of joint", target_concept_id: 9000301, predicate: "exactMatch" as const },
  { source_data_identifier: "hosp-b", source_code: "B1", original_source_name: "y", source_name: "Test scan of head", target_concept_id: 9000303, predicate: "broadMatch" as const },
];

const reply = (id: number | null, predicate: string | null) =>
  `Reasoning...\n\`\`\`json\n${JSON.stringify({ definition: "d", qualifiers_in_source: [], candidate_notes: [], target_concept_id: id, predicate, confidence: "high" })}\n\`\`\``;

Deno.test("parseJudgeReply reads the last JSON object, fenced or bare", () => {
  assertEquals(parseJudgeReply(reply(7, "exactMatch"))?.target_concept_id, 7);
  assertEquals(parseJudgeReply('text {"a":1} more {"target_concept_id": 9, "predicate": "broadMatch"}')?.target_concept_id, 9);
  assertEquals(parseJudgeReply("no json here"), null);
});

Deno.test("runs five independent judges, each with a different candidate order", async () => {
  const prompts: string[] = [];
  const out = await judgeCandidates({ row, candidates, coding_system: "Greek EOPYY code" }, {
    generate: (system, prompt) => {
      assertMatch(system, /# Judge/);
      prompts.push(prompt);
      return Promise.resolve(reply(101, "exactMatch"));
    },
    details,
  });
  assertEquals(prompts.length, 5);
  const firstIds = new Set(prompts.map((p) => p.match(/"concept_id":\s*(\d+)/)![1]));
  assert(firstIds.size >= 2, "candidate orders should differ between judges");
  assert(prompts.every((p) => p.includes("Greek EOPYY code")));
  assertEquals(out.result, { concept_id: 101, predicate: "exactMatch", agreement: 5, tie: false });
  assertEquals(out.votes.length, 5);
});

Deno.test("the institution's examples go in the shared system prompt with vocabulary names", async () => {
  let system = "";
  let prompt = "";
  await judgeCandidates({ row, candidates }, {
    generate: (sys, p) => {
      system = sys;
      prompt = p;
      return Promise.resolve(reply(101, "exactMatch"));
    },
    details,
    examples,
  });
  assert(system.includes('"target_concept_name": "Name 9000301"'), "example target named from the vocabulary");
  assert(!system.includes("hosp-b"), "other institutions' examples filtered out");
  assert(!prompt.includes("Test scope of joint"), "examples must not repeat in the per-row prompt");
});

Deno.test("concept references in the judge rules are rendered from the vocabulary", async () => {
  let system = "";
  await judgeCandidates({ row, candidates, judges: 1 }, {
    generate: (sys) => {
      system = sys;
      return Promise.resolve(reply(101, "exactMatch"));
    },
    details,
    examples: [],
  });
  assert(system.includes("Name 4088889 (4088889)"));
  assert(!system.includes("{{concept:"));
  assert(!system.includes("## Gold examples"), "no examples section without examples");
});

Deno.test("system prompt is byte-identical for every judge and every row of an institution (cacheable)", async () => {
  const systems = new Set<string>();
  const generate = (sys: string) => {
    systems.add(sys);
    return Promise.resolve(reply(101, "exactMatch"));
  };
  await judgeCandidates({ row, candidates }, { generate, details, examples });
  await judgeCandidates({ row: { ...row, source_code: "C2", source_name: "OTHER" }, candidates: candidates.slice(1), coding_system: "x" }, { generate, details, examples });
  assertEquals(systems.size, 1);
});

Deno.test("generateArgs marks the system prompt for caching and passes the cache key and abort signal", () => {
  const model = { provider: "anthropic.messages" };
  const signal = new AbortController().signal;
  const args = generateArgs(model, "SYSTEM", "PROMPT", signal, {
    withSystemCachePoint: (_m, sys) => ({ role: "system", content: sys, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } }),
    cacheProviderOptions: (_m, key) => ({ openai: { promptCacheKey: key } }),
  });
  assertEquals(args.system, { role: "system", content: "SYSTEM", providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } });
  assertEquals(args.prompt, "PROMPT");
  assertEquals(args.abortSignal, signal);
  assertEquals(args.providerOptions, { openai: { promptCacheKey: "concept-mapping-judge" } });
});

Deno.test("a malformed reply is retried once, then counted as an abstention", async () => {
  let calls = 0;
  const out = await judgeCandidates({ row, candidates, judges: 1 }, {
    generate: () => {
      calls++;
      return Promise.resolve("I could not decide");
    },
    details,
  });
  assertEquals(calls, 2);
  assertEquals(out.votes[0].concept_id, null);
  assertEquals(out.result.agreement, 0);
});

Deno.test("a pick outside the candidate list is discarded", async () => {
  const out = await judgeCandidates({ row, candidates, judges: 1 }, {
    generate: () => Promise.resolve(reply(999999, "exactMatch")),
    details,
  });
  assertEquals(out.votes[0].concept_id, null);
  assertMatch(out.votes[0].error ?? "", /not among the candidates/);
});

Deno.test("a judge call that throws counts as an abstention and reports the error", async () => {
  let n = 0;
  const out = await judgeCandidates({ row, candidates }, {
    generate: () => (n++ === 0 ? Promise.reject(new Error("rate limited")) : Promise.resolve(reply(102, "broadMatch"))),
    details,
  });
  assertEquals(out.result.concept_id, 102);
  assertEquals(out.result.agreement, 4);
  assert(out.votes.some((v) => (v.error ?? "").includes("rate limited")));
});

Deno.test("a judge call that never answers times out as an abstention", async () => {
  const out = await judgeCandidates({ row, candidates, judges: 1 }, {
    generate: () => new Promise<string>(() => {}),
    details,
    timeoutMs: 20,
  });
  assertEquals(out.votes[0].concept_id, null);
  assertMatch(out.votes[0].error ?? "", /timed out/);
});

Deno.test("judges see how each candidate matched and the support of ancestor candidates", async () => {
  let prompt = "";
  const cands = [
    { concept_id: 101, concept_name: "Concept 1", sources: ["lexical:x"], matched: { term: "src term", kind: "source", vocabulary: "ICD9Proc" } },
    { concept_id: 102, concept_name: "Concept 2", sources: ["ancestor"], support: 0.8 },
  ];
  await judgeCandidates({ row, candidates: cands, judges: 1 }, {
    generate: (_s, p) => {
      prompt = p;
      return Promise.resolve(reply(101, "exactMatch"));
    },
    details,
    examples: [],
  });
  assert(prompt.includes('"matched":{"term":"src term","kind":"source","vocabulary":"ICD9Proc"}'));
  assert(prompt.includes('"support":0.8'));
});
