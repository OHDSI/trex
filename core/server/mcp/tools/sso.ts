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
    "Update an existing SSO provider's display name, client id, client secret or enabled flag. The id must be a lowercase identifier (e.g. 'google', 'github', 'microsoft', 'okta'). Pass an empty string for clientSecret to keep the existing secret unchanged. THIS TOOL CANNOT CREATE A WORKING PROVIDER: it writes five columns and `issuer` is not one of them, so a provider created here can never federate anybody and no sign-in button will appear for it. Use PUT /admin/federation/providers/:id to create one, or to give this one an issuer.",
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
        // save_sso_provider (V1) writes id, displayName, clientId, clientSecret
        // and enabled — and nothing else. `issuer` stays NULL, and a NULL issuer
        // is what enabledProviderIds and federation/router.ts's /authorize both
        // exclude on, so such a row is invisible to the login page and answers
        // "Unknown provider" to anyone who reaches it by hand. Until this, the
        // tool reported success, sso-list then showed the provider ENABLED, and
        // an operator had no way to find out why no button appeared. Saying so
        // is the whole of the fix: the function is V1 and cannot be edited
        // without a migration, and nothing here can invent an issuer.
        let unfederatable = false;
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
          // Read back inside the same transaction, because what the operator
          // has to be told depends on the row this write produced.
          const { rows } = await client.query(
            `SELECT issuer FROM trexdb.sso_provider WHERE id = $1`,
            [id],
          );
          unfederatable = rows[0]?.issuer == null;
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
        const text = unfederatable
          ? `SSO provider '${id}' saved, but it has no issuer and therefore CANNOT ` +
            "federate anybody: it will not appear on the login page and its /authorize " +
            "answers \"Unknown provider\". sso-save writes five columns and issuer is not " +
            `one of them. Set one with PUT /admin/federation/providers/${id}, which also ` +
            "writes the discovery, scopes and link-policy columns a sign-in needs."
          : `SSO provider '${id}' saved`;
        return { content: [{ type: "text", text }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "sso-delete",
    "Delete an SSO provider by ID. Users who authenticated via this provider keep their accounts but cannot sign in through it until the provider is re-added. Their trexdb.account rows survive the delete, so re-adding the provider under the same id restores their links.",
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
        // No reload step: every reader of this table queries it per request.
        return { content: [{ type: "text", text: `SSO provider '${id}' deleted` }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );
}
