import { assert, assertEquals } from "jsr:@std/assert";
import { truncateMiddle } from "./truncate.ts";

Deno.test("truncateMiddle passes short text through unchanged", () => {
  assertEquals(truncateMiddle("hello", 100), "hello");
});

Deno.test("truncateMiddle does not truncate at exact boundary", () => {
  const text = "x".repeat(100);
  assertEquals(truncateMiddle(text, 100), text);
});

Deno.test("truncateMiddle keeps first and last half verbatim", () => {
  const text = "A".repeat(50) + "B".repeat(900) + "C".repeat(50);
  const out = truncateMiddle(text, 100);
  assert(out.includes("A".repeat(50)), "head not retained");
  assert(out.includes("C".repeat(50)), "tail not retained");
  assert(!out.includes("B".repeat(900)), "middle not dropped");
});

Deno.test("truncateMiddle header reports original length and line count", () => {
  const text = ("line\n").repeat(1000);
  const out = truncateMiddle(text, 100);
  assert(out.includes("original length: 5000 chars"));
  assert(out.includes("1000 lines"));
});

Deno.test("truncateMiddle bounds retained content, not returned string", () => {
  const text = "x".repeat(10_000);
  const out = truncateMiddle(text, 100);
  const retained = out.replace(/^Warning:[\s\S]*?\n\n/, "").replace(/\n\n\[\.\.\.[^\]]*\]\n\n/, "");
  assertEquals(retained.length, 100);
});
