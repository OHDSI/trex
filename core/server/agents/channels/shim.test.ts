import { assertEquals, assertThrows } from "jsr:@std/assert";
import { defineChannel, GET, POST, WS } from "./shim.ts";

Deno.test("defineChannel brands the definition and preserves routes", () => {
  const ch = defineChannel({ routes: [POST("/m", () => new Response("ok"))] });
  assertEquals(ch.__trexChannel, true);
  assertEquals(ch.routes.length, 1);
  assertEquals(ch.routes[0].method, "POST");
  assertEquals(ch.routes[0].path, "/m");
});

Deno.test("defineChannel allows an empty routes array", () => {
  const ch = defineChannel({ routes: [] });
  assertEquals(ch.__trexChannel, true);
  assertEquals(ch.routes.length, 0);
});

Deno.test("defineChannel defaults routes to an empty array when omitted", () => {
  const ch = defineChannel({});
  assertEquals(ch.__trexChannel, true);
  assertEquals(ch.routes.length, 0);
});

Deno.test("defineChannel rejects a route missing its handler", () => {
  assertThrows(
    () =>
      defineChannel({
        // deno-lint-ignore no-explicit-any
        routes: [{ method: "POST", path: "/m" } as any],
      }),
    Error,
  );
});

Deno.test("POST and GET build routes with the right method", () => {
  const p = POST("/a", () => new Response("a"));
  assertEquals(p.method, "POST");
  assertEquals(p.path, "/a");
  const g = GET("/b", () => new Response("b"));
  assertEquals(g.method, "GET");
  assertEquals(g.path, "/b");
});

Deno.test("WS route's handler throws the v1-unsupported error when invoked", () => {
  const ws = WS("/x", () => ({}));
  assertEquals(ws.method, "WS");
  assertEquals(ws.path, "/x");
  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => ws.handler(new Request("http://x/x"), {} as any),
    Error,
    "agents: WebSocket channels are not supported in v1",
  );
});
