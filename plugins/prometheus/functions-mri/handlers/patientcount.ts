// @ts-nocheck - Deno edge function
import { Conn } from "../db.ts";
import { MriState } from "../state.ts";
import { validateDatasetId, toQualifiedSchema } from "../../functions/sql_safety.ts";
import { decodeMriQuery } from "../mriquery/decode.ts";
import { generateConfig } from "../config/generate.ts";
import { ifrToElm } from "../ifr/to_elm.ts";
import { compileCount } from "../elm/compiler.ts";

/** Pure: MRI patientcount response shape. */
export function buildPatientCountResponse(count: number): { data: Array<Record<string, number>> } {
  return { data: [{ "patient.attributes.pcount": count }] };
}

export async function handlePatientCount(mriquery: string, conn: Conn, state: MriState): Promise<Response> {
  const ifr = await decodeMriQuery(mriquery);
  const datasetId = ifr.datasetId ?? (ifr.filter?.configMetadata?.id ?? "").replace(/^fhir-/, "");
  validateDatasetId(datasetId);

  // Mapping only needs the configPaths referenced; regenerate from Patient + all curated types.
  const { mapping } = generateConfig(datasetId, ["Patient", "Condition", "Observation", "Procedure"]);
  const elm = ifrToElm(ifr, mapping);
  const sql = compileCount(elm, toQualifiedSchema(state.dbName, datasetId));

  const rows = await conn.query(sql);
  const n = parseInt(String(rows?.[0]?.pcount ?? rows?.[0]?.column0 ?? "0"), 10) || 0;
  return Response.json(buildPatientCountResponse(n));
}
