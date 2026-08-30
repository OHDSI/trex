import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { mirrorEveTurn, type MirrorDeps } from "./chat-mirror.ts";

// Merges writes into a per-session row (rather than overwriting it), so
// setDevxChatId's dedicated write and a prior seeded row can coexist — the
// same shape the real claw.orchestrations table gives.
function fakeSql() {
  const store = new Map<string, any>();
  const fn = (sql: string, params: unknown[] = []) => {
    if (sql.trim().startsWith("SELECT")) {
      const r = store.get(String(params[0]));
      return Promise.resolve({ rows: r ? [r] : [] });
    }
    const existing = store.get(String(params[0])) ?? { session_id: params[0] };
    store.set(String(params[0]), { ...existing, devx_chat_id: params[1] });
    return Promise.resolve({ rows: [] });
  };
  return { fn, store };
}

function fakeFetchOk() {
  const calls: { url: string; body: any }[] = [];
  const fn = ((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;
  return { fn, calls };
}

async function withCapturedError(run: () => Promise<void>): Promise<unknown[]> {
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    await run();
  } finally {
    console.error = original;
  }
  return errors;
}

Deno.test("mirrorEveTurn creates a chat on first use and posts both messages", async () => {
  const sql = fakeSql();
  const fetchStub = fakeFetchOk();
  const ensureCalls: Array<string | null> = [];
  const deps: MirrorDeps = {
    mintToken: () => Promise.resolve("tok"),
    ensureChat: (_token, _appId, existingChatId) => {
      ensureCalls.push(existingChatId);
      return Promise.resolve("devx-chat-1");
    },
    fetch: fetchStub.fn,
  };

  await mirrorEveTurn(sql.fn, {
    sessionId: "s1",
    userId: "u1",
    appId: null,
    existingDevxChatId: null,
    userMessage: "hi",
    replyText: "hello",
  }, deps);

  assertEquals(ensureCalls, [null]);
  assertEquals(fetchStub.calls.length, 2);
  assertEquals(fetchStub.calls[0].body.role, "user");
  assertEquals(fetchStub.calls[0].body.content, "hi");
  assertEquals(fetchStub.calls[1].body.role, "assistant");
  assertEquals(fetchStub.calls[1].body.content, "hello");
  assertEquals(sql.store.get("s1").devx_chat_id, "devx-chat-1");
});

Deno.test("mirrorEveTurn reuses the persisted chat id on a later turn instead of creating another", async () => {
  const sql = fakeSql();
  sql.store.set("s1", { session_id: "s1", devx_chat_id: "devx-chat-1" });
  const fetchStub = fakeFetchOk();
  const ensureCalls: Array<string | null> = [];
  const deps: MirrorDeps = {
    mintToken: () => Promise.resolve("tok"),
    ensureChat: (_token, _appId, existingChatId) => {
      ensureCalls.push(existingChatId);
      return Promise.resolve("devx-chat-1");
    },
    fetch: fetchStub.fn,
  };

  await mirrorEveTurn(sql.fn, {
    sessionId: "s1",
    userId: "u1",
    appId: null,
    existingDevxChatId: "devx-chat-1",
    userMessage: "next",
    replyText: "ok",
  }, deps);

  assertEquals(ensureCalls, ["devx-chat-1"]); // reuse, not a fresh create
  assertEquals(fetchStub.calls.length, 2); // still mirrors this turn's messages
});

Deno.test("mirrorEveTurn swallows a failing chat creation and never throws", async () => {
  const sql = fakeSql();
  const deps: MirrorDeps = {
    mintToken: () => Promise.resolve("tok"),
    ensureChat: () => Promise.reject(new Error("boom")),
    fetch: fakeFetchOk().fn,
  };
  const errors = await withCapturedError(() =>
    mirrorEveTurn(sql.fn, {
      sessionId: "s1",
      userId: "u1",
      appId: null,
      existingDevxChatId: null,
      userMessage: "hi",
      replyText: "hello",
    }, deps)
  );
  assertEquals(errors.length, 1);
  assertStringIncludes(String(errors[0]), "devx chat mirror");
});

Deno.test("mirrorEveTurn swallows a failing message POST and never throws", async () => {
  const sql = fakeSql();
  const deps: MirrorDeps = {
    mintToken: () => Promise.resolve("tok"),
    ensureChat: () => Promise.resolve("devx-chat-1"),
    fetch: (() => Promise.resolve(new Response("server error", { status: 500 }))) as typeof fetch,
  };
  const errors = await withCapturedError(() =>
    mirrorEveTurn(sql.fn, {
      sessionId: "s1",
      userId: "u1",
      appId: null,
      existingDevxChatId: null,
      userMessage: "hi",
      replyText: "hello",
    }, deps)
  );
  assertEquals(errors.length, 1);
  assertStringIncludes(String(errors[0]), "devx chat mirror");
  // The chat id it DID manage to create is still persisted, even though the
  // message post that followed failed.
  assertEquals(sql.store.get("s1").devx_chat_id, "devx-chat-1");
});
