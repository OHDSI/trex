import { defineMcpClientConnection } from "eve/connections";

// A no-auth MCP client connection pointing at a dummy endpoint — the loader
// discovers this file as the `echo` connection (name = filename sans ext).
export default defineMcpClientConnection({
  description: "Echo MCP server (dummy, no auth)",
  url: "http://localhost:9/mcp",
});
