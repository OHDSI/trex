// Unit tests for the devx eve-adapter (task-v1-brief.md): toDevxCtx/wrap,
// exercised against a fake ToolContext. ensureWorkspace/ensureAppWorkspace
// are NOT mocked — they touch the real filesystem under DEVX_WORKSPACE_DIR
// (redirected to a scratch dir below), matching devx's existing precedent
// of exercising the real fs in tests rather than injecting a fake one.
//
// Manifest loading (loadAgent + buildAgentWorkerConfig against this same
// plugins/devx/agent dir) is instead covered by
// core/server/plugin/agents.test.ts, NOT here — see this file's design note
// in the task-v1 report for why: this file's only runtime dependency is the
// "eve"/"eve/tools" bare specifiers (resolved for local runs via
// plugins/devx/agent/local-test-import-map.json, a plain import map that
// is neither a `deno.json` picked up by buildAgentWorkerConfig's own merge
// nor a workspace-member config Deno's root workspace would reject), while
// loadAgent/buildAgentWorkerConfig transitively pull in express/pg/edn-data
// — real dependencies only resolvable inside core/server's own, already
// fully-configured Deno workspace member.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { toDevxCtx, wrap } from "./context.ts";
import type { LegacyToolDef } from "./context.ts";
import type { ToolContext } from "../../../../core/server/agents/eve-shim/types.ts";

// Redirect workspace.ts's DEFAULT_WORKSPACE_DIR to a scratch dir for the
// duration of this test file, so tests don't write into the shared
// /tmp/devx-workspaces used by a real running server.
const SCRATCH = await Deno.makeTempDir({ prefix: "devx-agent-context-test-" });
Deno.env.set("DEVX_WORKSPACE_DIR", SCRATCH);

function fakeToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "s-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// toDevxCtx
// ---------------------------------------------------------------------------

Deno.test("toDevxCtx: userId comes ONLY from ToolContext.userId, never from metadata", async () => {
  const ctx = fakeToolContext({
    userId: "real-user",
    // deno-lint-ignore no-explicit-any
    metadata: { mode: "build", chatId: "c-1", userId: "attacker-supplied-id" } as any,
    sql: () => Promise.resolve({ rows: [] }),
  });
  const devxCtx = await toDevxCtx(ctx as ToolContext & { sql: NonNullable<ToolContext["sql"]> });
  assertEquals(devxCtx.userId, "real-user");
});

Deno.test("toDevxCtx: workspacePath uses ensureWorkspace when metadata has no appId", async () => {
  const ctx = fakeToolContext({
    userId: "u-1",
    metadata: { mode: "build", chatId: "c-1" },
    sql: () => Promise.resolve({ rows: [] }),
  });
  const devxCtx = await toDevxCtx(ctx as ToolContext & { sql: NonNullable<ToolContext["sql"]> });
  assertEquals(devxCtx.workspacePath, `${SCRATCH}/u-1`);
  assert((await Deno.stat(devxCtx.workspacePath)).isDirectory);
  assertEquals(devxCtx.appId, null);
  assertEquals(devxCtx.chatId, "c-1");
});

Deno.test("toDevxCtx: workspacePath uses ensureAppWorkspace when metadata carries an appId", async () => {
  const ctx = fakeToolContext({
    userId: "u-2",
    metadata: { mode: "build", chatId: "c-2", appId: "app-9" },
    sql: () => Promise.resolve({ rows: [] }),
  });
  const devxCtx = await toDevxCtx(ctx as ToolContext & { sql: NonNullable<ToolContext["sql"]> });
  assertEquals(devxCtx.workspacePath, `${SCRATCH}/u-2/app-9`);
  assert((await Deno.stat(devxCtx.workspacePath)).isDirectory);
  assertEquals(devxCtx.appId, "app-9");
});

Deno.test("toDevxCtx: send routes through evectx.emit, defaulting the event name to 'devx'", async () => {
  const emitted: Array<[string, unknown]> = [];
  const ctx = fakeToolContext({
    userId: "u-3",
    metadata: { mode: "build", chatId: "c-3" },
    sql: () => Promise.resolve({ rows: [] }),
    emit: (name, data) => emitted.push([name, data]),
  });
  const devxCtx = await toDevxCtx(ctx as ToolContext & { sql: NonNullable<ToolContext["sql"]> });
  devxCtx.send({ type: "custom-event", value: 1 });
  devxCtx.send({ value: 2 }); // no `type` field -> defaults to "devx"
  assertEquals(emitted, [
    ["custom-event", { type: "custom-event", value: 1 }],
    ["devx", { value: 2 }],
  ]);
});

Deno.test("toDevxCtx: send is a no-op (does not throw) when evectx.emit is unwired", async () => {
  const ctx = fakeToolContext({
    userId: "u-4",
    metadata: { mode: "build", chatId: "c-4" },
    sql: () => Promise.resolve({ rows: [] }),
  });
  const devxCtx = await toDevxCtx(ctx as ToolContext & { sql: NonNullable<ToolContext["sql"]> });
  devxCtx.send({ type: "x" }); // must not throw
});

Deno.test("toDevxCtx: sql is passed through verbatim", async () => {
  const sql = (_q: string) => Promise.resolve({ rows: [{ ok: true }] });
  const ctx = fakeToolContext({ userId: "u-5", metadata: { mode: "build", chatId: "c-5" }, sql });
  const devxCtx = await toDevxCtx(ctx as ToolContext & { sql: NonNullable<ToolContext["sql"]> });
  assertEquals(devxCtx.sql, sql);
  assertEquals(await devxCtx.sql("select 1"), { rows: [{ ok: true }] });
});

Deno.test("toDevxCtx: requireConsent always resolves true (approval is enforced upstream by needsApproval)", async () => {
  const ctx = fakeToolContext({ userId: "u-6", metadata: { mode: "build", chatId: "c-6" }, sql: () => Promise.resolve({ rows: [] }) });
  const devxCtx = await toDevxCtx(ctx as ToolContext & { sql: NonNullable<ToolContext["sql"]> });
  assertEquals(await devxCtx.requireConsent({ toolName: "anything" }), true);
});

Deno.test("toDevxCtx: throws a clear error when ToolContext.sql is missing", async () => {
  const ctx = fakeToolContext({ userId: "u-7", metadata: { mode: "build", chatId: "c-7" } });
  await assertRejects(
    // deno-lint-ignore no-explicit-any
    () => toDevxCtx(ctx as any),
    Error,
    "hookCtx.sql",
  );
});

// ---------------------------------------------------------------------------
// wrap()
// ---------------------------------------------------------------------------

function legacyDef(overrides: Partial<LegacyToolDef<{ x?: number }>> = {}): LegacyToolDef<{ x?: number }> {
  return {
    description: "a legacy devx tool",
    schema: { type: "object", properties: { x: { type: "number" } } },
    execute: (args) => Promise.resolve(`got ${JSON.stringify(args)}`),
    ...overrides,
  };
}

Deno.test("wrap: defaultConsent 'ask' maps to needsApproval: true", () => {
  const tool = wrap(legacyDef({ defaultConsent: "ask" }));
  assertEquals(tool.needsApproval, true);
});

Deno.test("wrap: defaultConsent 'always'/'never'/undefined does NOT set needsApproval", () => {
  assertEquals(wrap(legacyDef({ defaultConsent: "always" })).needsApproval, false);
  assertEquals(wrap(legacyDef({ defaultConsent: "never" })).needsApproval, false);
  assertEquals(wrap(legacyDef({})).needsApproval, false);
});

Deno.test("wrap: modifiesState is carried through as a passthrough field", () => {
  assertEquals(wrap(legacyDef({ modifiesState: true })).modifiesState, true);
  assertEquals(wrap(legacyDef({ modifiesState: false })).modifiesState, false);
  assertEquals(wrap(legacyDef({})).modifiesState, undefined);
});

Deno.test("wrap: description/inputSchema pass through unchanged", () => {
  const schema = { type: "object", properties: { x: { type: "number" } } };
  const tool = wrap(legacyDef({ description: "desc here", schema }));
  assertEquals(tool.description, "desc here");
  assertEquals(tool.inputSchema, schema);
});

Deno.test("wrap: execute adapts ToolContext to DevxAgentContext and forwards args/result", async () => {
  // deno-lint-ignore no-explicit-any
  let seenCtx: any;
  const tool = wrap(
    legacyDef({
      execute: (args, ctx) => {
        seenCtx = ctx;
        return Promise.resolve(`x=${args.x}`);
      },
    }),
  );
  const evectx = fakeToolContext({
    userId: "u-8",
    metadata: { mode: "build", chatId: "c-8" },
    sql: () => Promise.resolve({ rows: [] }),
  });
  const result = await tool.execute!({ x: 42 }, evectx);
  assertEquals(result, "x=42");
  assertEquals(seenCtx.userId, "u-8");
  assertEquals(seenCtx.chatId, "c-8");
  assertEquals(typeof seenCtx.send, "function");
  assertEquals(typeof seenCtx.sql, "function");
  assertEquals(typeof seenCtx.requireConsent, "function");
});

Deno.test("wrap: __trexTool brand is set (loader.ts checks this on every tools/*.ts default export)", () => {
  const tool = wrap(legacyDef()) as unknown as { __trexTool?: boolean };
  assertEquals(tool.__trexTool, true);
});
