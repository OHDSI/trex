import { assertEquals } from "jsr:@std/assert";
import { createSdkTranslator } from "./events.ts";

const TURN = "sess-abc";

Deno.test("translateSdkMessage maps assistant text to message.appended", () => {
  const translate = createSdkTranslator();
  const m = {
    type: "assistant",
    session_id: TURN,
    message: { content: [{ type: "text", text: "hello there" }] },
  };
  assertEquals(translate(m), {
    type: "message.appended",
    data: { turnId: TURN, messageDelta: "hello there", messageSoFar: "hello there" },
  });
});

Deno.test("translateSdkMessage maps assistant tool_use to actions.requested", () => {
  const translate = createSdkTranslator();
  const m = {
    type: "assistant",
    session_id: TURN,
    message: {
      content: [{ type: "tool_use", id: "call-1", name: "Read", input: { file_path: "a.ts" } }],
    },
  };
  assertEquals(translate(m), {
    type: "actions.requested",
    data: {
      turnId: TURN,
      actions: [{ kind: "tool-call", callId: "call-1", toolName: "Read", input: { file_path: "a.ts" } }],
    },
  });
});

Deno.test("translateSdkMessage correlates a tool_result's toolName from the earlier tool_use", () => {
  const translate = createSdkTranslator();
  translate({
    type: "assistant",
    session_id: TURN,
    message: { content: [{ type: "tool_use", id: "call-1", name: "Read", input: { file_path: "a.ts" } }] },
  });
  const result = translate({
    type: "user",
    session_id: TURN,
    message: { content: [{ type: "tool_result", tool_use_id: "call-1", content: "file contents" }] },
  });
  assertEquals(result, {
    type: "action.result",
    data: {
      turnId: TURN,
      result: { kind: "tool-result", callId: "call-1", toolName: "Read", output: "file contents" },
      status: "completed",
    },
  });
});

Deno.test("translateSdkMessage does not cross-correlate two concurrent tool_use ids", () => {
  const translate = createSdkTranslator();
  translate({
    type: "assistant",
    session_id: TURN,
    message: {
      content: [
        { type: "tool_use", id: "call-a", name: "Read", input: {} },
        { type: "tool_use", id: "call-b", name: "Bash", input: {} },
      ],
    },
  });
  const resultB = translate({
    type: "user",
    session_id: TURN,
    message: { content: [{ type: "tool_result", tool_use_id: "call-b", content: "ran" }] },
  });
  const resultA = translate({
    type: "user",
    session_id: TURN,
    message: { content: [{ type: "tool_result", tool_use_id: "call-a", content: "read" }] },
  });
  assertEquals(
    (resultB as { data: { result: { toolName: string } } }).data.result.toolName,
    "Bash",
  );
  assertEquals(
    (resultA as { data: { result: { toolName: string } } }).data.result.toolName,
    "Read",
  );
});

Deno.test("translateSdkMessage degrades an orphan tool_result (id never seen) instead of dropping it", () => {
  const translate = createSdkTranslator();
  const result = translate({
    type: "user",
    session_id: TURN,
    message: { content: [{ type: "tool_result", tool_use_id: "unseen-call", content: "text form" }] },
  });
  assertEquals(result, {
    type: "action.result",
    data: {
      turnId: TURN,
      result: { kind: "tool-result", callId: "unseen-call", toolName: "", output: "text form" },
      status: "completed",
    },
  });
});

Deno.test("translateSdkMessage maps a failed user tool_result to action.result (failed)", () => {
  const translate = createSdkTranslator();
  translate({
    type: "assistant",
    session_id: TURN,
    message: { content: [{ type: "tool_use", id: "call-2", name: "Bash", input: {} }] },
  });
  const m = {
    type: "user",
    session_id: TURN,
    message: {
      content: [{ type: "tool_result", tool_use_id: "call-2", content: "boom", is_error: true }],
    },
  };
  assertEquals(translate(m), {
    type: "action.result",
    data: {
      turnId: TURN,
      result: { kind: "tool-result", callId: "call-2", toolName: "Bash", output: "boom" },
      status: "failed",
    },
  });
});

Deno.test("translateSdkMessage prefers tool_use_result (structured output) over the raw content block", () => {
  const translate = createSdkTranslator();
  translate({
    type: "assistant",
    session_id: TURN,
    message: { content: [{ type: "tool_use", id: "call-3", name: "Read", input: {} }] },
  });
  const m = {
    type: "user",
    session_id: TURN,
    message: { content: [{ type: "tool_result", tool_use_id: "call-3", content: "text form" }] },
    tool_use_result: { structured: true },
  };
  assertEquals(translate(m), {
    type: "action.result",
    data: {
      turnId: TURN,
      result: { kind: "tool-result", callId: "call-3", toolName: "Read", output: { structured: true } },
      status: "completed",
    },
  });
});

Deno.test("translateSdkMessage maps the terminal success result to turn.completed", () => {
  const translate = createSdkTranslator();
  const m = {
    type: "result",
    subtype: "success",
    session_id: TURN,
    is_error: false,
    result: "done",
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 20 },
  };
  assertEquals(translate(m), {
    type: "turn.completed",
    data: { turnId: TURN, usage: { inputTokens: 100, outputTokens: 20 }, finishReason: "end_turn" },
  });
});

Deno.test("translateSdkMessage maps the terminal error result to turn.failed", () => {
  const translate = createSdkTranslator();
  const m = {
    type: "result",
    subtype: "error_during_execution",
    session_id: TURN,
    is_error: true,
    errors: ["boom", "again"],
  };
  assertEquals(translate(m), {
    type: "turn.failed",
    data: { turnId: TURN, message: "boom; again" },
  });
});

Deno.test("translateSdkMessage maps compact_boundary to context.compacted with a sentinel seq", () => {
  const translate = createSdkTranslator();
  const m = { type: "system", subtype: "compact_boundary", session_id: TURN };
  assertEquals(translate(m), {
    type: "context.compacted",
    data: { via: "summary", replacedTurnSeqTo: -1 },
  });
});

Deno.test("translateSdkMessage maps permission_denied to a failed action.result", () => {
  const translate = createSdkTranslator();
  const m = {
    type: "system",
    subtype: "permission_denied",
    session_id: TURN,
    tool_name: "Bash",
    tool_use_id: "call-4",
    message: "denied by policy",
  };
  assertEquals(translate(m), {
    type: "action.result",
    data: {
      turnId: TURN,
      result: { kind: "tool-result", callId: "call-4", toolName: "Bash", output: { error: "denied by policy" } },
      status: "failed",
    },
  });
});

// Representative sample of UNMAPPED SDKMessage variants, named explicitly so
// adding one to the mapped set later forces a deliberate test edit here —
// not a wildcard/loop that would silently keep passing.
Deno.test("translateSdkMessage drops a representative sample of unmapped variants", () => {
  const translate = createSdkTranslator();
  // SDKPartialAssistantMessage — streaming delta; only the full assistant
  // message (mapped above) is translated.
  assertEquals(translate({ type: "stream_event", session_id: TURN }), null);
  // SDKSystemMessage (init) — session bootstrap metadata, not a turn event.
  assertEquals(translate({ type: "system", subtype: "init", session_id: TURN }), null);
  // SDKStatusMessage — CLI status ticks, no eve counterpart.
  assertEquals(translate({ type: "system", subtype: "status", session_id: TURN }), null);
  // SDKNotificationMessage — CLI-side toast, not a turn/session-lifecycle event.
  assertEquals(translate({ type: "system", subtype: "notification", session_id: TURN }), null);
  // SDKConversationResetMessage — no eve counterpart for a mid-session reset.
  assertEquals(translate({ type: "conversation_reset", session_id: TURN }), null);
  // SDKUserMessageReplay — same wire `type: "user"` as a live tool result,
  // but it replays history rather than reporting a live turn event.
  assertEquals(
    translate({
      type: "user",
      session_id: TURN,
      isReplay: true,
      message: { content: [{ type: "tool_result", tool_use_id: "call-1", content: "x" }] },
    }),
    null,
  );
});

Deno.test("translateSdkMessage degrades to null on a malformed/partial message rather than throwing", () => {
  const translate = createSdkTranslator();
  assertEquals(translate(null as unknown as { type: string }), null);
  assertEquals(translate({} as unknown as { type: string }), null);
  assertEquals(translate({ type: "assistant" } as unknown as { type: string }), null); // no session_id
  assertEquals(
    translate({ type: "assistant", session_id: TURN, message: "not an object" } as unknown as { type: string }),
    null,
  );
  assertEquals(
    translate({ type: "user", session_id: TURN, message: { content: "plain string" } } as unknown as {
      type: string;
    }),
    null,
  );
  // A result message missing `is_error` (required on the real SDK type) is
  // treated as malformed, not defaulted to success.
  assertEquals(translate({ type: "result", session_id: TURN } as unknown as { type: string }), null);
});
