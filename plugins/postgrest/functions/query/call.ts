// Ports the RPC side of src/PostgREST/Query.hs (PostgREST v12.2.3):
// actionQuery for CallReadPlan — the prepareCall statement over the
// callPlanToQuery CTE, the tx mode / isolation level / function SET settings
// from the called Routine (planTxMode / planIsoLvl / setPgLocals
// funcSettings), and the post-call guards failNotSingular /
// failExceedsMaxAffectedPref (which throw inside the transaction, matching
// upstream's SQL.condemn).

import type { AuthResult } from "../auth/jwt.ts";
import type { AppConfig } from "../config.ts";
import { internalError, maxAffectedViolationError, singularityError } from "../errors.ts";
import type { ApiRequest } from "../parse/api-request.ts";
import type { MediaType } from "../parse/media-type.ts";
import type { PreferHandling } from "../parse/preferences.ts";
import { shouldCount } from "../parse/preferences.ts";
import type { CallReadPlan } from "../plan/call-plan.ts";
import { renderSnippet } from "../sql/builder.ts";
import { callPlanToQuery, readPlanToCountQuery, readPlanToQuery } from "../sql/query-builder.ts";
import {
  decodeCallResult,
  decodeCustomBody,
  decodePlanResult,
  mtSnippet,
  prepareCall,
  type ResultSet,
  type RSStandard,
} from "../sql/statements.ts";
import { runQuery } from "./executor.ts";

/**
 * Ports Query.hs actionQuery (DbCall CallReadPlan): builds the prepareCall
 * statement and runs it through the transaction lifecycle. Plan.hs decided
 * the tx mode (GET/HEAD and stable/immutable POST run READ ONLY — a volatile
 * function invoked via GET that writes fails with 25006
 * read_only_sql_transaction, which maps to 405); Query.hs planIsoLvl takes
 * the function's isolation level over the role's.
 */
export async function invokeQuery(
  plan: CallReadPlan,
  config: AppConfig,
  apiReq: ApiRequest,
  authResult: AuthResult,
): Promise<ResultSet> {
  const { preferCount, preferTransaction, preferTimezone, preferMaxAffected, preferHandling } = apiReq.iPreferences;
  const isPlan = plan.crMedia.kind === "MTVndPlan";

  // Statements.hs mtSnippet: a plan accept EXPLAIN-wraps the whole statement.
  const statement = mtSnippet(
    plan.crMedia,
    prepareCall(
      plan.crProc,
      callPlanToQuery(plan.crCallPlan),
      readPlanToQuery(plan.crReadPlan),
      readPlanToCountQuery(plan.crReadPlan),
      shouldCount(preferCount),
      plan.crHandler,
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
    // Plan.hs txMode: a POST of a stable/immutable function also runs READ ONLY
    isReadonlyRpc: plan.crTxMode === "Read",
    funcIsoLvl: plan.crProc.isolationLvl ?? undefined,
    funcSettings: plan.crProc.funcSettings,
    timezone: preferTimezone ?? undefined,
    preferTx: preferTransaction === null ? undefined : preferTransaction === "Commit" ? "commit" : "rollback",
    mainQuery: { ...renderSnippet(statement), rawTypes: isPlan },
    postRunner: (_client, main) => {
      if (isPlan) return Promise.resolve(decodePlanResult(main));
      const resultSet = decodeCustomBody(plan.crHandler, decodeCallResult(main));
      failNotSingular(plan.crMedia, resultSet);
      failExceedsMaxAffectedPref(preferMaxAffected, preferHandling, resultSet);
      return Promise.resolve(resultSet);
    },
  });
  if (outcome.extra === undefined) throw internalError("call query returned no result set");
  return outcome.extra;
}

/** Ports Query.hs failNotSingular (RPC side). */
function failNotSingular(mediaType: MediaType, resultSet: RSStandard): void {
  if (mediaType.kind === "MTVndSingularJSON" && resultSet.rsQueryTotal !== 1) {
    throw singularityError(resultSet.rsQueryTotal);
  }
}

/** Ports Query.hs failExceedsMaxAffectedPref — only under handling=strict. */
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
