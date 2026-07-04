// Ports the mutate side of src/PostgREST/Plan.hs (PostgREST v12.2.3) —
// mutateReadPlan / mutatePlan / inferColsEmbedNeeds / resolveOrError — and
// src/PostgREST/Plan/MutatePlan.hs (the MutatePlan data type).

import type { ApiRequest, Mutation } from "../parse/api-request.ts";
import type { MediaType } from "../parse/media-type.ts";
import type { NonnegRange } from "../parse/range.ts";
import type { PreferResolution } from "../parse/preferences.ts";
import type { AppConfig } from "../config.ts";
import { columnNotFound, internalError, invalidFilters, invalidPreferences, notFound } from "../errors.ts";
import type { QualifiedIdentifier, SchemaCache, Table } from "../schema-cache/types.ts";
import { qiKey } from "../schema-cache/types.ts";
import type { FieldName } from "../types.ts";
import type {
  CoercibleField,
  CoercibleLogicTree,
  CoercibleOrderTerm,
  MediaHandler,
  ReadPlanTree,
} from "./types.ts";
import {
  addFilterToLogicForest,
  hasDefaultSelect,
  negotiateContent,
  readPlan,
  resolveFilter,
  resolveLogicTree,
  resolveOrder,
  resolveTableFieldName,
  type ResolverContext,
  withJsonParse,
} from "./read-plan.ts";

// --------------------------------------------------------------------------
// Plan/MutatePlan.hs
// --------------------------------------------------------------------------

/** Ports Plan/MutatePlan.hs MutatePlan. */
export type MutatePlan =
  | {
    kind: "Insert";
    in_: QualifiedIdentifier;
    insCols: CoercibleField[];
    /** The body is assumed to be json at this stage (ApiRequest validates). */
    insBody: string | null;
    onConflict: [PreferResolution, FieldName[]] | null;
    /** Only used for PUT (the payload-pk-matches-URL conditions). */
    where_: CoercibleLogicTree[];
    returning: FieldName[];
    insPkCols: FieldName[];
    applyDefs: boolean;
  }
  | {
    kind: "Update";
    in_: QualifiedIdentifier;
    updCols: CoercibleField[];
    updBody: string | null;
    where_: CoercibleLogicTree[];
    mutRange: NonnegRange;
    mutOrder: CoercibleOrderTerm[];
    returning: FieldName[];
    applyDefs: boolean;
  }
  | {
    kind: "Delete";
    in_: QualifiedIdentifier;
    where_: CoercibleLogicTree[];
    mutRange: NonnegRange;
    mutOrder: CoercibleOrderTerm[];
    returning: FieldName[];
  };

// --------------------------------------------------------------------------
// Plan.hs MutateReadPlan (the CrudPlan mutation constructor)
// --------------------------------------------------------------------------

export interface MutateReadPlan {
  mrReadPlan: ReadPlanTree;
  mrMutatePlan: MutatePlan;
  mrHandler: MediaHandler;
  mrMedia: MediaType;
  mrMutation: Mutation;
  crudQi: QualifiedIdentifier;
}

/** Ports Plan.hs mutateReadPlan. Throws PgrstError. */
export function mutateReadPlan(
  mutation: Mutation,
  apiRequest: ApiRequest,
  identifier: QualifiedIdentifier,
  conf: AppConfig,
  sCache: SchemaCache,
): MutateReadPlan {
  const rPlan = readPlan(identifier, conf, sCache, apiRequest);
  const mPlan = mutatePlan(mutation, identifier, apiRequest, sCache, rPlan);
  const { invalidPrefs, preferHandling } = apiRequest.iPreferences;
  if (invalidPrefs.length > 0 && preferHandling === "Strict") throw invalidPreferences(invalidPrefs);
  const [handler, mediaType] = negotiateContent(conf, apiRequest, apiRequest.iAcceptMediaType, hasDefaultSelect(rPlan));
  return { mrReadPlan: rPlan, mrMutatePlan: mPlan, mrHandler: handler, mrMedia: mediaType, mrMutation: mutation, crudQi: identifier };
}

/** ApiRequest.hs payRaw — partial selector, like upstream (urlencoded bodies
 * to relations were already converted to ProcessedJSON in getPayload). */
function payRaw(payload: NonNullable<ApiRequest["iPayload"]>): string {
  if (payload.kind === "ProcessedUrlEncoded") {
    throw internalError("no payRaw on an urlencoded payload");
  }
  return payload.payRaw;
}

/** Ports Plan.hs mutatePlan. Throws PgrstError (404/PGRST204/PGRST105). */
export function mutatePlan(
  mutation: Mutation,
  qi: QualifiedIdentifier,
  apiRequest: ApiRequest,
  sCache: SchemaCache,
  readReq: ReadPlanTree,
): MutatePlan {
  const ctx: ResolverContext = {
    tables: sCache.tables,
    representations: sCache.representations,
    qi,
    outputType: "json",
  };
  const { qsOnConflict, qsLogic, qsOrder, qsFiltersRoot, qsFilterFields } = apiRequest.iQueryParams;
  const { preferResolution, preferRepresentation, preferMissing } = apiRequest.iPreferences;

  const tbl = sCache.tables.get(qiKey(qi)) ?? null;
  const pkCols = tbl === null ? [] : tbl.pkCols;
  const confCols = qsOnConflict ?? pkCols;
  const returnings = preferRepresentation === "None" || preferRepresentation === null
    ? []
    : inferColsEmbedNeeds(readReq, pkCols);
  const logic = qsLogic.map(([, lt]) => resolveLogicTree(ctx, lt));
  const rootOrder = (qsOrder.find(([path]) => path.length === 0)?.[1] ?? []).map((t) => resolveOrder(ctx, t));
  // foldr (addFilterToLogicForest . resolveFilter ctx) logic qsFiltersRoot
  const combinedLogic = [...qsFiltersRoot].reduceRight(
    (lf, flt) => addFilterToLogicForest(resolveFilter(ctx, flt), lf),
    logic,
  );
  const body = apiRequest.iPayload === null ? null : payRaw(apiRequest.iPayload);
  const applyDefaults = preferMissing === "ApplyDefaults";
  // S.toList iColumns: Data.Set enumerates in ascending order
  const typedColumns = [...apiRequest.iColumns].sort().map((col) => resolveOrError(ctx, tbl, col));

  switch (mutation) {
    case "MutationCreate":
      return {
        kind: "Insert",
        in_: qi,
        insCols: typedColumns,
        insBody: body,
        onConflict: preferResolution === null ? null : [preferResolution, confCols],
        where_: [],
        returning: returnings,
        insPkCols: pkCols,
        applyDefs: applyDefaults,
      };
    case "MutationUpdate":
      return {
        kind: "Update",
        in_: qi,
        updCols: typedColumns,
        updBody: body,
        where_: combinedLogic,
        mutRange: apiRequest.iTopLevelRange,
        mutOrder: rootOrder,
        returning: returnings,
        applyDefs: applyDefaults,
      };
    case "MutationSingleUpsert": {
      const pkSet = new Set(pkCols);
      const filterFieldsArePks = qsFilterFields.size === pkSet.size && [...qsFilterFields].every((f) => pkSet.has(f));
      const allEqFilters = qsFiltersRoot.every((f) =>
        f.opExpr.kind === "OpExpr" && !f.opExpr.negated &&
        f.opExpr.operation.kind === "OpQuant" && f.opExpr.operation.op === "OpEqual" &&
        f.opExpr.operation.quantifier === null
      );
      if (qsLogic.length === 0 && filterFieldsArePks && pkSet.size > 0 && allEqFilters) {
        return {
          kind: "Insert",
          in_: qi,
          insCols: typedColumns,
          insBody: body,
          onConflict: ["MergeDuplicates", pkCols],
          where_: combinedLogic,
          returning: returnings,
          insPkCols: [],
          applyDefs: false,
        };
      }
      throw invalidFilters();
    }
    case "MutationDelete":
      return {
        kind: "Delete",
        in_: qi,
        where_: combinedLogic,
        mutRange: apiRequest.iTopLevelRange,
        mutOrder: rootOrder,
        returning: returnings,
      };
  }
}

/** Ports Plan.hs resolveOrError — 404 without a table, PGRST204 for an
 * unknown column, otherwise the json-parse coercion is installed. */
export function resolveOrError(ctx: ResolverContext, table: Table | null, field: FieldName): CoercibleField {
  if (table === null) throw notFound();
  const cf = resolveTableFieldName(table, field);
  if (cf.cfIRType === "") throw columnNotFound(table.name, field);
  return withJsonParse(ctx, cf);
}

/**
 * Ports Plan.hs inferColsEmbedNeeds: infers the columns needed for an embed
 * to be successful after a mutation — the selected fields plus the FK columns
 * of the embeds plus the PK columns (deduplicated and sorted, like
 * `S.toList . S.fromList`), or `*` when selected/needed.
 */
export function inferColsEmbedNeeds(readReq: ReadPlanTree, pkCols: FieldName[]): FieldName[] {
  const fldNames = readReq.rootLabel.select.map((s) => s.csField.cfName);
  // if * is part of the select, we must not add pk or fk columns manually —
  // otherwise those would be selected and output twice
  if (fldNames.includes("*")) return ["*"];
  const fkCols = readReq.subForest.flatMap((node) => {
    const rel = node.rootLabel.relToParent;
    if (rel === null || rel.kind === "computed") return [];
    const card = rel.cardinality;
    if (card.tag === "M2M") return card.junction.colsSource.map(([c]) => c);
    return card.columns.map(([c]) => c);
  });
  const hasComputedRel = readReq.subForest.some((node) => node.rootLabel.relToParent?.kind === "computed");
  // on computed relationships we cannot know the required columns for an
  // embedding to succeed, so we just return all
  if (hasComputedRel) return ["*"];
  return [...new Set([...fldNames, ...fkCols, ...pkCols])].sort();
}
