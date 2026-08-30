import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { runDelegatedTurn } from "./delegate.ts";
import type { SdkMessageLike } from "./events.ts";
import { runTurn } from "../runner.ts";
import { loadAgent } from "../../loader.ts";
import { createStore } from "../store.ts";
import type { AgentEvent } from "../events.ts";
import type { AgentEngine } from "../../eve-shim/types.ts";
import { publish, subscribe, subscriberCount } from "../stream.ts";

const TOY = new URL("../../testdata/toy-agent/agent", import.meta.url).pathname;

// Same mock shapes runner.test.ts uses (see its own comment on ai@6's nested
// finish/usage chunk shape) — copied, not imported, because that file exports
// none of them.
const FINISH = {
  type: "finish",
  finishReason: { unified: "stop", raw: "stop" },
  usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
};
const textChunks = (text: string) => [
  { type: "text-start", id: "1" },
  { type: "text-delta", id: "1", delta: text },
  { type: "text-end", id: "1" },
  FINISH,
];
const toolCallChunks = (toolName: string, input: unknown, toolCallId = "c-1") => [
  { type: "tool-call", toolCallId, toolName, input: JSON.stringify(input) },
  {
    type: "finish",
    finishReason: { unified: "tool-calls", raw: "tool-calls" },
    usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
  },
];

// deno-lint-ignore no-explicit-any
function sequencedModel(...responses: any[][]) {
  let call = 0;
  return new MockLanguageModelV3({
    doStream: () => {
      const chunks = responses[Math.min(call++, responses.length - 1)];
      return Promise.resolve({ stream: simulateReadableStream({ chunks }) });
    },
  });
}

interface RecordedStep {
  seq: number;
  kind: string;
  name: string | null;
  payload: unknown;
  usage: unknown;
}

function recordingStore() {
  const steps: RecordedStep[] = [];
  const fn = (sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> => {
    if (sql.includes("INSERT INTO agents.steps") && params) {
      const [, seq, kind, name, payload, usage] = params;
      steps.push({
        seq: Number(seq),
        kind: String(kind),
        name: typeof name === "string" ? name : null,
        payload: typeof payload === "string" ? JSON.parse(payload) : null,
        usage: typeof usage === "string" ? JSON.parse(usage) : null,
      });
    }
    return Promise.resolve({ rows: [] });
  };
  return { store: createStore(fn), steps };
}

// Drops `undefined`-valued keys (assertEquals counts those as present) and,
// deliberately, `lastStepInputTokens`: runner.ts reports the FINAL step's
// prefill there, while an engine reports one cumulative usage for its whole
// run — see delegate.ts for why a total is not passed off as a window size.
function normalize(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v), (k, val) => (k === "lastStepInputTokens" ? undefined : val));
}

function scriptedEngine(...scripts: SdkMessageLike[][]): AgentEngine {
  let call = 0;
  return {
    name: "scripted",
    run: () => {
      const script = scripts[Math.min(call++, scripts.length - 1)];
      return (async function* () {
        for (const m of script) yield m;
      })();
    },
  };
}

const SESSION = "sess-1";
const assistantText = (text: string): SdkMessageLike => ({
  type: "assistant",
  session_id: SESSION,
  message: { content: [{ type: "text", text }] },
});
const assistantToolUse = (name: string, input: unknown, id = "c-1"): SdkMessageLike => ({
  type: "assistant",
  session_id: SESSION,
  message: { content: [{ type: "tool_use", id, name, input }] },
});
const toolResult = (id: string, output: unknown): SdkMessageLike => ({
  type: "user",
  session_id: SESSION,
  message: { content: [{ type: "tool_result", tool_use_id: id, content: "ignored" }] },
  tool_use_result: output,
});
const resultOk = (inputTokens: number, outputTokens: number): SdkMessageLike => ({
  type: "result",
  session_id: SESSION,
  is_error: false,
  stop_reason: "stop",
  usage: { input_tokens: inputTokens, output_tokens: outputTokens },
});

Deno.test("a delegated turn persists the same steps runner.ts does for the same tool call and reply", async () => {
  const agent = await loadAgent(TOY);

  const runner = recordingStore();
  await runTurn({
    agent, sessionId: SESSION, turnId: "t-1", history: [],
    message: "echo hi", store: runner.store, emit: () => {},
    model: sequencedModel(toolCallChunks("echo", { text: "hi" }), textChunks("done")),
  });

  const delegated = recordingStore();
  await runDelegatedTurn({
    agent, sessionId: SESSION, turnId: "t-1", message: "echo hi",
    store: delegated.store, emit: () => {},
    engine: scriptedEngine([
      assistantToolUse("echo", { text: "hi" }),
      toolResult("c-1", { echoed: "hi" }),
      assistantText("done"),
      resultOk(2, 2),
    ]),
  });

  // Guards the comparison below against passing on two empty lists.
  assertEquals(runner.steps.map((s) => s.kind), ["tool-call", "tool-result", "text", "finish"]);
  assertEquals(normalize(delegated.steps), normalize(runner.steps));
});

Deno.test("a delegated turn emits the same events, in the same order, runner.ts does", async () => {
  const agent = await loadAgent(TOY);

  const runnerEvents: AgentEvent[] = [];
  await runTurn({
    agent, sessionId: SESSION, turnId: "t-1", history: [],
    message: "echo hi", store: recordingStore().store, emit: (e) => runnerEvents.push(e),
    model: sequencedModel(toolCallChunks("echo", { text: "hi" }), textChunks("done")),
  });

  const delegatedEvents: AgentEvent[] = [];
  await runDelegatedTurn({
    agent, sessionId: SESSION, turnId: "t-1", message: "echo hi",
    store: recordingStore().store, emit: (e) => delegatedEvents.push(e),
    engine: scriptedEngine([
      assistantToolUse("echo", { text: "hi" }),
      toolResult("c-1", { echoed: "hi" }),
      assistantText("done"),
      resultOk(2, 2),
    ]),
  });

  assertEquals(runnerEvents.map((e) => e.type), [
    "actions.requested",
    "action.result",
    "message.appended",
    "message.completed",
    "turn.completed",
  ]);
  assertEquals(normalize(delegatedEvents), normalize(runnerEvents));
});

Deno.test("a delegated turn's events carry eve's turn id, not the engine's session id", async () => {
  const agent = await loadAgent(TOY);
  const events: AgentEvent[] = [];
  await runDelegatedTurn({
    agent, sessionId: SESSION, turnId: "turn-abc", message: "hi",
    store: recordingStore().store, emit: (e) => events.push(e),
    engine: scriptedEngine([assistantText("hello"), resultOk(1, 1)]),
  });
  const ids = events.map((e) => ("turnId" in e.data ? e.data.turnId : "turn-abc"));
  assertEquals(ids, ["turn-abc", "turn-abc", "turn-abc"]);
});

Deno.test("a delegated turn's events reach a live subscriber in order", async () => {
  const agent = await loadAgent(TOY);
  const seen: string[] = [];
  const unsubscribe = subscribe(SESSION, (e) => seen.push(e.type));
  try {
    await runDelegatedTurn({
      agent, sessionId: SESSION, turnId: "t-1", message: "echo hi",
      store: recordingStore().store, emit: (e) => publish(SESSION, e),
      engine: scriptedEngine([
        assistantToolUse("echo", { text: "hi" }),
        toolResult("c-1", { echoed: "hi" }),
        assistantText("done"),
        resultOk(1, 1),
      ]),
    });
  } finally {
    unsubscribe();
  }
  assertEquals(seen, ["actions.requested", "action.result", "message.appended", "message.completed", "turn.completed"]);
  assertEquals(subscriberCount(SESSION), 0);
});

Deno.test("a terminal event closes the turn exactly once and stops reading the engine", async () => {
  const agent = await loadAgent(TOY);
  const events: AgentEvent[] = [];
  const { store, steps } = recordingStore();
  let closed = false;
  const engine: AgentEngine = {
    name: "chatty",
    run: () =>
      (async function* () {
        try {
          yield assistantText("first");
          yield resultOk(1, 1);
          yield assistantText("after the end");
          yield resultOk(9, 9);
        } finally {
          closed = true;
        }
      })(),
  };
  const res = await runDelegatedTurn({
    agent, sessionId: SESSION, turnId: "t-1", message: "hi", store, emit: (e) => events.push(e), engine,
  });

  assertEquals(res.text, "first");
  assertEquals(events.filter((e) => e.type === "turn.completed").length, 1);
  assertEquals(events.filter((e) => e.type === "message.completed").length, 1);
  assertEquals(steps.filter((s) => s.kind === "finish").length, 1);
  assert(!events.some((e) => e.type === "message.appended" && e.data.messageDelta === "after the end"));
  assert(closed, "the engine's stream must be closed once the turn is over");
});

Deno.test("an engine that throws mid-stream fails the turn instead of leaving it running", async () => {
  const agent = await loadAgent(TOY);
  const events: AgentEvent[] = [];
  const { store, steps } = recordingStore();
  const engine: AgentEngine = {
    name: "broken",
    run: () =>
      (async function* () {
        yield assistantText("partial");
        throw new Error("engine died");
      })(),
  };
  await assertRejects(
    () =>
      runDelegatedTurn({
        agent, sessionId: SESSION, turnId: "t-1", message: "hi", store, emit: (e) => events.push(e), engine,
      }),
    Error,
    "engine died",
  );
  // Same posture as runner.ts's "error" stream part: an error step for replay,
  // no turn.failed of its own (handler.ts's catch owns that event), and the
  // partial text still persisted by the finally.
  assertEquals(steps.map((s) => s.kind), ["error", "text"]);
  assertEquals(steps[0].payload, { message: "Error: engine died" });
  assert(!events.some((e) => e.type === "turn.completed"));
  assert(!events.some((e) => e.type === "turn.failed"));
});

Deno.test("an engine's terminal failure fails the turn", async () => {
  const agent = await loadAgent(TOY);
  const { store, steps } = recordingStore();
  await assertRejects(
    () =>
      runDelegatedTurn({
        agent, sessionId: SESSION, turnId: "t-1", message: "hi", store, emit: () => {},
        engine: scriptedEngine([
          assistantText("trying"),
          { type: "result", session_id: SESSION, is_error: true, errors: ["rate limited"] },
        ]),
      }),
    Error,
    "rate limited",
  );
  assert(steps.some((s) => s.kind === "error"));
  assert(!steps.some((s) => s.kind === "finish"));
});

Deno.test("an engine stream that ends without a terminal event fails the turn", async () => {
  const agent = await loadAgent(TOY);
  const { store, steps } = recordingStore();
  await assertRejects(
    () =>
      runDelegatedTurn({
        agent, sessionId: SESSION, turnId: "t-1", message: "hi", store, emit: () => {},
        engine: scriptedEngine([assistantText("half an answer")]),
      }),
    Error,
    "without a terminal event",
  );
  assert(steps.some((s) => s.kind === "error"));
});

Deno.test("a silent delegated turn gets runner.ts's no-silent-turn fallback verbatim", async () => {
  const agent = await loadAgent(TOY);

  const runnerEvents: AgentEvent[] = [];
  await runTurn({
    agent, sessionId: SESSION, turnId: "t-1", history: [],
    message: "hi", store: recordingStore().store, emit: (e) => runnerEvents.push(e),
    model: sequencedModel([FINISH]),
  });

  const delegatedEvents: AgentEvent[] = [];
  await runDelegatedTurn({
    agent, sessionId: SESSION, turnId: "t-1", message: "hi",
    store: recordingStore().store, emit: (e) => delegatedEvents.push(e),
    engine: scriptedEngine([resultOk(1, 1)]),
  });

  const completed = (es: AgentEvent[]) => es.find((e) => e.type === "message.completed");
  assertEquals(normalize(completed(delegatedEvents)), normalize(completed(runnerEvents)));
});

Deno.test("a delegated turn that ran tools but produced no text does not claim nothing changed", async () => {
  const agent = await loadAgent(TOY);
  const events: AgentEvent[] = [];
  await runDelegatedTurn({
    agent, sessionId: SESSION, turnId: "t-1", message: "hi",
    store: recordingStore().store, emit: (e) => events.push(e),
    engine: scriptedEngine([
      assistantToolUse("echo", { text: "hi" }),
      toolResult("c-1", { echoed: "hi" }),
      resultOk(1, 1),
    ]),
  });
  const completed = events.find((e) => e.type === "message.completed");
  assert(completed && completed.type === "message.completed");
  assert(!completed.data.message.includes("Nothing was changed"));
});

Deno.test("the translator's correlation state is created per turn, not shared across turns", async () => {
  const agent = await loadAgent(TOY);
  // Same engine object for both turns: a tool_use in turn 1 must not let
  // turn 2 recover a tool name for the same id.
  const engine = scriptedEngine(
    [assistantToolUse("echo", { text: "hi" }, "c-9"), resultOk(1, 1)],
    [toolResult("c-9", { echoed: "hi" }), resultOk(1, 1)],
  );
  await runDelegatedTurn({
    agent, sessionId: SESSION, turnId: "t-1", message: "one",
    store: recordingStore().store, emit: () => {}, engine,
  });
  const { store, steps } = recordingStore();
  await runDelegatedTurn({
    agent, sessionId: SESSION, turnId: "t-2", message: "two", store, emit: () => {}, engine,
  });
  const result = steps.find((s) => s.kind === "tool-result");
  assert(result, "expected the second turn to persist its tool-result");
  assertEquals(result.name, "");
});

Deno.test("the engine receives the turn's resolved prompt and ids", async () => {
  const agent = await loadAgent(TOY);
  const seen: { sessionId: string; turnId: string; prompt: string }[] = [];
  const engine: AgentEngine = {
    name: "capturing",
    run: (turn) => {
      seen.push({ sessionId: turn.sessionId, turnId: turn.turnId, prompt: turn.prompt });
      return (async function* () {
        yield resultOk(1, 1);
      })();
    },
  };
  await runDelegatedTurn({
    agent: { ...agent, config: { ...agent.config, buildUserMessage: (base: string) => Promise.resolve(`[wrapped] ${base}`) } },
    sessionId: SESSION, turnId: "t-1", message: "do the thing",
    store: recordingStore().store, emit: () => {}, engine,
    hookCtx: { sessionId: SESSION, env: () => undefined, sql: () => Promise.resolve({ rows: [] }) },
  });
  assertEquals(seen, [{ sessionId: SESSION, turnId: "t-1", prompt: "[wrapped] do the thing" }]);
});
