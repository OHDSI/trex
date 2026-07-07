import { assertEquals } from "jsr:@std/assert";
import { buildConnectionProvider } from "./provider.ts";
import { _resetMcpCache, type McpClient, type McpConnectFn } from "./mcp.ts";
import type { ConnectionDef } from "./types.ts";
import type { HookCtx } from "../eve-shim/types.ts";
import type { LoadedAgent } from "../loader.ts";

const REMOTE_TOOLS = [
  { name: "ping", description: "Ping", inputSchema: { type: "object", properties: {} } },
  { name: "danger", description: "Dangerous", inputSchema: { type: "object", properties: {} } },
];

function fakeConnect(
  tools = REMOTE_TOOLS,
  opts: { throwOnConnect?: boolean } = {},
): { fn: McpConnectFn; rec: { headers: Record<string, string>[]; calls: unknown[] } } {
  const rec = { headers: [] as Record<string, string>[], calls: [] as unknown[] };
  const fn: McpConnectFn = (_url, headers) => {
    rec.headers.push(headers);
    if (opts.throwOnConnect) return Promise.reject(new Error("connect boom"));
    const client: McpClient = {
      listTools: () => Promise.resolve({ tools }),
      callTool: (a) => {
        rec.calls.push(a);
        return Promise.resolve({ content: [{ type: "text", text: "pong" }] });
      },
    };
    return Promise.resolve(client);
  };
  return { fn, rec };
}

function mcpConn(name: string, over: Partial<ConnectionDef> = {}): ConnectionDef {
  return {
    __trexConnection: true,
    type: "mcp",
    name,
    description: `${name} MCP`,
    url: "https://mcp.example/sse",
    ...over,
  };
}

function fakeAgent(connections: Record<string, ConnectionDef>): LoadedAgent {
  return { dir: "/agents/test", connections } as unknown as LoadedAgent;
}

function hookCtx(): HookCtx {
  return {
    sessionId: "s1",
    env: () => undefined,
    sql: () => Promise.resolve({ rows: [] }),
  };
}

Deno.test("provider yields namespaced <conn>__<tool> ToolDefs", async () => {
  _resetMcpCache();
  const { fn } = fakeConnect();
  const provider = buildConnectionProvider(fakeAgent({ echo: mcpConn("echo") }), { connect: fn });
  const tools = await provider(hookCtx());
  assertEquals(Object.keys(tools).sort(), ["echo__danger", "echo__ping"]);
  assertEquals(tools["echo__ping"].description, "Ping");
});

Deno.test("tools.allow filters to the allowed subset", async () => {
  _resetMcpCache();
  const { fn } = fakeConnect();
  const provider = buildConnectionProvider(
    fakeAgent({ echo: mcpConn("echo", { tools: { allow: ["ping"] } }) }),
    { connect: fn },
  );
  const tools = await provider(hookCtx());
  assertEquals(Object.keys(tools), ["echo__ping"]);
});

Deno.test("tools.block filters out the blocked subset", async () => {
  _resetMcpCache();
  const { fn } = fakeConnect();
  const provider = buildConnectionProvider(
    fakeAgent({ echo: mcpConn("echo", { tools: { block: ["danger"] } }) }),
    { connect: fn },
  );
  const tools = await provider(hookCtx());
  assertEquals(Object.keys(tools), ["echo__ping"]);
});

Deno.test("approval:once maps to needsApproval:true on every tool", async () => {
  _resetMcpCache();
  const { fn } = fakeConnect();
  const provider = buildConnectionProvider(
    fakeAgent({ echo: mcpConn("echo", { approval: "once" }) }),
    { connect: fn },
  );
  const tools = await provider(hookCtx());
  assertEquals(tools["echo__ping"].needsApproval, true);
  assertEquals(tools["echo__danger"].needsApproval, true);
});

Deno.test("no approval => needsApproval falsy", async () => {
  _resetMcpCache();
  const { fn } = fakeConnect();
  const provider = buildConnectionProvider(fakeAgent({ echo: mcpConn("echo") }), { connect: fn });
  const tools = await provider(hookCtx());
  assertEquals(tools["echo__ping"].needsApproval, undefined);
});

Deno.test("static auth.getToken sends a Bearer header on connect", async () => {
  _resetMcpCache();
  const { fn, rec } = fakeConnect();
  const provider = buildConnectionProvider(
    fakeAgent({
      echo: mcpConn("echo", {
        auth: { kind: "static", getToken: () => Promise.resolve({ token: "sekret" }) },
      }),
    }),
    { connect: fn },
  );
  const tools = await provider(hookCtx());
  // Exercise the tool so callTool runs against the authed client.
  await tools["echo__ping"].execute!({}, undefined);
  assertEquals(rec.headers[0]["Authorization"], "Bearer sekret");
  assertEquals(rec.calls.length, 1);
});

Deno.test("static auth.headers (object + fn) are merged", async () => {
  _resetMcpCache();
  const { fn, rec } = fakeConnect();
  const provider = buildConnectionProvider(
    fakeAgent({
      echo: mcpConn("echo", {
        headers: { "X-Top": "1" },
        auth: { kind: "static", headers: () => ({ "X-Auth": "2" }) },
      }),
    }),
    { connect: fn },
  );
  await provider(hookCtx());
  assertEquals(rec.headers[0]["X-Top"], "1");
  assertEquals(rec.headers[0]["X-Auth"], "2");
});

Deno.test("a broken connection is skipped; others still resolve", async () => {
  _resetMcpCache();
  const goodConnect = fakeConnect().fn;
  const badConnect = fakeConnect(REMOTE_TOOLS, { throwOnConnect: true }).fn;
  // Route per-connection: bad for "broken", good for "ok".
  const connect: McpConnectFn = (url, headers) =>
    url.includes("broken") ? badConnect(url, headers) : goodConnect(url, headers);
  const provider = buildConnectionProvider(
    fakeAgent({
      broken: mcpConn("broken", { url: "https://mcp.example/broken" }),
      ok: mcpConn("ok", { url: "https://mcp.example/ok" }),
    }),
    { connect },
  );
  const tools = await provider(hookCtx());
  // Broken connection contributed nothing; the good one is fully present.
  assertEquals(Object.keys(tools).sort(), ["ok__danger", "ok__ping"]);
});

Deno.test("openapi connections are skipped (Task 4)", async () => {
  _resetMcpCache();
  const { fn } = fakeConnect();
  const provider = buildConnectionProvider(
    fakeAgent({
      api: {
        __trexConnection: true,
        type: "openapi",
        name: "api",
        description: "Petstore",
        spec: "https://x/openapi.json",
      },
    }),
    { connect: fn },
  );
  const tools = await provider(hookCtx());
  assertEquals(Object.keys(tools), []);
});

Deno.test("per-user static getToken → distinct clients per user (no cross-tenant reuse)", async () => {
  _resetMcpCache();
  const { fn, rec } = fakeConnect();
  const agent = fakeAgent({
    echo: mcpConn("echo", {
      // ctx-dependent static auth: token is the caller's userId.
      auth: {
        kind: "static",
        getToken: (ctx?: { userId?: string }) => Promise.resolve({ token: ctx?.userId ?? "anon" }),
      },
    }),
  });
  const provider = buildConnectionProvider(agent, { connect: fn });
  const ctxA: HookCtx = { sessionId: "s", userId: "userA", env: () => undefined, sql: () => Promise.resolve({ rows: [] }) };
  const ctxB: HookCtx = { sessionId: "s", userId: "userB", env: () => undefined, sql: () => Promise.resolve({ rows: [] }) };
  const toolsA = await provider(ctxA);
  const toolsB = await provider(ctxB);
  // Two distinct auths → two connects; each carries its own bearer.
  assertEquals(rec.headers.length, 2);
  assertEquals(rec.headers[0]["Authorization"], "Bearer userA");
  assertEquals(rec.headers[1]["Authorization"], "Bearer userB");
  // User B's tool executes against a client connected with B's credentials.
  await toolsB["echo__ping"].execute!({}, undefined);
  await toolsA["echo__ping"].execute!({}, undefined);
});

Deno.test("same resolved auth across turns → single shared client", async () => {
  _resetMcpCache();
  const { fn, rec } = fakeConnect();
  // Agent-level constant token: every caller resolves the same headers.
  const agent = fakeAgent({
    echo: mcpConn("echo", { auth: { kind: "static", getToken: () => Promise.resolve({ token: "constant" }) } }),
  });
  const provider = buildConnectionProvider(agent, { connect: fn });
  const mk = (userId: string): HookCtx => ({ sessionId: "s", userId, env: () => undefined, sql: () => Promise.resolve({ rows: [] }) });
  await provider(mk("userA"));
  await provider(mk("userB"));
  assertEquals(rec.headers.length, 1); // one shared client despite two users
});
