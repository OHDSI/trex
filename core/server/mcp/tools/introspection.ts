import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { REGISTERED_FUNCTIONS, ROLE_SCOPES, REQUIRED_URL_SCOPES } from "../../plugin/function.ts";
import { REGISTERED_UI_ROUTES, getPluginsJson } from "../../plugin/ui.ts";
import { REGISTERED_FLOWS } from "../../plugin/flow.ts";

// Read-only views into the live plugin/function registries. These mirror the
// GraphQL introspection queries (registeredFunctions, registeredFlows,
// uiPluginRoutes, roleScopeMappings, urlScopeRequirements, uiPluginsJson) so an
// agent can understand what a deployment actually exposes before acting.
export function registerIntrospectionTools(server: McpServer) {
  server.tool(
    "introspect-functions",
    "List all edge/plugin functions registered on this deployment. Each entry has the owning pluginName, its source, and the entryPoint. Use this to see what serverless functions exist and which plugin provides them.",
    {},
    () => {
      const functions = REGISTERED_FUNCTIONS.map((f) => ({
        pluginName: f.name,
        source: f.source,
        entryPoint: f.function,
      }));
      return { content: [{ type: "text", text: JSON.stringify(functions, null, 2) }] };
    },
  );

  server.tool(
    "introspect-flows",
    "List all registered workflow flows (Prefect-style) with their name, entrypoint, container image, and tags. Use this to discover the deployment's runnable flows.",
    {},
    () => {
      const flows = REGISTERED_FLOWS.map((f) => ({
        name: f.name,
        entrypoint: f.entrypoint,
        image: f.image,
        tags: f.tags,
      }));
      return { content: [{ type: "text", text: JSON.stringify(flows, null, 2) }] };
    },
  );

  server.tool(
    "introspect-ui-routes",
    "List all plugin-provided UI routes: each entry maps a urlPrefix to the plugin (pluginName) and its on-disk fsPath. Use this to see which SPA/UI plugins are mounted and where.",
    {},
    () => {
      const routes = REGISTERED_UI_ROUTES.map((r) => ({
        pluginName: r.pluginName,
        urlPrefix: r.urlPrefix,
        fsPath: r.fsPath,
      }));
      return { content: [{ type: "text", text: JSON.stringify(routes, null, 2) }] };
    },
  );

  server.tool(
    "introspect-role-scopes",
    "Show the role-to-scope mapping: for each application role, the list of authorization scopes it grants. Use this to understand what a given role is permitted to do.",
    {},
    () => {
      const mappings = Object.entries(ROLE_SCOPES).map(([role, scopes]) => ({
        role,
        scopes,
      }));
      return { content: [{ type: "text", text: JSON.stringify(mappings, null, 2) }] };
    },
  );

  server.tool(
    "introspect-url-scopes",
    "Show URL-to-scope requirements: for each protected path, the scopes a caller must hold. Use this to understand the access-control model of the deployment's routes.",
    {},
    () => {
      const requirements = REQUIRED_URL_SCOPES.map((r) => ({
        path: r.path,
        scopes: r.scopes,
      }));
      return { content: [{ type: "text", text: JSON.stringify(requirements, null, 2) }] };
    },
  );

  server.tool(
    "introspect-plugins-json",
    "Return the merged plugins.json manifest (the combined UI/plugin configuration the frontend consumes). Use this to inspect the full plugin manifest as a single JSON object.",
    {},
    () => {
      try {
        const parsed = JSON.parse(getPluginsJson());
        return { content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );
}
