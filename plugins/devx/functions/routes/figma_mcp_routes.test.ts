import { assert, assertEquals } from "jsr:@std/assert";
import { buildFigmaAuthUrl, FIGMA_MCP_URL } from "./figma_mcp_routes.ts";

Deno.test("buildFigmaAuthUrl carries PKCE, state, scope and the MCP resource indicator", () => {
  const url = new URL(buildFigmaAuthUrl({
    clientId: "client-1",
    redirectUri: "https://d2e.example/devx/settings",
    state: "st-123",
    challenge: "ch-456",
  }));
  assertEquals(url.origin + url.pathname, "https://www.figma.com/oauth/mcp");
  assertEquals(url.searchParams.get("client_id"), "client-1");
  assertEquals(url.searchParams.get("response_type"), "code");
  assertEquals(url.searchParams.get("redirect_uri"), "https://d2e.example/devx/settings");
  assertEquals(url.searchParams.get("scope"), "mcp:connect");
  assertEquals(url.searchParams.get("state"), "st-123");
  assertEquals(url.searchParams.get("code_challenge"), "ch-456");
  assertEquals(url.searchParams.get("code_challenge_method"), "S256");
  // The MCP spec requires binding the grant to the resource server (RFC 8707);
  // Figma's metadata advertises require_state_parameter, covered above.
  assertEquals(url.searchParams.get("resource"), FIGMA_MCP_URL);
});

Deno.test("FIGMA_MCP_URL is the official remote server endpoint", () => {
  assert(FIGMA_MCP_URL === "https://mcp.figma.com/mcp");
});
