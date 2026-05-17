import { postgraphile } from "postgraphile";
import { PostGraphileAmberPreset } from "postgraphile/presets/amber";
import { PgV4SimpleSubscriptionsPlugin } from "postgraphile/presets/v4";
import { makePgService } from "postgraphile/adaptors/pg";
import { PostGraphileConnectionFilterPreset } from "postgraphile-plugin-connection-filter";
import { makeJSONPgSmartTagsPlugin } from "graphile-utils";
import { BASE_PATH } from "./config.ts";
import { pluginOperationsPlugin } from "./graphql/plugin-operations.ts";

// Defence-in-depth: even if a SQL `COMMENT ON ... @omit` migration hasn't run
// (or somebody adds a sensitive table without one), keep secret-bearing tables
// out of the auto-generated GraphQL schema. The connection still runs as the
// owner role today, so RLS is bypassed — these tables would otherwise be
// world-readable on /graphql.
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
  return postgraphile({
    extends: [PostGraphileAmberPreset, PostGraphileConnectionFilterPreset],
    plugins: [
      omitSensitivePlugin,
      pluginOperationsPlugin,
      PgV4SimpleSubscriptionsPlugin,
    ],
    pgServices: [
      makePgService({
        connectionString: databaseUrl,
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
