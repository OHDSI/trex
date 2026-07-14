import { assertEquals, assertThrows } from "jsr:@std/assert";
import { realizeOpenApi } from "./openapi.ts";
import type { ConnectionDef } from "./types.ts";

// A small OpenAPI 3.x document with two operations, a $ref-ed request body,
// path/query/header params, and an apiKey (header) security scheme.
const SPEC = {
  openapi: "3.0.0",
  servers: [{ url: "https://api.example.com/v1" }],
  components: {
    schemas: {
      Pet: {
        type: "object",
        properties: { name: { type: "string" }, tag: { type: "string" } },
        required: ["name"],
      },
    },
    securitySchemes: {
      apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
  },
  security: [{ apiKey: [] }],
  paths: {
    "/pets/{petId}": {
      get: {
        operationId: "getPet",
        summary: "Get a pet by id",
        parameters: [
          { name: "petId", in: "path", required: true, schema: { type: "string" } },
          { name: "verbose", in: "query", schema: { type: "boolean" } },
        ],
      },
    },
    "/pets": {
      post: {
        operationId: "createPet",
        summary: "Create a pet",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
        },
      },
    },
  },
};

function conn(over: Partial<ConnectionDef> = {}): ConnectionDef {
  return {
    __trexConnection: true,
    type: "openapi",
    name: "petstore",
    description: "Petstore",
    spec: SPEC,
    ...over,
  };
}

// A fetch mock that records the request and returns a canned JSON response.
function fakeFetch(status = 200, body: unknown = { ok: true }) {
  const rec: { url?: string; method?: string; headers?: Record<string, string>; body?: string } = {};
  const fn = (url: string | URL, init?: RequestInit): Promise<Response> => {
    rec.url = String(url);
    rec.method = init?.method;
    rec.headers = init?.headers as Record<string, string>;
    rec.body = init?.body as string | undefined;
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        statusText: status === 200 ? "OK" : "ERR",
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return { fn, rec };
}

Deno.test("realizeOpenApi: one ToolDef per operation with correct names + descriptions", () => {
  const tools = realizeOpenApi(conn(), {}, {});
  assertEquals(tools.map((t) => t.name).sort(), ["createPet", "getPet"]);
  const get = tools.find((t) => t.name === "getPet")!;
  assertEquals(get.description, "Get a pet by id");
});

Deno.test("realizeOpenApi: inputSchema derives from params (path/query) as top-level props", () => {
  const tools = realizeOpenApi(conn(), {}, {});
  const get = tools.find((t) => t.name === "getPet")!;
  const schema = get.inputSchema as {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  assertEquals(schema.type, "object");
  assertEquals(Object.keys(schema.properties).sort(), ["petId", "verbose"]);
  // path params are always required.
  assertEquals(schema.required, ["petId"]);
});

Deno.test("realizeOpenApi: $ref request body resolves + nests under `body`", () => {
  const tools = realizeOpenApi(conn(), {}, {});
  const post = tools.find((t) => t.name === "createPet")!;
  const schema = post.inputSchema as {
    properties: { body: { type: string; properties: Record<string, unknown>; required?: string[] } };
    required?: string[];
  };
  // The $ref was dereferenced into the Pet schema (not left as {$ref:...}).
  assertEquals(schema.properties.body.type, "object");
  assertEquals(Object.keys(schema.properties.body.properties).sort(), ["name", "tag"]);
  assertEquals(schema.properties.body.required, ["name"]);
  // requestBody.required=true → `body` is required at the top level.
  assertEquals(schema.required, ["body"]);
});

Deno.test("realizeOpenApi: execute builds URL with path templating + query", async () => {
  const { fn, rec } = fakeFetch();
  const tools = realizeOpenApi(conn(), {}, { fetch: fn });
  const get = tools.find((t) => t.name === "getPet")!;
  const res = await get.execute({ petId: "42", verbose: true });
  assertEquals(rec.method, "GET");
  assertEquals(rec.url, "https://api.example.com/v1/pets/42?verbose=true");
  assertEquals(res, { status: 200, statusText: "OK", body: { ok: true } });
});

Deno.test("realizeOpenApi: execute POSTs a JSON body + content-type", async () => {
  const { fn, rec } = fakeFetch(201, { id: 1 });
  const tools = realizeOpenApi(conn(), {}, { fetch: fn });
  const post = tools.find((t) => t.name === "createPet")!;
  const res = await post.execute({ body: { name: "Rex" } });
  assertEquals(rec.method, "POST");
  assertEquals(rec.url, "https://api.example.com/v1/pets");
  assertEquals(rec.body, JSON.stringify({ name: "Rex" }));
  assertEquals((rec.headers as Record<string, string>)["content-type"], "application/json");
  assertEquals(res.status, 201);
});

Deno.test("realizeOpenApi: apiKey security moves the Bearer token into the named header", async () => {
  const { fn, rec } = fakeFetch();
  // Provider resolves static auth into an Authorization: Bearer header; the
  // spec's apiKey scheme (in: header, name: X-API-Key) must relocate it.
  const tools = realizeOpenApi(conn(), { Authorization: "Bearer sekret" }, { fetch: fn });
  const get = tools.find((t) => t.name === "getPet")!;
  await get.execute({ petId: "1" });
  const headers = rec.headers as Record<string, string>;
  assertEquals(headers["X-API-Key"], "sekret");
  assertEquals(headers["Authorization"], undefined);
});

Deno.test("realizeOpenApi: bearer scheme keeps the Authorization header intact", async () => {
  const { fn, rec } = fakeFetch();
  const bearerSpec = {
    ...SPEC,
    components: {
      ...SPEC.components,
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    },
    security: [{ bearerAuth: [] }],
  };
  const tools = realizeOpenApi(
    conn({ spec: bearerSpec }),
    { Authorization: "Bearer sekret" },
    { fetch: fn },
  );
  await tools.find((t) => t.name === "getPet")!.execute({ petId: "1" });
  assertEquals((rec.headers as Record<string, string>)["Authorization"], "Bearer sekret");
});

Deno.test("realizeOpenApi: header params + baseUrl override honored", async () => {
  const { fn, rec } = fakeFetch();
  const spec = {
    ...SPEC,
    paths: {
      "/ping": {
        get: {
          operationId: "ping",
          parameters: [{ name: "X-Trace", in: "header", schema: { type: "string" } }],
        },
      },
    },
  };
  const tools = realizeOpenApi(conn({ spec, baseUrl: "https://override.example" }), {}, { fetch: fn });
  await tools[0].execute({ "X-Trace": "abc" });
  assertEquals(rec.url, "https://override.example/ping");
  assertEquals((rec.headers as Record<string, string>)["X-Trace"], "abc");
});

Deno.test("realizeOpenApi: operationId-less op gets a method_path slug name", () => {
  const spec = {
    ...SPEC,
    paths: { "/health/live": { get: { summary: "liveness" } } },
  };
  const tools = realizeOpenApi(conn({ spec }), {}, {});
  assertEquals(tools.map((t) => t.name), ["get_health_live"]);
});

Deno.test("realizeOpenApi: non-JSON response returned as text; empty body as null", async () => {
  const fn = (_url: string | URL, _init?: RequestInit): Promise<Response> =>
    Promise.resolve(new Response("plain text", { status: 200, headers: { "content-type": "text/plain" } }));
  const tools = realizeOpenApi(conn(), {}, { fetch: fn });
  const res = await tools.find((t) => t.name === "getPet")!.execute({ petId: "1" });
  assertEquals(res.body, "plain text");

  const empty = (_url: string | URL, _init?: RequestInit): Promise<Response> =>
    Promise.resolve(new Response("", { status: 200 }));
  const tools2 = realizeOpenApi(conn(), {}, { fetch: empty });
  const res2 = await tools2.find((t) => t.name === "getPet")!.execute({ petId: "1" });
  assertEquals(res2.body, null);
});

Deno.test("realizeOpenApi: JSON string spec is parsed", () => {
  const tools = realizeOpenApi(conn({ spec: JSON.stringify(SPEC) }), {}, {});
  assertEquals(tools.map((t) => t.name).sort(), ["createPet", "getPet"]);
});

Deno.test("realizeOpenApi: a non-JSON string spec throws a clear v1-deferral error", () => {
  assertThrows(
    () => realizeOpenApi(conn({ spec: "https://remote/openapi.yaml" }), {}, {}),
    Error,
    "JSON",
  );
});

Deno.test("realizeOpenApi: missing base URL throws", () => {
  const spec = { openapi: "3.0.0", paths: { "/x": { get: { operationId: "x" } } } };
  assertThrows(
    () => realizeOpenApi(conn({ spec }), {}, {}),
    Error,
    "base URL",
  );
});

Deno.test("realizeOpenApi: Swagger 2.0 host/basePath/schemes → base URL", async () => {
  const { fn, rec } = fakeFetch();
  const swagger = {
    swagger: "2.0",
    host: "api.swagger.test",
    basePath: "/v2",
    schemes: ["https"],
    paths: { "/thing": { get: { operationId: "getThing" } } },
  };
  const tools = realizeOpenApi(conn({ spec: swagger }), {}, { fetch: fn });
  await tools[0].execute({});
  assertEquals(rec.url, "https://api.swagger.test/v2/thing");
});
