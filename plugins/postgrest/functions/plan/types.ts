// Ports src/PostgREST/Plan/Types.hs and Plan/ReadPlan.hs (PostgREST
// v12.2.3) — the planner-side AST: query elements resolved against the
// schema cache (CoercibleField carries the type coercion / data
// representation info the SQL layer needs).
//
// Also hosts the MediaHandler type from SchemaCache/Routine.hs — the plugin
// keeps the raw media-handler introspection rows in the schema cache, so the
// resolved handler enum lives with the plan that consumes it.

import type {
  AggregateFunction,
  Alias,
  Cast,
  Field,
  FieldName,
  Hint,
  JoinType,
  JsonPath,
  LogicOperator,
  NodeName,
  OpExpr,
  OrderDirection,
  OrderNulls,
} from "../types.ts";
import type { MediaType } from "../parse/media-type.ts";
import type { QualifiedIdentifier, Relationship } from "../schema-cache/types.ts";
import type { NonnegRange } from "../parse/range.ts";

/** Plan/Types.hs TransformerProc — a data representation function name. */
export type TransformerProc = string;

/**
 * Ports Plan/Types.hs CoercibleField: a named query element paired with the
 * type coercion information needed for its specific use (output field,
 * filter input, ...). cfIRType "" means "type unknown and not needed".
 */
export interface CoercibleField {
  cfName: FieldName;
  cfJsonPath: JsonPath;
  cfToJson: boolean;
  /** The native Postgres type of the field, the intermediate (IR) type before mapping. */
  cfIRType: string;
  /** The optional mapping from irType -> targetType (data representations). */
  cfTransform: TransformerProc | null;
  cfDefault: string | null;
}

/** Ports Plan/Types.hs unknownField. */
export function unknownField(name: FieldName, path: JsonPath): CoercibleField {
  return { cfName: name, cfJsonPath: path, cfToJson: false, cfIRType: "", cfTransform: null, cfDefault: null };
}

/** Ports Plan/Types.hs CoercibleFilter (incl. the CoercibleFilterNullEmbed constructor). */
export type CoercibleFilter =
  | { kind: "CoercibleFilter"; field: CoercibleField; opExpr: OpExpr }
  | { kind: "CoercibleFilterNullEmbed"; hasNot: boolean; fld: FieldName };

/** Ports Plan/Types.hs CoercibleLogicTree. */
export type CoercibleLogicTree =
  | { kind: "CoercibleExpr"; negated: boolean; op: LogicOperator; children: CoercibleLogicTree[] }
  | { kind: "CoercibleStmnt"; filter: CoercibleFilter };

/** Ports Plan/Types.hs CoercibleOrderTerm. */
export type CoercibleOrderTerm =
  | {
    kind: "CoercibleOrderTerm";
    coField: CoercibleField;
    coDirection: OrderDirection | null;
    coNullOrder: OrderNulls | null;
  }
  | {
    kind: "CoercibleOrderRelationTerm";
    coRelation: FieldName;
    coRelTerm: Field;
    coDirection: OrderDirection | null;
    coNullOrder: OrderNulls | null;
  };

/** Ports Plan/Types.hs CoercibleSelectField. */
export interface CoercibleSelectField {
  csField: CoercibleField;
  csAggFunction: AggregateFunction | null;
  csAggCast: Cast | null;
  csCast: Cast | null;
  csAlias: Alias | null;
}

/** Ports Plan/Types.hs RelJsonEmbedMode. */
export type RelJsonEmbedMode = "JsonObject" | "JsonArray";

/** Ports Plan/Types.hs SpreadSelectField. */
export interface SpreadSelectField {
  ssSelName: FieldName;
  ssSelAggFunction: AggregateFunction | null;
  ssSelAggCast: Cast | null;
  ssSelAlias: Alias | null;
}

/** Ports Plan/Types.hs RelSelectField. */
export type RelSelectField =
  | { kind: "JsonEmbed"; rsSelName: FieldName; rsAggAlias: Alias; rsEmbedMode: RelJsonEmbedMode; rsEmptyEmbed: boolean }
  | { kind: "Spread"; rsSpreadSel: SpreadSelectField[]; rsAggAlias: Alias };

// --------------------------------------------------------------------------
// Plan/ReadPlan.hs
// --------------------------------------------------------------------------

/** Ports Plan/ReadPlan.hs JoinCondition. */
export interface JoinCondition {
  left: [QualifiedIdentifier, FieldName];
  right: [QualifiedIdentifier, FieldName];
}

/** Ports Plan/ReadPlan.hs ReadPlan. */
export interface ReadPlan {
  select: CoercibleSelectField[];
  from: QualifiedIdentifier;
  fromAlias: Alias | null;
  where_: CoercibleLogicTree[];
  order: CoercibleOrderTerm[];
  range_: NonnegRange;
  relName: NodeName;
  relToParent: Relationship | null;
  relJoinConds: JoinCondition[];
  relAlias: Alias | null;
  relAggAlias: Alias;
  relHint: Hint | null;
  relJoinType: JoinType | null;
  relIsSpread: boolean;
  relSelect: RelSelectField[];
  /** Used for aliasing. */
  depth: number;
}

/** Ports Plan/ReadPlan.hs ReadPlanTree = Tree ReadPlan. Single node in
 * phase 4b; subForest is populated by resource embedding (phase 5). */
export interface ReadPlanTree {
  rootLabel: ReadPlan;
  subForest: ReadPlanTree[];
}

// --------------------------------------------------------------------------
// SchemaCache/Routine.hs MediaHandler (the resolved handler enum)
// --------------------------------------------------------------------------

/**
 * Ports Routine.hs MediaHandler. The CustomFunc constructor (user-defined
 * handlers from the schema cache) is deferred to phase 8/9.
 */
export type MediaHandler =
  | { kind: "BuiltinAggSingleJson"; stripNulls: boolean }
  | { kind: "BuiltinAggArrayJsonStrip" }
  | { kind: "BuiltinOvAggJson" }
  | { kind: "BuiltinOvAggGeoJson" }
  | { kind: "BuiltinOvAggCsv" }
  | { kind: "NoAgg" };

/** Ports Routine.hs ResolvedHandler — MTAny resolves to a concrete media type. */
export type ResolvedHandler = [MediaHandler, MediaType];
