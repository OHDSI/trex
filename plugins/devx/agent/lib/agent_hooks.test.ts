// H2/H3 wiring for the eve loop: user-configured PreToolUse/PostToolUse/Stop
// hooks (devx.hooks) and attachment materialization now fire on this loop
// the same way they did on the legacy one (functions/agent.ts:235 for hooks,
// functions/index.ts:405-408 for attachments). See agent.ts's own comments
// on turnHooks/onToolCall/onToolResult/onTurnEnd/buildUserMessage for the
// contract each is called under.
import { assert, assertEquals } from "jsr:@std/assert";
import { buildUserMessage, onToolCall, onToolResult, onTurnEnd } from "../agent.ts";

// `captured` records `${query}::${params}` -- loadHooks (functions/skills/
// hooks.ts) binds the event name as $1, it is never inlined into the query
// text itself, so a caller wanting to assert "loaded once for event X" must
// capture params too, not just grep the query string.
function ctxWithHooks(rows: any[], captured?: { queries: string[] }) {
  return {
    sessionId: "s1",
    userId: "u1",
    metadata: { chatId: "c1", appId: "a1" },
    env: () => undefined,
    sql: (q: string, params?: unknown[]) => {
      captured?.queries.push(`${q}::${JSON.stringify(params ?? [])}`);
      if (q.includes("devx.hooks")) return Promise.resolve({ rows });
      return Promise.resolve({ rows: [] });
    },
  } as any;
}

// A "deny" verdict only ever comes out of hooks.ts's executeCommandHook via
// a real subprocess run through the Trex-runtime DuckDB bridge
// (globalThis.Trex.databaseManager(), functions/duckdb.ts) -- absent in a
// plain `deno test` process (confirmed: the brief's literal fixture, with no
// hook_type at all, resolves to {allow:true} here, not false -- hook_type
// missing means executeHook's final `return {action:"approve"}` fires
// unconditionally; adding hook_type:"command" alone still resolves to
// {allow:true} because executeCommandHook's own ALLOWED_EXECUTABLES/
// duckdb-unavailable paths both fail OPEN, "don't block on hook failures").
// Reproducing an actual deny -- to prove onToolCall's OWN wiring correctly
// turns a hooks.ts deny verdict into {allow:false} -- means stubbing the one
// seam hooks.ts reads through, same "stop at/stub the Trex-runtime boundary"
// precedent as agent/lib/tools_batch_a.test.ts.
Deno.test("a blocking PreToolUse row denies the tool call", async () => {
  const originalTrex = (globalThis as any).Trex;
  (globalThis as any).Trex = {
    databaseManager: () => ({
      getConnection: () => ({
        connection: {
          execute: async () => [
            { column0: JSON.stringify({ exit_code: 0, output: JSON.stringify({ action: "deny" }) }) },
          ],
          close: () => {},
        },
      }),
    }),
  };
  try {
    const ctx = ctxWithHooks([
      { id: "h1", event: "PreToolUse", matcher: "Bash", hook_type: "command", command: "bash -c block", enabled: true, sort_order: 0 },
    ]);
    const decision = await onToolCall({ name: "Bash", input: { command: "rm -rf /" } }, ctx);
    assertEquals(decision.allow, false);
    assert(decision.reason?.includes("PreToolUse"));
  } finally {
    (globalThis as any).Trex = originalTrex;
  }
});

Deno.test("a non-matching PreToolUse row leaves the call alone", async () => {
  const ctx = ctxWithHooks([
    { id: "h1", event: "PreToolUse", matcher: "Write", hook_type: "command", command: "exit 2", enabled: true, sort_order: 0 },
  ]);
  const decision = await onToolCall({ name: "Bash", input: { command: "ls" } }, ctx);
  assertEquals(decision.allow, true);
});

Deno.test("hook rows load once per turn, not once per tool call", async () => {
  const captured = { queries: [] as string[] };
  const ctx = ctxWithHooks([], captured);
  await onToolCall({ name: "Bash", input: {} }, ctx);
  await onToolCall({ name: "Read", input: {} }, ctx);
  await onToolCall({ name: "Write", input: {} }, ctx);
  const hookQueries = captured.queries.filter((q) => q.includes("devx.hooks") && q.includes("PreToolUse"));
  assertEquals(hookQueries.length, 1, "PreToolUse rows must be loaded once per turn");
});

Deno.test("PostToolUse hooks pass a non-string tool result through untouched", async () => {
  const ctx = ctxWithHooks([
    { id: "h1", event: "PostToolUse", matcher: "*", hook_type: "command", command: "exit 2", enabled: true, sort_order: 0 },
  ]);
  const structured = { ok: true, files: ["a.ts"] };
  const out = await onToolResult({ name: "Read", input: {}, result: structured }, ctx);
  assert(out === structured, "a non-string result must pass through unmodified, not be JSON-stringified");
});

Deno.test("onToolResult is a no-op when no PostToolUse hooks are configured", async () => {
  const ctx = ctxWithHooks([]);
  const out = await onToolResult({ name: "Read", input: {}, result: "file contents" }, ctx);
  assertEquals(out, "file contents");
});

// The attachment test performs a fetch that would otherwise go out over the
// network and fail/hang in a sandboxed test run. plugins/devx/functions/
// attachments.test.ts stubs the network at globalThis.fetch (not a second
// mocking layer) -- reused verbatim here, restored in `finally`.
Deno.test("buildUserMessage appends materialized attachment paths, never content", async () => {
  const workspacePath = await Deno.makeTempDir();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
  try {
    const ctx = {
      sessionId: "s1",
      userId: "u1",
      metadata: {
        chatId: "c1",
        appId: "a1",
        attachments: [{ url: "https://example.invalid/a.png", name: "a.png" }],
      },
      env: () => undefined,
      sql: () => Promise.resolve({ rows: [] }),
    } as any;
    const out = await buildUserMessage("fix the header", ctx);
    assert(out.startsWith("fix the header"));
    assert(out.includes("<user_attachments>"));
    assert(out.includes("a.png"));
    assert(!out.includes("\x01\x02\x03"), "only the path may enter the prompt, never file bytes/content");
  } finally {
    globalThis.fetch = originalFetch;
    await Deno.remove(workspacePath, { recursive: true }).catch(() => {});
  }
});

Deno.test("buildUserMessage is a no-op with no attachments", async () => {
  const ctx = {
    sessionId: "s1",
    userId: "u1",
    metadata: { chatId: "c1", appId: "a1" },
    env: () => undefined,
    sql: () => Promise.resolve({ rows: [] }),
  } as any;
  assertEquals(await buildUserMessage("just build it", ctx), "just build it");
});

Deno.test("buildUserMessage is a no-op with no appId (no workspace to materialize into)", async () => {
  const ctx = {
    sessionId: "s1",
    userId: "u1",
    metadata: { chatId: "c1", attachments: [{ url: "https://example.invalid/a.png", name: "a.png" }] },
    env: () => undefined,
    sql: () => Promise.resolve({ rows: [] }),
  } as any;
  assertEquals(await buildUserMessage("just build it", ctx), "just build it");
});

Deno.test("onTurnEnd runs Stop hooks with the turn's final text", async () => {
  const seen: string[] = [];
  const ctx = {
    sessionId: "s1",
    userId: "u1",
    metadata: { chatId: "c1" },
    env: () => undefined,
    sql: (q: string) => {
      if (q.includes("devx.hooks")) {
        seen.push("loaded");
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    },
  } as any;
  await onTurnEnd({ text: "done", finishReason: "stop" }, ctx);
  assertEquals(seen, ["loaded"]);
});

Deno.test("onTurnEnd is a no-op when the turn carries no chatId", async () => {
  const ctx = {
    sessionId: "s1",
    userId: "u1",
    metadata: {},
    env: () => undefined,
    sql: () => Promise.resolve({ rows: [] }),
  } as any;
  // Must not throw even though there is nowhere to run Stop hooks against.
  await onTurnEnd({ text: "done", finishReason: "stop" }, ctx);
});

Deno.test("PreToolUse/PostToolUse/Stop caches are independent turns per HookCtx object", async () => {
  // Two distinct HookCtx objects (as core builds one per request) must not
  // share a cache entry -- each gets its own load.
  const captured1 = { queries: [] as string[] };
  const captured2 = { queries: [] as string[] };
  const ctx1 = ctxWithHooks([], captured1);
  const ctx2 = ctxWithHooks([], captured2);
  await onToolCall({ name: "Bash", input: {} }, ctx1);
  await onToolCall({ name: "Bash", input: {} }, ctx2);
  assertEquals(captured1.queries.filter((q) => q.includes("devx.hooks")).length, 1);
  assertEquals(captured2.queries.filter((q) => q.includes("devx.hooks")).length, 1);
});
