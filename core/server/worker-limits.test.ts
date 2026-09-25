import { assertEquals } from "jsr:@std/assert";
import { workerMemoryLimitMb } from "./worker-limits.ts";

// The default is the whole point of the change: 150 put trex BELOW the
// runtime's own compile-time default of 256 (.cargo/config.toml), and the
// retire-at-half rule turned that into a 75MB trigger.
Deno.test("defaults to 512MB, so the retire-at-half alert sits at 256", () => {
  assertEquals(workerMemoryLimitMb(undefined), 512);
});

Deno.test("an explicit value wins", () => {
  assertEquals(workerMemoryLimitMb("150"), 150);
  assertEquals(workerMemoryLimitMb("1024"), 1024);
});

// A typo must not take the boot down, and must not be read as "no limit":
// a worker with no ceiling is how a host runs out of memory.
for (const bad of ["", "   ", "abc", "0", "-1", "3.5", "512mb", "NaN", "Infinity"]) {
  Deno.test(`falls back to the default for ${JSON.stringify(bad)}`, () => {
    assertEquals(workerMemoryLimitMb(bad), 512);
  });
}
