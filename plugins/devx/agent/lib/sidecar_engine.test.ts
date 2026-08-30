import { assert, assertEquals } from "jsr:@std/assert";
import { createSidecarEngine, type PermissionDecision, type SidecarStream, toSdkMessage } from "./sidecar_engine.ts";
import type { HookCtx } from "../../../../core/server/agents/eve-shim/types.ts";
import { createSdkTranslator } from "../../../../core/server/agents/service/engine/events.ts";
import { subscribe } from "../../../../core/server/agents/service/stream.ts";
import type { AgentEvent } from "../../../../core/server/agents/service/events.ts";

// The engine's contract is "produce what core's translator reads", so the
// translation assertions run the yielded messages through the REAL translator
// rather than eyeballing the SDK shapes.

const SESSION = "s-eng-1";
const TURN = "t-eng-1";

/** Routes on SQL text like the real pool would route on the query itself. */
function fakeSql(over: Record<string, unknown[]> = {}) {
  return (sql: string, _params: unknown[] = []) => {
    if (sql.includes("FROM agents.sessions")) {
      return Promise.resolve({ rows: over.session ?? [{ plugin: "devx", agent: "coder", unattended: false }] });
    }
    if (sql.includes("FROM devx.settings")) return Promise.resolve({ rows: over.settings ?? [{ model: "sonnet" }] });
    if (sql.includes("agents.channel_sessions")) return Promise.resolve({ rows: over.channel ?? [] });
    if (sql.includes("FROM agents.tool_consents")) return Promise.resolve({ rows: over.consent ?? [] });
    if (sql.includes("INSERT INTO agents.approvals")) return Promise.resolve({ rows: [{ id: "req-1" }] });
    if (sql.includes("FROM agents.approvals")) return Promise.resolve({ rows: over.decision ?? [] });
    return Promise.resolve({ rows: [] });
  };
}

function hookCtx(sql: HookCtx["sql"]): HookCtx {
  return {
    sessionId: SESSION,
    userId: "u-1",
    // No appId: resolveWorkspace's per-user branch, which needs no app row.
    metadata: {},
    env: () => undefined,
    sql,
  };
}

// Stands in for streamClaudeCodeChat: replays a scripted SSE-shaped script
// through `send`, and hands any permission request to the injected resolver.
function fakeStream(
  script: Array<{ type: string; [k: string]: unknown }>,
  opts: { permission?: { id: string; toolName: string; input: Record<string, unknown> }; fail?: string } = {},
): { stream: SidecarStream; decisions: PermissionDecision[] } {
  const decisions: PermissionDecision[] = [];
  const stream: SidecarStream = async (args) => {
    if (opts.permission && args.resolvePermission) {
      decisions.push(await args.resolvePermission(opts.permission));
    }
    for (const e of script) args.send(e);
    if (opts.fail) throw new Error(opts.fail);
    return { content: "", toolCalls: [] };
  };
  return { stream, decisions };
}

async function drain(ctx: HookCtx, stream: SidecarStream) {
  const engine = createSidecarEngine(ctx, { stream });
  const translate = createSdkTranslator();
  const events: Array<{ type: string; data: unknown }> = [];
  for await (const m of engine.run({ sessionId: SESSION, turnId: TURN, prompt: "do it" })) {
    const e = translate(m);
    if (e) events.push(e);
  }
  return events;
}

Deno.test("sidecar engine: text and tool traffic arrive as the events eve's translator produces", async () => {
  const { stream } = fakeStream([
    { type: "chunk", content: "working" },
    { type: "chunk", content: "\n<!--tool:c-1-->\n" },
    { type: "tool_call_start", callId: "c-1", name: "Bash", args: { command: "ls" } },
    { type: "tool_call_end", callId: "c-1", name: "Bash", result: "a.txt" },
    { type: "token_usage", prompt_tokens: 11, completion_tokens: 7 },
  ]);
  const events = await drain(hookCtx(fakeSql()), stream);

  assertEquals(events.map((e) => e.type), [
    "message.appended",
    "actions.requested",
    "action.result",
    "turn.completed",
  ]);
  // The legacy UI's tool breadcrumb is transport chrome, not model output.
  assertEquals((events[0].data as { messageDelta: string }).messageDelta, "working");
  assertEquals((events[1].data as { actions: Array<{ toolName: string }> }).actions[0].toolName, "Bash");
  assertEquals(
    (events[2].data as { result: { toolName: string; output: unknown } }).result,
    { kind: "tool-result", callId: "c-1", toolName: "Bash", output: "a.txt" },
  );
  assertEquals((events[3].data as { usage: unknown }).usage, { inputTokens: 11, outputTokens: 7 });
});

Deno.test("sidecar engine: a sidecar failure ends the stream with a terminal failure, never silently", async () => {
  const { stream } = fakeStream([{ type: "chunk", content: "partial" }], { fail: "Claude Code server failed to start" });
  const events = await drain(hookCtx(fakeSql()), stream);

  assertEquals(events.map((e) => e.type), ["message.appended", "turn.failed"]);
  assertEquals((events[1].data as { message: string }).message, "Claude Code server failed to start");
});

Deno.test("sidecar engine: a gated tool opens an eve approval keyed to the real turn, and an approval lets it proceed", async () => {
  const seen: AgentEvent[] = [];
  const unsubscribe = subscribe(SESSION, (e) => seen.push(e));
  try {
    const { stream, decisions } = fakeStream([], {
      permission: { id: "p-1", toolName: "Bash", input: { command: "rm -rf /tmp/x" } },
    });
    // Decision already recorded: the gate polls agents.approvals for it.
    await drain(hookCtx(fakeSql({ decision: [{ decision: "approve" }] })), stream);

    assertEquals(decisions, [{ behavior: "allow", updatedInput: { command: "rm -rf /tmp/x" } }]);
    const requested = seen.filter((e) => e.type === "input.requested");
    assertEquals(requested.length, 1);
    // Keyed to THIS turn — the whole reason the decision could move to eve.
    assertEquals((requested[0].data as { turnId: string }).turnId, TURN);
  } finally {
    unsubscribe();
  }
});

Deno.test("sidecar engine: a denial reaches the sidecar as a deny, so the tool does not run", async () => {
  const { stream, decisions } = fakeStream([], {
    permission: { id: "p-2", toolName: "Write", input: { file_path: "/tmp/x", content: "hi" } },
  });
  await drain(hookCtx(fakeSql({ decision: [{ decision: "deny" }] })), stream);

  assertEquals(decisions, [{ behavior: "deny", message: "denied by user" }]);
});

Deno.test("sidecar engine: a sticky 'never' consent denies without ever opening a request", async () => {
  const seen: AgentEvent[] = [];
  const unsubscribe = subscribe(SESSION, (e) => seen.push(e));
  try {
    const { stream, decisions } = fakeStream([], {
      permission: { id: "p-3", toolName: "Bash", input: { command: "ls" } },
    });
    await drain(hookCtx(fakeSql({ consent: [{ consent: "never" }] })), stream);

    assertEquals(decisions, [{ behavior: "deny", message: "denied by user" }]);
    assertEquals(seen.filter((e) => e.type === "input.requested").length, 0);
  } finally {
    unsubscribe();
  }
});

Deno.test("sidecar engine: an unauthenticated request cannot reach the sidecar at all", async () => {
  const engine = createSidecarEngine({ ...hookCtx(fakeSql()), userId: undefined }, { stream: fakeStream([]).stream });
  let threw = "";
  try {
    for await (const _ of engine.run({ sessionId: SESSION, turnId: TURN, prompt: "do it" })) { /* drains */ }
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e);
  }
  assert(threw.includes("authenticated user"));
});

Deno.test("sidecar engine: events with no eve counterpart are dropped rather than mistranslated", () => {
  for (const type of ["step", "subagent_start", "questionnaire", "consent_request", "done"]) {
    assertEquals(toSdkMessage({ type }, SESSION), null);
  }
});
