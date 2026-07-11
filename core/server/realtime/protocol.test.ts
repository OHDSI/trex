import { assertEquals } from "jsr:@std/assert";
import { decodeFrame, encodeFrame, reply } from "./protocol.ts";

Deno.test("decodes vsn=1.0.0 object frames", () => {
  const m = decodeFrame('{"topic":"realtime:room1","event":"phx_join","payload":{"config":{}},"ref":"1","join_ref":"1"}');
  assertEquals(m?.topic, "realtime:room1");
  assertEquals(m?.event, "phx_join");
  assertEquals(m?.ref, "1");
});

Deno.test("rejects malformed frames", () => {
  assertEquals(decodeFrame("not json"), null);
  assertEquals(decodeFrame('{"no":"topic"}'), null);
});

Deno.test("encodes reply preserving ref and join_ref", () => {
  const req = decodeFrame('{"topic":"phoenix","event":"heartbeat","payload":{},"ref":"7"}')!;
  const r = reply(req, "ok", {});
  assertEquals(JSON.parse(encodeFrame(r)), {
    topic: "phoenix", event: "phx_reply", payload: { status: "ok", response: {} }, ref: "7",
  });
});
