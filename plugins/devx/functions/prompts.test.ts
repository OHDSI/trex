import { assertEquals } from "jsr:@std/assert";
import { constructSystemPrompt } from "./prompts.ts";
import { resolveCoderProfile } from "./coder_profile.ts";

// The UI path must stay byte-identical after adding the `profile` parameter.
// resolveCoderProfile({}) (no remoteChannel) yields basePrompt: null, which
// constructSystemPrompt's `if (profile?.basePrompt)` branch treats as falsy —
// so passing the ui profile MUST produce exactly what omitting the argument
// produced before this parameter existed. Assert that equivalence directly,
// for every mode, rather than trusting it by inspection.
const uiProfile = resolveCoderProfile({});

Deno.test("ui profile leaves build-mode prompt unchanged", () => {
  const withoutProfile = constructSystemPrompt("build", undefined, undefined);
  const withUiProfile = constructSystemPrompt("build", undefined, undefined, uiProfile);
  assertEquals(withUiProfile, withoutProfile);
});

Deno.test("ui profile leaves agent-mode prompt unchanged", () => {
  const withoutProfile = constructSystemPrompt("agent", undefined, undefined);
  const withUiProfile = constructSystemPrompt("agent", undefined, undefined, uiProfile);
  assertEquals(withUiProfile, withoutProfile);
});

Deno.test("ui profile leaves ask-mode prompt unchanged", () => {
  const withoutProfile = constructSystemPrompt("ask", undefined, undefined);
  const withUiProfile = constructSystemPrompt("ask", undefined, undefined, uiProfile);
  assertEquals(withUiProfile, withoutProfile);
});

Deno.test("ui profile leaves plan-mode prompt unchanged", () => {
  const withoutProfile = constructSystemPrompt("plan", undefined, undefined);
  const withUiProfile = constructSystemPrompt("plan", undefined, undefined, uiProfile);
  assertEquals(withUiProfile, withoutProfile);
});

Deno.test("ui profile leaves custom ai_rules and skill context unchanged", () => {
  const rules = "# Custom Rules\n- do the thing";
  const skill = "some active skill context";
  const withoutProfile = constructSystemPrompt("agent", rules, skill);
  const withUiProfile = constructSystemPrompt("agent", rules, skill, uiProfile);
  assertEquals(withUiProfile, withoutProfile);
});

Deno.test("channel profile replaces the base prompt instead of decorating it", () => {
  const channelProfile = resolveCoderProfile({ remoteChannel: true });
  const prompt = constructSystemPrompt("agent", undefined, undefined, channelProfile);
  assertEquals(prompt.includes("iframe"), false);
  assertEquals(prompt.includes("STOP after the step"), true);
});
