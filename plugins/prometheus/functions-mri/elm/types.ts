// @ts-nocheck - Deno edge function

/** Boolean/comparison expression over a single resource's _raw, referencing
 *  AttrMapping-derived value expressions by their resolved SQL. */
export type ElmExpr =
  | { type: "And"; operands: ElmExpr[] }
  | { type: "Or"; operands: ElmExpr[] }
  | { type: "Not"; operand: ElmExpr }
  | { type: "Compare"; op: "=" | "!=" | "<" | "<=" | ">" | ">="; valueExpr: string; literal: string | number }
  | { type: "True" };

/** A resource retrieve used as a filter (EXISTS) or as the base (Patient). */
export interface ElmRetrieve {
  resourceType: string;   // canonical, e.g. "Condition"
  alias: string;          // SQL alias, e.g. "c0"
  joinToPatient: boolean; // true → EXISTS subquery linked by subject.reference
  where: ElmExpr;
}

/** A stratification axis (MVP: Patient-level attributes). */
export interface ElmAxis {
  id: string;             // full attribute config-path, e.g. "patient.attributes.Age"
  valueExpr: string;      // SQL value expression relative to the patient alias "p"
  kind: "text" | "num";
  binSize?: number;       // numeric binning
  axisNum: number;        // 1 = X axis, 2 = Y/stacked axis (from MRI categoryId prefix)
}

export interface ElmQuery {
  patientWhere: ElmExpr;  // predicates on the Patient base table (alias "p")
  filters: ElmRetrieve[]; // non-Patient EXISTS filters
  axes: ElmAxis[];        // empty → plain count
}
