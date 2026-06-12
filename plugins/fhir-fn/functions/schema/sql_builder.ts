// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/schema/sql_builder.rs

/// Build an INSERT ... SELECT that uses json_transform() to decompose _raw into typed columns.
export function buildInsertSql(
  schema: string,
  table: string,
  version: number,
  transformSpec: string,
  columnNames: string[],
): string {
  const escapedSpec = transformSpec.replace(/'/g, "''");
  const quotedCols = quotedColumnList(columnNames);
  const prefixedCols = prefixedColumnList(columnNames, "t");

  const colSuffix = columnNames.length === 0 ? "" : `, ${quotedCols}`;
  const selSuffix = columnNames.length === 0 ? "" : `, ${prefixedCols}`;

  return `INSERT INTO ${schema}."${table}" (_id, _version_id, _last_updated, _is_deleted, _raw${colSuffix}) SELECT $1, ${version}, CURRENT_TIMESTAMP, false, $2::JSON${selSuffix} FROM (SELECT UNNEST(json_transform($2::JSON, '${escapedSpec}'))) AS t`;
}

/// Build an UPDATE ... FROM json_transform() to update typed columns alongside _raw.
export function buildUpdateSql(
  schema: string,
  table: string,
  version: number,
  transformSpec: string,
  columnNames: string[],
): string {
  const escapedSpec = transformSpec.replace(/'/g, "''");
  const setCols = columnNames
    .map((c) => `"${c}" = t."${c}"`)
    .join(", ");

  const setSuffix = columnNames.length === 0 ? "" : `, ${setCols}`;

  return `UPDATE ${schema}."${table}" SET _version_id = ${version}, _last_updated = CURRENT_TIMESTAMP, _is_deleted = false, _raw = $2::JSON${setSuffix} FROM (SELECT UNNEST(json_transform($2::JSON, '${escapedSpec}'))) AS t WHERE _id = $1`;
}

/// Build an INSERT OR REPLACE ... SELECT (for bundle PUT / upsert).
export function buildUpsertSql(
  schema: string,
  table: string,
  version: number,
  transformSpec: string,
  columnNames: string[],
): string {
  const escapedSpec = transformSpec.replace(/'/g, "''");
  const quotedCols = quotedColumnList(columnNames);
  const prefixedCols = prefixedColumnList(columnNames, "t");

  const colSuffix = columnNames.length === 0 ? "" : `, ${quotedCols}`;
  const selSuffix = columnNames.length === 0 ? "" : `, ${prefixedCols}`;

  return `INSERT OR REPLACE INTO ${schema}."${table}" (_id, _version_id, _last_updated, _is_deleted, _raw${colSuffix}) SELECT $1, ${version}, CURRENT_TIMESTAMP, false, $2::JSON${selSuffix} FROM (SELECT UNNEST(json_transform($2::JSON, '${escapedSpec}'))) AS t`;
}

function quotedColumnList(names: string[]): string {
  return names.map((c) => `"${c}"`).join(", ");
}

function prefixedColumnList(names: string[], prefix: string): string {
  return names.map((c) => `${prefix}."${c}"`).join(", ");
}
