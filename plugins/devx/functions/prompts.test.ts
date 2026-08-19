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

// Final whole-branch review, Important 4: the channel profile used to replace
// LOCAL_AGENT_SYSTEM_PROMPT wholesale, dropping KNOWLEDGE_BASE_BLOCK and the
// tool-use guidance blocks even though Task 7's own decision text says "KB
// stays identical, only the interaction contract differs" — the kb MCP server
// is still registered, so the coder had the tools but was never told they're
// authoritative. Composing from the SAME exported blocks the ui profile uses
// (prompts_channel.ts) fixes this by construction.
Deno.test("channel profile prompt carries the knowledge base block's distinguishing text", () => {
  const channelProfile = resolveCoderProfile({ remoteChannel: true });
  const prompt = constructSystemPrompt("agent", undefined, undefined, channelProfile);
  assertStringIncludes(prompt, "mcp__kb__KBSearch");
  assertStringIncludes(prompt, "Prefer the knowledge base over web search for trex, OHDSI/OMOP/Strategus, and d2e questions");
});

Deno.test("channel profile prompt carries the tool-calling and development-workflow guidance", () => {
  const channelProfile = resolveCoderProfile({ remoteChannel: true });
  const prompt = constructSystemPrompt("agent", undefined, undefined, channelProfile);
  assertStringIncludes(prompt, "<tool_calling>");
  assertStringIncludes(prompt, "<tool_calling_best_practices>");
  assertStringIncludes(prompt, "<file_editing_tool_selection>");
  assertStringIncludes(prompt, "<development_workflow>");
  assertStringIncludes(prompt, "<web_research>");
  assertStringIncludes(prompt, "<general_guidelines>");
});

// Only the preview-panel casualties (APP_COMMANDS_BLOCK / IMAGE_GENERATION_BLOCK)
// were intended to be dropped — this pins that restoring the other blocks did
// not also resurrect what has no meaning on a channel turn (there is no
// preview panel, no RestartApp/RefreshPreview, no GenerateImage tool offered).
Deno.test("channel profile prompt still omits the preview-panel/iframe framing and RestartApp", () => {
  const channelProfile = resolveCoderProfile({ remoteChannel: true });
  const prompt = constructSystemPrompt("agent", undefined, undefined, channelProfile);
  assertEquals(prompt.includes("iframe"), false);
  assertEquals(prompt.includes("RestartApp"), false);
  assertEquals(prompt.includes("RefreshPreview"), false);
  assertEquals(prompt.includes("<app_commands>"), false);
  assertEquals(prompt.includes("GenerateImage"), false);
});

// R2 residual (final review): composing the channel prompt from the shared
// blocks pulled in DEVELOPMENT_WORKFLOW_BLOCK's step 2 ("Use `AskUserQuestion`
// to ask...") and step 4 ("you must ask the user to interact with the
// application"), both of which contradict <remote_channel_context>'s "Never
// hand back instructions for the user to execute" — and fn-claude-code's `ask`
// MCP server is registered unconditionally, so a channel turn that actually
// called AskUserQuestion would burn its full 10-minute poll with nobody able
// to answer. The override block must appear, and it must appear AFTER the
// dev-workflow block's AskUserQuestion mention so recency favours it.
Deno.test("channel profile prompt overrides the dev-workflow block's question-tool and user-interaction instructions", () => {
  const channelProfile = resolveCoderProfile({ remoteChannel: true });
  const prompt = constructSystemPrompt("agent", undefined, undefined, channelProfile);
  assertStringIncludes(prompt, "<channel_workflow_override>");
  assertStringIncludes(prompt, "Never call `AskUserQuestion`");
  assertStringIncludes(prompt, "Never ask anyone to click, run, submit, or otherwise interact with the app");

  const devWorkflowIdx = prompt.indexOf("Use `AskUserQuestion` to ask 1-3 focused questions");
  const overrideIdx = prompt.indexOf("<channel_workflow_override>");
  assertEquals(devWorkflowIdx > -1, true);
  assertEquals(overrideIdx > -1, true);
  assertEquals(overrideIdx > devWorkflowIdx, true);
});

// The UI profile never sees prompts_channel.ts at all — this pins that the
// override is channel-only, not a change to the shared block itself.
Deno.test("ui profile prompt carries no channel-workflow override", () => {
  const prompt = constructSystemPrompt("agent", undefined, undefined, uiProfile);
  assertEquals(prompt.includes("<channel_workflow_override>"), false);
});

// Final whole-branch review, Important 6: the reply contract's `triggers`
// attribute must name the SAME four labels, in the SAME wording, that step 5
// of facilitate-coding-task.md asks the coder to choose among — a mismatch
// here is exactly how the trailer and the skill's prose silently drift apart.
Deno.test("channel profile reply contract names the same four FULL-track trigger labels as the skill's step 5", () => {
  const channelProfile = resolveCoderProfile({ remoteChannel: true });
  const prompt = constructSystemPrompt("agent", undefined, undefined, channelProfile);
  assertStringIncludes(prompt, "triggers=");
  for (const label of ["new subsystem", "schema change", "multiple components", "design space"]) {
    assertStringIncludes(prompt, label);
  }
});
