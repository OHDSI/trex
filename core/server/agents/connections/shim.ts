import type { ConnectionAuth, ConnectionConfig, ConnectionDef } from "./types.ts";

// Shared validation for both connection factories — mirrors defineTool /
// defineChannel's brand+validate posture. `description` is always required;
// when `tools` is present it must carry EXACTLY one of `allow`/`block` (never
// both, never neither) so the loader has an unambiguous allow-or-block policy.
// `type`-specific requirements (mcp→url, openapi→spec) are enforced by the
// callers, which know which field to name in the error.
function validateCommon(type: "mcp" | "openapi", cfg: ConnectionConfig): void {
  if (!cfg.description) {
    throw new Error(`define${type === "mcp" ? "McpClient" : "OpenApi"}Connection: description is required`);
  }
  if (cfg.tools !== undefined) {
    const t = cfg.tools as { allow?: unknown; block?: unknown };
    const hasAllow = "allow" in t && t.allow !== undefined;
    const hasBlock = "block" in t && t.block !== undefined;
    if (hasAllow && hasBlock) {
      throw new Error("connection tools: specify exactly one of `allow` or `block`, not both");
    }
    if (!hasAllow && !hasBlock) {
      throw new Error("connection tools: specify exactly one of `allow` or `block`");
    }
  }
}

// Brands a connection file's config as an MCP client connection. Requires a
// reachable MCP server `url` in addition to the common rules.
export function defineMcpClientConnection(cfg: ConnectionConfig): ConnectionDef {
  validateCommon("mcp", cfg);
  if (!cfg.url) throw new Error("defineMcpClientConnection: url is required");
  return Object.assign({}, cfg, {
    type: "mcp" as const,
    __trexConnection: true as const,
  });
}

// Brands a connection file's config as an OpenAPI connection. Requires an
// OpenAPI `spec` (inline object, file path, or url) in addition to the common
// rules.
export function defineOpenApiConnection(cfg: ConnectionConfig): ConnectionDef {
  validateCommon("openapi", cfg);
  if (cfg.spec === undefined) {
    throw new Error("defineOpenApiConnection: spec is required");
  }
  return Object.assign({}, cfg, {
    type: "openapi" as const,
    __trexConnection: true as const,
  });
}

// trex's replacement for eve's `connect()`: names a trex OAuth connector as a
// connection's `auth`, resolved to a live token at call time by the runtime.
// `principalType` defaults to "user" (act on behalf of the session's end user);
// "app" acts as the application's own service principal.
export function trexConnect(
  connector: string,
  opts?: { principalType?: "user" | "app" },
): ConnectionAuth {
  return {
    kind: "oauth",
    connector,
    principalType: opts?.principalType ?? "user",
  };
}

export type {
  ConnectionAuth,
  ConnectionConfig,
  ConnectionDef,
  ConnectionTools,
} from "./types.ts";
