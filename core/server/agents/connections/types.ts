// Structural type surface for the "connections" authoring API — the
// eve-compatible way an agent-dir connection file describes an MCP client or
// OpenAPI integration exposed to the model. Keep this file dependency-free:
// connection files import it transitively via "eve/connections" and must stay
// portable to real eve. Mirrors channels/types.ts and eve-shim/types.ts.

// How a connection authenticates outbound calls. `static` carries an inline
// token/header source; `oauth` names a trex connector resolved at call time
// (produced by trexConnect). deno-lint-ignore no-explicit-any: ctx shape is
// runtime-owned (Task 2+) and intentionally loose for authoring parity.
export type ConnectionAuth =
  | {
    kind: "static";
    // deno-lint-ignore no-explicit-any
    getToken?: (ctx?: any) => Promise<{ token: string }>;
    // deno-lint-ignore no-explicit-any
    headers?: Record<string, string> | ((ctx?: any) => Record<string, string>);
  }
  | { kind: "oauth"; connector: string; principalType?: "user" | "app" };

// Which subset of a connection's discovered tools is exposed to the model.
// Exactly one of `allow`/`block` is permitted (enforced by the factories).
export type ConnectionTools = { allow: string[] } | { block: string[] };

// The branded connection definition produced by defineMcpClientConnection /
// defineOpenApiConnection and consumed by the loader/runtime (Tasks 2+).
// `__trexConnection` is the brand the loader checks before trusting a
// connection file's default export, exactly as `__trexTool`/`__trexChannel`
// gate the tool/channel surfaces.
export interface ConnectionDef {
  __trexConnection: true;
  type: "mcp" | "openapi";
  name?: string; // set by the loader from the filename
  description: string;
  url?: string; // mcp: the MCP server endpoint
  spec?: unknown | string; // openapi: inline spec object | file path | url
  baseUrl?: string; // openapi: override the spec's server base url
  auth?: ConnectionAuth;
  // deno-lint-ignore no-explicit-any
  headers?: Record<string, string> | ((ctx?: any) => Record<string, string>);
  tools?: ConnectionTools;
  approval?: "once";
}

// Author-facing input to the connection factories: everything on ConnectionDef
// except the brand and `type` (which the factory stamps) and `name` (which the
// loader sets from the filename).
export type ConnectionConfig = Omit<
  ConnectionDef,
  "__trexConnection" | "type" | "name"
>;
