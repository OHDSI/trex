import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { answerPermissionRequest, buildAskQuestionRule } from "./claude_code_agent.ts";
import { resolveCoderProfile } from "./coder_profile.ts";

// answerPermissionRequest answers the sidecar's "permission" SSE event (see
// canUseTool in fn-claude-code/server.js) by writing the exact decision file
// path/shape it polls for: /tmp/.claude-permission-<id>.decision holding
// { behavior: "allow"|"deny", updatedInput?, message? }. Staged landing: it
// decides via devx's own consent path (devx.tool_consents/pending_consents —
// the same DB flow agent.ts's requireConsent uses), not eve's approval gate —
// eve keys approvals to agents.turns, which a legacy devx chat has none of.

async function readDecisionFile(id: string) {
  const raw = await Deno.readTextFile(`/tmp/.claude-permission-${id}.decision`);
  return JSON.parse(raw);
}

async function cleanupDecisionFile(id: string) {
  try {
    await Deno.remove(`/tmp/.claude-permission-${id}.decision`);
  } catch {
    // already absent
  }
}

/** Routes on SQL text like the real pool would route on the query itself. */
function fakeSql(responses: Record<string, unknown>, calls: Array<[string, unknown[]]>) {
  return (sql: string, params: unknown[] = []) => {
    calls.push([sql.trim(), params]);
    if (sql.includes("SELECT consent FROM devx.tool_consents")) {
      return Promise.resolve({ rows: responses.toolConsentRows ?? [] });
    }
    if (sql.includes("SELECT decision FROM devx.pending_consents")) {
      return Promise.resolve({ rows: responses.pendingDecisionRows ?? [] });
    }
    return Promise.resolve({ rows: [] });
  };
}

Deno.test("answerPermissionRequest: settings.auto_approve allows without touching the DB", async () => {
  const id = crypto.randomUUID();
  try {
    const calls: Array<[string, unknown[]]> = [];
    const sent: unknown[] = [];
    const result = await answerPermissionRequest({
      id, toolName: "Bash", input: { command: "ls" }, chatId: "c1", userId: "u1",
      sqlFn: fakeSql({}, calls), send: (e) => sent.push(e), autoApprove: true,
    });
    assertEquals(result, { behavior: "allow", updatedInput: { command: "ls" } });
    assertEquals(calls.length, 0);
    assertEquals(sent.length, 0);
    assertEquals(await readDecisionFile(id), { behavior: "allow", updatedInput: { command: "ls" } });
  } finally {
    await cleanupDecisionFile(id);
  }
});

Deno.test("answerPermissionRequest: an existing 'always' tool_consents row allows without asking", async () => {
  const id = crypto.randomUUID();
  try {
    const calls: Array<[string, unknown[]]> = [];
    const sent: unknown[] = [];
    const result = await answerPermissionRequest({
      id, toolName: "Write", input: { file_path: "a.txt" }, chatId: "c1", userId: "u1",
      sqlFn: fakeSql({ toolConsentRows: [{ consent: "always" }] }, calls),
      send: (e) => sent.push(e), autoApprove: false,
    });
    assertEquals(result.behavior, "allow");
    assertEquals(sent.length, 0);
  } finally {
    await cleanupDecisionFile(id);
  }
});

Deno.test("answerPermissionRequest: a human approval produces an allow decision file", async () => {
  const id = crypto.randomUUID();
  try {
    const calls: Array<[string, unknown[]]> = [];
    const sent: unknown[] = [];
    const result = await answerPermissionRequest({
      id, toolName: "Edit", input: { file_path: "a.txt", old_string: "a", new_string: "b" },
      chatId: "c1", userId: "u1",
      sqlFn: fakeSql({ pendingDecisionRows: [{ decision: "allow" }] }, calls),
      send: (e) => sent.push(e), autoApprove: false,
    });
    assertEquals(result.behavior, "allow");
    assertEquals(sent[0], {
      type: "consent_request", requestId: id, toolName: "Edit",
      inputPreview: JSON.stringify({ file_path: "a.txt", old_string: "a", new_string: "b" }).slice(0, 200),
    });
    assertEquals(await readDecisionFile(id), result);
  } finally {
    await cleanupDecisionFile(id);
  }
});

Deno.test("answerPermissionRequest: a human denial produces a deny decision file", async () => {
  const id = crypto.randomUUID();
  try {
    const calls: Array<[string, unknown[]]> = [];
    const result = await answerPermissionRequest({
      id, toolName: "Bash", input: { command: "rm -rf /" }, chatId: "c1", userId: "u1",
      sqlFn: fakeSql({ pendingDecisionRows: [{ decision: "deny" }] }, calls),
      send: () => {}, autoApprove: false,
    });
    assertEquals(result.behavior, "deny");
    assertEquals(await readDecisionFile(id), result);
  } finally {
    await cleanupDecisionFile(id);
  }
});

Deno.test("answerPermissionRequest: a DB failure denies rather than leaving no decision file", async () => {
  const id = crypto.randomUUID();
  try {
    const result = await answerPermissionRequest({
      id, toolName: "Bash", input: { command: "ls" }, chatId: "c1", userId: "u1",
      sqlFn: () => Promise.reject(new Error("connection lost")),
      send: () => {}, autoApprove: false,
    });
    assertEquals(result.behavior, "deny");
    assertEquals(await readDecisionFile(id), result);
  } finally {
    await cleanupDecisionFile(id);
  }
});

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
