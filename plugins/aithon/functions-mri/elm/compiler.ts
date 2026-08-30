// @ts-nocheck - Deno edge function
import { escapeString } from "../../functions/sql_safety.ts";
import { ElmQuery, ElmExpr, ElmRetrieve } from "./types.ts";

function lit(v: string | number): string {
  return typeof v === "number" ? String(v) : `'${escapeString(String(v))}'`;
}

/** Compile a boolean/compare expression to a SQL predicate. */
function compileExpr(e: ElmExpr): string {
  switch (e.type) {
    case "True": return "TRUE";
    case "Not": return `NOT (${compileExpr(e.operand)})`;
    case "And": return e.operands.length ? `(${e.operands.map(compileExpr).join(" AND ")})` : "TRUE";
    case "Or": return e.operands.length ? `(${e.operands.map(compileExpr).join(" OR ")})` : "TRUE";
    case "Compare": return `${e.valueExpr} ${e.op} ${lit(e.literal)}`;
    default: return "TRUE";
  }
}

/** EXISTS subquery linking a non-Patient resource to the patient base alias "p". */
function compileFilter(f: ElmRetrieve, schema: string): string {
  const table = f.resourceType.toLowerCase();
  return `EXISTS (SELECT 1 FROM ${schema}."${table}" ${f.alias} WHERE NOT ${f.alias}._is_deleted` +
    ` AND json_extract_string(${f.alias}._raw, '$.subject.reference') LIKE '%/' || p.id` +
    ` AND (${compileExpr(f.where)}))`;
}

/** Numeric binning: floor(value / size) * size. */
export function binExpr(valueExpr: string, binSize: number): string {
  return `floor((${valueExpr}) / ${binSize}) * ${binSize}`;
}

function whereClause(elm: ElmQuery, schema: string): string {
  const parts = ["NOT p._is_deleted"];
  const pw = compileExpr(elm.patientWhere);
  if (pw !== "TRUE") parts.push(pw);
  for (const f of elm.filters) parts.push(compileFilter(f, schema));
  return parts.join(" AND ");
}

/** Compile a plain patient count. */
export function compileCount(elm: ElmQuery, schema: string): string {
  return `SELECT COUNT(DISTINCT p.id) AS pcount FROM ${schema}."patient" p WHERE ${whereClause(elm, schema)}`;
}

/** Compile a stratified bar-chart query: one grouped column per axis. */
export function compileBarchart(elm: ElmQuery, schema: string): string {
  const selectCols: string[] = [];
  const groupCols: string[] = [];
  for (const ax of elm.axes) {
    const v = ax.kind === "num" && ax.binSize ? binExpr(ax.valueExpr, ax.binSize) : ax.valueExpr;
    selectCols.push(`${v} AS "${ax.id}"`);
    groupCols.push(v);
  }
  const cols = [...selectCols, "COUNT(DISTINCT p.id) AS pcount"].join(", ");
  const group = groupCols.length ? ` GROUP BY ${groupCols.join(", ")} ORDER BY ${groupCols.join(", ")}` : "";
  return `SELECT ${cols} FROM ${schema}."patient" p WHERE ${whereClause(elm, schema)}${group}`;
}
