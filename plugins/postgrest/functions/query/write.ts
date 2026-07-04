// Ports the write side of src/PostgREST/Query.hs (PostgREST v12.2.3):
// writeQuery (the prepareWrite statement over the MutatePlan) and the
// post-mutation guards — failNotSingular, failExceedsMaxAffectedPref,
// failsChangesOffLimits and failPut. Guards throw inside the transaction so
// the executor rolls it back, matching upstream's SQL.condemn.

import type { AuthResult } from "../auth/jwt.ts";
import type { AppConfig } from "../config.ts";
import { internalError, maxAffectedViolationError, offLimitsChangesError, putMatchingPkError, singularityError } from "../errors.ts";
import type { ApiRequest } from "../parse/api-request.ts";
import type { MediaType } from "../parse/media-type.ts";
import type { PreferHandling } from "../parse/preferences.ts";
import { rangeLimit } from "../parse/range.ts";
import type { MutateReadPlan } from "../plan/mutate-plan.ts";
import { renderSnippet } from "../sql/builder.ts";
import { mutatePlanToQuery, readPlanToQuery } from "../sql/query-builder.ts";
import {
  decodeCustomBody,
  decodePlanResult,
  decodeWriteResult,
  mtSnippet,
  prepareWrite,
  type ResultSet,
  type RSStandard,
} from "../sql/statements.ts";
import { runQuery } from "./executor.ts";

/**
 * Ports Query.hs actionQuery (DbCrud MutateReadPlan) + writeQuery: builds the
 * prepareWrite statement and runs it through the transaction lifecycle, then
 * applies the mutation-specific guards (in upstream's order) before the
 * transaction is committed / optionally rolled back.
 */
export async function writeQuery(
  plan: MutateReadPlan,
  config: AppConfig,
  apiReq: ApiRequest,
  authResult: AuthResult,
): Promise<ResultSet> {
  const { preferTransaction, preferTimezone, preferRepresentation, preferResolution, preferMaxAffected, preferHandling } = apiReq.iPreferences;
  const isPlan = plan.mrMedia.kind === "MTVndPlan";

  // Query.hs writeQuery: (isPut, isInsert, pkCols)
  const mp = plan.mrMutatePlan;
  const isInsert = mp.kind === "Insert";
  const isPut = mp.kind === "Insert" && mp.where_.length > 0;
  const pkCols = mp.kind === "Insert" ? mp.insPkCols : [];

  // Statements.hs mtSnippet: a plan accept EXPLAIN-wraps the whole statement.
  const statement = mtSnippet(
    plan.mrMedia,
    prepareWrite(
      readPlanToQuery(plan.mrReadPlan),
      mutatePlanToQuery(mp),
      isInsert,
      isPut,
      plan.mrHandler,
      preferRepresentation,
      preferResolution,
      pkCols,
    ),
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
    mainQuery: { ...renderSnippet(statement), rawTypes: isPlan },
    postRunner: (_client, main) => {
      if (isPlan) return Promise.resolve(decodePlanResult(main));
      const resultSet = decodeCustomBody(plan.mrHandler, decodeWriteResult(main));
      switch (plan.mrMutation) {
        case "MutationCreate":
          failNotSingular(plan.mrMedia, resultSet);
          break;
        case "MutationUpdate":
        case "MutationDelete":
          failNotSingular(plan.mrMedia, resultSet);
          failExceedsMaxAffectedPref(preferMaxAffected, preferHandling, resultSet);
          failsChangesOffLimits(rangeLimit(apiReq.iTopLevelRange), resultSet);
          break;
        case "MutationSingleUpsert":
          failPut(resultSet);
          break;
      }
      return Promise.resolve(resultSet);
    },
  });
  if (outcome.extra === undefined) throw internalError("write query returned no result set");
  return outcome.extra;
}

/**
 * Ports Query.hs failPut: makes sure the querystring pk matches the payload
 * pk, e.g. PUT /items?id=eq.1 {"id":1,..} is accepted, PUT /items?id=eq.14
 * {"id":2,..} is rejected. If the condition is not satisfied then nothing is
 * inserted (see the WHERE on the PUT INSERT in the QueryBuilder).
 */
function failPut(resultSet: RSStandard): void {
  if (resultSet.rsQueryTotal !== 1) throw putMatchingPkError();
}

/** Ports Query.hs failNotSingular (mutation side): fail if a single JSON
 * object was requested and not exactly one row was affected. */
function failNotSingular(mediaType: MediaType, resultSet: RSStandard): void {
  if (mediaType.kind === "MTVndSingularJSON" && resultSet.rsQueryTotal !== 1) {
    throw singularityError(resultSet.rsQueryTotal);
  }
}

/** Ports Query.hs failExceedsMaxAffectedPref — only enforced under
 * Prefer: handling=strict. */
function failExceedsMaxAffectedPref(
  preferMaxAffected: number | null,
  preferHandling: PreferHandling | null,
  resultSet: RSStandard,
): void {
  if (preferMaxAffected === null) return;
  if (resultSet.rsQueryTotal > preferMaxAffected && preferHandling === "Strict") {
    throw maxAffectedViolationError(resultSet.rsQueryTotal);
  }
}

/** Ports Query.hs failsChangesOffLimits — a limited UPDATE/DELETE must not
 * change more rows than the limit. */
function failsChangesOffLimits(maxChanges: number | null, resultSet: RSStandard): void {
  if (maxChanges === null) return;
  if (resultSet.rsQueryTotal > maxChanges) {
    throw offLimitsChangesError(resultSet.rsQueryTotal, maxChanges);
  }
}
