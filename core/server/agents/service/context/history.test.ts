import { assert, assertEquals } from "jsr:@std/assert";
import {
  assembleHistory,
  ensureToolResultsPresent,
  SYNTHETIC_RESULT_TEXT,
  type AssistantPart,
  type ModelMessage,
  type ToolResultPart,
  type TurnRow,
} from "./history.ts";
import { DEFAULT_CONTEXT_CONFIG } from "./budget.ts";
import { SUMMARY_PREFIX } from "./prompts.ts";

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

Deno.test("assembleHistory applies fresh cap to recent turns and stale cap to older", () => {
  const big = "x".repeat(50_000);
  const mk = (n: string): TurnRow => turn(n, [
    { kind: "tool-call", name: "Bash", payload: { toolCallId: `c${n}`, input: {} } },
    { kind: "tool-result", name: "Bash", payload: { toolCallId: `c${n}`, output: big } },
  ]);
  const turns = [mk("1"), mk("2"), mk("3"), mk("4"), mk("5")];
  const cfg = { ...DEFAULT_CONTEXT_CONFIG, freshTurns: 3, freshToolOutputChars: 20_000, staleToolOutputChars: 2_000 };
  const msgs = assembleHistory(turns, cfg);

  const outputs = msgs.filter((m) => m.role === "tool")
    .map((m) => String((m.content as ToolResultPart[])[0].output));

  // turns 1 and 2 are stale, 3-5 are fresh
  assertEquals(outputs[0].includes("original length: 50000 chars"), true);
  assert(outputs[0].length < 3_000, "stale output not tightly capped");
  assert(outputs[4].length > 19_000, "fresh output over-truncated");
});

Deno.test("assembleHistory does not truncate text parts", () => {
  const big = "y".repeat(50_000);
  const turns = [turn("go", [{ kind: "text", name: null, payload: { text: big } }])];
  const msgs = assembleHistory(turns, DEFAULT_CONTEXT_CONFIG);
  assertEquals((msgs[1].content as AssistantPart[])[0], { type: "text", text: big });
});

Deno.test("assembleHistory resumes from the newest compaction step", () => {
  const turns: TurnRow[] = [
    { seq: 1, message: "old", metadata: null, steps: [{ kind: "text", name: null, payload: { text: "old reply" } }] },
    { seq: 2, message: "checkpoint", metadata: null, steps: [
      { kind: "compaction", name: null, payload: { summary: "did X, next Y", replacedTurnSeqFrom: 1, replacedTurnSeqTo: 1 } },
    ] },
    { seq: 3, message: "new", metadata: null, steps: [{ kind: "text", name: null, payload: { text: "new reply" } }] },
  ];
  const msgs = assembleHistory(turns, DEFAULT_CONTEXT_CONFIG);
  const joined = JSON.stringify(msgs);
  assert(!joined.includes("old reply"), "compacted turn still present");
  assert(joined.includes("did X, next Y"), "summary missing");
  assert(joined.includes(SUMMARY_PREFIX.slice(0, 40)), "framing prefix missing");
  assert(joined.includes("new reply"), "post-compaction turn missing");
});
