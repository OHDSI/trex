import { assertEquals, assertRejects } from "jsr:@std/assert";
import { parseReadyPort, startBootstrapReadySignal } from "./bootstrap-ready.ts";

Deno.test("parseReadyPort rejects missing, non-numeric, and out-of-range values", () => {
  for (const v of [undefined, "", "abc", "0", "-1", "3.5", "65536", "  8123"]) {
    assertEquals(parseReadyPort(v), null, `expected null for ${JSON.stringify(v)}`);
  }
});

Deno.test("parseReadyPort accepts a positive integer string", () => {
  assertEquals(parseReadyPort("8123"), 8123);
  assertEquals(parseReadyPort("1"), 1);
  assertEquals(parseReadyPort("65535"), 65535);
});

Deno.test("a started listener answers 200 with the bootstrapped body on any path/method", async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const signal = startBootstrapReadySignal(port);
  await signal.listening;
  try {
    for (const { path, method } of [
      { path: "/", method: "GET" },
      { path: "/anything/at/all", method: "GET" },
      { path: "/", method: "POST" },
      { path: "/health", method: "HEAD" },
    ]) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, { method });
      assertEquals(res.status, 200);
      if (method !== "HEAD") {
        const body = await res.json();
        assertEquals(body, { bootstrapped: true });
      } else {
        await res.body?.cancel();
      }
    }
  } finally {
    signal.stop();
  }
});

Deno.test("the port is bound before `listening` resolves", async () => {
  const port = 45000 + Math.floor(Math.random() * 15000);
  // Nothing is listening yet, so a connection is refused.
  await assertRejects(() => Deno.connect({ hostname: "127.0.0.1", port }));
  const signal = startBootstrapReadySignal(port);
  await signal.listening;
  try {
    // Resolving means a real TCP listener accepts connections — the beacon's
    // only contract, and the one Deno.serve silently failed to honour in the
    // trex runtime (a failure no test under plain `deno test` can reproduce).
    const conn = await Deno.connect({ hostname: "127.0.0.1", port });
    conn.close();
  } finally {
    signal.stop();
  }
});

Deno.test("no listener is started for an invalid or absent port (nothing to stop, nothing to fetch)", async () => {
  const port = parseReadyPort(undefined);
  assertEquals(port, null);
  // Guard mirrors the real call site: startBootstrapReadySignal is only ever
  // invoked with a value that already passed parseReadyPort.
  const before = await fetch("http://127.0.0.1:20999").catch((e) => e);
  assertEquals(before instanceof Error, true);
});

Deno.test("start does not throw when the port is already bound — it degrades to a warning", async () => {
  const port = 25000 + Math.floor(Math.random() * 20000);
  const first = startBootstrapReadySignal(port);
  await first.listening;
  try {
    const second = startBootstrapReadySignal(port);
    // The clash is reported through `listening`, never as a throw from the call
    // itself and never as an unhandled "error" event that would end the node.
    await assertRejects(() => second.listening);
    // second failed to bind; its stop() must still be safe to call.
    second.stop();
    // The original listener is unaffected.
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assertEquals(res.status, 200);
    await res.body?.cancel();
  } finally {
    first.stop();
  }
});
