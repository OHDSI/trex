// Ports the read side of src/PostgREST/Response.hs (PostgREST v12.2.3):
// actionResponse for WrappedReadPlan — status via rangeStatusHeader,
// Content-Range/Content-Location/Content-Type/Preference-Applied headers and
// the response.status / response.headers GUC overrides (Response/GucHeader.hs).

import { gucHeadersError, gucStatusError, invalidRange } from "./errors.ts";
import type { ApiRequest } from "./parse/api-request.ts";
import { toContentType } from "./parse/media-type.ts";
import { prefAppliedHeader } from "./parse/preferences.ts";
import { rangeOffset, rangeStatusHeader } from "./parse/range.ts";
import type { WrappedReadPlan } from "./plan/read-plan.ts";
import type { ResultSet } from "./sql/statements.ts";

/** Ports Response.hs actionResponse (DbCrudResult WrappedReadPlan ...). */
export function readResponse(resultSet: ResultSet, apiReq: ApiRequest, plan: WrappedReadPlan): Response {
  const { iPreferences, iTopLevelRange, iQueryParams, iSchema, iNegotiatedByProfile } = apiReq;
  const { rsTableTotal, rsQueryTotal, rsBody, rsGucHeaders, rsGucStatus } = resultSet;

  const { status, header: contentRange } = rangeStatusHeader(iTopLevelRange, rsQueryTotal, rsTableTotal);
  // Only these preferences count as applied on reads (Response.hs).
  const prefHeader = prefAppliedHeader({
    preferResolution: null,
    preferRepresentation: null,
    preferParameters: null,
    preferCount: iPreferences.preferCount,
    preferTransaction: iPreferences.preferTransaction,
    preferMissing: null,
    preferHandling: iPreferences.preferHandling,
    preferTimezone: iPreferences.preferTimezone,
    preferMaxAffected: null,
    invalidPrefs: [],
  });
  const headers: [string, string][] = [
    contentRange,
    [
      "Content-Location",
      `/${plan.crudQi.name}${iQueryParams.qsCanonical === "" ? "" : `?${iQueryParams.qsCanonical}`}`,
    ],
    toContentType(plan.wrMedia),
    ...(iNegotiatedByProfile ? [["Content-Profile", iSchema] as [string, string]] : []),
    ...(prefHeader === null ? [] : [["Preference-Applied", prefHeader] as [string, string]]),
  ];

  const [ovStatus, ovHeaders] = overrideStatusHeaders(rsGucStatus, rsGucHeaders, status, headers);

  const body = status === 416
    ? JSON.stringify(
      invalidRange({
        kind: "OutOfBounds",
        lower: String(rangeOffset(iTopLevelRange)),
        total: rsTableTotal === null ? "0" : String(rsTableTotal),
      }).body,
    )
    : plan.wrHdrsOnly
    ? null
    : rsBody;

  const responseHeaders = new Headers();
  for (const [k, v] of ovHeaders) responseHeaders.append(k, v);
  return new Response(body, { status: ovStatus, headers: responseHeaders });
}

/**
 * Ports Response.hs overrideStatusHeaders — status and headers can be
 * overridden from SQL via the response.status / response.headers GUCs.
 * Throws PGRST112 / PGRST111 on malformed values.
 */
function overrideStatusHeaders(
  rsGucStatus: string | null,
  rsGucHeaders: string | null,
  status: number,
  headers: [string, string][],
): [number, [string, string][]] {
  const gucStatus = decodeGucStatus(rsGucStatus);
  const gucHeaders = decodeGucHeaders(rsGucHeaders);
  return [gucStatus ?? status, addHeadersIfNotIncluded(headers, gucHeaders)];
}

/**
 * Ports Response.hs decodeGucHeaders + GucHeader.hs FromJSON: the GUC must
 * be a JSON array of objects with a single key and a string value.
 */
function decodeGucHeaders(raw: string | null): [string, string][] {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw gucHeadersError();
  }
  if (!Array.isArray(parsed)) throw gucHeadersError();
  return parsed.map((entry): [string, string] => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) throw gucHeadersError();
    const kvs = Object.entries(entry as Record<string, unknown>);
    if (kvs.length !== 1 || typeof kvs[0][1] !== "string") throw gucHeadersError();
    return [kvs[0][0], kvs[0][1]];
  });
}

/**
 * Ports Response.hs decodeGucStatus (Data.Text.Read decimal: leading digits
 * parse, any trailing rest is ignored).
 */
function decodeGucStatus(raw: string | null): number | null {
  if (raw === null) return null;
  const m = /^\d+/.exec(raw);
  if (m === null) throw gucStatusError();
  return Number.parseInt(m[0], 10);
}

/**
 * Ports Response.hs addHeadersIfNotIncluded: GUC headers win — a produced
 * header is dropped when a GUC header with the same (case-insensitive) name
 * exists, so the user can override instead of duplicating.
 */
function addHeadersIfNotIncluded(newHeaders: [string, string][], initialHeaders: [string, string][]): [string, string][] {
  const initialNames = new Set(initialHeaders.map(([k]) => k.toLowerCase()));
  return [...newHeaders.filter(([k]) => !initialNames.has(k.toLowerCase())), ...initialHeaders];
}
