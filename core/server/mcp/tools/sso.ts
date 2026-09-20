import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pool } from "../../db.ts";
import { refreshProviderOidcConfig } from "../../auth/federation/admin-store.ts";

export function registerSsoTools(server: McpServer) {
  server.tool(
    "sso-list",
    "List all configured SSO (Single Sign-On) providers. Shows provider ID, display name, client ID, enabled status, and timestamps. Client secrets are omitted for security. Supported providers include Google, GitHub, Microsoft, and any custom OIDC provider.",
    {},
    async () => {
      try {
        const result = await pool.query(
          `SELECT id, "displayName", "clientId", enabled, "createdAt", "updatedAt" FROM trexdb.sso_provider ORDER BY "createdAt" DESC`,
        );
        return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "sso-save",
    "Create or update an SSO provider. The id must be a lowercase identifier (e.g. 'google', 'github', 'microsoft', 'okta'). If a provider with this id exists, it will be updated. Pass an empty string for clientSecret to keep the existing secret unchanged. After saving, SSO providers are automatically reloaded.",
    {
      id: z.string().describe("Provider identifier (lowercase, e.g. 'google', 'github')"),
      displayName: z.string().describe("Display name shown on login page"),
      clientId: z.string().describe("OAuth client ID"),
      clientSecret: z.string().describe("OAuth client secret (empty string to keep existing)"),
      enabled: z.boolean().optional().describe("Whether the provider is enabled (default false)"),
    },
    async ({ id, displayName, clientId, clientSecret, enabled }) => {
      try {
        const client = await pool.connect();
        let queryErr: Error | undefined;
        try {
          await client.query("BEGIN");
          await client.query(
            `SELECT trexdb.save_sso_provider($1, $2, $3, $4, $5)`,
            [id, displayName, clientId, clientSecret, enabled ?? false],
          );
          // save_sso_provider writes clientId and clientSecret, both of which
          // @better-auth/sso reads out of the serialized oidcConfig rather than
          // out of the columns. Without this, rotating a secret here is
          // honoured by trex's own router and silently ignored by the plugin —
          // the provider keeps authenticating with the old credential until
          // somebody re-saves it through /admin/federation. A no-op for a row
          // with no issuer, which is every row this tool can create: the
          // function writes five columns and issuer is not one of them.
          await refreshProviderOidcConfig(client, id);
          await client.query("COMMIT");
        } catch (err) {
          queryErr = err instanceof Error ? err : new Error(String(err));
          await client.query("ROLLBACK").catch(() => {});
          throw err;
        } finally {
          // Released WITH the error when the statement failed so pg discards
          // the connection instead of handing a possibly-broken one back, the
          // same rule federation/admin-api.ts follows.
          client.release(queryErr);
        }
        return { content: [{ type: "text", text: `SSO provider '${id}' saved` }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "sso-delete",
    "Delete an SSO provider by ID. Users who authenticated via this provider will keep their accounts but won't be able to log in via SSO until the provider is re-added. After deletion, SSO providers are automatically reloaded.",
    {
      id: z.string().describe("Provider ID to delete"),
    },
    async ({ id }) => {
      try {
        const result = await pool.query(
          `DELETE FROM trexdb.sso_provider WHERE id = $1 RETURNING id`,
          [id],
        );
        if (result.rows.length === 0) {
          return { content: [{ type: "text", text: "SSO provider not found" }], isError: true };
        }
        try {
          // SSO providers are loaded from DB on each request; no reload needed
        } catch (_e) {
          // Non-fatal
        }
        return { content: [{ type: "text", text: `SSO provider '${id}' deleted` }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );
}
