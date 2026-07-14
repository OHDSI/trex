import { assertEquals, assertThrows } from "jsr:@std/assert";
import express from "express";
import type { Server } from "node:http";
import { mountMemoryProxy, normalizeMemoryValue } from "./memory.ts";

function setOverride(url: string | null) {
  (globalThis as Record<string, unknown>).__GBRAIN_BASE_URL_OVERRIDE__ = url;
}
function clearOverride() {
  delete (globalThis as Record<string, unknown>).__GBRAIN_BASE_URL_OVERRIDE__;
}

function listen(app: express.Express): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}
function portOf(server: Server): number {
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return addr.port;
}
function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

Deno.test("normalizes a git + inline memory", () => {
  const out = normalizeMemoryValue([{
    name: "research",
    sources: [
      {
        name: "clinical-notes",
        repo: "https://x/notes",
        ref: "main",
        dir: "pages/",
      },
      { name: "handbook", dir: "memory/handbook" },
    ],
  }]);
  assertEquals(out[0].name, "research");
  assertEquals(out[0].sources[0].ref, "main");
  assertEquals(out[0].sources[1].repo, undefined);
});

Deno.test("rejects bad memory name", () => {
  assertThrows(() =>
    normalizeMemoryValue([{
      name: "Bad Name",
      sources: [{ name: "s", dir: "d" }],
    }])
  );
});

Deno.test("rejects duplicate source names", () => {
  assertThrows(() =>
    normalizeMemoryValue([{
      name: "m",
      sources: [{ name: "s", dir: "a" }, { name: "s", dir: "b" }],
    }])
  );
});

Deno.test("rejects a source with neither repo nor dir", () => {
  assertThrows(() =>
    normalizeMemoryValue([{ name: "m", sources: [{ name: "s" }] }])
  );
});

// Deviation from the brief (controller decision): a memory name becomes a
// Postgres schema `memory_<name>` interpolated unquoted into DDL, where a
// hyphen is illegal — so memory names use a stricter no-hyphen regex than
// source names, which are namespaces, not schema idents.
Deno.test("rejects a hyphenated memory name (illegal in unquoted schema ident memory_<name>)", () => {
  assertThrows(() =>
    normalizeMemoryValue([{
      name: "clinical-notes",
      sources: [{ name: "s", dir: "d" }],
    }])
  );
});

Deno.test("accepts a hyphenated source name (sources are namespaces, not schema idents)", () => {
  const out = normalizeMemoryValue([{
    name: "research",
    sources: [{ name: "clinical-notes", dir: "d" }],
  }]);
  assertEquals(out[0].sources[0].name, "clinical-notes");
});

Deno.test("git source defaults ref to main", () => {
  const out = normalizeMemoryValue([{
    name: "m",
    sources: [{ name: "s", repo: "https://x/r" }],
  }]);
  assertEquals(out[0].sources[0].ref, "main");
});

Deno.test("normalizeMemoryValue accepts single-object form", () => {
  const out = normalizeMemoryValue({
    name: "m",
    sources: [{ name: "s", dir: "d" }],
  });
  assertEquals(out[0].name, "m");
});

Deno.test("mountMemoryProxy forwards method/path/body to gbrain and streams the response back", async () => {
  let seenPath = "", seenMethod = "", seenBody = "";
  const stubAc = new AbortController();
  const stub = Deno.serve(
    { port: 0, signal: stubAc.signal, onListen: () => {} },
    async (req) => {
      seenPath = new URL(req.url).pathname;
      seenMethod = req.method;
      seenBody = await req.text();
      return Response.json({ ok: true });
    },
  );
  const stubPort = (stub.addr as Deno.NetAddr).port;
  setOverride(`http://127.0.0.1:${stubPort}`);

  const app = express();
  app.use(express.json());
  mountMemoryProxy(app);
  const server = await listen(app);
  const port = portOf(server);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/memory/research/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"method":"initialize"}',
    });
    const json = await res.json();
    assertEquals(res.status, 200);
    assertEquals(json.ok, true);
    assertEquals(seenMethod, "POST");
    assertEquals(seenPath, "/memory/research/mcp");
    assertEquals(seenBody, '{"method":"initialize"}');
  } finally {
    await close(server);
    clearOverride();
    stubAc.abort();
    await stub.finished;
  }
});

Deno.test("mountMemoryProxy returns 503 when no gbrain base url is available", async () => {
  setOverride(null);

  const app = express();
  app.use(express.json());
  mountMemoryProxy(app);
  const server = await listen(app);
  const port = portOf(server);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/memory/x/mcp`);
    await res.body?.cancel();
    assertEquals(res.status, 503);
  } finally {
    await close(server);
    clearOverride();
  }
});
