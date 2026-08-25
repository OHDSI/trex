import { assertEquals } from "jsr:@std/assert";
import { assembleHistory, type TurnRow } from "./history.ts";
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
