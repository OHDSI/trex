// Tests for the shared queued-acknowledgement copy. The wording is the whole
// point of the module: the two variants must not be interchangeable, because
// they tell the human different things about whose turn it is.

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert";
import { queuedAckText } from "./queued-ack.ts";

Deno.test("the plain variant says the message was queued behind the running turn", () => {
  const text = queuedAckText(false);
  assert(text.includes("queued"), text);
  // It must NOT claim a gate was closed — nothing was denied on this path.
  assertEquals(/closed the pending approval/i.test(text), false, text);
});

Deno.test("the gate-denial variant says the approval was closed, not merely queued", () => {
  const text = queuedAckText(true);
  assert(/closed the pending approval/i.test(text), text);
  assert(/feedback/i.test(text), text);
});

Deno.test("the two variants are distinct and neither is empty", () => {
  assertNotEquals(queuedAckText(true), queuedAckText(false));
  assert(queuedAckText(true).length > 0);
  assert(queuedAckText(false).length > 0);
});

Deno.test("both variants are single-line, so every transport can send them as one message", () => {
  for (const denied of [true, false]) {
    assertEquals(queuedAckText(denied).includes("\n"), false, `variant deniedPendingGate=${denied} must be one line`);
  }
});
