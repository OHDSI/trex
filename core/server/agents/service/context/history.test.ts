import { assertEquals } from "jsr:@std/assert";
import {
  assembleHistory,
  ensureToolResultsPresent,
  SYNTHETIC_RESULT_TEXT,
  type ModelMessage,
  type TurnRow,
} from "./history.ts";
import { DEFAULT_CONTEXT_CONFIG } from "./budget.ts";

let seq = 0;
const turn = (message: string, steps: TurnRow["steps"]): TurnRow => ({ seq: ++seq, message, metadata: null, steps });

Deno.test("assembleHistory emits tool-call and tool-result parts in seq order", () => {
  const turns: TurnRow[] = [turn("read config.ts", [
    { kind: "tool-call", name: "Read", payload: { toolCallId: "c1", input: { path: "config.ts" } } },
    { kind: "tool-result", name: "Read", payload: { toolCallId: "c1", output: "export const x = 1;" } },
    { kind: "text", name: null, payload: { text: "It exports x." } },
  ])];
  const msgs = assembleHistory(turns, DEFAULT_CONTEXT_CONFIG);

  assertEquals(msgs[0], { role: "user", content: "read config.ts" });
  assertEquals(msgs[1], {
    role: "assistant",
    content: [{ type: "tool-call", toolCallId: "c1", toolName: "Read", input: { path: "config.ts" } }],
  });
  assertEquals(msgs[2], {
    role: "tool",
    content: [{ type: "tool-result", toolCallId: "c1", toolName: "Read", output: "export const x = 1;" }],
  });
  assertEquals(msgs[3], { role: "assistant", content: [{ type: "text", text: "It exports x." }] });
});

Deno.test("assembleHistory handles a turn with no tool calls", () => {
  const turns = [turn("hi", [{ kind: "text", name: null, payload: { text: "hello" } }])];
  const msgs = assembleHistory(turns, DEFAULT_CONTEXT_CONFIG);
  assertEquals(msgs.length, 2);
  assertEquals(msgs[1], { role: "assistant", content: [{ type: "text", text: "hello" }] });
});

Deno.test("assembleHistory ignores non-model step kinds", () => {
  const turns = [turn("go", [
    { kind: "approval-request", name: "Bash", payload: {} },
    { kind: "custom", name: "progress", payload: { pct: 50 } },
    { kind: "finish", name: null, payload: { finishReason: "stop" } },
    { kind: "text", name: null, payload: { text: "done" } },
  ])];
  const msgs = assembleHistory(turns, DEFAULT_CONTEXT_CONFIG);
  assertEquals(msgs.length, 2);
});

Deno.test("ensureToolResultsPresent synthesizes a result for an orphan call", () => {
  const msgs: ModelMessage[] = [
    { role: "user", content: "go" },
    { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "Bash", input: {} }] },
  ];
  const out = ensureToolResultsPresent(msgs);
  assertEquals(out.length, 3);
  assertEquals(out[2], {
    role: "tool",
    content: [{ type: "tool-result", toolCallId: "c1", toolName: "Bash", output: SYNTHETIC_RESULT_TEXT }],
  });
});

Deno.test("ensureToolResultsPresent inserts the result immediately after its call", () => {
  const msgs: ModelMessage[] = [
    { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "A", input: {} }] },
    { role: "assistant", content: [{ type: "text", text: "after" }] },
  ];
  const out = ensureToolResultsPresent(msgs);
  assertEquals(out[1].role, "tool");
  assertEquals(out[2], { role: "assistant", content: [{ type: "text", text: "after" }] });
});

Deno.test("ensureToolResultsPresent leaves well-formed history untouched", () => {
  const msgs: ModelMessage[] = [
    { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "A", input: {} }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: "c1", toolName: "A", output: "ok" }] },
  ];
  assertEquals(ensureToolResultsPresent(msgs), msgs);
});
