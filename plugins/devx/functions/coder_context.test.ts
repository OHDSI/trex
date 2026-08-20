// plugins/devx/functions/coder_context.test.ts
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { buildCoderContext, DEFAULT_MAX_STEPS } from "./coder_context.ts";

const base = { mode: "agent", settings: {} };

Deno.test("channel turn carries the gated protocol and the reply contract", async () => {
  const { systemPrompt } = await buildCoderContext({ ...base, remoteChannel: true });
  assertStringIncludes(systemPrompt, "<gated_protocol>");
  assertStringIncludes(systemPrompt, "<reply_contract>");
  assertStringIncludes(systemPrompt, "<commit-pr-hygiene>");
});

Deno.test("channel turn does NOT tell the coder to use the blocking question tool", async () => {
  const { systemPrompt } = await buildCoderContext({ ...base, remoteChannel: true });
  assertEquals(systemPrompt.includes("<asking-questions>"), false);
});

Deno.test("ui turn keeps the workbench prompt and the question rule", async () => {
  const { systemPrompt } = await buildCoderContext({ ...base, remoteChannel: false });
  assertStringIncludes(systemPrompt, "<asking-questions>");
  assertEquals(systemPrompt.includes("<gated_protocol>"), false);
});

Deno.test("the component-selection line is appended only when selected, one wording", async () => {
  const off = await buildCoderContext({ ...base });
  const on = await buildCoderContext({ ...base, hasComponentSelection: true });
  assertEquals(off.systemPrompt.includes("selected specific components"), false);
  assertStringIncludes(
    on.systemPrompt,
    "The user has selected specific components for editing. Focus your modifications on those components.",
  );
  assertEquals(on.systemPrompt.includes("code snippets are in the user's message"), false);
});

Deno.test("step budget: explicit setting wins on a ui turn", async () => {
  assertEquals((await buildCoderContext({ ...base, settings: { max_steps: 25 } })).maxSteps, 25);
});

Deno.test("step budget: unset falls back to the shared default", async () => {
  assertEquals((await buildCoderContext({ ...base, settings: {} })).maxSteps, DEFAULT_MAX_STEPS);
  assertEquals(DEFAULT_MAX_STEPS, 100);
});

Deno.test("step budget: the channel floor lifts a lower setting", async () => {
  const { maxSteps } = await buildCoderContext({ ...base, remoteChannel: true, settings: { max_steps: 25 } });
  assertEquals(maxSteps, 200);
});

Deno.test("step budget: a setting above the channel floor is kept", async () => {
  const { maxSteps } = await buildCoderContext({ ...base, remoteChannel: true, settings: { max_steps: 500 } });
  assertEquals(maxSteps, 500);
});
