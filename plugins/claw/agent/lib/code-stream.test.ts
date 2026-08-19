import { assert, assertEquals } from "jsr:@std/assert";
import { FakeTime } from "jsr:@std/testing/time";
import { streamTurn, summarizeActivity } from "./code-stream.ts";

Deno.test("summarizeActivity uses the last prose line and drops tool markers", () => {
  const acc = "Reading the plan.\n<!--tool:toolu_01ABC-->\nNow running the portal test suite.\n<!--tool:toolu_02DEF-->";
  assertEquals(summarizeActivity(acc), "Now running the portal test suite.");
});

Deno.test("summarizeActivity falls back when only tool markers arrived", () => {
  assertEquals(summarizeActivity("<!--tool:toolu_01ABC-->"), "still working");
});

Deno.test("summarizeActivity truncates long lines", () => {
  const long = "x".repeat(300);
  assertEquals(summarizeActivity(long).length, 140);
});

Deno.test("summarizeActivity falls back on empty text (first beat of a silent turn)", () => {
  assertEquals(summarizeActivity(""), "still working");
});

// Timer wiring: streamTurn's heartbeat is driven by a setInterval started when
// the stream opens, not by the chunk branch — so it must keep beating through a
// long stretch with no chunks (a build/test run) and stop the moment the stream
// closes. Faked time (no real 5-minute wait) drives a controllable SSE body:
// the response stream never emits a chunk until the test closes it, isolating
// the timer from the read loop entirely.
Deno.test("streamTurn's heartbeat fires on the HEARTBEAT_MS timer, not on chunks, and is cleared when the stream ends", async () => {
  const time = new FakeTime();
  const originalFetch = globalThis.fetch;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  try {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    globalThis.fetch = (() => Promise.resolve(new Response(body, { status: 200 }))) as typeof fetch;

    const notes: string[] = [];
    const turn = streamTurn("token", "chat-1", "do the thing", undefined, (note) => notes.push(note));

    // Two full heartbeat intervals pass with the stream still open and no
    // chunks ever sent — a chunk-driven beat would never fire here.
    await time.tickAsync(300_000);
    await time.tickAsync(300_000);
    assertEquals(notes, ["still working", "still working"]);

    // Close the stream: the "done" event ends the read loop.
    const enc = new TextEncoder();
    controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "done", content: "all done" })}\n`));
    controller.close();
    const result = await turn;
    assertEquals(result, "all done");

    // The finally block clears the interval on stream end — advancing the
    // clock further must not produce another beat.
    await time.tickAsync(300_000);
    assertEquals(notes.length, 2, "heartbeat must be cleared once the stream ends");
  } finally {
    globalThis.fetch = originalFetch;
    time.restore();
  }
});

// streamTurn's fetch had no AbortSignal — with per-session turn
// serialization and a 200-step channel floor, a
// hung upstream could wedge the WHOLE session, not just this turn, until the
// 2h reaper eventually ran. A bounded per-turn timeout closes that off.
Deno.test("streamTurn's fetch carries a bounded, not-yet-aborted AbortSignal", async () => {
  const originalFetch = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  let capturedInit: any;
  try {
    // deno-lint-ignore no-explicit-any
    globalThis.fetch = ((_url: string, init?: any) => {
      capturedInit = init;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          const enc = new TextEncoder();
          c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "done", content: "ok" })}\n`));
          c.close();
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    }) as typeof fetch;

    const result = await streamTurn("token", "chat-1", "do the thing");

    assertEquals(result, "ok");
    assert(capturedInit?.signal instanceof AbortSignal, "expected fetch to be called with an AbortSignal");
    assertEquals(capturedInit.signal.aborted, false, "the signal must not already be aborted at call time");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
