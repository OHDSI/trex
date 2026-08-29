import { assertEquals } from "jsr:@std/assert";
import {
  checkSpawnAllowed, MAX_CHILDREN_PER_SESSION, MAX_CONSECUTIVE_WAKES, MAX_LIVE_CHILDREN,
} from "./orchestration.ts";

Deno.test("constants are the documented values", () => {
  assertEquals(MAX_CONSECUTIVE_WAKES, 10);
  assertEquals(MAX_LIVE_CHILDREN, 8);
  assertEquals(MAX_CHILDREN_PER_SESSION, 50);
});

Deno.test("checkSpawnAllowed permits a spawn under both caps", () => {
  assertEquals(checkSpawnAllowed({ live: 0, total: 0 }), { allowed: true });
  assertEquals(checkSpawnAllowed({ live: 7, total: 49 }), { allowed: true });
});

Deno.test("checkSpawnAllowed refuses at the live cap, naming the limit", () => {
  const r = checkSpawnAllowed({ live: MAX_LIVE_CHILDREN, total: 10 });
  assertEquals(r.allowed, false);
  assertEquals((r as { reason: string }).reason.includes("8"), true);
});

Deno.test("checkSpawnAllowed refuses at the total cap", () => {
  const r = checkSpawnAllowed({ live: 0, total: MAX_CHILDREN_PER_SESSION });
  assertEquals(r.allowed, false);
  assertEquals((r as { reason: string }).reason.includes("50"), true);
});
