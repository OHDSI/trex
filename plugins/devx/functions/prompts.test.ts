import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
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

// Fix round 1: [[AI_RULES]] was silently dropped from the channel prompt
// because CHANNEL_CODER_SYSTEM_PROMPT had no placeholder for
// wrapAiRules(...) to land in — String.replace on an absent substring is a
// silent no-op. This is the assertion that would have caught it: the app's
// actual project rules (e.g. TREX.md content) must appear in the built
// channel-profile prompt, not just the literal placeholder disappearing.
Deno.test("channel profile prompt carries the app's own ai_rules", () => {
  const channelProfile = resolveCoderProfile({ remoteChannel: true });
  const rules = "# Project Rules\n- Use the shared SQL pool, never open a new connection.";
  const prompt = constructSystemPrompt("agent", rules, undefined, channelProfile);
  assertStringIncludes(prompt, "Use the shared SQL pool, never open a new connection.");
  assertEquals(prompt.includes("[[AI_RULES]]"), false);
});

// Fix round 2: filling the [[AI_RULES]] gap with DEFAULT_AI_RULES (the
// React/Tailwind/shadcn workbench boilerplate) made things worse than the
// round-1 bug — a channel coder on a non-React repo (this repo's own root
// has neither ai_rules nor TREX.md/AI_RULES.md) would be told, inside its own
// system prompt, that it's building a React app with shadcn/ui. With no
// aiRules supplied, the channel prompt must say nothing about a tech stack,
// not assert a wrong one.
Deno.test("channel profile with no ai_rules asserts no tech stack at all", () => {
  const channelProfile = resolveCoderProfile({ remoteChannel: true });
  const prompt = constructSystemPrompt("agent", undefined, undefined, channelProfile);
  assertEquals(prompt.toLowerCase().includes("shadcn"), false);
  assertEquals(prompt.includes("React application"), false);
  assertEquals(prompt.includes("[[AI_RULES]]"), false);
});
