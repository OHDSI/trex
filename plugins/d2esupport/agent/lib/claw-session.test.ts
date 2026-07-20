import { assertEquals } from "jsr:@std/assert";
import { runClawTurn } from "./claw-session.ts";

function fakeClaw(events: unknown[]) {
  const calls: { url: string; method: string; body?: string }[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method ?? "GET", body: init?.body ? String(init.body) : undefined });
    if (u.includes("/stream")) {
      const body = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
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
  const r = await runClawTurn({ clawSessionId: null, message: "SUPPORT_TASK\n...", userId: "u1", fetchImpl, mint: async () => "tok" });
  assertEquals(r.clawSessionId, "claw-1");
  assertEquals(r.replyText, "on it");
  assertEquals(calls[0].method, "POST");
});

Deno.test("continues an existing session via /session/:id", async () => {
  const { calls, fetchImpl } = fakeClaw([
    { type: "message.completed", data: { message: "ok" } },
    { type: "session.waiting", data: {} },
  ]);
  const r = await runClawTurn({ clawSessionId: "claw-9", message: "more", userId: "u1", fetchImpl, mint: async () => "tok" });
  assertEquals(r.clawSessionId, "claw-9");
  assertEquals(calls[0].url.includes("/eve/v1/session/claw-9"), true);
});
