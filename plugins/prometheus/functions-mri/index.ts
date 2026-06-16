// @ts-nocheck - Deno edge function
import { getMriState } from "./state.ts";
import { parseMriRoute } from "./router.ts";
import { withConnection } from "./db.ts";
import { handleGetMyConfig, handleGetMyConfigList, handleGetFrontendConfig } from "./handlers/config.ts";
import { handlePatientCount } from "./handlers/patientcount.ts";
import { handleBarchart } from "./handlers/barchart.ts";

export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const route = parseMriRoute(req.method, url.pathname, url.searchParams);
  const state = await getMriState();

  switch (route.kind) {
    case "getMyConfig":
      return await withConnection((conn) => handleGetMyConfig(route.datasetId, conn, state));
    case "getMyConfigList":
      return await withConnection((conn) => handleGetMyConfigList(route.datasetId, conn, state));
    case "getFrontendConfig":
      return await withConnection((conn) => handleGetFrontendConfig(route.configId, conn, state));
    case "patientcount": {
      const mriquery = url.searchParams.get("mriquery") ?? (req.method === "POST" ? await req.text() : "");
      return await withConnection((conn) => handlePatientCount(mriquery, conn, state));
    }
    case "barchart": {
      const mriquery = url.searchParams.get("mriquery") ?? (req.method === "POST" ? await req.text() : "");
      return await withConnection((conn) => handleBarchart(mriquery, conn, state));
    }
    default:
      return Response.json({ error: "not found" }, { status: 404 });
  }
}

if (import.meta.main) {
  Deno.serve((req) => handle(req));
}
