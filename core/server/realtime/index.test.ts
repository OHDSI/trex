import { assertEquals } from "jsr:@std/assert";
import { realtimeEnabled } from "./index.ts";

Deno.test("realtimeEnabled respects TREX_REALTIME_DISABLED", () => {
  Deno.env.delete("TREX_REALTIME_DISABLED");
  assertEquals(realtimeEnabled(), true);
  Deno.env.set("TREX_REALTIME_DISABLED", "true");
  assertEquals(realtimeEnabled(), false);
  Deno.env.delete("TREX_REALTIME_DISABLED");
});
