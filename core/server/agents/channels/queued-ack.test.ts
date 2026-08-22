// Tests for the shared queued-acknowledgement copy. The wording is the whole
// point of the module: the two variants must not be interchangeable, because
// they tell the human different things about whose turn it is.

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert";
import { queuedAckText, queuedAckTextGsm7 } from "./queued-ack.ts";

// "ASCII-only" as a codepoint check rather than a /[\x00-\x7F]/ regex: same
// assertion, but it does not trip deno lint's no-control-regex rule.
const isAscii = (s: string) => [...s].every((c) => (c.codePointAt(0) ?? 0) <= 0x7f);

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

// ---- the GSM-7 rendering ---------------------------------------------------

// The regression guard for the SMS cost. One non-GSM-7 character forces the
// whole body into UCS-2, dropping the per-segment budget from 160 septets to 70
// code units — which bills the 152-character denial variant as 3 segments
// instead of 1. Any future copy edit that reaches for a typographic dash, quote
// or ellipsis reintroduces that silently unless this test is here.
Deno.test("the GSM-7 variant is ASCII-only, in both forms", () => {
  for (const denied of [true, false]) {
    const text = queuedAckTextGsm7(denied);
    assert(isAscii(text), `variant deniedPendingGate=${denied} must be ASCII-only, got: ${text}`);
  }
});

Deno.test("the GSM-7 variant says the same thing as the default, differing only in the dash", () => {
  for (const denied of [true, false]) {
    assertEquals(queuedAckTextGsm7(denied), queuedAckText(denied).replaceAll("\u2014", "-"));
    // Same length: the swap is one character for one character, so the
    // GSM-7 form can never be the one that overflows a segment boundary.
    assertEquals(queuedAckTextGsm7(denied).length, queuedAckText(denied).length);
  }
});

Deno.test("the GSM-7 variant fits a single SMS segment; the default variant would not", () => {
  // GSM-7 bills 160 septets in a lone segment; UCS-2 bills 70 code units.
  const gsm7 = queuedAckTextGsm7(true);
  assert(gsm7.length <= 160, `denial ack is ${gsm7.length} GSM-7 septets — over a single segment`);
  // The default variant carries the em dash, so it would be sent as UCS-2 and
  // would NOT fit. This asserts the saving is real, not incidental.
  assert(queuedAckText(true).length > 70, "expected the default denial variant to overflow a lone UCS-2 segment");
});

// The default variant keeps the em dash — that is deliberate everywhere except
// SMS, and the other six adapters depend on the string being unchanged.
Deno.test("the default variant still uses the em dash", () => {
  for (const denied of [true, false]) {
    assert(queuedAckText(denied).includes("\u2014"), `default variant deniedPendingGate=${denied} lost its em dash`);
  }
});
