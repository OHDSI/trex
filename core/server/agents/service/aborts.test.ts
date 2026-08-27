import { assert, assertEquals } from "jsr:@std/assert";
import {
  abortChildTurn,
  clearChildTurnAbort,
  liveChildTurnAborts,
  registerChildTurnAbort,
} from "./aborts.ts";

Deno.test("a registered child turn can be aborted, and the abort reaches its signal", () => {
  const c = registerChildTurnAbort("c-1");
  assertEquals(c.signal.aborted, false);
  assertEquals(abortChildTurn("c-1"), true);
  assertEquals(c.signal.aborted, true, "the signal handed to streamText must actually be aborted");
  clearChildTurnAbort("c-1", c);
});

// The whole point of returning a boolean: a parent on ANOTHER worker finds
// nothing here, and its caller falls back to the database marking rather than
// pretending the interrupt happened.
Deno.test("aborting a child this worker is not running reports false rather than throwing", () => {
  assertEquals(abortChildTurn("not-here"), false);
});

Deno.test("a child that finishes normally leaves nothing behind (the leak guard)", () => {
  const before = liveChildTurnAborts();
  const c = registerChildTurnAbort("c-2");
  assertEquals(liveChildTurnAborts(), before + 1);
  clearChildTurnAbort("c-2", c);
  assertEquals(liveChildTurnAborts(), before, "a finished child's controller must not stay registered");
});

Deno.test("an aborted child is dropped immediately — a second stop reports it is no longer running here", () => {
  const before = liveChildTurnAborts();
  const c = registerChildTurnAbort("c-3");
  assertEquals(abortChildTurn("c-3"), true);
  assertEquals(liveChildTurnAborts(), before, "aborting must not leave a spent controller registered");
  assertEquals(abortChildTurn("c-3"), false);
  // The turn's own finally still runs; it must be a harmless no-op.
  clearChildTurnAbort("c-3", c);
  assertEquals(liveChildTurnAborts(), before);
});

// A turn that ends LATE (a stalled worker resurfacing after its turn was
// reaped and a NEW turn registered for the same session) must not unregister
// the live turn's controller and quietly make it un-stoppable.
Deno.test("a late-ending turn cannot clear a newer turn's controller", () => {
  const stale = registerChildTurnAbort("c-4");
  const fresh = registerChildTurnAbort("c-4"); // replaces it
  clearChildTurnAbort("c-4", stale); // the stale turn's finally, arriving late
  assertEquals(abortChildTurn("c-4"), true, "the newer turn must still be abortable");
  assert(fresh.signal.aborted, "and it must be the NEWER controller that was aborted");
  assert(!stale.signal.aborted);
});
