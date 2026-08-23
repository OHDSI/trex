import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { buildAskQuestionRule } from "./claude_code_agent.ts";
import { resolveCoderProfile } from "./coder_profile.ts";

// The ui profile's askQuestionRule told the coder to ALWAYS use
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

// Pin the ui profile's exact output against the literal
// template that lived inline in streamClaudeCodeChat before the
// buildAskQuestionRule extraction, so the refactor's byte-identity is an
// assertion, not a claim resting on two substring checks.
Deno.test("ui profile's ask_question rule is byte-identical to the pre-extraction text", () => {
  const uiProfile = resolveCoderProfile({});
  const rule = buildAskQuestionRule(uiProfile);
  const original = `<asking-questions>\nWhenever you need to ask the user ANYTHING — a clarifying question, a choice between options, or a confirmation — you MUST use the \`mcp__ask__ask_question\` tool. Pass \`options\` for a single choice, add \`multiSelect: true\` for multiple, or omit \`options\` for free text. This applies everywhere, not only during brainstorming. NEVER write a question as plain text in your reply: plain-text questions do NOT render as an interactive prompt and the user may not answer them.\n</asking-questions>`;
  assertEquals(rule, original);
});
