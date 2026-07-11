// Ports src/PostgREST/MediaType.hs (PostgREST v12.2.3) plus
// Network.Wai.Parse.parseHttpAccept (used by ApiRequest.hs to order the
// Accept header values by quality factor).

export type MTVndPlanOption = "PlanAnalyze" | "PlanVerbose" | "PlanSettings" | "PlanBuffers" | "PlanWAL";

export type MTVndPlanFormat = "PlanJSON" | "PlanText";

/** Enumeration of currently supported media types. */
export type MediaType =
  | { kind: "MTApplicationJSON" }
  | { kind: "MTGeoJSON" }
  | { kind: "MTTextCSV" }
  | { kind: "MTTextPlain" }
  | { kind: "MTTextXML" }
  | { kind: "MTOpenAPI" }
  | { kind: "MTUrlEncoded" }
  | { kind: "MTOctetStream" }
  | { kind: "MTAny" }
  | { kind: "MTOther"; value: string }
  // vendored media types
  | { kind: "MTVndArrayJSONStrip" }
  | { kind: "MTVndSingularJSON"; stripNulls: boolean }
  | { kind: "MTVndPlan"; mtFor: MediaType; format: MTVndPlanFormat; options: MTVndPlanOption[] };

export const MTApplicationJSON: MediaType = { kind: "MTApplicationJSON" };
export const MTAny: MediaType = { kind: "MTAny" };

/** Convert MediaType to a Content-Type HTTP header pair. */
export function toContentType(ct: MediaType): [string, string] {
  const charset = ct.kind === "MTOctetStream" || ct.kind === "MTOther" ? "" : "; charset=utf-8";
  return ["Content-Type", toMime(ct) + charset];
}

/** Convert from MediaType to a string representing the mime type. */
export function toMime(ct: MediaType): string {
  switch (ct.kind) {
    case "MTApplicationJSON":
      return "application/json";
    case "MTVndArrayJSONStrip":
      return "application/vnd.pgrst.array+json;nulls=stripped";
    case "MTGeoJSON":
      return "application/geo+json";
    case "MTTextCSV":
      return "text/csv";
    case "MTTextPlain":
      return "text/plain";
    case "MTTextXML":
      return "text/xml";
    case "MTOpenAPI":
      return "application/openapi+json";
    case "MTVndSingularJSON":
      return ct.stripNulls ? "application/vnd.pgrst.object+json;nulls=stripped" : "application/vnd.pgrst.object+json";
    case "MTUrlEncoded":
      return "application/x-www-form-urlencoded";
    case "MTOctetStream":
      return "application/octet-stream";
    case "MTAny":
      return "*/*";
    case "MTOther":
      return ct.value;
    case "MTVndPlan": {
      const opts = ct.options.length === 0 ? "" : `; options=${ct.options.map(toMimePlanOption).join("|")}`;
      return `application/vnd.pgrst.plan+${toMimePlanFormat(ct.format)}; for="${toMime(ct.mtFor)}"${opts}`;
    }
  }
}

function toMimePlanOption(opt: MTVndPlanOption): string {
  switch (opt) {
    case "PlanAnalyze":
      return "analyze";
    case "PlanVerbose":
      return "verbose";
    case "PlanSettings":
      return "settings";
    case "PlanBuffers":
      return "buffers";
    case "PlanWAL":
      return "wal";
  }
}

function toMimePlanFormat(fmt: MTVndPlanFormat): string {
  return fmt === "PlanJSON" ? "json" : "text";
}

/**
 * Ports MediaType.hs tokenizeMediaType: split a media type string into
 * (mainType, subType, params) — naive about ';' in quoted values, like
 * upstream (see its FIXMEs).
 */
export function tokenizeMediaType(t: string): [string, string, [string, string][]] {
  const slash = t.indexOf("/");
  const mainType = slash === -1 ? t : t.slice(0, slash);
  const rest = slash === -1 ? "" : t.slice(slash + 1);
  const semi = rest.indexOf(";");
  const subType = semi === -1 ? rest : rest.slice(0, semi);
  const restParams = semi === -1 ? "" : rest.slice(semi + 1);
  const dropAround = (s: string): string => s.replace(/^"+/, "").replace(/"+$/, "");
  const params: [string, string][] = restParams === "" ? [] : restParams.split(";").map((p) => {
    const eq = p.indexOf("=");
    const k = eq === -1 ? p : p.slice(0, eq);
    const v = eq === -1 ? "" : p.slice(eq + 1);
    return [k, dropAround(v)];
  });
  return [mainType, subType, params];
}

/** Ports MediaType.hs decodeMediaType. */
export function decodeMediaType(mt: string): MediaType {
  const [mainType, subType, paramsList] = tokenizeMediaType(mt);
  // normalize parameter names to lowercase, per RFC 7231 (last dup wins)
  const params = new Map(paramsList.map(([k, v]): [string, string] => [k.toLowerCase(), v]));

  const getPlan = (fmt: MTVndPlanFormat): MediaType => {
    const opts = (params.get("options") ?? "").split("|");
    const options: MTVndPlanOption[] = [];
    if (opts.includes("analyze")) options.push("PlanAnalyze");
    if (opts.includes("verbose")) options.push("PlanVerbose");
    if (opts.includes("settings")) options.push("PlanSettings");
    if (opts.includes("buffers")) options.push("PlanBuffers");
    if (opts.includes("wal")) options.push("PlanWAL");
    return { kind: "MTVndPlan", mtFor: decodeMediaType(params.get("for") ?? "application/json"), format: fmt, options };
  };
  const strippedNulls = (params.get("nulls") ?? "false") === "stripped";

  switch (`${mainType.toLowerCase()}/${subType.toLowerCase()}`) {
    case "application/json":
      return { kind: "MTApplicationJSON" };
    case "application/geo+json":
      return { kind: "MTGeoJSON" };
    case "text/csv":
      return { kind: "MTTextCSV" };
    case "text/plain":
      return { kind: "MTTextPlain" };
    case "text/xml":
      return { kind: "MTTextXML" };
    case "application/openapi+json":
      return { kind: "MTOpenAPI" };
    case "application/x-www-form-urlencoded":
      return { kind: "MTUrlEncoded" };
    case "application/octet-stream":
      return { kind: "MTOctetStream" };
    case "application/vnd.pgrst.plan":
      return getPlan("PlanText");
    case "application/vnd.pgrst.plan+text":
      return getPlan("PlanText");
    case "application/vnd.pgrst.plan+json":
      return getPlan("PlanJSON");
    case "application/vnd.pgrst.object+json":
      return { kind: "MTVndSingularJSON", stripNulls: strippedNulls };
    case "application/vnd.pgrst.object":
      return { kind: "MTVndSingularJSON", stripNulls: strippedNulls };
    case "application/vnd.pgrst.array+json":
    case "application/vnd.pgrst.array":
      return strippedNulls ? { kind: "MTVndArrayJSONStrip" } : { kind: "MTApplicationJSON" };
    case "*/*":
      return { kind: "MTAny" };
    default:
      return { kind: "MTOther", value: mt };
  }
}

/** Structural media type equality. */
export function mediaTypeEq(a: MediaType, b: MediaType): boolean {
  return toMime(a) === toMime(b);
}

/**
 * Ports Network.Wai.Parse.parseHttpAccept: strips all spaces, breaks each
 * item at ";q=", and stable-sorts by (q, specificity) descending, where
 * specificity is #semicolons - #stars.
 */
export function parseHttpAccept(accept: string): string[] {
  const count = (s: string, c: string): number => s.split(c).length - 1;
  const items = accept.split(",").map((item, idx) => {
    const noSpace = item.replaceAll(" ", "");
    const qi = noSpace.indexOf(";q=");
    let mt = noSpace;
    let q = 1.0;
    if (qi !== -1) {
      mt = noSpace.slice(0, qi);
      const qStr = noSpace.slice(qi + 3).split(";")[0];
      const parsed = Number.parseFloat(qStr);
      q = Number.isNaN(parsed) ? 1.0 : parsed;
    }
    return { mt, q, specificity: count(mt, ";") - count(mt, "*"), idx };
  });
  items.sort((a, b) => b.q - a.q || b.specificity - a.specificity || a.idx - b.idx);
  return items.map((i) => i.mt);
}
