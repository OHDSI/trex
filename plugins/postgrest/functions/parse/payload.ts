// Ports the request-body handling of src/PostgREST/ApiRequest.hs (PostgREST
// v12.2.3): getPayload, payloadAttributes and csvToJson (the Data.Csv
// decodeByName path), plus Network.HTTP.Types.URI parseSimpleQuery for
// x-www-form-urlencoded bodies. Error message strings are verbatim
// ("Empty or invalid json", "All object keys must match", "All lines must
// have same number of fields", "Content-Type not acceptable: ...") — they are
// spec-tested upstream.

import { invalidBody } from "../errors.ts";
import type { FieldName } from "../types.ts";
import { type MediaType, toMime } from "./media-type.ts";
import type { Action, Payload } from "./api-request.ts";

// --------------------------------------------------------------------------
// getPayload
// --------------------------------------------------------------------------

/**
 * Ports ApiRequest.hs getPayload: parses the request body per Content-Type
 * into a Payload and derives the effective columns set (payload keys, or the
 * ?columns= set when the body is passed through as RawJSON). Throws PGRST102
 * (InvalidBody) with upstream's exact messages.
 */
export function getPayload(
  reqBody: string,
  contentMediaType: MediaType,
  qsColumns: Set<FieldName> | null,
  action: Action,
): [Payload | null, Set<FieldName>] {
  const shouldParsePayload = action.kind === "ActDb" &&
    ((action.db.kind === "ActRelationMut" && action.db.mutation !== "MutationDelete") ||
      (action.db.kind === "ActRoutine" && action.db.invMethod.kind === "Inv"));

  // ?columns= only takes effect on POST/PATCH to relations and RPC POST.
  const columns = action.kind === "ActDb" &&
      ((action.db.kind === "ActRelationMut" &&
        (action.db.mutation === "MutationCreate" || action.db.mutation === "MutationUpdate")) ||
        (action.db.kind === "ActRoutine" && action.db.invMethod.kind === "Inv"))
    ? qsColumns
    : null;

  const isProc = action.kind === "ActDb" && action.db.kind === "ActRoutine";

  const payload = (): Payload => {
    switch (contentMediaType.kind) {
      case "MTApplicationJSON": {
        if (columns !== null) return { kind: "RawJSON", payRaw: reqBody };
        let json: unknown;
        if (reqBody === "" && isProc) {
          json = {}; // emptyObject
        } else {
          try {
            json = JSON.parse(reqBody);
          } catch {
            // Drop the parsing error message in favor of a generic one
            // (https://github.com/PostgREST/postgrest/issues/2344)
            throw invalidBody("Empty or invalid json");
          }
        }
        const attrs = payloadAttributes(reqBody, json);
        if (attrs === null) throw invalidBody("All object keys must match");
        return attrs;
      }
      case "MTTextCSV": {
        const json = csvToJson(decodeByName(reqBody));
        const raw = JSON.stringify(json);
        const attrs = payloadAttributes(raw, json);
        if (attrs === null) throw invalidBody("All lines must have same number of fields");
        return attrs;
      }
      case "MTUrlEncoded": {
        const params = parseSimpleQuery(reqBody);
        if (isProc) {
          return { kind: "ProcessedUrlEncoded", payArray: params, payKeys: new Set(params.map(([k]) => k)) };
        }
        // HM.fromList: later duplicates win
        const paramsMap: Record<string, string> = {};
        for (const [k, v] of params) paramsMap[k] = v;
        return { kind: "ProcessedJSON", payRaw: JSON.stringify(paramsMap), payKeys: new Set(Object.keys(paramsMap)) };
      }
      case "MTTextPlain":
      case "MTTextXML":
      case "MTOctetStream":
        if (isProc) return { kind: "RawPay", payRaw: reqBody };
        throw invalidBody(`Content-Type not acceptable: ${toMime(contentMediaType)}`);
      default:
        throw invalidBody(`Content-Type not acceptable: ${toMime(contentMediaType)}`);
    }
  };

  const checkedPayload = shouldParsePayload ? payload() : null;
  const cols = checkedPayload !== null &&
      (checkedPayload.kind === "ProcessedJSON" || checkedPayload.kind === "ProcessedUrlEncoded")
    ? checkedPayload.payKeys
    : checkedPayload !== null && checkedPayload.kind === "RawJSON" && columns !== null
    ? columns
    : new Set<FieldName>();
  return [checkedPayload, cols];
}

// --------------------------------------------------------------------------
// payloadAttributes
// --------------------------------------------------------------------------

/**
 * Ports ApiRequest.hs payloadAttributes: tests that an Array contains only
 * Objects having the same keys. Returns null when the keys don't match (the
 * caller picks the media-type specific message). Anything that is neither an
 * object nor an array of objects truncates to an empty array, like upstream.
 */
export function payloadAttributes(raw: string, json: unknown): Payload | null {
  // ProcessedJSON (JSON.encode emptyArray) S.empty
  const emptyPJArray: Payload = { kind: "ProcessedJSON", payRaw: "[]", payKeys: new Set() };
  if (Array.isArray(json)) {
    if (json.length === 0) return emptyPJArray;
    const first: unknown = json[0];
    if (first === null || typeof first !== "object" || Array.isArray(first)) return null;
    const canonicalKeys = new Set(Object.keys(first));
    const areKeysUniform = json.every((x: unknown) => {
      if (x === null || typeof x !== "object" || Array.isArray(x)) return false;
      const keys = Object.keys(x);
      return keys.length === canonicalKeys.size && keys.every((k) => canonicalKeys.has(k));
    });
    return areKeysUniform ? { kind: "ProcessedJSON", payRaw: raw, payKeys: canonicalKeys } : null;
  }
  if (json !== null && typeof json === "object") {
    return { kind: "ProcessedJSON", payRaw: raw, payKeys: new Set(Object.keys(json)) };
  }
  // truncate everything else to an empty array
  return emptyPJArray;
}

// --------------------------------------------------------------------------
// CSV — Data.Csv decodeByName + ApiRequest.hs csvToJson
// --------------------------------------------------------------------------

/** CsvData equivalent: rows as header-keyed records (insertion = header order). */
export type CsvData = Record<string, string>[];

/**
 * Ports Data.Csv decodeByName (as used by getPayload): the first record is
 * the header; every following record is zipped with it (cassava's
 * `V.zip hdr v` truncates to the shorter side, so a short row yields fewer
 * keys and the uniform-keys check in payloadAttributes rejects it with
 * "All lines must have same number of fields"). Throws PGRST102 on malformed
 * CSV, mirroring cassava's Left parse errors.
 */
export function decodeByName(input: string): CsvData {
  // cassava removeBlankLines: records of a single empty field are dropped
  const records = parseCsv(input).filter((r) => !(r.length === 1 && r[0] === ""));
  if (records.length === 0) throw invalidBody("parse error (not enough input)");
  const [header, ...rows] = records;
  return rows.map((fields) => {
    const rec: Record<string, string> = {};
    const n = Math.min(header.length, fields.length);
    for (let i = 0; i < n; i++) rec[header[i]] = fields[i];
    return rec;
  });
}

/**
 * RFC4180 CSV records: comma-separated, double-quoted fields with `""`
 * escapes, CRLF or LF record separators. A trailing newline does not produce
 * an extra record.
 */
export function parseCsv(input: string): string[][] {
  const records: string[][] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const pushField = (): void => {
    fields.push(field);
    field = "";
  };
  const pushRecord = (): void => {
    pushField();
    records.push(fields);
    fields = [];
  };
  while (i < input.length) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += c;
        i++;
      }
    } else if (c === '"' && field === "") {
      inQuotes = true;
      i++;
    } else if (c === ",") {
      pushField();
      i++;
    } else if (c === "\r" && input[i + 1] === "\n") {
      pushRecord();
      i += 2;
    } else if (c === "\n" || c === "\r") {
      pushRecord();
      i++;
    } else {
      field += c;
      i++;
    }
  }
  if (inQuotes) throw invalidBody("parse error (unexpected end of input)");
  // last record unless the input ended with a record separator (or was empty)
  if (field !== "" || fields.length > 0 || (input !== "" && !input.endsWith("\n") && !input.endsWith("\r"))) {
    pushRecord();
  }
  return records;
}

/**
 * Ports ApiRequest.hs csvToJson: converts parsed CSV rows into a JSON array
 * of objects; the string "NULL" becomes a JSON null.
 */
export function csvToJson(vals: CsvData): Record<string, string | null>[] {
  return vals.map((row) => {
    const obj: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(row)) obj[k] = v === "NULL" ? null : v;
    return obj;
  });
}

// --------------------------------------------------------------------------
// Network.HTTP.Types.URI parseSimpleQuery
// --------------------------------------------------------------------------

/**
 * Ports parseSimpleQuery: pairs split on '&'/';', keys/values split on the
 * first '=', '+' decoded as space, percent-decoding applied (invalid escapes
 * are kept verbatim, matching urlDecode's leniency).
 */
export function parseSimpleQuery(body: string): [string, string][] {
  const urlDecode = (s: string): string => {
    const plussed = s.replaceAll("+", " ");
    try {
      return decodeURIComponent(plussed);
    } catch {
      return plussed;
    }
  };
  return body
    .split(/[&;]/)
    .filter((part) => part !== "")
    .map((part): [string, string] => {
      const eq = part.indexOf("=");
      if (eq === -1) return [urlDecode(part), ""];
      return [urlDecode(part.slice(0, eq)), urlDecode(part.slice(eq + 1))];
    });
}
