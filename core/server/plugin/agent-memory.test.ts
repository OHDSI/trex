import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { parseMemoryLinks } from "./agent-memory.ts";

Deno.test("parseMemoryLinks parses an array, defaulting mode to read", () => {
  const links = parseMemoryLinks([{ name: "d2e" }, { name: "notes", mode: "readwrite" }]);
  assertEquals(links, [
    { name: "d2e", mode: "read" },
    { name: "notes", mode: "readwrite" },
  ]);
});

Deno.test("parseMemoryLinks wraps a single-object form", () => {
  const links = parseMemoryLinks({ name: "d2e" });
  assertEquals(links, [{ name: "d2e", mode: "read" }]);
});

Deno.test("parseMemoryLinks rejects a bad name (uppercase)", () => {
  assertThrows(() => parseMemoryLinks([{ name: "Bad" }]), Error);
});

Deno.test("parseMemoryLinks rejects a bad name (hyphen)", () => {
  assertThrows(() => parseMemoryLinks([{ name: "a-b" }]), Error);
});

Deno.test("parseMemoryLinks rejects an invalid mode", () => {
  assertThrows(() => parseMemoryLinks([{ name: "d2e", mode: "write" }]), Error);
});

Deno.test("parseMemoryLinks rejects a duplicate link name", () => {
  let threw = false;
  try {
    parseMemoryLinks([{ name: "d2e" }, { name: "d2e", mode: "readwrite" }]);
  } catch (e) {
    threw = true;
    assert(e instanceof Error);
  }
  assert(threw);
});
