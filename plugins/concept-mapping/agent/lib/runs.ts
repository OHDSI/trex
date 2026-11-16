// Persistence for mapping runs in the concept_mapping schema (_config DB).
// A run is one input CSV; rows stay 'pending' until a validated result is saved,
// so a large input can span several turns and resume where it stopped.
import { type RowResult, serializeSubmissionCsv, type SourceRow } from "./csv.ts";

export type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

interface RowRecord {
  row_index: number;
  source_data_identifier: string;
  source_code: string;
  original_source_name: string;
  source_name: string;
  status: string;
  result: RowResult | string | null;
}

const toSourceRow = (r: RowRecord): SourceRow => ({
  rowIndex: r.row_index,
  sourceDataIdentifier: r.source_data_identifier,
  sourceCode: r.source_code,
  originalSourceName: r.original_source_name,
  sourceName: r.source_name,
});

export async function createRun(
  sql: QueryFn,
  sessionId: string,
  userId: string | undefined,
  rows: SourceRow[],
): Promise<string> {
  const { rows: created } = await sql(
    "INSERT INTO concept_mapping.runs (session_id, created_by) VALUES ($1, $2) RETURNING id",
    [sessionId, userId ?? null],
  );
  const runId = String((created[0] as { id: string }).id);
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const params: unknown[] = [runId];
    const values = chunk.map((r) => {
      params.push(r.rowIndex, r.sourceDataIdentifier, r.sourceCode, r.originalSourceName, r.sourceName);
      const n = params.length;
      return `($1, $${n - 4}, $${n - 3}, $${n - 2}, $${n - 1}, $${n})`;
    });
    await sql(
      `INSERT INTO concept_mapping.run_rows
         (run_id, row_index, source_data_identifier, source_code, original_source_name, source_name)
       VALUES ${values.join(", ")}`,
      params,
    );
  }
  return runId;
}

/** Throws unless the run exists and was started in this session. */
export async function assertRunInSession(sql: QueryFn, runId: string, sessionId: string): Promise<void> {
  const { rows } = await sql(
    "SELECT 1 FROM concept_mapping.runs WHERE id::text = $1 AND session_id = $2",
    [runId, sessionId],
  );
  if (rows.length === 0) throw new RunNotFound(`run ${runId} not found in this session`);
}

export class RunNotFound extends Error {}

export async function latestRunForSession(sql: QueryFn, sessionId: string): Promise<string | null> {
  const { rows } = await sql(
    "SELECT id FROM concept_mapping.runs WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1",
    [sessionId],
  );
  return rows.length ? String((rows[0] as { id: string }).id) : null;
}

export async function pendingRows(sql: QueryFn, runId: string, limit: number): Promise<SourceRow[]> {
  const { rows } = await sql(
    `SELECT row_index, source_data_identifier, source_code, original_source_name, source_name, status, result
       FROM concept_mapping.run_rows
      WHERE run_id = $1 AND status = 'pending'
      ORDER BY row_index
      LIMIT $2`,
    [runId, limit],
  );
  return (rows as RowRecord[]).map(toSourceRow);
}

export async function saveCodingSystems(
  sql: QueryFn,
  runId: string,
  sourceDataIdentifier: string,
  briefing: unknown,
): Promise<void> {
  await sql(
    `INSERT INTO concept_mapping.coding_systems (run_id, source_data_identifier, briefing)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (run_id, source_data_identifier) DO UPDATE SET briefing = EXCLUDED.briefing`,
    [runId, sourceDataIdentifier, JSON.stringify(briefing)],
  );
}

export async function getCodingSystems(sql: QueryFn, runId: string): Promise<Record<string, unknown>> {
  const { rows } = await sql(
    "SELECT source_data_identifier, briefing FROM concept_mapping.coding_systems WHERE run_id = $1",
    [runId],
  );
  const out: Record<string, unknown> = {};
  for (const r of rows as Array<{ source_data_identifier: string; briefing: unknown }>) {
    out[r.source_data_identifier] = typeof r.briefing === "string" ? JSON.parse(r.briefing) : r.briefing;
  }
  return out;
}

export async function saveRowResult(sql: QueryFn, runId: string, rowIndex: number, result: RowResult): Promise<void> {
  const { rows } = await sql(
    `UPDATE concept_mapping.run_rows
        SET status = 'done', result = $3::jsonb, updated_at = now()
      WHERE run_id = $1 AND row_index = $2
      RETURNING row_index`,
    [runId, rowIndex, JSON.stringify(result)],
  );
  if (rows.length === 0) throw new Error(`no row ${rowIndex} in run ${runId}`);
}

export async function markUnmapped(sql: QueryFn, runId: string, rowIndex: number, reason: string): Promise<void> {
  const { rows } = await sql(
    `UPDATE concept_mapping.run_rows
        SET status = 'unmapped', result = $3::jsonb, updated_at = now()
      WHERE run_id = $1 AND row_index = $2
      RETURNING row_index`,
    [runId, rowIndex, JSON.stringify({ unmappedReason: reason })],
  );
  if (rows.length === 0) throw new Error(`no row ${rowIndex} in run ${runId}`);
}

export async function runProgress(
  sql: QueryFn,
  runId: string,
): Promise<{ total: number; done: number; unmapped: number; pending: number }> {
  const { rows } = await sql(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'done')::int AS done,
            count(*) FILTER (WHERE status = 'unmapped')::int AS unmapped
       FROM concept_mapping.run_rows WHERE run_id = $1`,
    [runId],
  );
  const r = rows[0] as { total: number; done: number; unmapped: number };
  const [total, done, unmapped] = [Number(r.total), Number(r.done), Number(r.unmapped)];
  return { total, done, unmapped, pending: total - done - unmapped };
}

export async function exportRun(
  sql: QueryFn,
  runId: string,
): Promise<{ csv: string; unfinished: number[]; unmapped: Array<{ rowIndex: number; reason: string }> }> {
  const { rows } = await sql(
    `SELECT row_index, source_data_identifier, source_code, original_source_name, source_name, status, result
       FROM concept_mapping.run_rows WHERE run_id = $1 ORDER BY row_index`,
    [runId],
  );
  const unfinished: number[] = [];
  const unmapped: Array<{ rowIndex: number; reason: string }> = [];
  const out = (rows as RowRecord[]).map((r) => {
    if (r.status === "unmapped") {
      const res = (typeof r.result === "string" ? JSON.parse(r.result) : r.result) as { unmappedReason?: string } | null;
      unmapped.push({ rowIndex: r.row_index, reason: res?.unmappedReason ?? "" });
      return toSourceRow(r);
    }
    if (r.status !== "done" || !r.result) {
      unfinished.push(r.row_index);
      return toSourceRow(r);
    }
    const result = typeof r.result === "string" ? JSON.parse(r.result) as RowResult : r.result;
    return { ...toSourceRow(r), ...result };
  });
  return { csv: serializeSubmissionCsv(out), unfinished, unmapped };
}
