import { assertEquals } from "jsr:@std/assert";
import { stableConversationId } from "./discord-channel.ts";

Deno.test("stableConversationId uses the channel id, ignoring the interaction id", () => {
  assertEquals(stableConversationId({ channelId: "chan-9", interactionId: "int-1" }), "chan-9");
  assertEquals(stableConversationId({ channelId: "chan-9", interactionId: "int-2" }), "chan-9");
});
