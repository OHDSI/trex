// Regression tests for the "enqueue after close" hazard that stranded a claw
// coding hand-off for 65 minutes: an unguarded send() in a catch block threw,
// which skipped that block's controller.close(), so the reader never saw EOF.
import { assertEquals } from "jsr:@std/assert";
import { createSseWriter, type SseController } from "./sse.ts";

const DEAD = "The stream controller cannot close or enqueue";

/** A controller that accepts writes until it is closed, then throws like the real one. */
function fakeController() {
  const frames: string[] = [];
  const dec = new TextDecoder();
  let isClosed = false;
  const controller: SseController = {
    enqueue(chunk) {
      if (isClosed) throw new TypeError(DEAD);
      frames.push(dec.decode(chunk));
    },
    close() {
      if (isClosed) throw new TypeError(DEAD);
      isClosed = true;
    },
  };
  return { controller, frames, isClosed: () => isClosed };
}

/** A controller that is dead from the outset — every operation throws. */
function deadController(): SseController {
  return {
    enqueue() {
      throw new TypeError(DEAD);
    },
    close() {
      throw new TypeError(DEAD);
    },
  };
}

Deno.test("send writes a JSON data frame", () => {
  const { controller, frames } = fakeController();
  const w = createSseWriter(controller);
  assertEquals(w.send({ type: "chunk", content: "hi" }), true);
  assertEquals(frames, ['data: {"type":"chunk","content":"hi"}\n\n']);
});

Deno.test("sendRaw writes the frame verbatim — [DONE] is not JSON-quoted", () => {
  const { controller, frames } = fakeController();
  const w = createSseWriter(controller);
  w.sendRaw("data: [DONE]\n\n");
  assertEquals(frames, ["data: [DONE]\n\n"]);
});

// The core regression: this is the exact sequence that hung the hand-off.
Deno.test("send on an already-closed stream returns false instead of throwing", () => {
  const w = createSseWriter(deadController());
  assertEquals(w.send({ type: "error", error: "rate limit" }), false);
});

Deno.test("close() after a failed send still runs — the reader always gets EOF", () => {
  const { controller, isClosed } = fakeController();
  const w = createSseWriter(controller);
  w.close(); // stream ends
  // The catch block then tries to report the error onto the dead stream...
  assertEquals(w.send({ type: "error", error: "boom" }), false);
  // ...and calling close() again must not throw, so the terminal path completes.
  w.close();
  assertEquals(isClosed(), true);
});

Deno.test("close() is idempotent and never throws, even on a dead controller", () => {
  const w = createSseWriter(deadController());
  w.close();
  w.close();
  assertEquals(w.closed, true);
});

Deno.test("closed reflects state; a normal terminal path sends then closes once", () => {
  const { controller, frames, isClosed } = fakeController();
  const w = createSseWriter(controller);
  assertEquals(w.closed, false);
  w.send({ type: "done" });
  w.sendRaw("data: [DONE]\n\n");
  w.close();
  assertEquals(w.closed, true);
  assertEquals(isClosed(), true);
  assertEquals(frames.length, 2);
});
