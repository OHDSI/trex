// CSV intake and export in the mapping submission format.
// Hand-written RFC 4180 parsing: quoted fields, doubled quotes, CRLF, BOM.

export type Predicate = "exactMatch" | "broadMatch";

export interface SourceRow {
  rowIndex: number;
  sourceDataIdentifier: string;
  sourceCode: string;
  originalSourceName: string;
  sourceName: string;
}

export interface RowResult {
  targetConceptId: number;
  targetConceptName: string;
  alternativeTargetConceptId?: number;
  alternativeTargetConceptName?: string;
  predicate: Predicate;
  voteAgreement: number;
  retrievalConfidence: "high" | "medium" | "low";
  phase: 4 | 5;
  rationale: string;
}

export const REQUIRED_COLUMNS = [
  "source_data_identifier",
  "source_code",
  "original_source_name",
  "source_name",
] as const;

export const SUBMISSION_HEADER = [
  ...REQUIRED_COLUMNS,
  "target_concept_id",
  "target_concept_name",
  "alternative_target_concept_id",
  "alternative_target_concept_name",
  "predicate",
].join(",");

export function parseCsvRecords(text: string): string[][] {
  const src = text.startsWith("﻿") ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  // Drop blank lines and delimiter-only lines (Excel often appends ",,,").
  return records.filter((r) => r.some((f) => f.trim() !== ""));
}

export function parseSourceCsv(text: string): { rows: SourceRow[]; errors: string[] } {
  const records = parseCsvRecords(text);
  if (records.length === 0) return { rows: [], errors: ["empty CSV"] };
  const header = records[0].map((h) => h.trim());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) return { rows: [], errors: [`missing required column(s): ${missing.join(", ")}`] };
  const col = Object.fromEntries(REQUIRED_COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<
    (typeof REQUIRED_COLUMNS)[number],
    number
  >;
  const rows: SourceRow[] = [];
  const errors: string[] = [];
  records.slice(1).forEach((r, i) => {
    const get = (c: (typeof REQUIRED_COLUMNS)[number]) => (r[col[c]] ?? "").trim();
    const row: SourceRow = {
      rowIndex: rows.length,
      sourceDataIdentifier: get("source_data_identifier"),
      sourceCode: get("source_code"),
      originalSourceName: get("original_source_name"),
      sourceName: get("source_name"),
    };
    if (!row.sourceName && !row.originalSourceName) {
      errors.push(`row ${i + 1}: source_name and original_source_name both empty`);
      return;
    }
    if (!row.sourceDataIdentifier || !row.sourceCode) {
      errors.push(`row ${i + 1}: source_data_identifier and source_code are required`);
      return;
    }
    rows.push(row);
  });
  return { rows, errors };
}

function cell(v: unknown): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function serializeSubmissionCsv(rows: Array<SourceRow & Partial<RowResult>>): string {
  const lines = rows.map((r) =>
    [
      r.sourceDataIdentifier,
      r.sourceCode,
      r.originalSourceName,
      r.sourceName,
      r.targetConceptId,
      r.targetConceptName,
      r.alternativeTargetConceptId,
      r.alternativeTargetConceptName,
      r.predicate,
    ].map(cell).join(",")
  );
  return [SUBMISSION_HEADER, ...lines].join("\n") + "\n";
}

/** The CSV embedded in a chat message (optionally in a code fence), starting at its header line. */
export function extractCsv(text: string): string | null {
  const at = text.indexOf("source_data_identifier");
  if (at === -1) return null;
  const start = text.lastIndexOf("\n", at) + 1;
  const end = text.indexOf("```", start);
  return end === -1 ? text.slice(start) : text.slice(start, end);
}
