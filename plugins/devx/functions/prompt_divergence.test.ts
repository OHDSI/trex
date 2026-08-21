// The four dispatch paths (claude-code agent, ai-sdk agent, copilot agent,
// and the raw-provider chat dispatch in index.ts) must not assemble prompts
// themselves. Before the shared coder context existed they each did, and
// drifted: the channel profile reached only claude-code, the skills and
// commit-hygiene rules only claude-code, and the component-selection
// sentence was worded three different ways. index.ts drifted the same way
// for the raw-provider (anthropic/google/bedrock/openai) build/ask turns
// until it was converted too. This test fails when a future edit
// reintroduces per-path assembly.
//
// Known gap (documented, not closed here — see task-4-report.md): a call
// site can still diverge at the point the prompt reaches the engine by
// interpolating past `buildCoderContext`'s result, e.g.
// `streamX(settings, history, send, systemPrompt + extra)`. That defeats
// all of the assertions below at once — nothing assigns to `systemPrompt`,
// `buildCoderContext(` is still present, and no direct construction occurs.
// This is deliberately not policed with a regex: a text scan cannot
// reliably distinguish that shape from legitimate uses of `+` near
// `systemPrompt` (e.g. inside comments or unrelated string building)
// without a real parser, and a false-positive-prone assertion here would
// be worse than the documented gap.
import { assertEquals } from "jsr:@std/assert";

const ENGINES = [
  "plugins/devx/functions/agent.ts",
  "plugins/devx/functions/claude_code_agent.ts",
  "plugins/devx/functions/copilot_agent.ts",
  "plugins/devx/functions/index.ts",
  "plugins/devx/agent/agent.ts",
];

Deno.test("no dispatch path mutates the system prompt after building the coder context", async () => {
  for (const path of ENGINES) {
    const src = await Deno.readTextFile(path);
    const mutations = src.split("\n").filter((l) =>
      /^\s*systemPrompt\s*(\+=|=[^=])/.test(l)
    );
    assertEquals(mutations, [], `${path} assembles the prompt itself; use buildCoderContext`);
  }
});

Deno.test("every dispatch path builds its context through the shared builder", async () => {
  for (const path of ENGINES) {
    const src = await Deno.readTextFile(path);
    assertEquals(src.includes("buildCoderContext("), true, `${path} does not call buildCoderContext`);
  }
});

Deno.test("no dispatch path constructs the base prompt directly", async () => {
  for (const path of ENGINES) {
    const src = await Deno.readTextFile(path);
    assertEquals(
      src.includes("constructSystemPrompt("), false,
      `${path} calls constructSystemPrompt directly; that belongs to coder_context.ts`,
    );
  }
});

// The ENGINES list above is a hardcoded allowlist of the *known* dispatch
// paths — it does nothing to stop a future fifth path from assembling its
// own base prompt and simply not being added to the list. That is exactly
// how index.ts escaped notice originally: it built its own prompt and was
// only caught by human review, not by a test. This scans every .ts file
// under plugins/devx (recursively) instead of a fixed list, so a new file
// that calls constructSystemPrompt() directly fails immediately without
// anyone remembering to update an allowlist. It only covers the "direct
// construction" class — mutation-after-build has no stable anchor to scan
// for outside the known dispatch files, so that stays on the per-file
// assertions above.
//
// Root is plugins/devx (not plugins/devx/functions): widened so a future
// direct constructSystemPrompt( call from plugins/devx/agent/ (the eve
// agents-loop runtime, a separate module tree from functions/) is caught
// too. plugins/devx/agent/agent.ts's buildInstructions now CALLS
// buildCoderContext rather than re-implementing constructSystemPrompt's
// dynamic parts by hand (see that file's buildInstructions header comment),
// so it is listed in ENGINES above like the other three dispatch paths and
// is policed the same way: no direct constructSystemPrompt( call, no
// post-build systemPrompt mutation, buildCoderContext( required.
//
// What is NOT closed, part 1 (maxSteps): eve's AgentConfig.maxSteps is read
// once at agent-definition time (runner.ts:118), not per turn, so unlike the
// other three engines this loop cannot thread settings.max_steps or the
// channel profile's maxStepsFloor through to buildCoderContext's maxSteps
// result — buildInstructions passes settings: { max_steps: undefined } for
// exactly this reason. Making that per-turn needs an override plumbed
// through the agents runner itself; that is out of scope here (see
// agent.ts's defineAgent call site for the full explanation).
//
// What is NOT closed, part 2 (a fifth dispatch path this file cannot see):
// a self-delegated subagent turn from plugins/devx/agent/agent.ts does not
// go through buildInstructions/buildCoderContext at all. The `agent`
// built-in tool (core/server/agents/service/toolset.ts) resolves to a copy
// of the calling agent when the model omits its `agent` argument — exactly
// the mode this loop's main coder chat runs in (useAgentsChat.ts sends
// mode: undefined) — and that nested turn's system prompt is built by
// runSubagent (toolset.ts:204) via the STATIC buildSystemPrompt(target,
// ctx.metadata), which never calls resolveInstructions and therefore never
// reaches agent.ts's buildInstructions hook or buildCoderContext. See
// agent.ts's defineAgent call site for the full explanation.
//
// The ENGINES list two tests up (and the recursive scan below) is NOT
// evidence this gap doesn't exist: both only read files under plugins/devx,
// and runSubagent's static prompt assembly lives in
// core/server/agents/service/toolset.ts — a different package this file
// never opens. A green run here means "the five known plugins/devx dispatch
// paths don't hand-roll a base prompt," not "every prompt this loop can
// produce goes through the shared contract."
const ROOT = "plugins/devx";
const CONSTRUCT_PROMPT_ALLOWED = new Set([
  `${ROOT}/functions/coder_context.ts`,
  `${ROOT}/functions/prompts.ts`,
]);

async function collectTsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    // ROOT is plugins/devx (an npm package), not plugins/devx/functions (which
    // had no node_modules) — skip it. Installed dependencies aren't ours to
    // fix, and a vendored .ts containing the literal "constructSystemPrompt("
    // would otherwise fail this guard with an offender nobody on the team can
    // act on. Un-installed here (278 files, ~13ms) but a real checkout with
    // deps installed is ~6,900 files — do not remove this.
    if (entry.isDirectory && entry.name === "node_modules") continue;
    if (entry.isDirectory) {
      out.push(...(await collectTsFiles(path)));
    } else if (entry.isFile && path.endsWith(".ts") && !path.endsWith(".test.ts")) {
      out.push(path);
    }
  }
  return out;
}

Deno.test("only coder_context.ts and prompts.ts may call constructSystemPrompt anywhere in the package", async () => {
  const files = await collectTsFiles(ROOT);
  const offenders: string[] = [];
  for (const path of files) {
    if (CONSTRUCT_PROMPT_ALLOWED.has(path)) continue;
    const src = await Deno.readTextFile(path);
    if (src.includes("constructSystemPrompt(")) {
      offenders.push(path);
    }
  }
  assertEquals(
    offenders,
    [],
    "only coder_context.ts and prompts.ts may call constructSystemPrompt() — a new dispatch path must go through buildCoderContext instead",
  );
});
