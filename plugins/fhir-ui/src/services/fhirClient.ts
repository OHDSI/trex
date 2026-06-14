import type { Bundle, CapabilityStatement, FhirResource, ParsedStructureDefinition } from "@/types/fhir";

export class FhirError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export class FhirClient {
  constructor(private baseUrl: string, private apiKey: string) {}

  private headers(withBody: boolean): HeadersInit {
    return {
      apikey: this.apiKey,
      accept: "application/fhir+json",
      ...(withBody ? { "content-type": "application/fhir+json" } : {}),
    };
  }

  private async req(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method, headers: this.headers(body !== undefined), body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data: any;
    try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
    if (!res.ok) {
      const msg = data?.issue?.[0]?.diagnostics || data?.issue?.[0]?.details?.text || `HTTP ${res.status}`;
      throw new FhirError(msg, res.status);
    }
    return data;
  }

  listDatasets(): Promise<unknown> { return this.req("GET", "/datasets"); }
  metadata(ds: string): Promise<CapabilityStatement> { return this.req("GET", `/${ds}/metadata`); }
  listStructureDefinitions(ds: string): Promise<{ resourceTypes: string[] }> { return this.req("GET", `/${ds}/StructureDefinition`); }
  getStructureDefinition(ds: string, type: string): Promise<ParsedStructureDefinition> { return this.req("GET", `/${ds}/StructureDefinition/${type}`); }

  getCounts(ds: string): Promise<{ counts: Record<string, number> }> { return this.req("GET", `/${ds}/$counts`); }

  search(ds: string, type: string, params: Record<string, string> | URLSearchParams = {}): Promise<Bundle> {
    const qs = (params instanceof URLSearchParams ? params : new URLSearchParams(params)).toString();
    return this.req("GET", `/${ds}/${type}${qs ? `?${qs}` : ""}`);
  }
  read(ds: string, type: string, id: string): Promise<FhirResource> { return this.req("GET", `/${ds}/${type}/${id}`); }
  create(ds: string, type: string, body: FhirResource): Promise<FhirResource> { return this.req("POST", `/${ds}/${type}`, body); }
  update(ds: string, type: string, id: string, body: FhirResource): Promise<FhirResource> { return this.req("PUT", `/${ds}/${type}/${id}`, body); }
}
