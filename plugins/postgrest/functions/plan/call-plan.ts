// Ports the call (RPC) side of src/PostgREST/Plan.hs (PostgREST v12.2.3) —
// callReadPlan / findProc / callPlan — and src/PostgREST/Plan/CallPlan.hs
// (CallPlan, CallParams, jsonRpcParams). The NoRpc / AmbiguousRpc error
// payloads are composed here exactly like Error.hs (lines 224-252), with the
// fuzzy hint from errors-fuzzy.ts noRpcHint.

import type { ApiRequest, InvokeMethod } from "../parse/api-request.ts";
import type { MediaType } from "../parse/media-type.ts";
import type { AppConfig } from "../config.ts";
import { ambiguousRpc, invalidPreferences, noRpc, type PgrstError } from "../errors.ts";
import { noRpcHint } from "../errors-fuzzy.ts";
import type {
  QualifiedIdentifier,
  Routine,
  RoutineMap,
  RoutineParam,
  SchemaCache,
} from "../schema-cache/types.ts";
import {
  funcReturnsCompositeAlias,
  funcReturnsScalar,
  funcReturnsSetOfScalar,
  funcTableName,
  qiKey,
  toQi,
} from "../schema-cache/types.ts";
import type { FieldName } from "../types.ts";
import type { MediaHandler, ReadPlanTree } from "./types.ts";
import { hasDefaultSelect, negotiateContent, readPlan } from "./read-plan.ts";
import { inferColsEmbedNeeds } from "./mutate-plan.ts";

// --------------------------------------------------------------------------
// Plan/CallPlan.hs
// --------------------------------------------------------------------------

/** Ports Plan/CallPlan.hs CallParams. */
export type CallParams =
  /** Call with key params: func(a := val1, b := val2). */
  | { kind: "KeyParams"; params: RoutineParam[] }
  /** Call with positional params (only one supported): func(val). */
  | { kind: "OnePosParam"; param: RoutineParam };

/** Ports Plan/CallPlan.hs CallPlan (the FunctionCall constructor). */
export interface CallPlan {
  funCQi: QualifiedIdentifier;
  funCParams: CallParams;
  funCArgs: string | null;
  funCScalar: boolean;
  funCSetOfScalar: boolean;
  funCRetCompositeAlias: boolean;
  funCReturning: FieldName[];
}

/** RpcParamValue: fixed `?v=1` or repeated `?v=1&v=2&v=3` (variadic). */
type RpcParamValue = { kind: "Fixed"; value: string } | { kind: "Variadic"; values: string[] };

/**
 * Ports Plan/CallPlan.hs jsonRpcParams: converts rpc params
 * `/rpc/func?a=val1&b=val2` to json `{"a": "val1", "b": "val2"}`. Repeated
 * keys of a variadic parameter collect into a JSON array; for non-variadic
 * parameters the last repetition wins (HM.fromList / mergeParams).
 */
export function jsonRpcParams(proc: Routine, prms: [string, string][]): string {
  if (!proc.hasVariadic) {
    // if proc has no variadic param, save steps and directly convert to json
    const obj: Record<string, string> = {};
    for (const [k, v] of prms) obj[k] = v;
    return JSON.stringify(obj);
  }
  const prmIsVariadic = (prm: string): boolean =>
    proc.params.some((p) => p.name === prm && p.variadic);
  const paramsMap = new Map<string, RpcParamValue>();
  for (const [k, v] of prms) {
    const value: RpcParamValue = prmIsVariadic(k) ? { kind: "Variadic", values: [v] } : { kind: "Fixed", value: v };
    const old = paramsMap.get(k);
    // mergeParams: variadics concatenate (old ++ new); otherwise the new wins
    if (old !== undefined && old.kind === "Variadic" && value.kind === "Variadic") {
      paramsMap.set(k, { kind: "Variadic", values: [...old.values, ...value.values] });
    } else {
      paramsMap.set(k, value);
    }
  }
  const obj: Record<string, unknown> = {};
  for (const [k, v] of paramsMap) obj[k] = v.kind === "Fixed" ? v.value : v.values;
  return JSON.stringify(obj);
}

// --------------------------------------------------------------------------
// Plan.hs CallReadPlan
// --------------------------------------------------------------------------

/** Hasql.Transaction.Sessions Mode, as decided by Plan.hs callReadPlan. */
export type TxMode = "Read" | "Write";

/** Ports Plan.hs CallReadPlan. */
export interface CallReadPlan {
  crReadPlan: ReadPlanTree;
  crCallPlan: CallPlan;
  crTxMode: TxMode;
  crProc: Routine;
  crHandler: MediaHandler;
  crMedia: MediaType;
  crInvMthd: InvokeMethod;
  crQi: QualifiedIdentifier;
}

/** ApiRequest.hs payRaw — partial selector, like upstream. */
function payRaw(payload: NonNullable<ApiRequest["iPayload"]>): string {
  if (payload.kind === "ProcessedUrlEncoded") {
    throw new Error("no payRaw on an urlencoded payload");
  }
  return payload.payRaw;
}

/** Ports Plan.hs callReadPlan. Throws PgrstError (PGRST202/PGRST203/...). */
export function callReadPlan(
  identifier: QualifiedIdentifier,
  conf: AppConfig,
  sCache: SchemaCache,
  apiRequest: ApiRequest,
  invMethod: InvokeMethod,
): CallReadPlan {
  const { iPreferences, iContentMediaType, iColumns, iPayload, iQueryParams } = apiRequest;
  const qsParams = iQueryParams.qsParams;
  const paramKeys = invMethod.kind === "InvRead"
    ? new Set(qsParams.map(([k]) => k))
    : iColumns;
  const proc = findProc(
    identifier,
    paramKeys,
    iPreferences.preferParameters === "SingleObject",
    sCache.routines,
    iContentMediaType,
    invMethod.kind === "Inv",
  );
  // done so a set returning function can embed other relations
  const relIdentifier: QualifiedIdentifier = {
    schema: proc.schema,
    name: funcTableName(proc) ?? proc.name,
  };
  const rPlan = readPlan(relIdentifier, conf, sCache, apiRequest);
  const args = invMethod.kind === "InvRead"
    ? jsonRpcParams(proc, qsParams)
    : iContentMediaType.kind === "MTUrlEncoded"
    ? (iPayload !== null && iPayload.kind === "ProcessedUrlEncoded" ? jsonRpcParams(proc, iPayload.payArray) : "")
    : (iPayload === null ? "" : payRaw(iPayload));
  const txMode: TxMode = invMethod.kind === "InvRead"
    ? "Read"
    : proc.volatility === "volatile"
    ? "Write"
    : "Read";
  const cPlan = callPlan(proc, apiRequest, paramKeys, args, rPlan);
  const [handler, mediaType] = negotiateContent(conf, apiRequest, apiRequest.iAcceptMediaType, hasDefaultSelect(rPlan));
  const { invalidPrefs, preferHandling } = iPreferences;
  if (invalidPrefs.length > 0 && preferHandling === "Strict") throw invalidPreferences(invalidPrefs);
  return {
    crReadPlan: rPlan,
    crCallPlan: cPlan,
    crTxMode: txMode,
    crProc: proc,
    crHandler: handler,
    crMedia: mediaType,
    crInvMthd: invMethod,
    crQi: identifier,
  };
}

// --------------------------------------------------------------------------
// Plan.hs findProc
// --------------------------------------------------------------------------

/**
 * Ports Plan.hs findProc: search a pg proc by matching name and argument keys
 * to parameters. Since a function can be overloaded, the name is not enough
 * to find it — an overloaded function can have a different volatility or even
 * a different return type. Throws PGRST202 (NoRpc) / PGRST203 (AmbiguousRpc).
 */
export function findProc(
  qi: QualifiedIdentifier,
  argumentsKeys: Set<string>,
  paramsAsSingleObject: boolean,
  allProcs: RoutineMap,
  contentMediaType: MediaType,
  isInvPost: boolean,
): Routine {
  // First find the proc by name
  const lookupProcName = allProcs.get(qiKey(qi)) ?? [];

  // If the function is called with post and has a single unnamed parameter
  // it can be called depending on content type and the parameter type
  const hasSingleUnnamedParam = (proc: Routine): boolean => {
    if (proc.params.length !== 1) return false;
    const ppType = proc.params[0].type;
    if (!isInvPost) return false;
    switch (contentMediaType.kind) {
      case "MTApplicationJSON":
        return ppType === "json" || ppType === "jsonb";
      case "MTTextPlain":
        return ppType === "text";
      case "MTTextXML":
        return ppType === "xml";
      case "MTOctetStream":
        return ppType === "bytea";
      default:
        return false;
    }
  };

  const setEq = (a: Set<string>, b: Set<string>): boolean => a.size === b.size && [...a].every((x) => b.has(x));
  const isSubsetOf = (a: Set<string>, b: Set<string>): boolean => [...a].every((x) => b.has(x));
  const difference = (a: Set<string>, b: Set<string>): Set<string> => new Set([...a].filter((x) => !b.has(x)));

  const matchesParams = (proc: Routine): boolean => {
    const params = proc.params;
    const firstType = params[0]?.type;
    // exceptional case for Prefer: params=single-object
    if (paramsAsSingleObject) {
      return params.length === 1 && (firstType === "json" || firstType === "jsonb");
    }
    // If the function has no parameters, the arguments keys must be empty as well
    if (params.length === 0) {
      const rawContentType = contentMediaType.kind === "MTOctetStream" ||
        contentMediaType.kind === "MTTextPlain" || contentMediaType.kind === "MTTextXML";
      return argumentsKeys.size === 0 && !(isInvPost && rawContentType);
    }
    // A function has optional and required parameters. Optional parameters
    // have a default value and don't require arguments for the function to be
    // executed, required parameters must have an argument present.
    const reqParams = new Set(params.filter((p) => p.required).map((p) => p.name));
    const optParams = new Set(params.filter((p) => !p.required).map((p) => p.name));
    // If the function only has required parameters, the arguments keys must match those parameters
    if (optParams.size === 0) return setEq(argumentsKeys, reqParams);
    // If the function only has optional parameters, the arguments keys can match none or any of them (a subset)
    if (reqParams.size === 0) return isSubsetOf(argumentsKeys, optParams);
    // If the function has required and optional parameters, the arguments keys
    // have to match the required parameters and can match any or none of the
    // default parameters.
    return setEq(difference(argumentsKeys, optParams), reqParams);
  };

  // The partition obtained has the form (overloadedProcs, fallbackProcs)
  // where fallbackProcs are functions with a single unnamed parameter
  const ts: Routine[] = [];
  const fs: Routine[] = [];
  for (const proc of lookupProcName) {
    if (matchesParams(proc)) ts.push(proc);
    else if (hasSingleUnnamedParam(proc)) fs.push(proc);
  }

  if (ts.length === 1) return ts[0]; // Matches the functions with named arguments
  if (ts.length > 1) throw ambiguousRpcError(ts);
  // If there are no functions with named arguments, fallback to the single unnamed argument function
  if (fs.length === 1) return fs[0];
  if (fs.length > 1) throw ambiguousRpcError(fs);
  throw noRpcError(
    qi.schema,
    qi.name,
    [...argumentsKeys].sort(), // S.toList: ascending order
    paramsAsSingleObject,
    contentMediaType,
    isInvPost,
    // HM.keys allProcs — the RoutineMap keys are qiKey strings
    [...allProcs.keys()].map(toQi),
    lookupProcName,
  );
}

/** Ports Error.hs `toJSON (AmbiguousRpc procs)` — the PGRST203 candidate list. */
export function ambiguousRpcError(procs: Routine[]): PgrstError {
  return ambiguousRpc(
    procs.map((p) => `${p.schema}.${p.name}(${p.params.map((a) => `${a.name} => ${a.type}`).join(", ")})`),
  );
}

/**
 * Ports Error.hs `toJSON (NoRpc ...)` (lines 224-246): the PGRST202
 * message/details/hint composition. The hint is null in the case of single
 * unnamed parameter functions.
 */
export function noRpcError(
  schema: string,
  procName: string,
  argumentKeys: string[],
  hasPreferSingleObject: boolean,
  contentType: MediaType,
  isInvPost: boolean,
  allProcs: QualifiedIdentifier[],
  overloadedProcs: Routine[],
): PgrstError {
  const func = `${schema}.${procName}`;
  const prms = argumentKeys.join(", ");
  const prmsMsg = `(${prms})`;
  const prmsDet = ` with parameter${argumentKeys.length > 1 ? "s " : " "}${prms}`;
  const fmtPrms = (p: string): string => (argumentKeys.length === 0 ? " without parameters" : p);
  const onlySingleParams = hasPreferSingleObject ||
    (isInvPost &&
      (contentType.kind === "MTTextPlain" || contentType.kind === "MTTextXML" || contentType.kind === "MTOctetStream"));
  const message = `Could not find the function ${func}${onlySingleParams ? "" : fmtPrms(prmsMsg)} in the schema cache`;
  const searched = hasPreferSingleObject
    ? " with a single json/jsonb parameter"
    : isInvPost && contentType.kind === "MTTextPlain"
    ? " with a single unnamed text parameter"
    : isInvPost && contentType.kind === "MTTextXML"
    ? " with a single unnamed xml parameter"
    : isInvPost && contentType.kind === "MTOctetStream"
    ? " with a single unnamed bytea parameter"
    : isInvPost && contentType.kind === "MTApplicationJSON"
    ? `${fmtPrms(prmsDet)} or with a single unnamed json/jsonb parameter`
    : fmtPrms(prmsDet);
  const details = `Searched for the function ${func}${searched}, but no matches were found in the schema cache.`;
  // The hint will be null in the case of single unnamed parameter functions
  const hint = onlySingleParams ? null : noRpcHint(schema, procName, argumentKeys, allProcs, overloadedProcs);
  return noRpc(message, details, hint);
}

// --------------------------------------------------------------------------
// Plan.hs callPlan
// --------------------------------------------------------------------------

/** Ports Plan.hs callPlan. */
export function callPlan(
  proc: Routine,
  apiRequest: ApiRequest,
  paramKeys: Set<FieldName>,
  args: string,
  readReq: ReadPlanTree,
): CallPlan {
  const paramsAsSingleObject = apiRequest.iPreferences.preferParameters === "SingleObject";
  const specifiedParams = (params: RoutineParam[]): RoutineParam[] =>
    params.filter((x) => paramKeys.has(x.name));
  const prms = proc.params;
  const callParams: CallParams = prms.length === 1
    ? (paramsAsSingleObject || prms[0].name === ""
      ? { kind: "OnePosParam", param: prms[0] }
      : { kind: "KeyParams", params: specifiedParams(prms) })
    : { kind: "KeyParams", params: specifiedParams(prms) };
  return {
    funCQi: { schema: proc.schema, name: proc.name },
    funCParams: callParams,
    funCArgs: args,
    funCScalar: funcReturnsScalar(proc),
    funCSetOfScalar: funcReturnsSetOfScalar(proc),
    funCRetCompositeAlias: funcReturnsCompositeAlias(proc),
    funCReturning: inferColsEmbedNeeds(readReq, []),
  };
}
