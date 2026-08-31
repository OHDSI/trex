import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert";
import askCodeAgentTool, { askCore, providerFromSettings, routeCodeTurn, type CodeTurnOutcome, type TransportDeps } from "./askCodeAgent.ts";
import type { CodeTurnArgs } from "../lib/code-stream.ts";
import type { TokioClient } from "../lib/code-session.ts";
import type { MirrorDeps } from "../lib/chat-mirror.ts";

function fakeSql() {
  const store = new Map<string, any>();
  const calls: string[] = [];
  const fn = (sql: string, params: unknown[] = []) => {
    calls.push(sql.split("\n")[0].trim());
    if (sql.startsWith("SELECT")) {
      const r = store.get(String(params[0]));
      return Promise.resolve({ rows: r ? [r] : [] });
    }
    store.set(String(params[0]), {
      session_id: params[0], code_session_id: params[1], event_cursor: params[2], app_id: params[3] ?? null,
    });
    return Promise.resolve({ rows: [] });
  };
  return { fn, store, calls };
}

// Stubs code-stream's runCodeTurn: records the args askCore passed and returns a
// canned reply + chat id, so the orchestration logic is exercised without a
// live coder.
function stubTurn(reply = "ok", chatId = "chat-1") {
  const seen: CodeTurnArgs[] = [];
  const fn = (args: CodeTurnArgs) => {
    seen.push(args);
    return Promise.resolve({ chatId, replyText: reply });
  };
  return { fn, seen };
}

Deno.test("askCore opens a coder chat on first use and stores its id", async () => {
  const sql = fakeSql();
  const turn = stubTurn("on it — here is my plan", "chat-1");
  const out = await askCore(
    sql.fn,
    { sessionId: "s1", userId: "u1" },
    { message: "Build X with acceptance criteria Y" },
    turn.fn,
  );
  assertEquals(out.reply, "on it — here is my plan");
  assertEquals(turn.seen[0].chatId, null); // first use — no prior chat
  assertEquals(turn.seen[0].message, "Build X with acceptance criteria Y");
  assertEquals(turn.seen[0].userId, "u1");
  const row = sql.store.get("s1");
  assertEquals(row.code_session_id, "chat-1");
  assertEquals(Number(row.event_cursor), 0);
});

Deno.test("askCore passes the chosen app on first call and persists it", async () => {
  const sql = fakeSql();
  const turn = stubTurn();
  await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "Build X", app: "app-7" }, turn.fn);
  assertEquals(turn.seen[0].appId, "app-7");
  assertEquals(sql.store.get("s1").app_id, "app-7");
});

Deno.test("askCore keeps the stored app once the chat exists (mid-task change ignored)", async () => {
  const sql = fakeSql();
  sql.store.set("s1", { session_id: "s1", code_session_id: "chat-1", event_cursor: 0, app_id: "app-7" });
  const turn = stubTurn();
  await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "continue", app: "app-9" }, turn.fn);
  assertEquals(turn.seen[0].appId, "app-7"); // stored app wins
  assertEquals(sql.store.get("s1").app_id, "app-7");
});

Deno.test("askCore continues the SAME coder chat", async () => {
  const sql = fakeSql();
  sql.store.set("s1", { session_id: "s1", code_session_id: "chat-1", event_cursor: 0, app_id: null });
  const turn = stubTurn("answered", "chat-1");
  const out = await askCore(
    sql.fn,
    { sessionId: "s1", userId: "u1" },
    { message: "the team says: use option B" },
    turn.fn,
  );
  assertEquals(out.reply, "answered");
  assertEquals(turn.seen[0].chatId, "chat-1"); // continues the stored chat
});

// The heartbeat is wired through askCodeAgent so claw can still show a sign of
// life while blocked inside this hand-off.
Deno.test("askCore passes onProgress to the coder turn when a channelId is available", async () => {
  const sql = fakeSql();
  const turn = stubTurn();
  await askCore(sql.fn, { sessionId: "s1", userId: "u1", channelId: "chan-1" }, { message: "go" }, turn.fn);
  assertEquals(typeof turn.seen[0].onProgress, "function");
});

Deno.test("askCore passes no onProgress at all when there is no channelId — never a no-op timer", async () => {
  const sql = fakeSql();
  const turn = stubTurn();
  await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "go" }, turn.fn);
  assertEquals(turn.seen[0].onProgress, undefined);
});

Deno.test("askCore's onProgress posts 'Still on it: <note>' to the channel and swallows a post failure", async () => {
  const sql = fakeSql();
  const turn = stubTurn();
  const originalFetch = globalThis.fetch;
  const originalToken = Deno.env.get("DISCORD_BOT_TOKEN");
  const posts: { url: string; body: unknown }[] = [];
  try {
    Deno.env.set("DISCORD_BOT_TOKEN", "tok-1");
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      posts.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return Promise.resolve(new Response("{}", { status: 500 })); // fails — must be swallowed
    }) as typeof fetch;

    await askCore(sql.fn, { sessionId: "s1", userId: "u1", channelId: "chan-1" }, { message: "go" }, turn.fn);
    const onProgress = turn.seen[0].onProgress!;
    onProgress("running tests");
    // Fire-and-forget: give the swallowed rejection a tick to settle before
    // asserting — a failing heartbeat must never surface as an unhandled
    // rejection or throw back into the caller.
    await new Promise((r) => setTimeout(r, 0));

    assertEquals(posts.length, 1);
    assertEquals(posts[0].url.includes("chan-1"), true);
    assertEquals((posts[0].body as { content: string }).content, "Still on it: running tests");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) Deno.env.delete("DISCORD_BOT_TOKEN");
    else Deno.env.set("DISCORD_BOT_TOKEN", originalToken);
  }
});

// Settled decisions ride every hand-off.
Deno.test("askCore prepends the decision ledger to the forwarded message when decisions exist", async () => {
  const sql = fakeSql();
  sql.store.set("s1", {
    session_id: "s1",
    code_session_id: "chat-1",
    event_cursor: 0,
    app_id: null,
    decisions: [{ at: "2026-08-06T12:00:00Z", question: "follow-up window", decision: "configurable, default 365 days" }],
  });
  const turn = stubTurn();
  await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "next step: implement it" }, turn.fn);
  assertStringIncludes(turn.seen[0].message, "Already settled");
  assertStringIncludes(turn.seen[0].message, "follow-up window: configurable, default 365 days");
  assertStringIncludes(turn.seen[0].message, "next step: implement it");
});

Deno.test("askCore leaves the message untouched when there are no decisions yet", async () => {
  const sql = fakeSql();
  const turn = stubTurn();
  await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "Build X" }, turn.fn);
  assertEquals(turn.seen[0].message, "Build X");
});

// The coder's reply ends with a machine trailer; the channel must never see
// it, and claw gets the parsed facts back.
Deno.test("askCore strips the handoff trailer from the reply and returns it parsed", async () => {
  const sql = fakeSql();
  const reply = 'Implemented and tested.\n\n<handoff track="light" saved="trex/specs/x.md" tests="4/4 pass"/>';
  const turn = stubTurn(reply);
  const out = await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "go" }, turn.fn);
  assertEquals(out.reply, "Implemented and tested.");
  assertEquals(out.trailer?.track, "light");
  assertEquals(out.trailer?.saved, "trex/specs/x.md");
  assertEquals(out.trailer?.tests, "4/4 pass");
});

Deno.test("askCore returns a null trailer and the reply unchanged when the coder sends no trailer", async () => {
  const sql = fakeSql();
  const turn = stubTurn("Just prose, no trailer.");
  const out = await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "go" }, turn.fn);
  assertEquals(out.reply, "Just prose, no trailer.");
  assertEquals(out.trailer, null);
});

// --- a coder turn that parks on a human approval ---------------------------

// Stubs the EVE transport's richer result: how the turn ended, where the cursor
// got to, and what it is parked on.
function stubEveTurn(result: Partial<CodeTurnOutcome>) {
  const seen: CodeTurnArgs[] = [];
  const fn = (args: CodeTurnArgs) => {
    seen.push(args);
    return Promise.resolve({ chatId: "chat-1", replyText: "", ...result } as CodeTurnOutcome);
  };
  return { fn, seen };
}

async function withDiscord(fn: (posts: { url: string; body: Record<string, unknown> }[]) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const originalToken = Deno.env.get("DISCORD_BOT_TOKEN");
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  try {
    Deno.env.set("DISCORD_BOT_TOKEN", "tok-1");
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      posts.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return Promise.resolve(new Response(JSON.stringify({ id: "msg-1" }), { status: 200 }));
    }) as typeof fetch;
    await fn(posts);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) Deno.env.delete("DISCORD_BOT_TOKEN");
    else Deno.env.set("DISCORD_BOT_TOKEN", originalToken);
  }
}

Deno.test("askCore posts the coder's approval gate to the thread and reports the park instead of a reply", async () => {
  await withDiscord(async (posts) => {
    const sql = fakeSql();
    const turn = stubEveTurn({
      nextCursor: 5,
      reason: "input-requested",
      pending: [{ requestId: "req-1", toolName: "runCommand", input: { cmd: "rm -rf build" } }],
    });
    const out = await askCore(
      sql.fn,
      { sessionId: "s1", userId: "u1", channelId: "chan-1" },
      { message: "go" },
      turn.fn,
    );

    assertEquals(posts.length, 1);
    assertStringIncludes(posts[0].url, "/channels/chan-1/messages");
    const row = (posts[0].body.components as Array<{ components: Array<Record<string, unknown>> }>)[0].components[0];
    assertEquals(row.custom_id, "eve_choice");
    assertStringIncludes(out.reply, "req-1");
    assertStringIncludes(out.reply, "PAUSED");
    assertEquals(out.trailer, null);
    // The cursor the park reported is what a re-attach will resume from.
    assertEquals(Number(sql.store.get("s1").event_cursor), 5);
  });
});

Deno.test("askCore still hands the requestId over when there is no channel to render the gate in", async () => {
  const sql = fakeSql();
  const turn = stubEveTurn({
    nextCursor: 2,
    reason: "input-requested",
    pending: [{ requestId: "req-1", toolName: "runCommand", input: {} }],
  });
  const out = await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "go" }, turn.fn);
  assertStringIncludes(out.reply, "req-1");
  assertStringIncludes(out.reply, "resolveCoderApproval");
});

Deno.test("askCore stores the turn's cursor when the transport reports one, and 0 when it does not", async () => {
  const eve = fakeSql();
  await askCore(eve.fn, { sessionId: "s1", userId: "u1" }, { message: "go" }, stubEveTurn({
    replyText: "done",
    nextCursor: 12,
    reason: "completed",
  }).fn);
  assertEquals(Number(eve.store.get("s1").event_cursor), 12);

  const legacy = fakeSql();
  await askCore(legacy.fn, { sessionId: "s1", userId: "u1" }, { message: "go" }, stubTurn("done").fn);
  assertEquals(Number(legacy.store.get("s1").event_cursor), 0);
});

// --- routeCodeTurn: real provider-based routing wired for production --------
// (askCore's own tests above always inject an explicit runTurn stub and so
// never exercise this; these tests drive routeCodeTurn directly with fake
// deps — never mintToken/Trex.req, which only resolve inside a staged worker.)

function baseArgs(overrides: Partial<CodeTurnArgs> = {}): CodeTurnArgs {
  return { chatId: null, message: "go", userId: "u1", appId: null, ...overrides };
}

function fakeClient(): TokioClient {
  return { req: () => Promise.resolve(new Response("{}", { status: 200 })) };
}

Deno.test("routeCodeTurn calls the eve transport for a claude-code account too", async () => {
  const seenEve: unknown[] = [];
  const deps: TransportDeps = {
    runLegacy: () => {
      throw new Error("must not call legacy — eve hosts the sidecar since phase 2");
    },
    runEve: (_client, runArgs) => {
      seenEve.push(runArgs);
      return Promise.resolve({ codeSessionId: "sess-1", replyText: "ok", nextCursor: 2, reason: "completed", pending: [] });
    },
    getClient: () => fakeClient(),
  };
  const out = await routeCodeTurn(baseArgs(), 0, deps);
  assertEquals(out.replyText, "ok");
  assertEquals(out.transport, "eve");
  assertEquals(seenEve.length, 1);
});

Deno.test("routeCodeTurn calls the eve transport for a non-claude-code account", async () => {
  const seenEve: unknown[] = [];
  const deps: TransportDeps = {
    runLegacy: () => {
      throw new Error("must not call legacy for an anthropic account");
    },
    runEve: (_client, runArgs) => {
      seenEve.push(runArgs);
      return Promise.resolve({
        codeSessionId: "sess-1",
        replyText: "done",
        nextCursor: 7,
        reason: "completed",
        pending: [],
      });
    },
    getClient: () => fakeClient(),
  };
  const out = await routeCodeTurn(baseArgs({ chatId: "sess-0" }), 3, deps);
  assertEquals(out.chatId, "sess-1");
  assertEquals(out.replyText, "done");
  assertEquals(out.nextCursor, 7);
  assertEquals(out.reason, "completed");
  assertEquals(seenEve.length, 1);
  assertEquals((seenEve[0] as { codeSessionId: string }).codeSessionId, "sess-0");
  assertEquals((seenEve[0] as { startCursor: number }).startCursor, 3);
});

// The transport no longer depends on the account's provider, so a turn must not
// read devx settings to pick one — reading them first is what deadlocked a
// fresh deployment (the read threw on the `null` body of a missing row, and the
// only code that CREATES that row ran after it).
Deno.test("routeCodeTurn reads no settings before the turn — nothing to fail, nothing to fall back from", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("must not read devx settings to choose a transport");
  }) as typeof fetch;
  try {
    const out = await routeCodeTurn(baseArgs(), 0, {
      ensureProvider: () => Promise.resolve(),
      runLegacy: () => {
        throw new Error("must not call legacy");
      },
      runEve: () =>
        Promise.resolve({ codeSessionId: "sess-1", replyText: "ok", nextCursor: 1, reason: "completed", pending: [] }),
      getClient: () => fakeClient(),
    });
    assertEquals(out.transport, "eve");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("providerFromSettings tolerates the null body a missing devx.settings row returns", () => {
  assertEquals(providerFromSettings(null), undefined);
  assertEquals(providerFromSettings({}), undefined);
  assertEquals(providerFromSettings({ provider: 7 }), undefined);
  assertEquals(providerFromSettings({ provider: "claude-code" }), "claude-code");
});

Deno.test("routeCodeTurn refuses attachments with no appId on the eve transport instead of silently dropping them", async () => {
  const deps: TransportDeps = {
    runEve: () => {
      throw new Error("must not reach the coder — attachments would be silently dropped");
    },
    getClient: () => fakeClient(),
  };
  const args = baseArgs({ appId: null, attachments: [{ name: "a.png", url: "https://x/a.png" }] });
  await assertRejects(() => routeCodeTurn(args, 0, deps), Error, "attachments need an app");
});

Deno.test("routeCodeTurn allows attachments through on eve when an appId is present", async () => {
  const seenEve: unknown[] = [];
  const deps: TransportDeps = {
    runEve: (_client, runArgs) => {
      seenEve.push(runArgs);
      return Promise.resolve({ codeSessionId: "sess-1", replyText: "ok", nextCursor: 1, reason: "completed", pending: [] });
    },
    getClient: () => fakeClient(),
  };
  const args = baseArgs({ appId: "app-1", attachments: [{ name: "a.png", url: "https://x/a.png" }] });
  await routeCodeTurn(args, 0, deps);
  assertEquals(seenEve.length, 1);
});

Deno.test("routeCodeTurn throws when eve is chosen but Trex.req is unavailable", async () => {
  const deps: TransportDeps = {
    runEve: () => {
      throw new Error("must not call eve with no client");
    },
    getClient: () => null,
  };
  await assertRejects(() => routeCodeTurn(baseArgs(), 0, deps), Error, "Trex.req unavailable");
});

// CLAW_CODER_PROVIDER used to be asserted only inside the legacy runCodeTurn;
// with everything on eve, an unasserted pin would be silently ignored and a
// live verification would run against settings nobody wrote.
Deno.test("routeCodeTurn asserts the pinned coder provider BEFORE the eve turn", async () => {
  const order: string[] = [];
  const deps: TransportDeps = {
    ensureProvider: (userId) => {
      order.push(`ensure:${userId}`);
      return Promise.resolve();
    },
    runEve: () => {
      order.push("eve");
      return Promise.resolve({ codeSessionId: "sess-1", replyText: "ok", nextCursor: 1, reason: "completed", pending: [] });
    },
    getClient: () => fakeClient(),
  };
  await routeCodeTurn(baseArgs(), 0, deps);
  assertEquals(order, ["ensure:u1", "eve"]);
});

// Routing claude-code to eve must not bypass the create-body flag: without it
// the hard escalate tier reads the session as unapprovable and the ship step's
// `git push` is DENIED outright rather than relayed to the channel.
Deno.test("a claude-code session opened through the eve transport declares approverReachable", async () => {
  const reqs: { url: string; init: { method: string; body?: string } }[] = [];
  const client: TokioClient = {
    req(url, init) {
      reqs.push({ url, init });
      if (url.includes("/pending-approval")) return Promise.resolve(Response.json({ pending: null }));
      if (init.method === "POST") return Promise.resolve(Response.json({ sessionId: "code-1" }));
      const events = [
        { type: "message.completed", data: { message: "shipped" } },
        { type: "turn.completed", data: {} },
      ].map((e) => JSON.stringify(e)).join("\n") + "\n";
      return Promise.resolve(new Response(events, { headers: { "content-type": "application/x-ndjson" } }));
    },
  };
  // No runEve stub: this drives code-session.ts's real runCodeTurn.
  const out = await routeCodeTurn(baseArgs(), 0, {
    runLegacy: () => {
      throw new Error("must not call legacy for a claude-code account");
    },
    getClient: () => client,
  });
  assertEquals(out.transport, "eve");
  assertEquals(out.replyText, "shipped");
  const create = reqs.find((r) => r.init.method === "POST");
  assert(create, "expected a session create POST");
  assertEquals(JSON.parse(create.init.body ?? "{}").approverReachable, true);
});

// --- devx-UI mirroring: eve turns only, never legacy ------------------------
// (regression: PR #176's live devx-UI visibility was built on the legacy
// transport's server-side /chats,/messages writes; the eve transport never
// touches those tables on its own — see chat-mirror.ts.)

// Like fakeSql above, but MERGES writes into a session's row instead of
// overwriting it wholesale — askCore issues two distinct writes per eve turn
// (the main orchestration upsert, and chat-mirror's dedicated devx_chat_id
// write), which must coexist the same way they do against the real table.
function fakeSqlMerging() {
  const store = new Map<string, any>();
  const fn = (sql: string, params: unknown[] = []) => {
    if (sql.trim().startsWith("SELECT")) {
      const r = store.get(String(params[0]));
      return Promise.resolve({ rows: r ? [r] : [] });
    }
    const existing = store.get(String(params[0])) ?? { session_id: params[0] };
    if (sql.includes("devx_chat_id = EXCLUDED.devx_chat_id")) {
      store.set(String(params[0]), { ...existing, devx_chat_id: params[1] });
    } else {
      store.set(String(params[0]), {
        ...existing,
        code_session_id: params[1],
        event_cursor: params[2],
        app_id: params[3] ?? null,
      });
    }
    return Promise.resolve({ rows: [] });
  };
  return { fn, store };
}

function stubEveTurnWithTransport(overrides: Partial<CodeTurnOutcome> = {}) {
  return (_args: CodeTurnArgs): Promise<CodeTurnOutcome> =>
    Promise.resolve({
      chatId: "sess-1",
      replyText: "done",
      nextCursor: 1,
      reason: "completed",
      pending: [],
      transport: "eve",
      ...overrides,
    });
}

Deno.test("askCore mirrors an eve turn into devx once and reuses the chat on the next turn", async () => {
  const sql = fakeSqlMerging();
  const ensureCalls: Array<string | null> = [];
  const postedRoles: string[] = [];
  const mirrorDeps: MirrorDeps = {
    mintToken: () => Promise.resolve("tok"),
    ensureChat: (_token, _appId, existingChatId) => {
      ensureCalls.push(existingChatId);
      return Promise.resolve("devx-chat-1");
    },
    fetch: ((_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      postedRoles.push(body.role);
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof fetch,
  };

  await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "go" }, stubEveTurnWithTransport(), mirrorDeps);
  await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "go again" }, stubEveTurnWithTransport(), mirrorDeps);

  assertEquals(ensureCalls, [null, "devx-chat-1"]); // created once, reused on turn 2
  assertEquals(postedRoles, ["user", "assistant", "user", "assistant"]);
  assertEquals(sql.store.get("s1").devx_chat_id, "devx-chat-1");
});

Deno.test("askCore does not mirror a legacy-transport turn", async () => {
  const sql = fakeSqlMerging();
  let mintCalled = false;
  const mirrorDeps: MirrorDeps = {
    mintToken: () => {
      mintCalled = true;
      return Promise.resolve("tok");
    },
  };
  const turn = stubTurn("ok", "chat-1"); // no `transport` field — legacy shape
  await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "go" }, turn.fn, mirrorDeps);
  assertEquals(mintCalled, false);
});

Deno.test("askCore's turn result is intact even when eve mirroring fails outright (chat creation)", async () => {
  const sql = fakeSqlMerging();
  const mirrorDeps: MirrorDeps = { mintToken: () => Promise.reject(new Error("mint failed")) };
  const out = await askCore(
    sql.fn,
    { sessionId: "s1", userId: "u1" },
    { message: "go" },
    stubEveTurnWithTransport({ replyText: "done" }),
    mirrorDeps,
  );
  assertEquals(out.reply, "done");
});

Deno.test("askCore's turn result is intact even when eve mirroring's message POST fails", async () => {
  const sql = fakeSqlMerging();
  const mirrorDeps: MirrorDeps = {
    mintToken: () => Promise.resolve("tok"),
    ensureChat: () => Promise.resolve("devx-chat-1"),
    fetch: (() => Promise.resolve(new Response("fail", { status: 500 }))) as typeof fetch,
  };
  const out = await askCore(
    sql.fn,
    { sessionId: "s1", userId: "u1" },
    { message: "go" },
    stubEveTurnWithTransport({ replyText: "done" }),
    mirrorDeps,
  );
  assertEquals(out.reply, "done");
});

// --- Coder-voice contract: TEXT guard, not a behaviour guard -----------------
//
// This only asserts the PROMPT TEXT hasn't regressed — it cannot verify that
// claw actually behaves this way at runtime (that needs a live model turn).
// The real behavioural check is
// plugins/claw/agent/evals/evals/modes/coder-gets-summary-not-transcript.eval.ts,
// which drives claw against a seeded multi-participant discussion and asserts
// on the RECORDED askCodeAgent argument — but that eval suite needs a live
// stack and is not wired into any CI workflow (see evals/README.md), so
// nothing runs it automatically today. This test exists so an edit that walks
// the description back toward "relay the participants" (the exact instruction
// that produced the leak — see git history on this file) fails the ordinary
// `deno test` gate instead of silently reverting the contract.

function messageInputDescription(): string {
  const schema = askCodeAgentTool.inputSchema as { properties?: Record<string, { description?: unknown }> };
  const description = schema.properties?.message?.description;
  assert(typeof description === "string", "askCodeAgent's `message` input must have a string description");
  return description;
}

Deno.test("askCodeAgent's tool description does not regress toward relaying the channel", () => {
  const description = askCodeAgentTool.description;
  assert(!description.toLowerCase().includes("relay the participants"), "must not reintroduce the transcript-relaying instruction");
  assertStringIncludes(description, "YOUR OWN summary");
  assertStringIncludes(description, "channel, thread, participant, or Discord");
});

Deno.test("askCodeAgent's message input description does not regress toward relaying the channel", () => {
  const description = messageInputDescription();
  assert(!description.toLowerCase().includes("relay the participants"), "must not reintroduce the transcript-relaying instruction");
  assertStringIncludes(description, "YOUR OWN summary");
  assertStringIncludes(description, "channel, thread, participant, or Discord");
});

Deno.test("instructions.md still has the Talking to the coder section", async () => {
  const text = await Deno.readTextFile(new URL("../instructions.md", import.meta.url));
  assertStringIncludes(text, "## Talking to the coder");
});
