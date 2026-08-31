// deno test --no-check --allow-all plugins/devx/functions/lib/eve_sse.test.ts
import { assertEquals } from "jsr:@std/assert";
import {
  DROPPED_EVE_EVENT_KINDS,
  HANDLED_EVE_EVENT_KINDS,
  MAPPED_EVE_EVENT_KINDS,
  toDevxSse,
} from "./eve_sse.ts";

Deno.test("maps a text append onto a devx chunk", () => {
  const frame = toDevxSse({
    type: "message.appended",
    data: { turnId: "t1", messageDelta: "hi", messageSoFar: "hi" },
  });
  assertEquals(frame, { type: "chunk", content: "hi" });
});

Deno.test("maps a single requested action onto tool_call_start", () => {
  const frame = toDevxSse({
    type: "actions.requested",
    data: { turnId: "t1", actions: [{ kind: "tool-call", callId: "c1", toolName: "Read", input: { path: "a.ts" } }] },
  });
  assertEquals(frame, { type: "tool_call_start", callId: "c1", name: "Read", args: { path: "a.ts" } });
});

Deno.test("drops a parallel action-request batch, explicitly", () => {
  const twoActions = toDevxSse({
    type: "actions.requested",
    data: {
      turnId: "t1",
      actions: [
        { kind: "tool-call", callId: "c1", toolName: "Read", input: {} },
        { kind: "tool-call", callId: "c2", toolName: "Grep", input: {} },
      ],
    },
  });
  assertEquals(twoActions, null);

  const zeroActions = toDevxSse({ type: "actions.requested", data: { turnId: "t1", actions: [] } });
  assertEquals(zeroActions, null);
});

Deno.test("maps a completed action result onto tool_call_end", () => {
  const frame = toDevxSse({
    type: "action.result",
    data: {
      turnId: "t1",
      result: { kind: "tool-result", callId: "c1", toolName: "Read", output: "file contents" },
      status: "completed",
    },
  });
  assertEquals(frame, { type: "tool_call_end", callId: "c1", name: "Read", result: "file contents", error: undefined });
});

Deno.test("maps a failed action result onto tool_call_end with error set", () => {
  const frame = toDevxSse({
    type: "action.result",
    data: {
      turnId: "t1",
      result: { kind: "tool-result", callId: "c1", toolName: "Read", output: { error: "not found" } },
      status: "failed",
    },
  });
  assertEquals(frame, {
    type: "tool_call_end",
    callId: "c1",
    name: "Read",
    result: { error: "not found" },
    error: true,
  });
});

Deno.test("drops events with no devx equivalent, explicitly", () => {
  assertEquals(toDevxSse({ type: "context.compacted", data: { via: "summary", replacedTurnSeqTo: -1 } }), null);
  assertEquals(toDevxSse({ type: "turn.completed", data: { turnId: "t1" } }), null);
  assertEquals(toDevxSse({ type: "turn.failed", data: { turnId: "t1", message: "boom" } }), null);
});

Deno.test("dropped kinds are exactly the ones this file declares, not assumed", () => {
  for (const kind of DROPPED_EVE_EVENT_KINDS) {
    assertEquals(MAPPED_EVE_EVENT_KINDS.includes(kind), false, `${kind} cannot be both mapped and dropped`);
  }
  assertEquals(new Set([...MAPPED_EVE_EVENT_KINDS, ...DROPPED_EVE_EVENT_KINDS]), new Set(HANDLED_EVE_EVENT_KINDS));
});

// The pinning test: HANDLED_EVE_EVENT_KINDS must equal the real set of
// kinds core/server/agents/service/engine/events.ts's TranslatedEvent can
// produce. This is a text read, not a module import — it never pulls
// core/ into the worker bundle — but it does mean a new eve event kind
// added there, and not mirrored here, fails this test loudly instead of
// silently falling through toDevxSse's `default: null`.
Deno.test("HANDLED_EVE_EVENT_KINDS pins the real kinds engine/events.ts produces", async () => {
  const sourceUrl = new URL(
    "../../../../core/server/agents/service/engine/events.ts",
    import.meta.url,
  );
  const source = await Deno.readTextFile(sourceUrl);
  const realKinds = new Set([...source.matchAll(/"([a-z]+\.[a-z]+)"/g)].map((m) => m[1]));

  assertEquals(realKinds.size > 0, true, "sanity: the source file's kind literals must be findable");
  assertEquals(new Set(HANDLED_EVE_EVENT_KINDS), realKinds);
});
