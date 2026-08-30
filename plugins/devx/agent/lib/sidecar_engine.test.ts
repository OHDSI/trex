import { assert, assertEquals } from "jsr:@std/assert";
import { createSidecarEngine, type PermissionDecision, type SidecarStream, toSdkMessage } from "./sidecar_engine.ts";
import type { HookCtx } from "../../../../core/server/agents/eve-shim/types.ts";
import { createSdkTranslator } from "../../../../core/server/agents/service/engine/events.ts";
import { subscribe } from "../../../../core/server/agents/service/stream.ts";
import { coarseScopeKey, deriveScopeKey } from "../../../../core/server/agents/service/scope-key.ts";
import { ensureAppWorkspace, getRunWorktreePath, getWorkspacePath } from "../../functions/tools/workspace.ts";
import type { AgentEvent } from "../../../../core/server/agents/service/events.ts";

// The engine's contract is "produce what core's translator reads", so the
// translation assertions run the yielded messages through the REAL translator
// rather than eyeballing the SDK shapes.

const SESSION = "s-eng-1";
const TURN = "t-eng-1";

/** Routes on SQL text like the real pool would route on the query itself. */
function fakeSql(over: Record<string, unknown[]> = {}, consentByKey: Record<string, string> = {}) {
  return (sql: string, params: unknown[] = []) => {
    if (sql.includes("FROM agents.sessions")) {
      // gateContext and store.isUnattended both read this row, exactly as
      // they do in production.
      return Promise.resolve({ rows: over.session ?? [{ plugin: "devx", agent: "coder", unattended: false }] });
    }
    if (sql.includes("FROM devx.settings")) return Promise.resolve({ rows: over.settings ?? [{ model: "sonnet" }] });
    if (sql.includes("agents.channel_sessions")) return Promise.resolve({ rows: over.channel ?? [] });
    if (sql.includes("FROM agents.tool_consents")) {
      // Keyed on the scope_key parameter, exactly as the real query is — the
      // coarse-key fallback is invisible to a fake that ignores it.
      const key = String(params[4] ?? "");
      if (key in consentByKey) return Promise.resolve({ rows: [{ consent: consentByKey[key] }] });
      return Promise.resolve({ rows: over.consent ?? [] });
    }
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
  // Short deadline on purpose: a test asserting "this must NOT gate" would
  // otherwise park for the production 30 minutes when it regresses, turning a
  // failure into a hang.
  const engine = createSidecarEngine(ctx, { stream, approvalPollMs: 1, approvalTimeoutMs: 150 });
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

// ---------------------------------------------------------------------------
// The unattended path. This is claw's whole working mode, and it is the half
// the first cut of this file never exercised: fakeSql always said
// unattended:false, so "an unattended coder runs Write and Bash without a
// human" was asserted nowhere.
// ---------------------------------------------------------------------------

const UNATTENDED = [{ plugin: "devx", agent: "coder", unattended: true }];

// Runs one permission request and reports both the decision the sidecar got
// and whether a human was asked (an eve gate always announces itself first).
async function decide(
  sqlOver: Record<string, unknown[]>,
  permission: { id: string; toolName: string; input: Record<string, unknown> },
  consentByKey: Record<string, string> = {},
) {
  const seen: AgentEvent[] = [];
  const unsubscribe = subscribe(SESSION, (e) => seen.push(e));
  try {
    const { stream, decisions } = fakeStream([], { permission });
    await drain(hookCtx(fakeSql(sqlOver, consentByKey)), stream);
    return { decision: decisions[0], gated: seen.filter((e) => e.type === "input.requested").length };
  } finally {
    unsubscribe();
  }
}

Deno.test("sidecar engine: an unattended turn writes files without parking on a human", async () => {
  const { decision, gated } = await decide({ session: UNATTENDED }, {
    id: "p-u1",
    toolName: "Write",
    input: { file_path: "/w/src/main.rs", content: "fn main() {}" },
  });
  assertEquals(decision, { behavior: "allow", updatedInput: { file_path: "/w/src/main.rs", content: "fn main() {}" } });
  assertEquals(gated, 0);
});

Deno.test("sidecar engine: a channel-bound session counts as unattended even though its column says otherwise", async () => {
  // spawn.ts: a channel session never writes agents.sessions.unattended, so
  // reading the column alone would gate every build command on a claw coder.
  const { decision, gated } = await decide(
    { session: [{ plugin: "devx", agent: "coder", unattended: false }], channel: [{ ok: 1 }] },
    { id: "p-u2", toolName: "Bash", input: { command: "cargo build --release" } },
  );
  assertEquals(decision.behavior, "allow");
  assertEquals(gated, 0);
});

Deno.test("sidecar engine: read-only and build commands stay ungated for an unattended turn", async () => {
  for (const command of ["git status", "git diff HEAD~1", "git log --oneline -5", "cargo build", "npm test"]) {
    const { decision, gated } = await decide({ session: UNATTENDED }, {
      id: `p-ok-${command}`,
      toolName: "Bash",
      input: { command },
    });
    assertEquals(decision.behavior, "allow", `${command} must stay ungated`);
    assertEquals(gated, 0, `${command} must not park on a human`);
  }
});

Deno.test("sidecar engine: an unattended turn cannot push, run psql or touch cron without a human", async () => {
  for (
    const command of [
      "git push --force origin main",
      "cd /w && git push",
      'bash -lc "git push origin main"',
      "git -C /w/repo push",
      "psql -c 'drop table users'",
      "crontab -r",
    ]
  ) {
    const { decision } = await decide({ session: UNATTENDED }, {
      id: `p-no-${command}`,
      toolName: "Bash",
      input: { command },
    });
    assertEquals(decision.behavior, "deny", `${command} must not run unattended`);
  }
});

Deno.test("sidecar engine: a channel-bound push is asked rather than refused outright", async () => {
  // The hard tier denies an unattended session but GATES a channel-bound one:
  // claw has somewhere to put the question.
  const { decision, gated } = await decide(
    { session: [{ plugin: "devx", agent: "coder", unattended: false }], channel: [{ ok: 1 }], decision: [{ decision: "approve" }] },
    { id: "p-u3", toolName: "Bash", input: { command: "git push origin main" } },
  );
  assertEquals(decision.behavior, "allow");
  assertEquals(gated, 1);
});

Deno.test("sidecar engine: a 'never' recorded before Bash keys carried a subcommand still refuses", async () => {
  // The ONLY row this user has is keyed on the OLD coarse action, which is what
  // an existing deployment's agents.tool_consents actually holds. Nothing
  // rewrites it, so the gate has to find it or the refusal silently lapses.
  const workspace = getWorkspacePath("u-1");
  const command = "git clean -fdx";
  assertEquals(coarseScopeKey(deriveScopeKey("Bash", { command }, workspace)), `${workspace}+git`);
  const { decision, gated } = await decide(
    { session: UNATTENDED },
    { id: "p-old", toolName: "Bash", input: { command } },
    { [`${workspace}+git`]: "never" },
  );
  assertEquals(decision, { behavior: "deny", message: "denied by user" });
  assertEquals(gated, 0);
});

Deno.test("sidecar engine: `git subtree push` cannot slip past the floor unattended", async () => {
  const { decision } = await decide({ session: UNATTENDED }, {
    id: "p-subtree",
    toolName: "Bash",
    input: { command: "git subtree push --prefix=dist origin gh-pages" },
  });
  assertEquals(decision.behavior, "deny");
});

// The delegated half of the claw fix: the engine has to READ
// agents.sessions.approver_reachable and hand it to the gate, or a relayed
// coder session running on the sidecar is refused where the model loop asks.
const WATCHED = [{ plugin: "devx", agent: "coder", unattended: false, approver_reachable: true }];

Deno.test("sidecar engine: a watched (relayed) session is asked for a push, not refused", async () => {
  const { decision, gated } = await decide(
    { session: WATCHED, decision: [{ decision: "approve" }] },
    { id: "p-claw", toolName: "Bash", input: { command: "git push origin main" } },
  );
  assertEquals(decision.behavior, "allow");
  assertEquals(gated, 1);
});

Deno.test("sidecar engine: the same session without an approver is refused outright", async () => {
  const { decision, gated } = await decide(
    { session: [{ plugin: "devx", agent: "coder", unattended: false }], decision: [{ decision: "approve" }] },
    { id: "p-noclaw", toolName: "Bash", input: { command: "git push origin main" } },
  );
  assertEquals(decision, { behavior: "deny", message: "requires approval but this session has no approver" });
  assertEquals(gated, 0);
});

Deno.test("sidecar engine: an unattended session with a reachable approver is still asked, never allowed outright", async () => {
  const { decision, gated } = await decide(
    {
      session: [{ plugin: "devx", agent: "coder", unattended: true, approver_reachable: true }],
      decision: [{ decision: "deny" }],
    },
    { id: "p-unatt", toolName: "Bash", input: { command: "git push --force origin main" } },
  );
  assertEquals(decision, { behavior: "deny", message: "denied by user" });
  assertEquals(gated, 1);
});

// ---------------------------------------------------------------------------
// The session's declared scope (V14) on THIS path. core's runDelegatedTurn
// calls neither resolveInstructions nor buildSdkTools, so agent.ts's
// filterTools / resolveWorkspace never fire for a claude-code turn — without
// the engine reading the scope itself both capabilities are inert here.
// ---------------------------------------------------------------------------

/** fakeSql, plus the V14 scope row (the only SELECT naming tool_allowlist). */
function scopedSql(scopeRow: Record<string, unknown>, over: Record<string, unknown[]> = {}): HookCtx["sql"] {
  const base = fakeSql(over);
  return (sql: string, params: unknown[] = []) =>
    sql.includes("tool_allowlist") ? Promise.resolve({ rows: [scopeRow] }) : base(sql, params);
}

async function runScoped(
  session: string,
  sql: HookCtx["sql"],
  opts: {
    metadata?: unknown;
    permission?: { id: string; toolName: string; input: Record<string, unknown> };
  } = {},
) {
  const decisions: PermissionDecision[] = [];
  let workspacePathOverride: string | undefined;
  let allowedTools: readonly string[] | undefined;
  const stream: SidecarStream = async (args) => {
    workspacePathOverride = args.workspacePathOverride;
    allowedTools = args.allowedTools;
    if (opts.permission && args.resolvePermission) decisions.push(await args.resolvePermission(opts.permission));
    return { content: "", toolCalls: [] };
  };
  const ctx: HookCtx = { ...hookCtx(sql), sessionId: session, metadata: opts.metadata ?? {} };
  const engine = createSidecarEngine(ctx, { stream, approvalPollMs: 1, approvalTimeoutMs: 150 });
  for await (const _ of engine.run({ sessionId: session, turnId: TURN, prompt: "do it" })) { /* drains */ }
  return { decisions, workspacePathOverride, allowedTools };
}

Deno.test("sidecar engine: a delegated turn enforces the session's declared tool allowlist", async () => {
  const session = "s-eng-allowlist";
  const seen: AgentEvent[] = [];
  const unsubscribe = subscribe(session, (e) => seen.push(e));
  try {
    const { decisions } = await runScoped(
      session,
      scopedSql({ tool_allowlist: ["Read"], tool_allowlist_declared: true, workspace_path: "" }, { decision: [{ decision: "approve" }] }),
      { permission: { id: "p-al", toolName: "Bash", input: { command: "rm -rf /tmp/x" } } },
    );
    assertEquals(decisions, [{ behavior: "deny", message: "Bash is not in this session's tool allowlist" }]);
    // Refused by the allowlist, never turned into an approval a human could grant.
    assertEquals(seen.filter((e) => e.type === "input.requested").length, 0);
  } finally {
    unsubscribe();
  }
});

Deno.test("sidecar engine: an allowlisted tool still reaches eve's approval gate", async () => {
  const { decisions } = await runScoped(
    "s-eng-allowlist-hit",
    scopedSql({ tool_allowlist: ["Bash"], tool_allowlist_declared: true, workspace_path: "" }, { decision: [{ decision: "approve" }] }),
    { permission: { id: "p-al2", toolName: "Bash", input: { command: "rm -rf /tmp/x" } } },
  );
  assertEquals(decisions, [{ behavior: "allow", updatedInput: { command: "rm -rf /tmp/x" } }]);
});

// The inverted-default trap: an EMPTY allowlist declares "no tools", not "all".
Deno.test("sidecar engine: a declared EMPTY allowlist denies every gated tool", async () => {
  const { decisions } = await runScoped(
    "s-eng-allowlist-empty",
    scopedSql({ tool_allowlist: [], tool_allowlist_declared: true, workspace_path: "" }, { decision: [{ decision: "approve" }] }),
    { permission: { id: "p-al3", toolName: "Read", input: { file_path: "/tmp/x" } } },
  );
  assertEquals(decisions, [{ behavior: "deny", message: "Read is not in this session's tool allowlist" }]);
});

Deno.test("sidecar engine: an undeclared allowlist leaves every tool available, exactly as today", async () => {
  const { decisions } = await runScoped(
    "s-eng-allowlist-none",
    scopedSql({ workspace_path: "" }, { decision: [{ decision: "approve" }] }),
    { permission: { id: "p-al4", toolName: "Bash", input: { command: "rm -rf /tmp/x" } } },
  );
  assertEquals(decisions, [{ behavior: "allow", updatedInput: { command: "rm -rf /tmp/x" } }]);
});

Deno.test("sidecar engine: a delegated turn runs in the declared worktree, not the app tree", async () => {
  const declared = getRunWorktreePath("u-1", "app-eng", "run-9");
  const { workspacePathOverride } = await runScoped("s-eng-ws", scopedSql({ workspace_path: declared }), {
    metadata: { appId: "app-eng" },
  });
  assertEquals(workspacePathOverride, declared);
});

// Same acceptance rule as agent.ts's: independent of the turn's metadata.appId.
Deno.test("sidecar engine: the declared worktree survives a turn whose metadata omits or changes appId", async () => {
  const declared = getRunWorktreePath("u-1", "app-eng", "run-9");
  for (const metadata of [{}, { appId: "app-other" }, undefined]) {
    const { workspacePathOverride } = await runScoped("s-eng-ws-drift", scopedSql({ workspace_path: declared }), { metadata });
    assertEquals(workspacePathOverride, declared);
  }
});

Deno.test("sidecar engine: a rejected declared workspace falls back to the derived tree", async () => {
  const { workspacePathOverride } = await runScoped("s-eng-ws-bad", scopedSql({ workspace_path: "/etc" }), {
    metadata: { appId: "app-eng" },
  });
  assertEquals(workspacePathOverride, await ensureAppWorkspace("u-1", "app-eng"));
});

// canUseTool alone cannot close the allowlist: the SDK auto-approves the
// read-only built-ins in `default` permission mode, so Read/Glob/Grep never
// reach it. The allowlist therefore also has to reach the sidecar's query()
// as the SDK `tools` option (server.js), which is what drops them from the
// model's context in the first place.
Deno.test("sidecar engine: the declared allowlist is handed to the sidecar, not only to canUseTool", async () => {
  const { allowedTools } = await runScoped(
    "s-eng-allowlist-forward",
    scopedSql({ tool_allowlist: ["Read", "Grep"], tool_allowlist_declared: true, workspace_path: "" }),
  );
  assertEquals(allowedTools, ["Read", "Grep"]);
});

Deno.test("sidecar engine: a declared EMPTY allowlist is forwarded as empty, never as absent", async () => {
  const { allowedTools } = await runScoped(
    "s-eng-allowlist-forward-empty",
    scopedSql({ tool_allowlist: [], tool_allowlist_declared: true, workspace_path: "" }),
  );
  assertEquals(allowedTools, []);
});

Deno.test("sidecar engine: an undeclared allowlist forwards nothing, leaving the SDK preset alone", async () => {
  const { allowedTools } = await runScoped(
    "s-eng-allowlist-forward-none",
    scopedSql({ tool_allowlist: [], tool_allowlist_declared: false, workspace_path: "" }),
  );
  assertEquals(allowedTools, undefined);
});
