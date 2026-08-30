// @ts-nocheck - Deno edge function

import { FhirError } from "./error.ts";
import { AppState, externalBase, stripMount } from "./state.ts";
import { withConnection } from "./db.ts";
import { getMetadata } from "./handlers/metadata.ts";
import { handleStructureDefinitionList, handleStructureDefinitionRead } from "./handlers/structure_definition.ts";
import {
  createDataset,
  listDatasets,
  getDataset,
  updateDataset,
  deleteDataset,
} from "./handlers/dataset.ts";
import {
  createResource,
  readResource,
  updateResource,
  deleteResource,
} from "./handlers/crud.ts";
import { searchResources } from "./handlers/search.ts";
import { resourceHistory, readResourceVersion } from "./handlers/history.ts";
import { processBundle } from "./handlers/bundle.ts";
import { importNdjson } from "./handlers/import.ts";
import { systemExport, typeExport, exportStatus } from "./handlers/export.ts";
import { getCounts } from "./handlers/counts.ts";
import { globalSearch } from "./handlers/global_search.ts";

// ---------------------------------------------------------------------------
// Route type
// ---------------------------------------------------------------------------

export type Route =
  | { kind: "health" }
  | { kind: "metrics" }
  | { kind: "createDataset" }
  | { kind: "listDatasets" }
  | { kind: "getDataset"; datasetId: string }
  | { kind: "updateDataset"; datasetId: string }
  | { kind: "deleteDataset"; datasetId: string }
  | { kind: "metadata"; datasetId: string }
  | { kind: "search"; datasetId: string; resourceType: string }
  | { kind: "create"; datasetId: string; resourceType: string }
  | { kind: "read"; datasetId: string; resourceType: string; id: string }
  | { kind: "update"; datasetId: string; resourceType: string; id: string }
  | { kind: "delete"; datasetId: string; resourceType: string; id: string }
  | { kind: "history"; datasetId: string; resourceType: string; id: string }
  | { kind: "vread"; datasetId: string; resourceType: string; id: string; versionId: string }
  | { kind: "bundle"; datasetId: string }
  | { kind: "import"; datasetId: string }
  | { kind: "export"; datasetId: string }
  | { kind: "exportStatus"; datasetId: string; jobId: string }
  | { kind: "typeExport"; datasetId: string; resourceType: string }
  | { kind: "evaluateMeasure"; datasetId: string; measureId?: string }
  | { kind: "cql"; datasetId: string }
  | { kind: "structureDefinitionList"; datasetId: string }
  | { kind: "structureDefinitionRead"; datasetId: string; type: string }
  | { kind: "counts"; datasetId: string }
  | { kind: "globalSearch"; datasetId: string }
  | { kind: "notFound" };

// ---------------------------------------------------------------------------
// parseRoute — pure, total, never throws
// ---------------------------------------------------------------------------

/**
 * Parse a path that is already stripped of the mount prefix (e.g. "/ds1/Patient/p1").
 * Precedence: literal segments win over params.  Specific operation paths ($..., _history)
 * are tested before the generic param patterns.
 */
export function parseRoute(method: string, path: string): Route {
  const m = method.toUpperCase();

  // Normalise to always start with "/"
  const p = path.startsWith("/") ? path : `/${path}`;

  // Split into non-empty segments
  const segs = p.split("/").filter((s) => s.length > 0);
  const n = segs.length;

  // -------------------------------------------------------------------------
  // 0 segments — root (not matched)
  // -------------------------------------------------------------------------
  if (n === 0) return { kind: "notFound" };

  const s0 = segs[0];

  // -------------------------------------------------------------------------
  // /health  /metrics  — reserved literals at 1-segment; non-GET → notFound
  // -------------------------------------------------------------------------
  if (n === 1 && s0 === "health") {
    return m === "GET" ? { kind: "health" } : { kind: "notFound" };
  }
  if (n === 1 && s0 === "metrics") {
    return m === "GET" ? { kind: "metrics" } : { kind: "notFound" };
  }

  // -------------------------------------------------------------------------
  // /datasets  /datasets/{dataset_id}
  // -------------------------------------------------------------------------
  if (s0 === "datasets") {
    if (n === 1) {
      if (m === "POST") return { kind: "createDataset" };
      if (m === "GET") return { kind: "listDatasets" };
    }
    if (n === 2) {
      const datasetId = segs[1];
      if (m === "GET") return { kind: "getDataset", datasetId };
      if (m === "PUT") return { kind: "updateDataset", datasetId };
      if (m === "DELETE") return { kind: "deleteDataset", datasetId };
    }
    return { kind: "notFound" };
  }

  // -------------------------------------------------------------------------
  // Everything below: s0 is the dataset_id
  // -------------------------------------------------------------------------
  const datasetId = s0;

  // /{dataset_id}  — POST → bundle
  if (n === 1) {
    if (m === "POST") return { kind: "bundle", datasetId };
    return { kind: "notFound" };
  }

  const s1 = segs[1];

  // -------------------------------------------------------------------------
  // 2-segment paths with literal s1
  // -------------------------------------------------------------------------
  if (n === 2) {
    // /{ds}/metadata  — literal; non-GET → notFound
    if (s1 === "metadata") {
      return m === "GET" ? { kind: "metadata", datasetId } : { kind: "notFound" };
    }

    // /{ds}/$import  — literal; non-POST → notFound
    if (s1 === "$import") {
      return m === "POST" ? { kind: "import", datasetId } : { kind: "notFound" };
    }

    // /{ds}/$export  (GET only — status sub-path handled below at n===4)
    if (s1 === "$export") {
      return m === "GET" ? { kind: "export", datasetId } : { kind: "notFound" };
    }

    // /{ds}/$cql  — literal; non-POST → notFound
    if (s1 === "$cql") {
      return m === "POST" ? { kind: "cql", datasetId } : { kind: "notFound" };
    }

    // /{ds}/$counts  — literal; non-GET → notFound
    if (s1 === "$counts") {
      return m === "GET" ? { kind: "counts", datasetId } : { kind: "notFound" };
    }

    // /{ds}/$global-search  — literal; non-GET → notFound
    if (s1 === "$global-search") {
      return m === "GET" ? { kind: "globalSearch", datasetId } : { kind: "notFound" };
    }

    // Any other segment starting with "$" is an unknown operation → notFound
    if (s1.startsWith("$")) return { kind: "notFound" };

    // /{ds}/StructureDefinition  — registry list (no DB required)
    if (s1 === "StructureDefinition") {
      return m === "GET" ? { kind: "structureDefinitionList", datasetId } : { kind: "notFound" };
    }

    // /{ds}/{resourceType}  search / create
    const resourceType = s1;
    if (m === "GET") return { kind: "search", datasetId, resourceType };
    if (m === "POST") return { kind: "create", datasetId, resourceType };
    return { kind: "notFound" };
  }

  // -------------------------------------------------------------------------
  // 3-segment paths
  // -------------------------------------------------------------------------
  const s2 = segs[2];

  if (n === 3) {
    // /{ds}/$export/...  — s1 is a known operation literal; any other 3-seg path with it is notFound
    if (s1 === "$export") return { kind: "notFound" };

    // /{ds}/Measure/$evaluate-measure  (literal "Measure" + literal "$evaluate-measure")
    if (s1 === "Measure" && s2 === "$evaluate-measure") {
      if (m === "GET" || m === "POST") return { kind: "evaluateMeasure", datasetId };
      return { kind: "notFound" };
    }

    // /{ds}/{resourceType}/$export  (type-level export) — literal s2; non-GET → notFound
    if (s2 === "$export") {
      return m === "GET" ? { kind: "typeExport", datasetId, resourceType: s1 } : { kind: "notFound" };
    }

    // Any other s2 starting with "$" is an unknown operation → notFound
    if (s2.startsWith("$")) return { kind: "notFound" };

    // /{ds}/StructureDefinition/{type}  — registry read (no DB required)
    if (s1 === "StructureDefinition") {
      return m === "GET" ? { kind: "structureDefinitionRead", datasetId, type: s2 } : { kind: "notFound" };
    }

    // /{ds}/{resourceType}/{id}  — read / update / delete
    const resourceType = s1;
    const id = s2;
    if (m === "GET") return { kind: "read", datasetId, resourceType, id };
    if (m === "PUT") return { kind: "update", datasetId, resourceType, id };
    if (m === "DELETE") return { kind: "delete", datasetId, resourceType, id };
    return { kind: "notFound" };
  }

  // -------------------------------------------------------------------------
  // 4-segment paths
  // -------------------------------------------------------------------------
  const s3 = segs[3];

  if (n === 4) {
    // /{ds}/$export/... — s1 is a literal operation; fence it
    if (s1 === "$export") {
      if (s2 === "status" && m === "GET") {
        return { kind: "exportStatus", datasetId, jobId: s3 };
      }
      return { kind: "notFound" };
    }

    // /{ds}/Measure/{measure_id}/$evaluate-measure  — fence: wrong method → notFound
    if (s1 === "Measure" && s3 === "$evaluate-measure") {
      if (m === "GET" || m === "POST") {
        return { kind: "evaluateMeasure", datasetId, measureId: s2 };
      }
      return { kind: "notFound" };
    }

    // s3 is a literal operation or reserved segment — fence it
    if (s3 === "$evaluate-measure") return { kind: "notFound" };
    if (s3.startsWith("$")) return { kind: "notFound" };

    // /{ds}/{resourceType}/{id}/_history
    if (s3 === "_history") {
      return m === "GET" ? { kind: "history", datasetId, resourceType: s1, id: s2 } : { kind: "notFound" };
    }

    return { kind: "notFound" };
  }

  // -------------------------------------------------------------------------
  // 5-segment paths
  // -------------------------------------------------------------------------
  if (n === 5) {
    const s4 = segs[4];

    // /{ds}/{resourceType}/{id}/_history/{versionId}
    if (s3 === "_history" && m === "GET") {
      return { kind: "vread", datasetId, resourceType: s1, id: s2, versionId: s4 };
    }

    return { kind: "notFound" };
  }

  return { kind: "notFound" };
}

// ---------------------------------------------------------------------------
// postProcess — response rewriting
// ---------------------------------------------------------------------------

/**
 * Rewrite response:
 *  - Set content-type: application/fhir+json on JSON responses.
 *  - Rewrite relative Location header to absolute FHIR URL.
 *  - Rewrite relative fullUrl entries in Bundle bodies.
 */
export async function postProcess(
  res: Response,
  externalBaseUrl: string,
  datasetId: string | null,
): Promise<Response> {
  const ct = res.headers.get("content-type") ?? "";
  const isJson = ct.includes("application/json") || ct.includes("application/fhir+json");

  if (!isJson) {
    // Not JSON — pass through as-is (but clone so body is readable)
    return res;
  }

  // Read body once
  let bodyText: string;
  try {
    bodyText = await res.text();
  } catch {
    return res;
  }

  // Try to parse as JSON; on failure, pass through with corrected content-type
  let json: unknown;
  let parsed = false;
  try {
    json = JSON.parse(bodyText);
    parsed = true;
  } catch {
    // fall through
  }

  const headers = new Headers(res.headers);
  headers.set("content-type", "application/fhir+json");

  // Rewrite Location header
  const location = headers.get("location");
  if (location && datasetId && !location.startsWith("http://") && !location.startsWith("https://")) {
    // Strip leading slash if present, then build absolute URL
    const rel = location.startsWith("/") ? location.slice(1) : location;
    headers.set("location", `${externalBaseUrl}/${datasetId}/${rel}`);
  }

  // Rewrite Bundle fullUrls
  if (parsed && datasetId) {
    const obj = json as Record<string, unknown>;
    if (obj?.resourceType === "Bundle" && Array.isArray(obj.entry)) {
      obj.entry = obj.entry.map((e: unknown) => {
        const entry = e as Record<string, unknown>;
        if (typeof entry.fullUrl === "string") {
          const fu = entry.fullUrl as string;
          if (!fu.startsWith("http://") && !fu.startsWith("https://")) {
            const rel = fu.startsWith("/") ? fu.slice(1) : fu;
            return { ...entry, fullUrl: `${externalBaseUrl}/${datasetId}/${rel}` };
          }
        }
        return entry;
      });
    }
  }

  return new Response(parsed ? JSON.stringify(json) : bodyText, {
    status: res.status,
    headers,
  });
}

// ---------------------------------------------------------------------------
// route — main dispatcher
// ---------------------------------------------------------------------------

export async function route(req: Request, state: AppState): Promise<Response> {
  const url = new URL(req.url);
  const stripped = stripMount(url.pathname);

  const parsed = parseRoute(req.method, stripped);

  let res: Response;
  try {
    res = await dispatch(req, parsed, state);
  } catch (err) {
    if (err instanceof FhirError) {
      res = err.toResponse();
    } else {
      res = FhirError.internal("internal server error").toResponse();
    }
  }

  // Determine datasetId for postProcess (null for non-dataset routes)
  let datasetId: string | null = null;
  if ("datasetId" in parsed) {
    datasetId = (parsed as { datasetId: string }).datasetId;
  }

  return postProcess(res, externalBase(req), datasetId);
}

async function dispatch(
  req: Request,
  parsed: Route,
  state: AppState,
): Promise<Response> {
  switch (parsed.kind) {
    case "health":
      return Response.json({ status: "ok" });

    case "metrics":
      return new Response("# metrics\n", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });

    case "notFound":
      return FhirError.notFound("no route matched").toResponse();

    case "metadata":
      return await withConnection((conn) => getMetadata(parsed.datasetId, conn, state));

    case "structureDefinitionList":
      return handleStructureDefinitionList(state);

    case "structureDefinitionRead":
      return handleStructureDefinitionRead(state, parsed.type);

    case "counts":
      return await withConnection((conn) => getCounts(parsed.datasetId, conn, state));

    case "globalSearch": {
      const u = new URL(req.url);
      const q = u.searchParams.get("q") ?? "";
      return await withConnection((conn) => globalSearch(parsed.datasetId, q, conn, state));
    }

    case "createDataset": {
      const body = await req.json().catch(() => ({}));
      return await withConnection((conn) => createDataset(body, conn, state));
    }

    case "listDatasets":
      return await withConnection((conn) => listDatasets(conn, state));

    case "getDataset":
      return await withConnection((conn) => getDataset(parsed.datasetId, conn, state));

    case "updateDataset": {
      const body = await req.json().catch(() => ({}));
      return await withConnection((conn) => updateDataset(parsed.datasetId, body, conn, state));
    }

    case "deleteDataset":
      return await withConnection((conn) => deleteDataset(parsed.datasetId, conn, state));

    case "create": {
      const body = await req.json().catch(() => ({}));
      return await withConnection((conn) => createResource(parsed.datasetId, parsed.resourceType, body, conn, state));
    }

    case "read":
      return await withConnection((conn) => readResource(parsed.datasetId, parsed.resourceType, parsed.id, conn, state));

    case "update": {
      const body = await req.json().catch(() => ({}));
      const ifMatch = req.headers.get("if-match");
      return await withConnection((conn) => updateResource(parsed.datasetId, parsed.resourceType, parsed.id, body, ifMatch, conn, state));
    }

    case "delete":
      return await withConnection((conn) => deleteResource(parsed.datasetId, parsed.resourceType, parsed.id, conn, state));

    case "search": {
      const u = new URL(req.url);
      const params = Object.fromEntries(u.searchParams.entries());
      return await withConnection((conn) => searchResources(parsed.datasetId, parsed.resourceType, params, conn, state));
    }

    case "history":
      return await withConnection((conn) => resourceHistory(parsed.datasetId, parsed.resourceType, parsed.id, conn, state));

    case "vread":
      return await withConnection((conn) => readResourceVersion(parsed.datasetId, parsed.resourceType, parsed.id, parsed.versionId, conn, state));

    case "bundle": {
      const body = await req.json().catch(() => ({}));
      return await withConnection((conn) => processBundle(parsed.datasetId, body, conn, state));
    }

    case "import": {
      const bodyText = await req.text();
      return await withConnection((conn) => importNdjson(parsed.datasetId, bodyText, conn, state));
    }

    case "export": {
      const u = new URL(req.url);
      const query = Object.fromEntries(u.searchParams.entries());
      return await withConnection((conn) => systemExport(parsed.datasetId, query, conn, state));
    }

    case "typeExport":
      return await withConnection((conn) => typeExport(parsed.datasetId, parsed.resourceType, conn, state));

    case "exportStatus":
      return await withConnection((conn) => exportStatus(parsed.datasetId, parsed.jobId, conn, state));

    default:
      return FhirError.internal("handler not implemented").toResponse();
  }
}
