import { assertEquals } from "jsr:@std/assert";
import { buildWorkerHeaders } from "./worker-headers.ts";

Deno.test("drops a client-supplied x-user-id when there is no verified identity", () => {
  // Attack: an unauthenticated caller (or one hitting a no-scope route) sets
  // x-user-id themselves. A worker that trusts x-user-id would treat them as
  // that user. The gateway must not forward the client's value.
  const headers = buildWorkerHeaders(
    { "x-user-id": "victim-or-admin", "content-type": "application/json" },
    {},
  );
  assertEquals(headers.get("x-user-id"), null);
  assertEquals(headers.get("content-type"), "application/json");
});

Deno.test("drops a client-supplied x-user-role when there is no verified identity", () => {
  const headers = buildWorkerHeaders({ "x-user-role": "admin" }, {});
  assertEquals(headers.get("x-user-role"), null);
});

Deno.test("overrides a client-supplied x-user-id with the verified user", () => {
  const headers = buildWorkerHeaders(
    { "x-user-id": "attacker" },
    { userId: "alice", userRole: "authenticated" },
  );
  assertEquals(headers.get("x-user-id"), "alice");
  assertEquals(headers.get("x-user-role"), "authenticated");
});

Deno.test("forwards non-identity headers unchanged", () => {
  const headers = buildWorkerHeaders(
    { authorization: "Bearer abc", "x-request-id": "r1" },
    { userId: "alice" },
  );
  assertEquals(headers.get("authorization"), "Bearer abc");
  assertEquals(headers.get("x-request-id"), "r1");
});

Deno.test("still strips transport headers the proxy recomputes", () => {
  const headers = buildWorkerHeaders(
    { "accept-encoding": "gzip", "content-length": "10", "transfer-encoding": "chunked" },
    { userId: "alice" },
  );
  assertEquals(headers.get("accept-encoding"), null);
  assertEquals(headers.get("content-length"), null);
  assertEquals(headers.get("transfer-encoding"), null);
});
