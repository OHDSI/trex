// Ports the read side of src/PostgREST/Query.hs (PostgREST v12.2.3):
// actionQuery for WrappedReadPlan — main statement + count strategies
// (exact / planned / estimated via EXPLAIN in the same transaction) and
// failNotSingular — on top of the executor's transaction lifecycle.

import type { PoolClient } from "pg";
import type { AuthResult } from "../auth/jwt.ts";
import type { AppConfig } from "../config.ts";
import { internalError, singularityError } from "../errors.ts";
import type { ApiRequest } from "../parse/api-request.ts";
import type { MediaType } from "../parse/media-type.ts";
import type { PreferCount } from "../parse/preferences.ts";
import { shouldCount } from "../parse/preferences.ts";
import type { WrappedReadPlan } from "../plan/read-plan.ts";
import { renderSnippet, type Snippet } from "../sql/builder.ts";
import { limitedQuery, readPlanToCountQuery, readPlanToQuery } from "../sql/query-builder.ts";
import { decodePlanRows, decodeReadResult, preparePlanRows, prepareRead, type ResultSet } from "../sql/statements.ts";
import { runQuery } from "./executor.ts";

/**
 * Ports Query.hs actionQuery (DbCrud WrappedReadPlan): builds the mainRead
 * statement and runs it through the transaction lifecycle. The count-total
 * EXPLAIN statements (planned/estimated) run in the same transaction, after
 * the main query, via the executor's postRunner — like upstream's
 * resultSetWTotal. Throws PgrstError (singularity errors roll the
 * transaction back, matching SQL.condemn).
 */
export async function readQuery(
  plan: WrappedReadPlan,
  config: AppConfig,
  apiReq: ApiRequest,
  authResult: AuthResult,
): Promise<ResultSet> {
  if (plan.wrMedia.kind === "MTVndPlan") {
    // TODO(phase 8): explainF-wrapped statements + RSPlan decoding.
    throw internalError("application/vnd.pgrst.plan is not implemented yet — phase 8");
  }
  const { preferCount, preferTransaction, preferTimezone } = apiReq.iPreferences;

  const countQuery = readPlanToCountQuery(plan.wrReadPlan);
  const statement = prepareRead(
    readPlanToQuery(plan.wrReadPlan),
    preferCount === "EstimatedCount"
      // LIMIT maxRows + 1 so we can determine below that maxRows was surpassed
      ? limitedQuery(countQuery, config.dbMaxRows === null ? null : config.dbMaxRows + 1)
      : countQuery,
    shouldCount(preferCount),
    plan.wrHandler,
  );

  const outcome = await runQuery<ResultSet>({
    authResult,
    config,
    req: {
      path: apiReq.iPath,
      method: apiReq.iMethod,
      headers: Object.fromEntries(apiReq.iHeaders),
      cookies: Object.fromEntries(apiReq.iCookies),
    },
    schema: apiReq.iSchema,
    timezone: preferTimezone ?? undefined,
    preferTx: preferTransaction === null ? undefined : preferTransaction === "Commit" ? "commit" : "rollback",
    mainQuery: renderSnippet(statement),
    postRunner: async (client, main) => {
      const resultSet = decodeReadResult(main);
      failNotSingular(plan.wrMedia, resultSet);
      return await resultSetWTotal(client, config, preferCount, resultSet, countQuery);
    },
  });
  if (outcome.extra === undefined) throw internalError("read query returned no result set");
  return outcome.extra;
}

/**
 * Ports Query.hs failNotSingular: fail if a single JSON object was requested
 * and not exactly one row was found. Thrown inside the transaction, so the
 * executor rolls it back (upstream SQL.condemn).
 */
function failNotSingular(mediaType: MediaType, resultSet: ResultSet): void {
  if (mediaType.kind === "MTVndSingularJSON" && resultSet.rsQueryTotal !== 1) {
    throw singularityError(resultSet.rsQueryTotal);
  }
}

/**
 * Ports Query.hs resultSetWTotal: the planned/estimated count strategies run
 * an EXPLAIN (FORMAT JSON) of the (unlimited) count query; estimated falls
 * back to the exact count when the total did not surpass db-max-rows.
 */
async function resultSetWTotal(
  client: PoolClient,
  config: AppConfig,
  preferCount: PreferCount | null,
  resultSet: ResultSet,
  countQuery: Snippet,
): Promise<ResultSet> {
  if (preferCount === "PlannedCount") {
    return { ...resultSet, rsTableTotal: await explain(client, countQuery) };
  }
  if (preferCount === "EstimatedCount") {
    // Haskell `tableTotal > (fromIntegral <$> configDbMaxRows)`: with no
    // db-max-rows (Nothing) any Just total compares greater, so the estimate
    // always runs.
    const { rsTableTotal } = resultSet;
    if (rsTableTotal !== null && (config.dbMaxRows === null || rsTableTotal > config.dbMaxRows)) {
      const estimate = await explain(client, countQuery);
      return { ...resultSet, rsTableTotal: estimate === null ? rsTableTotal : Math.max(rsTableTotal, estimate) };
    }
    return resultSet;
  }
  // ExactCount was computed in-statement; no count otherwise.
  return resultSet;
}

/** Ports Statements.hs preparePlanRows execution: "Plan Rows" of the first plan. */
async function explain(client: PoolClient, countQuery: Snippet): Promise<number | null> {
  const rendered = renderSnippet(preparePlanRows(countQuery));
  const res = await client.query({ text: rendered.text, values: rendered.values });
  return decodePlanRows(res);
}
