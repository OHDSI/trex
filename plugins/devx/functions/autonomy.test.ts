import { assertEquals } from "jsr:@std/assert";
import { runsUnattended } from "./autonomy.ts";

Deno.test("a channel turn is unattended even when the user never opted in", () => {
  assertEquals(runsUnattended({ remoteChannel: true, userAutoApprove: false }), true);
});

Deno.test("a browser turn keeps the user's own preference", () => {
  assertEquals(runsUnattended({ remoteChannel: false, userAutoApprove: false }), false);
  assertEquals(runsUnattended({ remoteChannel: false, userAutoApprove: true }), true);
});

Deno.test("absent flags default to attended — the safe direction", () => {
  assertEquals(runsUnattended({}), false);
});

Deno.test("only a literal true enables the channel path (a truthy string must not)", () => {
  assertEquals(runsUnattended({ remoteChannel: "yes" as unknown as boolean }), false);
});
