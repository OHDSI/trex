// @ts-nocheck - Deno edge function

import { FhirError } from "./error.ts";
import { AppState, externalBase, getState } from "./state.ts";

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
  // /health  /metrics
  // -------------------------------------------------------------------------
  if (n === 1 && s0 === "health" && m === "GET") return { kind: "health" };
  if (n === 1 && s0 === "metrics" && m === "GET") return { kind: "metrics" };

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
    // /{ds}/metadata
    if (s1 === "metadata" && m === "GET") return { kind: "metadata", datasetId };

    // /{ds}/$import
    if (s1 === "$import" && m === "POST") return { kind: "import", datasetId };

    // /{ds}/$export  (GET only — status sub-path handled below at n===4)
    if (s1 === "$export" && m === "GET") return { kind: "export", datasetId };

    // /{ds}/$cql
    if (s1 === "$cql" && m === "POST") return { kind: "cql", datasetId };

    // /{ds}/Measure/$evaluate-measure  — handled at n===3 below; but won't reach here
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
    // /{ds}/$export/status — needs 4 segments (job_id) — fall through; handled at n===4

    // /{ds}/Measure/$evaluate-measure  (literal "Measure" + literal "$evaluate-measure")
    if (s1 === "Measure" && s2 === "$evaluate-measure") {
      if (m === "GET" || m === "POST") return { kind: "evaluateMeasure", datasetId };
    }

    // /{ds}/{resourceType}/$export  (type-level export)
    if (s2 === "$export" && m === "GET") {
      return { kind: "typeExport", datasetId, resourceType: s1 };
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
    // /{ds}/$export/status/{job_id}
    if (s1 === "$export" && s2 === "status" && m === "GET") {
      return { kind: "exportStatus", datasetId, jobId: s3 };
    }

    // /{ds}/Measure/{measure_id}/$evaluate-measure
    if (s1 === "Measure" && s3 === "$evaluate-measure") {
      if (m === "GET" || m === "POST") {
        return { kind: "evaluateMeasure", datasetId, measureId: s2 };
      }
    }

    // /{ds}/{resourceType}/{id}/_history
    if (s3 === "_history" && m === "GET") {
      return { kind: "history", datasetId, resourceType: s1, id: s2 };
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
      bodyText = JSON.stringify(obj);
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

const BASE_PATH_DEFAULT = "/trex/fhir";

export async function route(req: Request, state: AppState): Promise<Response> {
  const basePath = Deno.env.get("FHIR_BASE_PATH") ?? BASE_PATH_DEFAULT;
  const url = new URL(req.url);
  const raw = url.pathname;
  const stripped = (raw.startsWith(basePath) ? raw.slice(basePath.length) : raw) || "/";

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
  _req: Request,
  parsed: Route,
  _state: AppState,
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

    default:
      return FhirError.internal("handler not implemented").toResponse();
  }
}
