import { postgraphile } from "postgraphile";
import { PostGraphileAmberPreset } from "postgraphile/presets/amber";
import { PgV4SimpleSubscriptionsPlugin } from "postgraphile/presets/v4";
import { makePgService } from "postgraphile/adaptors/pg";
import { PostGraphileConnectionFilterPreset } from "postgraphile-plugin-connection-filter";
import { makeJSONPgSmartTagsPlugin } from "graphile-utils";
import { BASE_PATH } from "./config.ts";
import { toAuthenticatorUrl } from "./lib/db-url.ts";
import { pluginOperationsPlugin } from "./graphql/plugin-operations.ts";

// Defence-in-depth: even if a SQL `COMMENT ON ... @omit` migration hasn't run
// (or somebody adds a sensitive table without one), keep secret-bearing tables
// out of the auto-generated GraphQL schema. PostGraphile now connects as the
// `authenticator` role and SET ROLEs per request so RLS is enforced, but this
// keeps the highest-value secret tables out of the schema regardless of grants.
const omitSensitivePlugin = makeJSONPgSmartTagsPlugin({
  version: 1,
  config: {
    class: {
      "trexdb.setting": { tags: { omit: true } },
    },
  },
});

const graphiqlEnabled = Deno.env.get("ENABLE_GRAPHIQL") === "true";

export function createPostGraphile(databaseUrl: string, schemas: string[]) {
  // Connect as the unprivileged `authenticator` role (Supabase model) so the
  // trexdb RLS policies are enforced. Per-request, `authContext` sets a `role`
  // in pgSettings to SET LOCAL ROLE anon/authenticated/service_role.
  // GRAPHQL_DATABASE_URL overrides the derived URL (e.g. when the deploy uses a
  // randomized authenticator password).
  const connectionString =
    Deno.env.get("GRAPHQL_DATABASE_URL") || toAuthenticatorUrl(databaseUrl);

  return postgraphile({
    extends: [PostGraphileAmberPreset, PostGraphileConnectionFilterPreset],
    plugins: [
      omitSensitivePlugin,
      pluginOperationsPlugin,
      PgV4SimpleSubscriptionsPlugin,
    ],
    pgServices: [
      makePgService({
        connectionString,
        schemas,
      }),
    ],
    grafserv: {
      graphqlPath: `${BASE_PATH}/graphql`,
      graphiqlPath: `${BASE_PATH}/graphiql`,
      graphiql: graphiqlEnabled,
    },
    grafast: {
      context(ctx: any) {
        const req = ctx.expressv4?.req || ctx.req || ctx.request;
        return {
          pgSettings: req?.pgSettings || {},
        };
      },
    },
  });
}
