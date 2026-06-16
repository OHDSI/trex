// @ts-nocheck - Deno edge function
import { Conn } from "../db.ts";
import { MriState } from "../state.ts";
import { validateDatasetId, toQualifiedSchema } from "../../functions/sql_safety.ts";
import { decodeMriQuery } from "../mriquery/decode.ts";
import { generateConfig } from "../config/generate.ts";
import { ifrToElm } from "../ifr/to_elm.ts";
import { compileBarchart } from "../elm/compiler.ts";
import { assembleBarchart } from "../postprocess/barchart.ts";

/** Display labels for the selected axes, derived from the attribute id's leaf name. */
export function axisLabels(axisSelection: Array<{ categoryId: string; attributeId: string }>, _mapping: Record<string, any>) {
  return axisSelection
    .filter((ax) => ax.attributeId && ax.attributeId !== "n/a")
    .map((ax) => ({ name: ax.attributeId.split(".").pop() ?? ax.categoryId }));
}

export async function handleBarchart(mriquery: string, conn: Conn, state: MriState): Promise<Response> {
  const ifr = await decodeMriQuery(mriquery);
  const datasetId = ifr.datasetId ?? (ifr.filter?.configMetadata?.id ?? "").replace(/^fhir-/, "");
  validateDatasetId(datasetId);

  const { mapping } = generateConfig(datasetId, ["Patient", "Condition", "Observation", "Procedure"]);
  const elm = ifrToElm(ifr, mapping);
  const sql = compileBarchart(elm, toQualifiedSchema(state.dbName, datasetId));

  const rows = await conn.query(sql);
  const labels = axisLabels(ifr.axisSelection ?? [], mapping);
  const result = assembleBarchart(rows, elm.axes, labels);
  return Response.json(result);
}
