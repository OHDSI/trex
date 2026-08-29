import { assert, assertEquals } from "jsr:@std/assert";
import { streamText } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
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
    content: [{
      type: "tool-result",
      toolCallId: "c1",
      toolName: "Read",
      output: { type: "text", value: "export const x = 1;" },
    }],
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
    content: [{
      type: "tool-result",
      toolCallId: "c1",
      toolName: "Bash",
      output: { type: "text", value: SYNTHETIC_RESULT_TEXT },
    }],
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
    { role: "tool", content: [{ type: "tool-result", toolCallId: "c1", toolName: "A", output: { type: "text", value: "ok" } }] },
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

  // A string result stays in the `text` arm of ToolResultOutput; the cap is
  // applied to its value, so that is what the length assertions must read.
  const outputs = msgs.filter((m) => m.role === "tool")
    .map((m) => {
      const out = (m.content as ToolResultPart[])[0].output;
      assertEquals(out.type, "text", "a string tool result must replay as tagged text");
      return String(out.value);
    });

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

// --- Consumption, not just construction ------------------------------------
//
// Every test above asserts on the SHAPE of the assembled messages; none ever
// handed them to a model. That is exactly how a tool result whose `output`
// was a bare string shipped: ai@6's standardizePrompt rejects anything but
// the tagged ToolResultOutput union with AI_InvalidPromptError BEFORE a
// provider is reached, so assembly could satisfy every assertion here and
// still kill every turn that followed a turn containing a tool call. The
// tests below drive a REAL streamText over the REAL assembleHistory output
// against a mock model (no network), so the messages are consumed, not just
// inspected.
// The raw doStream chunk shape (nested finishReason/usage) is
// LanguageModelV3's, not the flattened one the SDK exposes on fullStream —
// see runner.test.ts's FINISH for the same mock input.
// deno-lint-ignore no-explicit-any
const CHUNKS: any[] = [
  { type: "text-start", id: "1" },
  { type: "text-delta", id: "1", delta: "ok" },
  { type: "text-end", id: "1" },
  {
    type: "finish",
    finishReason: { unified: "stop", raw: "stop" },
    usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
  },
];

function acceptingModel() {
  return new MockLanguageModelV3({
    doStream: () => Promise.resolve({ stream: simulateReadableStream({ chunks: CHUNKS }) }),
  });
}

// Drains the whole stream and re-throws whatever the SDK reported: streamText
// surfaces a prompt rejection as an `error` part / onError callback rather
// than as a synchronous throw, so a test that only awaited the result would
// pass over exactly the failure it exists to catch.
async function runModel(msgs: ModelMessage[]): Promise<string> {
  const errors: unknown[] = [];
  const result = streamText({
    model: acceptingModel(),
    messages: msgs as never,
    onError: (e: { error: unknown }) => {
      errors.push(e.error);
    },
  });
  let text = "";
  for await (const part of result.fullStream) {
    if (part.type === "error") errors.push(part.error);
    else if (part.type === "text-delta") text += part.text;
  }
  if (errors.length > 0) throw errors[0];
  return text;
}

Deno.test("a real model call accepts a replayed turn that contained a tool call", async () => {
  const turns: TurnRow[] = [turn("read config.ts", [
    { kind: "tool-call", name: "Read", payload: { toolCallId: "c1", input: { path: "config.ts" } } },
    { kind: "tool-result", name: "Read", payload: { toolCallId: "c1", output: "export const PORT = 8080;" } },
    { kind: "text", name: null, payload: { text: "It sets PORT to 8080." } },
  ])];
  const msgs = assembleHistory(turns, DEFAULT_CONTEXT_CONFIG);
  const sent: ModelMessage[] = [...msgs, { role: "user", content: "what port was that?" }];

  assertEquals(await runModel(sent), "ok");
});

Deno.test("a real model call accepts a replayed STRUCTURED tool result", async () => {
  const turns: TurnRow[] = [turn("list ports", [
    { kind: "tool-call", name: "Ports", payload: { toolCallId: "c1", input: {} } },
    { kind: "tool-result", name: "Ports", payload: { toolCallId: "c1", output: { port: 8080, tls: false } } },
  ])];
  const msgs = assembleHistory(turns, DEFAULT_CONTEXT_CONFIG);

  // Structured in, structured out — not flattened into a string on the way.
  const out = (msgs.find((m) => m.role === "tool")!.content as ToolResultPart[])[0].output;
  assertEquals(out, { type: "json", value: { port: 8080, tls: false } });
  assertEquals(await runModel([...msgs, { role: "user", content: "and now?" }]), "ok");
});

Deno.test("a real model call accepts ensureToolResultsPresent's synthetic result", async () => {
  const turns: TurnRow[] = [turn("run it", [
    { kind: "tool-call", name: "Bash", payload: { toolCallId: "orphan-1", input: { cmd: "sleep 1" } } },
  ])];
  const msgs = ensureToolResultsPresent(assembleHistory(turns, DEFAULT_CONTEXT_CONFIG));
  assertEquals(msgs.filter((m) => m.role === "tool").length, 1, "the orphan call was not backfilled");

  assertEquals(await runModel([...msgs, { role: "user", content: "what happened?" }]), "ok");
});

Deno.test("a structured result over the tier cap lands as truncated text", () => {
  // wrapToolWithCap only guarantees the FRESH cap at storage time, so an
  // object stored intact can still be far over the (much smaller) stale cap
  // when it is replayed as an old turn. It must be squeezed, not passed
  // through whole — the stale tier IS the budget.
  const mk = (n: string): TurnRow => turn(n, [
    { kind: "tool-call", name: "Dump", payload: { toolCallId: `c${n}`, input: {} } },
    { kind: "tool-result", name: "Dump", payload: { toolCallId: `c${n}`, output: { blob: "z".repeat(50_000) } } },
  ]);
  const cfg = { ...DEFAULT_CONTEXT_CONFIG, freshTurns: 1, freshToolOutputChars: 60_000, staleToolOutputChars: 2_000 };
  const outs = assembleHistory([mk("1"), mk("2")], cfg)
    .filter((m) => m.role === "tool").map((m) => (m.content as ToolResultPart[])[0].output);

  assertEquals(outs[0].type, "text", "a stale over-cap object must be serialized and truncated");
  assert(String(outs[0].value).includes("original length: 50"), "no truncation header on the stale result");
  assert(String(outs[0].value).length < 3_000, "stale structured output not tightly capped");
  // The fresh turn is under its own cap, so it keeps its structure.
  assertEquals(outs[1].type, "json");
});

Deno.test("a tool result with no recorded output replays as json null", () => {
  // A tool that returned nothing genuinely has no value to report. `json`
  // null reaches the wire as the literal `null` rather than as an empty text
  // block, which some providers reject outright.
  const turns: TurnRow[] = [turn("go", [
    { kind: "tool-call", name: "Void", payload: { toolCallId: "c1", input: {} } },
    { kind: "tool-result", name: "Void", payload: { toolCallId: "c1" } },
  ])];
  const msgs = assembleHistory(turns, DEFAULT_CONTEXT_CONFIG);
  const out = (msgs.find((m) => m.role === "tool")!.content as ToolResultPart[])[0].output;
  assertEquals(out, { type: "json", value: null });
});
