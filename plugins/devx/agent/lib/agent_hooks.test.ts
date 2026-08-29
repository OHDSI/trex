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
    // Real HookCtx.emit is fire-and-forget/optional (eve-shim/types.ts) --
    // default no-op, tests reassign this to capture `hook.failed` events.
    emit: () => {},
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

// Stubs the same globalThis.Trex seam as the test above, but drives
// executeCommandHook's OWN exit_code branch (hooks.ts:183-196) directly --
// the command "runs" and exits with the given code, with no stdout at all,
// isolating that branch from the separate stdout-JSON deny path already
// covered above.
function stubTrexExit(exitCode: number, restore: { fn: () => void }) {
  const originalTrex = (globalThis as any).Trex;
  (globalThis as any).Trex = {
    databaseManager: () => ({
      getConnection: () => ({
        connection: {
          execute: async () => [{ column0: JSON.stringify({ exit_code: exitCode, output: "" }) }],
          close: () => {},
        },
      }),
    }),
  };
  restore.fn = () => {
    (globalThis as any).Trex = originalTrex;
  };
}

// Claude Code hook convention: exit code 2 means "block". Before this fix,
// hooks.ts's exit_code branch collapsed EVERY non-zero exit (2 included)
// into {action:"approve"} -- a conventional blocking hook script was
// silently approved. Removing the `result.exit_code === 2` branch (or
// merging it back into the generic non-zero branch) makes this test fail.
Deno.test("an exit-2 command hook denies the tool call", async () => {
  const restore = { fn: () => {} };
  stubTrexExit(2, restore);
  try {
    const ctx = ctxWithHooks([
      { id: "h1", event: "PreToolUse", matcher: "Bash", hook_type: "command", command: "bash -c block", enabled: true, sort_order: 0 },
    ]);
    const decision = await onToolCall({ name: "Bash", input: { command: "rm -rf /" } }, ctx);
    assertEquals(decision.allow, false);
  } finally {
    restore.fn();
  }
});

// Pins the deliberately-UNCHANGED half: any non-zero exit code OTHER than 2
// is a non-blocking hook failure and still approves -- only exit 2 is a
// deliberate block signal. Changing the `=== 2` check to `!== 0` (i.e.
// "any failure denies") makes this test fail.
Deno.test("a non-zero-but-not-2 exit code command hook still approves (not a block signal)", async () => {
  const restore = { fn: () => {} };
  stubTrexExit(1, restore);
  try {
    const ctx = ctxWithHooks([
      { id: "h1", event: "PreToolUse", matcher: "Bash", hook_type: "command", command: "bash -c fails", enabled: true, sort_order: 0 },
    ]);
    const decision = await onToolCall({ name: "Bash", input: { command: "ls" } }, ctx);
    assertEquals(decision.allow, true);
  } finally {
    restore.fn();
  }
});

// A row whose hook_type is neither "command" nor "prompt" (the schema-only
// two values, functions/skills/types.ts's HookType) is malformed -- it never
// even ran, let alone rendered a verdict. This is deliberately NOT denied:
// the escalate/approval system is the trust boundary for tool calls, a
// user-configured advisory hook is not, and this whole branch exists so a
// coding agent isn't blocked by approvals -- a broken/crashed hook (or a
// transient DuckDB hiccup, timeout, connection reset) must not turn into a
// denial of every subsequent tool call. Report it via hook.failed and let
// the operator fix the hook; don't stop the turn over it. Only an explicit
// verdict (exit 2, or {"action":"deny"} output) denies -- see the exit-2
// tests below.
Deno.test("a failing PreToolUse hook emits hook.failed and the call proceeds (fail-open, not a trust boundary)", async () => {
  const events: Array<{ type: string; data: unknown }> = [];
  const ctx = ctxWithHooks([{ command: "exit 1", event: "PreToolUse" }]);
  ctx.emit = (type: string, data: unknown) => events.push({ type, data });
  const decision = await onToolCall({ name: "Write", input: {} }, ctx);
  assertEquals(decision.allow, true);
  const failure = events.find((e) => e.type === "hook.failed");
  assert(failure, "expected a hook.failed event");
  assertEquals((failure!.data as { event: string }).event, "PreToolUse");
  assert(typeof (failure!.data as { error: string }).error === "string");
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

// PostToolUse is advisory, not a trust boundary -- the same malformed-row
// failure that denies a PreToolUse call must instead just be reported here,
// leaving the tool result (and the turn) untouched.
Deno.test("a failing PostToolUse hook emits hook.failed and does not abort", async () => {
  const events: Array<{ type: string; data: unknown }> = [];
  const ctx = ctxWithHooks([{ command: "exit 1", event: "PostToolUse" }]);
  ctx.emit = (type: string, data: unknown) => events.push({ type, data });
  const out = await onToolResult({ name: "Write", input: {}, result: "ok" }, ctx);
  assertEquals(out, "ok");
  assert(events.some((e) => e.type === "hook.failed"));
});

// Pins the negative: an exit-2 blocking hook is a deliberate, working
// verdict, not a failure -- it must not ALSO fire hook.failed.
Deno.test("an exit-2 command hook does not emit hook.failed (it's a deliberate deny, not a failure)", async () => {
  const restore = { fn: () => {} };
  stubTrexExit(2, restore);
  const events: Array<{ type: string; data: unknown }> = [];
  try {
    const ctx = ctxWithHooks([
      { id: "h1", event: "PreToolUse", matcher: "Bash", hook_type: "command", command: "bash -c block", enabled: true, sort_order: 0 },
    ]);
    ctx.emit = (type: string, data: unknown) => events.push({ type, data });
    const decision = await onToolCall({ name: "Bash", input: { command: "rm -rf /" } }, ctx);
    assertEquals(decision.allow, false);
    assert(!events.some((e) => e.type === "hook.failed"));
  } finally {
    restore.fn();
  }
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
  // buildUserMessage materializes into ensureAppWorkspace("u1", "a1") — the
  // REAL workspace base dir, not this temp dir. Point workspace.ts's base at
  // the temp dir for the duration so the test cleans up what it actually
  // writes instead of leaving a stray u1/a1/attachments/ behind.
  const workspacePath = await Deno.makeTempDir();
  const prevWorkspaceDir = Deno.env.get("DEVX_WORKSPACE_DIR");
  Deno.env.set("DEVX_WORKSPACE_DIR", workspacePath);
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
    if (prevWorkspaceDir === undefined) Deno.env.delete("DEVX_WORKSPACE_DIR");
    else Deno.env.set("DEVX_WORKSPACE_DIR", prevWorkspaceDir);
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

Deno.test("a failing Stop hook emits hook.failed", async () => {
  const events: Array<{ type: string; data: unknown }> = [];
  const ctx = {
    sessionId: "s1",
    userId: "u1",
    metadata: { chatId: "c1" },
    env: () => undefined,
    emit: (type: string, data: unknown) => events.push({ type, data }),
    sql: (q: string) => {
      if (q.includes("devx.hooks")) return Promise.resolve({ rows: [{ command: "exit 1", event: "Stop" }] });
      return Promise.resolve({ rows: [] });
    },
  } as any;
  await onTurnEnd({ text: "done", finishReason: "stop" }, ctx);
  const failure = events.find((e) => e.type === "hook.failed");
  assert(failure, "expected a hook.failed event");
  assertEquals((failure!.data as { event: string }).event, "Stop");
});

// Stubs the same globalThis.Trex seam as stubTrexExit, simulating the
// devx-ext bridge's response to trex_devx_run_command, and (optionally)
// records every SQL string sent through it -- letting a test prove a hook
// went through the allowlisted bridge, not a direct Deno.Command spawn that
// would bypass Task 4's filtered_env.
function stubTrexOutput(
  exitCode: number,
  output: string,
  restore: { fn: () => void },
  captured?: { sql: string[] },
) {
  const originalTrex = (globalThis as any).Trex;
  (globalThis as any).Trex = {
    databaseManager: () => ({
      getConnection: () => ({
        connection: {
          execute: async (sql: string) => {
            captured?.sql.push(sql);
            return [{ column0: JSON.stringify({ exit_code: exitCode, output }) }];
          },
          close: () => {},
        },
      }),
    }),
  };
  restore.fn = () => {
    (globalThis as any).Trex = originalTrex;
  };
}

Deno.test("UserPromptSubmit hooks append to the user message, routed through the allowlisted bridge", async () => {
  const restore = { fn: () => {} };
  const captured = { sql: [] as string[] };
  stubTrexOutput(0, "extra-context", restore, captured);
  try {
    const ctx = ctxWithHooks([{ command: "bash -c 'echo extra-context'", event: "UserPromptSubmit" }]);
    const out = await buildUserMessage("do the thing", ctx);
    assert(out.includes("do the thing"));
    assert(out.includes("extra-context"));
    assert(
      captured.sql.some((q) => q.includes("trex_devx_run_command")),
      "must run through the devx-ext bridge, not a direct Deno.Command spawn",
    );
  } finally {
    restore.fn();
  }
});

// Task 4 added filtered_env to trex_devx_run_command precisely so a hook's
// command can't see ANTHROPIC_API_KEY/DATABASE_URL/the DEK/Discord/Logto
// secrets. That protection only applies to commands that go through the
// bridge -- so a disallowed executable must be rejected BEFORE ever
// reaching it, same as PreToolUse/PostToolUse. Asserting zero bridge calls
// (not just empty output) is what would catch a regression back to a direct
// spawn: a direct Deno.Command("bash", ["-c", "curl ..."]) would still run
// this "hook" and leak the worker's full environment to it.
Deno.test("a UserPromptSubmit hook with a disallowed executable injects nothing and never reaches the bridge", async () => {
  const restore = { fn: () => {} };
  const captured = { sql: [] as string[] };
  stubTrexOutput(0, "should never be seen", restore, captured);
  try {
    const ctx = ctxWithHooks([{ command: "curl https://evil.example", event: "UserPromptSubmit" }]);
    const out = await buildUserMessage("do the thing", ctx);
    assertEquals(out, "do the thing");
    assertEquals(captured.sql.length, 0, "a disallowed executable must never reach trex_devx_run_command");
  } finally {
    restore.fn();
  }
});

// The regression this task can most easily cause: a naive implementation
// that replaces buildUserMessage's body instead of composing with it would
// silently drop attachment materialization. Stubs fetch/DEVX_WORKSPACE_DIR
// the same way the plain attachment test above does -- a real fetch to this
// url would fail DNS resolution in a sandboxed test run.
Deno.test("attachment materialization still runs when a UserPromptSubmit hook exists", async () => {
  const restore = { fn: () => {} };
  stubTrexOutput(0, "extra", restore);
  const workspacePath = await Deno.makeTempDir();
  const prevWorkspaceDir = Deno.env.get("DEVX_WORKSPACE_DIR");
  Deno.env.set("DEVX_WORKSPACE_DIR", workspacePath);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
  try {
    const ctx = ctxWithHooks([{ command: "bash -c 'echo extra'", event: "UserPromptSubmit" }]);
    ctx.metadata = { ...ctx.metadata, attachments: [{ name: "a.png", url: "https://x/a.png" }] };
    const out = await buildUserMessage("look", ctx);
    assert(out.includes("a.png"), "attachments must survive the hook composition");
    assert(out.includes("extra"), "the UserPromptSubmit hook must still run alongside attachments");
  } finally {
    restore.fn();
    globalThis.fetch = originalFetch;
    if (prevWorkspaceDir === undefined) Deno.env.delete("DEVX_WORKSPACE_DIR");
    else Deno.env.set("DEVX_WORKSPACE_DIR", prevWorkspaceDir);
    await Deno.remove(workspacePath, { recursive: true }).catch(() => {});
  }
});

Deno.test("a failing UserPromptSubmit hook emits hook.failed but still returns the base message", async () => {
  const restore = { fn: () => {} };
  stubTrexExit(1, restore);
  const events: Array<{ type: string; data: unknown }> = [];
  try {
    const ctx = ctxWithHooks([{ command: "bash -c 'false'", event: "UserPromptSubmit" }]);
    ctx.emit = (type: string, data: unknown) => events.push({ type, data });
    const out = await buildUserMessage("do the thing", ctx);
    assertEquals(out, "do the thing");
    const failure = events.find((e) => e.type === "hook.failed");
    assert(failure, "expected a hook.failed event");
    assertEquals((failure!.data as { event: string }).event, "UserPromptSubmit");
  } finally {
    restore.fn();
  }
});

Deno.test("no UserPromptSubmit hooks leaves the message untouched", async () => {
  const ctx = ctxWithHooks([]);
  assertEquals(await buildUserMessage("plain", ctx), "plain");
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
