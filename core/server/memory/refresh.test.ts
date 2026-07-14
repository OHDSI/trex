import { assertEquals } from "jsr:@std/assert";
import { shouldSkipSource } from "./refresh.ts";

Deno.test("shouldSkipSource: never imported (null recorded) always proceeds", () => {
  assertEquals(shouldSkipSource(null, "abc123"), false);
});

Deno.test("shouldSkipSource: unchanged version is skipped", () => {
  assertEquals(shouldSkipSource("abc123", "abc123"), true);
});

Deno.test("shouldSkipSource: changed version proceeds", () => {
  assertEquals(shouldSkipSource("abc123", "def456"), false);
});
