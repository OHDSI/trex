// Ports src/PostgREST/ApiRequest/Preferences.hs (PostgREST v12.2.3) —
// client preferences set in HTTP Prefer headers, per RFC7240.
//
// The union values are the Haskell constructor names for greppability;
// toHeaderValue renders them back into the `Prefer:` syntax.

/** How to handle duplicate values (upserts). */
export type PreferResolution = "MergeDuplicates" | "IgnoreDuplicates";

/** How to return the mutated data (RFC7240 §4.2). */
export type PreferRepresentation = "Full" | "HeadersOnly" | "None";

/** How to pass parameters to stored procedures. Deprecated upstream. */
export type PreferParameters = "SingleObject";

/** How to determine the count of (expected) results. */
export type PreferCount = "ExactCount" | "PlannedCount" | "EstimatedCount";

/** Whether to commit or roll back transactions. */
export type PreferTransaction = "Commit" | "Rollback";

/** How to handle ?columns= keys missing from the json body. */
export type PreferMissing = "ApplyDefaults" | "ApplyNulls";

/** Handling of unrecognised preferences. */
export type PreferHandling = "Strict" | "Lenient";

type EnumPref =
  | PreferResolution
  | PreferRepresentation
  | PreferParameters
  | PreferCount
  | PreferTransaction
  | PreferMissing
  | PreferHandling;

/** Preferences recognized by the application. */
export interface Preferences {
  preferResolution: PreferResolution | null;
  preferRepresentation: PreferRepresentation | null;
  preferParameters: PreferParameters | null;
  preferCount: PreferCount | null;
  preferTransaction: PreferTransaction | null;
  preferMissing: PreferMissing | null;
  preferHandling: PreferHandling | null;
  /** PreferTimezone newtype — the raw (already validated) timezone name. */
  preferTimezone: string | null;
  /** PreferMaxAffected newtype. */
  preferMaxAffected: number | null;
  invalidPrefs: string[];
}

/** ToHeaderValue instances: the value we look for in the Prefer headers. */
export function toHeaderValue(pref: EnumPref): string {
  switch (pref) {
    case "MergeDuplicates":
      return "resolution=merge-duplicates";
    case "IgnoreDuplicates":
      return "resolution=ignore-duplicates";
    case "Full":
      return "return=representation";
    case "None":
      return "return=minimal";
    case "HeadersOnly":
      return "return=headers-only";
    case "SingleObject":
      return "params=single-object";
    case "ExactCount":
      return "count=exact";
    case "PlannedCount":
      return "count=planned";
    case "EstimatedCount":
      return "count=estimated";
    case "Commit":
      return "tx=commit";
    case "Rollback":
      return "tx=rollback";
    case "ApplyDefaults":
      return "missing=default";
    case "ApplyNulls":
      return "missing=null";
    case "Strict":
      return "handling=strict";
    case "Lenient":
      return "handling=lenient";
  }
}

const RESOLUTION: PreferResolution[] = ["MergeDuplicates", "IgnoreDuplicates"];
const REPRESENTATION: PreferRepresentation[] = ["Full", "None", "HeadersOnly"];
const PARAMETERS: PreferParameters[] = ["SingleObject"];
const COUNT: PreferCount[] = ["ExactCount", "PlannedCount", "EstimatedCount"];
const TRANSACTION: PreferTransaction[] = ["Commit", "Rollback"];
const MISSING: PreferMissing[] = ["ApplyDefaults", "ApplyNulls"];
const HANDLING: PreferHandling[] = ["Strict", "Lenient"];

/** Ports Haskell readMaybe @Int64 for max-affected. */
function readMaybeInt(s: string): number | null {
  const t = s.trim();
  return /^-?\d+$/.test(t) ? Number.parseInt(t, 10) : null;
}

/**
 * Ports Preferences.hs fromHeaders: parse the Prefer header(s) (RFC7240).
 * Multiple headers and comma-separated values are accepted; if a preference
 * is set more than once, only the first is used. Unknown preferences are
 * collected in invalidPrefs (for handling=strict at request time).
 */
export function fromHeaders(
  allowTxDbOverride: boolean,
  acceptedTzNames: Set<string>,
  headers: Headers | [string, string][],
): Preferences {
  const headerList: [string, string][] = headers instanceof Headers ? [...headers.entries()] : headers;
  const prefHeaders = headerList.filter(([k]) => k.toLowerCase() === "prefer");
  const prefs = prefHeaders.flatMap(([, v]) => v.split(",")).map((p) => p.trim());

  const parsePrefs = <T extends EnumPref>(vals: T[]): T | null => {
    const prefMap = new Map(vals.map((v): [string, T] => [toHeaderValue(v), v]));
    for (const p of prefs) {
      const hit = prefMap.get(p);
      if (hit !== undefined) return hit;
    }
    return null;
  };

  const listStripPrefix = (prefix: string): string | null => {
    for (const p of prefs) {
      if (p.startsWith(prefix)) return p.slice(prefix.length);
    }
    return null;
  };

  const timezonePref = listStripPrefix("timezone=");
  const isTimezonePrefAccepted = timezonePref !== null && acceptedTzNames.has(timezonePref);

  const maxAffectedRaw = listStripPrefix("max-affected=");
  const maxAffectedPref = maxAffectedRaw === null ? null : readMaybeInt(maxAffectedRaw);

  const acceptedPrefs = new Set(
    [...RESOLUTION, ...REPRESENTATION, ...PARAMETERS, ...COUNT, ...TRANSACTION, ...MISSING, ...HANDLING].map(
      toHeaderValue,
    ),
  );
  const isUnacceptable = (p: string): boolean =>
    !acceptedPrefs.has(p) &&
    (!p.startsWith("timezone=") || !isTimezonePrefAccepted) &&
    !p.startsWith("max-affected=");

  return {
    preferResolution: parsePrefs(RESOLUTION),
    preferRepresentation: parsePrefs(REPRESENTATION),
    preferParameters: parsePrefs(PARAMETERS),
    preferCount: parsePrefs(COUNT),
    preferTransaction: allowTxDbOverride ? parsePrefs(TRANSACTION) : null,
    preferMissing: parsePrefs(MISSING),
    preferHandling: parsePrefs(HANDLING),
    preferTimezone: isTimezonePrefAccepted ? timezonePref : null,
    preferMaxAffected: maxAffectedPref,
    invalidPrefs: prefs.filter(isUnacceptable),
  };
}

/** Ports Preferences.hs shouldCount. */
export function shouldCount(prefCount: PreferCount | null): boolean {
  return prefCount === "ExactCount" || prefCount === "EstimatedCount";
}

/**
 * Ports Preferences.hs prefAppliedHeader: the Preference-Applied header
 * value, or null when no preference was applied. Order matches upstream.
 */
export function prefAppliedHeader(p: Preferences): string | null {
  const vals: string[] = [];
  if (p.preferResolution !== null) vals.push(toHeaderValue(p.preferResolution));
  if (p.preferMissing !== null) vals.push(toHeaderValue(p.preferMissing));
  if (p.preferRepresentation !== null) vals.push(toHeaderValue(p.preferRepresentation));
  if (p.preferParameters !== null) vals.push(toHeaderValue(p.preferParameters));
  if (p.preferCount !== null) vals.push(toHeaderValue(p.preferCount));
  if (p.preferTransaction !== null) vals.push(toHeaderValue(p.preferTransaction));
  if (p.preferHandling !== null) vals.push(toHeaderValue(p.preferHandling));
  if (p.preferTimezone !== null) vals.push(`timezone=${p.preferTimezone}`);
  if (p.preferHandling === "Strict" && p.preferMaxAffected !== null) vals.push(`max-affected=${p.preferMaxAffected}`);
  return vals.length === 0 ? null : vals.join(", ");
}
