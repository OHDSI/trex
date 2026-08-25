// The eve loop and the legacy loop must produce the same prompt for the same
// mode. Legacy is NOT being retired -- claude-code (sidecar) users live there
// permanently (see useEffectiveLoop.ts) -- so this is an ongoing invariant,
// not a migration check.
//
// Task 16 exception (same posture as the is_builtin skill-listing exception
// below): this loop's buildInstructions appends a fixed note steering the
// model toward ToolSearch for tools withheld by agent.ts's
// context.deferredTools (agent.ts's DEFERRED_TOOLS_NOTE). Legacy has no
// deferred-tool concept at all -- every legacy tool is always fully visible
// -- so its prompt never carries this suffix, and never can. Parity is
// checked on the SHARED spine (everything legacy also renders, via
// startsWith) plus a positive check that the loop-specific suffix is really
// there, rather than plain assertEquals.
import { assert } from "jsr:@std/assert";
import { buildInstructions } from "../agent.ts";
import { buildCoderContext } from "../../functions/coder_context.ts";

// is_builtin: true on both rows is load-bearing (R12). The eve loop lists
// only skills core's `skillTool` can actually resolve — the filesystem-synced
// built-ins — so prompt PARITY holds for built-in skills and deliberately
// does NOT for user-created ones. That divergence has its own coverage in
// build_instructions.test.ts; this file's job is the shared spine, which is
// only comparable on rows both loops render.
const SKILL_ROWS = [
  { name: "brainstorming", description: "Explore an idea before building it", is_builtin: true },
  { name: "writing-plans", description: "Turn a spec into an implementation plan", is_builtin: true },
];
const SKILLS = SKILL_ROWS.map((s) => ({ name: s.name, description: s.description }));

function fakeCtx(metadata: unknown) {
  return {
    sessionId: "s1",
    userId: "u1",
    metadata,
    env: () => undefined,
    sql: (q: string) => {
      if (q.includes("devx.skills")) return Promise.resolve({ rows: SKILL_ROWS });
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
  assert(planPrompt.startsWith(legacy.systemPrompt), "eve's prompt must carry legacy's spine verbatim as its prefix");
  assert(planPrompt.includes("ToolSearch to find and enable them"), "eve's prompt must append the deferred-tools note legacy has no equivalent of");
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
  assert(p.startsWith(legacy.systemPrompt), "eve's prompt must carry legacy's spine verbatim as its prefix");
  assert(p.includes("ToolSearch to find and enable them"), "eve's prompt must append the deferred-tools note legacy has no equivalent of");
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
