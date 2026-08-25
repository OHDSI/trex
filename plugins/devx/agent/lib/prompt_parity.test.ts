// The eve loop and the legacy loop must produce the same prompt for the same
// mode. Legacy is NOT being retired -- claude-code (sidecar) and IAM-shaped
// bedrock users live there permanently (see useEffectiveLoop.ts) -- so this is
// an ongoing invariant, not a migration check.
import { assert, assertEquals } from "jsr:@std/assert";
import { buildInstructions } from "../agent.ts";
import { buildCoderContext } from "../../functions/coder_context.ts";

const SKILLS = [
  { name: "brainstorming", description: "Explore an idea before building it" },
  { name: "writing-plans", description: "Turn a spec into an implementation plan" },
];

function fakeCtx(metadata: unknown) {
  return {
    sessionId: "s1",
    userId: "u1",
    metadata,
    env: () => undefined,
    sql: (q: string) => {
      if (q.includes("devx.skills")) return Promise.resolve({ rows: SKILLS });
      return Promise.resolve({ rows: [] });
    },
  } as any;
}

Deno.test("plan mode gets the plan prompt, not the agent prompt", async () => {
  const planPrompt = await buildInstructions("BASE", fakeCtx({ mode: "plan" }));
  const legacy = await buildCoderContext({
    mode: "plan",
    remoteChannel: false,
    askToolAvailable: false,
    settings: { max_steps: undefined },
    skills: SKILLS,
  });
  assertEquals(planPrompt, legacy.systemPrompt);
});

Deno.test("an unset mode still resolves to the agent prompt", async () => {
  const p = await buildInstructions("BASE", fakeCtx({}));
  const legacy = await buildCoderContext({
    mode: "agent",
    remoteChannel: false,
    askToolAvailable: false,
    settings: { max_steps: undefined },
    skills: SKILLS,
  });
  assertEquals(p, legacy.systemPrompt);
});

Deno.test("every enabled skill is named in the prompt", async () => {
  const p = await buildInstructions("BASE", fakeCtx({ mode: "plan" }));
  for (const s of SKILLS) {
    assert(p.includes(s.name), `prompt never names skill "${s.name}"`);
    assert(p.includes(s.description), `prompt never describes skill "${s.name}"`);
  }
});

// SKILL_USAGE_RULE tells the model "The skills above are real and invocable".
// That sentence must have something above it to refer to.
Deno.test("the skills listing precedes the rule that references it", async () => {
  const p = await buildInstructions("BASE", fakeCtx({ mode: "agent" }));
  const listingAt = p.indexOf("brainstorming");
  const ruleAt = p.indexOf("The skills above are real");
  assert(listingAt >= 0, "no skills listing in the prompt");
  assert(ruleAt >= 0, "SKILL_USAGE_RULE missing from the prompt");
  assert(listingAt < ruleAt, "the listing must come before the rule that says 'above'");
});
