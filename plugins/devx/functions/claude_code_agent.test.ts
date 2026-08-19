import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { buildAskQuestionRule } from "./claude_code_agent.ts";
import { resolveCoderProfile } from "./coder_profile.ts";

// Fix round 1: the ui profile's askQuestionRule told the coder to ALWAYS use
// the blocking mcp__ask__ask_question tool, injected unconditionally
// regardless of profile. On a channel turn that tool polls devx.pending_responses
// for up to 5 minutes for an answer nobody is watching the chat to give — while
// CHANNEL_CODER_SYSTEM_PROMPT's own <gated_protocol> tells the coder the
// opposite (put the question in the reply and stop). buildAskQuestionRule must
// gate on profile.blockingQuestions so only one of those instructions ever
// reaches the model.

Deno.test("ui profile gets the blocking ask_question rule", () => {
  const uiProfile = resolveCoderProfile({});
  const rule = buildAskQuestionRule(uiProfile);
  assertStringIncludes(rule, "mcp__ask__ask_question");
  assertStringIncludes(rule, "MUST use");
});

Deno.test("channel profile gets no ask_question rule at all", () => {
  const channelProfile = resolveCoderProfile({ remoteChannel: true });
  const rule = buildAskQuestionRule(channelProfile);
  assertEquals(rule, "");
});
