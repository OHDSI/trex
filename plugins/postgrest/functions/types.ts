// Ports src/PostgREST/ApiRequest/Types.hs (PostgREST v12.2.3) — the
// parser-output side of the AST: fields, json paths, operators, filters,
// logic trees, order terms and select items.
//
// Haskell sum types become discriminated unions whose `kind` tags (or string
// literal values) are the Haskell constructor names, for greppability.

// --------------------------------------------------------------------------
// Identifiers / aliases
// --------------------------------------------------------------------------

/** Identifiers.hs FieldName. */
export type FieldName = string;

export type Alias = string;
export type Cast = string;
export type Hint = string;
export type NodeName = string;

/** A field e.g `id` or `json->>key`; Types.hs `type Field = (FieldName, JsonPath)`. */
export interface Field {
  name: FieldName;
  jsonPath: JsonPath;
}

/**
 * Path of the embedded levels, e.g "clients.projects.name=eq.." gives
 * ["clients", "projects"].
 */
export type EmbedPath = string[];

// --------------------------------------------------------------------------
// Json path operators (functions-json.html)
// --------------------------------------------------------------------------

/**
 * Represents the key (`->'key'`) or index (`->'1'::int`); the index is kept
 * as text (with its sign, e.g. "+1"/"-1") because upstream reuses its
 * escaping functions and lets pg do the casting.
 */
export type JsonOperand = { kind: "JKey"; jVal: string } | { kind: "JIdx"; jVal: string };

/** Represents the single arrow `->` or double arrow `->>` operators. */
export type JsonOperation = { kind: "JArrow"; jOp: JsonOperand } | { kind: "J2Arrow"; jOp: JsonOperand };

export type JsonPath = JsonOperation[];

// --------------------------------------------------------------------------
// Select items
// --------------------------------------------------------------------------

export type AggregateFunction = "Sum" | "Avg" | "Max" | "Min" | "Count";

export type JoinType = "JTInner" | "JTLeft";

/** Data.Tree.Tree — used for the select forest. */
export interface Tree<A> {
  rootLabel: A;
  subForest: Tree<A>[];
}

/** The value in `/tbl?select=alias:field.aggregateFunction()::cast`. */
export type SelectItem =
  | {
    kind: "SelectField";
    selField: Field;
    selAggregateFunction: AggregateFunction | null;
    selAggregateCast: Cast | null;
    selCast: Cast | null;
    selAlias: Alias | null;
  }
  /** The value in `/tbl?select=alias:another_tbl(*)`. */
  | {
    kind: "SelectRelation";
    selRelation: FieldName;
    selAlias: Alias | null;
    selHint: Hint | null;
    selJoinType: JoinType | null;
  }
  /** The value in `/tbl?select=...another_tbl(*)`. */
  | {
    kind: "SpreadRelation";
    selRelation: FieldName;
    selHint: Hint | null;
    selJoinType: JoinType | null;
  };

/**
 * Disambiguates an embedding operation when there's multiple relationships
 * between two tables (`!hint`), or forces a join type (`!inner`/`!left`).
 */
export type EmbedParam = { kind: "EPHint"; hint: Hint } | { kind: "EPJoinType"; joinType: JoinType };

// --------------------------------------------------------------------------
// Filters / operators
// --------------------------------------------------------------------------

/** Represents a single value in a filter, e.g. id=eq.singleval. */
export type SingleVal = string;

/** Represents a list value in a filter, e.g. id=in.(val1,val2,val3). */
export type ListVal = string[];

/** Three-valued logic values accepted by `is.`. */
export type TrileanVal = "TriTrue" | "TriFalse" | "TriNull" | "TriUnknown";

/** Operators that are quantifiable, i.e. can be used with any/all modifiers. */
export type QuantOperator =
  | "OpEqual"
  | "OpGreaterThanEqual"
  | "OpGreaterThan"
  | "OpLessThanEqual"
  | "OpLessThan"
  | "OpLike"
  | "OpILike"
  | "OpMatch"
  | "OpIMatch";

export type SimpleOperator =
  | "OpNotEqual"
  | "OpContains"
  | "OpContained"
  | "OpOverlap"
  | "OpStrictlyLeft"
  | "OpStrictlyRight"
  | "OpNotExtendsRight"
  | "OpNotExtendsLeft"
  | "OpAdjacent";

/** Operators for full text search. */
export type FtsOperator = "FilterFts" | "FilterFtsPlain" | "FilterFtsPhrase" | "FilterFtsWebsearch";

export type OpQuantifier = "QuantAny" | "QuantAll";

export type Operation =
  | { kind: "Op"; op: SimpleOperator; value: SingleVal }
  | { kind: "OpQuant"; op: QuantOperator; quantifier: OpQuantifier | null; value: SingleVal }
  | { kind: "In"; value: ListVal }
  | { kind: "Is"; value: TrileanVal }
  | { kind: "IsDistinctFrom"; value: SingleVal }
  | { kind: "Fts"; op: FtsOperator; language: string | null; value: SingleVal };

/** OpExpr's Bool is the `not.` negation; NoOpExpr is an RPC GET argument. */
export type OpExpr =
  | { kind: "OpExpr"; negated: boolean; operation: Operation }
  | { kind: "NoOpExpr"; value: string };

export interface Filter {
  field: Field;
  opExpr: OpExpr;
}

// --------------------------------------------------------------------------
// Logic trees
// --------------------------------------------------------------------------

export type LogicOperator = "And" | "Or";

/**
 * Boolean logic expression tree e.g. "and(name.eq.N,or(id.eq.1,id.eq.2))":
 * Expr's Bool is the `not.` negation of the whole subtree.
 */
export type LogicTree =
  | { kind: "Expr"; negated: boolean; op: LogicOperator; children: LogicTree[] }
  | { kind: "Stmnt"; filter: Filter };

// --------------------------------------------------------------------------
// Order terms
// --------------------------------------------------------------------------

export type OrderDirection = "OrderAsc" | "OrderDesc";

export type OrderNulls = "OrderNullsFirst" | "OrderNullsLast";

export type OrderTerm =
  | {
    kind: "OrderTerm";
    otTerm: Field;
    otDirection: OrderDirection | null;
    otNullOrder: OrderNulls | null;
  }
  /** Order by a to-one related table's column: `order=rel(col).desc`. */
  | {
    kind: "OrderRelationTerm";
    otRelation: FieldName;
    otRelTerm: Field;
    otDirection: OrderDirection | null;
    otNullOrder: OrderNulls | null;
  };

// --------------------------------------------------------------------------
// Errors
// --------------------------------------------------------------------------

/** Types.hs QPError — message + details of a query-string parse failure. */
export interface QPError {
  qpMessage: string;
  qpDetails: string;
}
