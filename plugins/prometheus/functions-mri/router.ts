// @ts-nocheck - Deno edge function
import { stripMriMount } from "./state.ts";

export type MriRoute =
  | { kind: "getMyConfig"; datasetId: string }
  | { kind: "getMyConfigList"; datasetId: string }
  | { kind: "getFrontendConfig"; configId: string; configVersion: string }
  | { kind: "patientcount" }
  | { kind: "barchart" }
  | { kind: "notFound" };

export function parseMriRoute(method: string, pathname: string, q: URLSearchParams): MriRoute {
  const m = method.toUpperCase();
  const p = stripMriMount(pathname);

  if (m === "GET" && p === "/pa/services/analytics.xsjs") {
    const action = q.get("action") ?? "";
    if (action === "getMyConfig") return { kind: "getMyConfig", datasetId: q.get("datasetId") ?? "" };
    if (action === "getMyConfigList") return { kind: "getMyConfigList", datasetId: q.get("datasetId") ?? "" };
    if (action === "getFrontendConfig") {
      return { kind: "getFrontendConfig", configId: q.get("configId") ?? "", configVersion: q.get("configVersion") ?? "" };
    }
    return { kind: "notFound" };
  }

  if (p === "/api/services/population/json/patientcount") return { kind: "patientcount" };
  if (p === "/api/services/population/json/barchart") return { kind: "barchart" };

  return { kind: "notFound" };
}
