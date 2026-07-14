import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  defineMcpClientConnection,
  defineOpenApiConnection,
  trexConnect,
} from "./shim.ts";
import { once } from "eve/tools/approval";

Deno.test("defineMcpClientConnection brands + sets type:mcp", () => {
  const def = defineMcpClientConnection({
    description: "Linear MCP",
    url: "https://mcp.linear.app/sse",
    tools: { allow: ["create_issue"] },
  });
  assertEquals(def.__trexConnection, true);
  assertEquals(def.type, "mcp");
  assertEquals(def.url, "https://mcp.linear.app/sse");
  assertEquals(def.description, "Linear MCP");
});

Deno.test("defineOpenApiConnection brands + sets type:openapi", () => {
  const def = defineOpenApiConnection({
    description: "Petstore",
    spec: "https://example.com/openapi.json",
    tools: { block: ["deletePet"] },
  });
  assertEquals(def.__trexConnection, true);
  assertEquals(def.type, "openapi");
  assertEquals(def.spec, "https://example.com/openapi.json");
});

Deno.test("mcp connection requires url", () => {
  assertThrows(
    () => defineMcpClientConnection({ description: "no url" } as never),
    Error,
    "url",
  );
});

Deno.test("openapi connection requires spec", () => {
  assertThrows(
    () => defineOpenApiConnection({ description: "no spec" } as never),
    Error,
    "spec",
  );
});

Deno.test("description is required", () => {
  assertThrows(
    () => defineMcpClientConnection({ url: "https://x" } as never),
    Error,
    "description",
  );
});

Deno.test("tools with both allow and block throws", () => {
  assertThrows(
    () =>
      defineMcpClientConnection({
        description: "both",
        url: "https://x",
        tools: { allow: ["a"], block: ["b"] } as never,
      }),
    Error,
    "allow",
  );
});

Deno.test("tools with neither allow nor block throws", () => {
  assertThrows(
    () =>
      defineMcpClientConnection({
        description: "neither",
        url: "https://x",
        tools: {} as never,
      }),
    Error,
  );
});

Deno.test("approval: once() is accepted", () => {
  const def = defineMcpClientConnection({
    description: "with approval",
    url: "https://x",
    tools: { allow: ["a"] },
    approval: once(),
  });
  assertEquals(def.approval, "once");
});

Deno.test("trexConnect defaults principalType to user", () => {
  const auth = trexConnect("linear");
  assertEquals(auth, {
    kind: "oauth",
    connector: "linear",
    principalType: "user",
  });
});

Deno.test("trexConnect honors explicit principalType:app", () => {
  const auth = trexConnect("linear", { principalType: "app" });
  assertEquals(auth, {
    kind: "oauth",
    connector: "linear",
    principalType: "app",
  });
});

Deno.test("trexConnect can be used as a connection's auth", () => {
  const def = defineOpenApiConnection({
    description: "authed",
    spec: "https://x/openapi.json",
    tools: { allow: ["a"] },
    auth: trexConnect("linear"),
  });
  assertEquals(def.auth, {
    kind: "oauth",
    connector: "linear",
    principalType: "user",
  });
});
