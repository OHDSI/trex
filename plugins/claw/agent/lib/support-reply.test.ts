import { assertEquals, assertRejects } from "jsr:@std/assert";
import { sendApprovedReply } from "./support-reply.ts";

// Mimics handler.ts's /stream: replayOnly=1 returns exactly the persisted
// history then closes (no live tail); otherwise it replays events from
// startIndex onward and stays "open" (there is no live tail to simulate
// here — the fake events list IS the full history at POST time).
function fakeSupport(historyBeforePost: unknown[], newTurnEvents: unknown[]) {
  const calls: { url: string; method: string }[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method ?? "GET" });
    if (u.includes("/stream")) {
      const parsed = new URL(u);
      const startIndex = Number(parsed.searchParams.get("startIndex") ?? "0") || 0;
      const replayOnly = parsed.searchParams.get("replayOnly") === "1";
      const full = replayOnly ? historyBeforePost : [...historyBeforePost, ...newTurnEvents];
      const body = full.slice(startIndex).map((e) => JSON.stringify(e)).join("\n") + "\n";
      return new Response(body, { status: 200 });
    }
    return new Response(JSON.stringify({ accepted: true }), { status: 202 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

Deno.test("sendApprovedReply skips a stale prior-turn terminal event and resolves on its own turn", async () => {
  const { calls, fetchImpl } = fakeSupport(
    [
      { type: "message.completed", data: { message: "stale ack", turnId: "t-old" } },
      { type: "turn.completed", data: { turnId: "t-old" } },
    ],
    [
      { type: "message.completed", data: { message: "delivered", turnId: "t-new" } },
      { type: "turn.completed", data: { turnId: "t-new" } },
    ],
  );
  await sendApprovedReply({ supportSessionId: "s1", finalReply: "final answer", userId: "u1", fetchImpl, mint: async () => "tok" });
  // First pass counted the 2 pre-existing history events; the live drain
  // must have started at startIndex=2, not 0.
  const liveCall = calls.find((c) => c.url.includes("/stream") && !c.url.includes("replayOnly"));
  assertEquals(liveCall?.url.includes("startIndex=2"), true);
});

Deno.test("sendApprovedReply surfaces a failure from its own turn, not a stale prior failure", async () => {
  const { fetchImpl } = fakeSupport(
    [
      { type: "turn.failed", data: { turnId: "t-old", message: "old failure, should be ignored" } },
    ],
    [
      { type: "turn.failed", data: { turnId: "t-new", message: "this turn's real failure" } },
    ],
  );
  await assertRejects(
    () => sendApprovedReply({ supportSessionId: "s1", finalReply: "final answer", userId: "u1", fetchImpl, mint: async () => "tok" }),
    Error,
    "this turn's real failure",
  );
});

Deno.test("sendApprovedReply with no prior history starts the live drain at 0", async () => {
  const { calls, fetchImpl } = fakeSupport(
    [],
    [{ type: "turn.completed", data: { turnId: "t-new" } }],
  );
  await sendApprovedReply({ supportSessionId: "s1", finalReply: "final answer", userId: "u1", fetchImpl, mint: async () => "tok" });
  const liveCall = calls.find((c) => c.url.includes("/stream") && !c.url.includes("replayOnly"));
  assertEquals(liveCall?.url.includes("startIndex=0"), true);
});
