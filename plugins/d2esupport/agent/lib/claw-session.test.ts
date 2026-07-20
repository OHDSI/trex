import { assertEquals, assertInstanceOf } from "jsr:@std/assert";
import { ClawTurnError, runClawTurn } from "./claw-session.ts";

// Mimics handler.ts's /stream: listEvents().slice(startIndex) — every event
// before startIndex (prior turns' replayed history) is withheld, exactly
// like the real service.
function fakeClaw(events: unknown[]) {
  const calls: { url: string; method: string; body?: string }[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method ?? "GET", body: init?.body ? String(init.body) : undefined });
    if (u.includes("/stream")) {
      const startIndex = Number(new URL(u).searchParams.get("startIndex") ?? "0") || 0;
      const body = events.slice(startIndex).map((e) => JSON.stringify(e)).join("\n") + "\n";
      return new Response(body, { status: 200 });
    }
    if (u.endsWith("/eve/v1/session")) {
      return Response.json({ sessionId: "claw-1" });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

Deno.test("creates a session, streams the reply, stops on turn.completed", async () => {
  const { calls, fetchImpl } = fakeClaw([
    { type: "message.completed", data: { message: "on it", turnId: "t1" } },
    { type: "turn.completed", data: { turnId: "t1" } },
  ]);
  const r = await runClawTurn({ clawSessionId: null, message: "SUPPORT_TASK\n...", userId: "u1", startCursor: 0, fetchImpl, mint: async () => "tok" });
  assertEquals(r.clawSessionId, "claw-1");
  assertEquals(r.replyText, "on it");
  assertEquals(r.nextCursor, 2);
  assertEquals(calls[0].method, "POST");
});

Deno.test("continues an existing session via /session/:id", async () => {
  const { calls, fetchImpl } = fakeClaw([
    { type: "message.completed", data: { message: "ok" } },
    { type: "session.waiting", data: {} },
  ]);
  const r = await runClawTurn({ clawSessionId: "claw-9", message: "more", userId: "u1", startCursor: 0, fetchImpl, mint: async () => "tok" });
  assertEquals(r.clawSessionId, "claw-9");
  assertEquals(calls[0].url.includes("/eve/v1/session/claw-9"), true);
});

Deno.test("startCursor skips a replayed prior turn's terminal event", async () => {
  // Full server-side history for the session: a PRIOR turn's terminal event
  // (turn.completed) followed by the CURRENT turn's events. Without cursor
  // filtering, startIndex=0 would return the stale turn.completed first and
  // the caller would return the previous turn's ack instantly.
  const { calls, fetchImpl } = fakeClaw([
    { type: "message.completed", data: { message: "stale ack", turnId: "t-old" } },
    { type: "turn.completed", data: { turnId: "t-old" } },
    { type: "message.completed", data: { message: "fresh ack", turnId: "t-new" } },
    { type: "turn.completed", data: { turnId: "t-new" } },
  ]);
  const r = await runClawTurn({ clawSessionId: "claw-9", message: "follow-up", userId: "u1", startCursor: 2, fetchImpl, mint: async () => "tok" });
  assertEquals(r.replyText, "fresh ack");
  assertEquals(r.nextCursor, 4);
  const streamCall = calls.find((c) => c.url.includes("/stream"));
  assertEquals(streamCall?.url.includes("startIndex=2"), true);
});

Deno.test("a prior turn's stale failure is not surfaced when startCursor skips it", async () => {
  const { fetchImpl } = fakeClaw([
    { type: "turn.failed", data: { turnId: "t-old", message: "old failure" } },
    { type: "message.completed", data: { message: "this turn is fine", turnId: "t-new" } },
    { type: "turn.completed", data: { turnId: "t-new" } },
  ]);
  const r = await runClawTurn({ clawSessionId: "claw-9", message: "follow-up", userId: "u1", startCursor: 1, fetchImpl, mint: async () => "tok" });
  assertEquals(r.replyText, "this turn is fine");
});

Deno.test("a live turn.failed throws a ClawTurnError carrying the cursor past the failed turn", async () => {
  const { fetchImpl } = fakeClaw([
    { type: "message.completed", data: { message: "stale ack", turnId: "t-old" } },
    { type: "turn.completed", data: { turnId: "t-old" } },
    { type: "turn.failed", data: { turnId: "t-new", message: "boom" } },
  ]);
  let caught: unknown;
  try {
    await runClawTurn({ clawSessionId: "claw-9", message: "follow-up", userId: "u1", startCursor: 2, fetchImpl, mint: async () => "tok" });
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, ClawTurnError);
  // startCursor(2) + 1 line read (the turn.failed line itself), matching the
  // success path's "count the terminal line" convention.
  assertEquals((caught as ClawTurnError).nextCursor, 3);
  assertEquals((caught as ClawTurnError).clawSessionId, "claw-9");
});
