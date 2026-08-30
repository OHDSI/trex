// @ts-nocheck - Deno edge function
import { Conn } from "../db.ts";
import { MriState } from "../state.ts";
import { validateDatasetId, escapeString } from "../../functions/sql_safety.ts";
import { generateConfig } from "../config/generate.ts";

/** SQL listing concrete (non-internal) tables in a dataset schema. */
export function buildPresentTypesSql(datasetId: string): string {
  const schemaName = datasetId.replaceAll("-", "_");
  return `SELECT table_name FROM information_schema.tables WHERE table_schema = '${escapeString(schemaName)}' AND table_name NOT LIKE '\\_%'`;
}

/** Pure: build the getMyConfig response body from the present resource types. */
export function getMyConfigResponse(datasetId: string, presentTypes: string[]): any[] {
  const { mriConfig } = generateConfig(datasetId, presentTypes);
  return [mriConfig];
}

/** Resolve the canonical resource types present in a dataset. */
async function presentTypes(datasetId: string, conn: Conn, state: MriState): Promise<string[]> {
  let rows: any[] = [];
  try {
    rows = await conn.query(buildPresentTypesSql(datasetId));
  } catch {
    return ["Patient"]; // schema may not exist yet
  }
  const lowerToCanonical = new Map<string, string>();
  for (const rt of state.registry.listResourceTypes()) lowerToCanonical.set(rt.toLowerCase(), rt);
  const out: string[] = [];
  for (const row of rows) {
    const t = (row.table_name ?? row.column0 ?? "").toLowerCase();
    const canonical = lowerToCanonical.get(t);
    if (canonical) out.push(canonical);
  }
  if (!out.includes("Patient")) out.unshift("Patient");
  return out;
}

export async function handleGetMyConfig(datasetId: string, conn: Conn, state: MriState): Promise<Response> {
  validateDatasetId(datasetId);
  const types = await presentTypes(datasetId, conn, state);
  return Response.json(getMyConfigResponse(datasetId, types));
}

export async function handleGetMyConfigList(datasetId: string, conn: Conn, state: MriState): Promise<Response> {
  validateDatasetId(datasetId);
  const types = await presentTypes(datasetId, conn, state);
  const { mriConfig } = generateConfig(datasetId, types);
  return Response.json([{ meta: mriConfig.meta, assigned: true }]);
}

export async function handleGetFrontendConfig(configId: string, conn: Conn, state: MriState): Promise<Response> {
  // configId is "fhir-<datasetId>"
  const datasetId = configId.startsWith("fhir-") ? configId.slice("fhir-".length) : configId;
  validateDatasetId(datasetId);
  const types = await presentTypes(datasetId, conn, state);
  const { mriConfig } = generateConfig(datasetId, types);
  return Response.json(mriConfig);
}
