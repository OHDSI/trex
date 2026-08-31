import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { answerPermissionRequest, buildAskQuestionRule, sidecarAllowedTools } from "./claude_code_agent.ts";
import { toolsOption } from "../fn-claude-code/tool_options.js";
import { resolveCoderProfile } from "./coder_profile.ts";

// answerPermissionRequest writes the exact decision file path/shape the sidecar's
// canUseTool polls for: /tmp/.claude-permission-<id>.decision holding
// { behavior: "allow"|"deny", updatedInput?, message? }.

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

// Task 6 re-points WHO decides: when the caller supplies a resolver (eve's
// approval gate, via agent/lib/sidecar_engine.ts), devx's own consent flow —
// and its auto_approve shortcut — must not run at all. The file protocol the
// sidecar polls is unchanged either way.

Deno.test("answerPermissionRequest: an injected resolver decides instead of devx's consent flow", async () => {
  const id = crypto.randomUUID();
  try {
    const calls: Array<[string, unknown[]]> = [];
    const sent: unknown[] = [];
    const seen: unknown[] = [];
    const result = await answerPermissionRequest({
      id, toolName: "Bash", input: { command: "ls" }, chatId: "c1", userId: "u1",
      sqlFn: fakeSql({}, calls), send: (e) => sent.push(e), autoApprove: false,
      resolvePermission: (req) => {
        seen.push(req);
        return Promise.resolve({ behavior: "allow", updatedInput: req.input });
      },
    });
    assertEquals(result, { behavior: "allow", updatedInput: { command: "ls" } });
    assertEquals(seen, [{ id, toolName: "Bash", input: { command: "ls" } }]);
    // No devx.tool_consents lookup, no pending_consents row, no consent_request.
    assertEquals(calls.length, 0);
    assertEquals(sent.length, 0);
    assertEquals(await readDecisionFile(id), { behavior: "allow", updatedInput: { command: "ls" } });
  } finally {
    await cleanupDecisionFile(id);
  }
});

Deno.test("answerPermissionRequest: an injected resolver's denial beats settings.auto_approve", async () => {
  const id = crypto.randomUUID();
  try {
    const calls: Array<[string, unknown[]]> = [];
    const result = await answerPermissionRequest({
      id, toolName: "Bash", input: { command: "rm -rf /" }, chatId: "c1", userId: "u1",
      sqlFn: fakeSql({}, calls), send: () => {}, autoApprove: true,
      resolvePermission: () => Promise.resolve({ behavior: "deny", message: "denied by user" }),
    });
    assertEquals(result, { behavior: "deny", message: "denied by user" });
    assertEquals(await readDecisionFile(id), { behavior: "deny", message: "denied by user" });
  } finally {
    await cleanupDecisionFile(id);
  }
});

Deno.test("answerPermissionRequest: a throwing injected resolver denies rather than leaving no decision file", async () => {
  const id = crypto.randomUUID();
  try {
    const result = await answerPermissionRequest({
      id, toolName: "Bash", input: { command: "ls" }, chatId: "c1", userId: "u1",
      sqlFn: fakeSql({}, []), send: () => {}, autoApprove: false,
      resolvePermission: () => Promise.reject(new Error("gate exploded")),
    });
    assertEquals(result, { behavior: "deny", message: "Permission decision failed" });
    assertEquals(await readDecisionFile(id), { behavior: "deny", message: "Permission decision failed" });
  } finally {
    await cleanupDecisionFile(id);
  }
});

// ---------------------------------------------------------------------------
// The two hops the declared allowlist takes to reach the SDK. The empty-list
// inversion is the trap on both: an EMPTY declared allowlist means "no
// built-ins", an ABSENT one means "leave the SDK preset alone". A truthiness
// test collapses those into one and hands a declared-nothing session every
// tool. The code was correct on both hops and nothing held it.
// ---------------------------------------------------------------------------

Deno.test("hop 1 (devx -> sidecar): a declared EMPTY allowlist is forwarded as [], never as absent", () => {
  assertEquals(sidecarAllowedTools([]), []);
  assertEquals(sidecarAllowedTools(["Read", "Grep"]), ["Read", "Grep"]);
  assertEquals(sidecarAllowedTools(undefined), undefined);
  assertEquals(sidecarAllowedTools(null), undefined);
});

Deno.test("hop 1: the forwarded list is a copy — a later mutation cannot widen what was sent", () => {
  const declared = ["Read"];
  const sent = sidecarAllowedTools(declared);
  declared.push("Bash");
  assertEquals(sent, ["Read"]);
});

Deno.test("hop 2 (sidecar -> SDK): `tools` is set for a declared EMPTY allowlist and omitted for an absent one", () => {
  assertEquals(toolsOption([]), { tools: [] });
  assertEquals(toolsOption(["Read", "Grep"]), { tools: ["Read", "Grep"] });
  // Omitted entirely — spreading `{}` is what leaves the SDK preset alone.
  assertEquals(toolsOption(undefined), {});
  assertEquals(toolsOption(null), {});
  assertEquals("tools" in toolsOption(undefined), false);
});
