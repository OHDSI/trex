import { describe, it, expect, vi, beforeEach } from "vitest";
import { FhirClient } from "./fhirClient";
const json = (body: unknown, init: any = {}) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/fhir+json" }, ...init });
describe("FhirClient", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it("searches a resource type with query params", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ resourceType: "Bundle", total: 1, entry: [{ resource: { resourceType: "Patient", id: "p1" } }] }));
    const c = new FhirClient("http://h/fhir", "k");
    const b = await c.search("ds1", "Patient", { gender: "female" });
    expect(b.total).toBe(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://h/fhir/ds1/Patient?gender=female");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers as any).toMatchObject({ apikey: "k" });
    const hdrs = (fetchMock.mock.calls[0][1] as RequestInit).headers as any;
    expect(hdrs.accept).toBe("application/fhir+json");
    expect(hdrs["content-type"]).toBeUndefined();
  });
  it("reads a structure definition", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ resourceType: "Patient", kind: "resource", isAbstract: false, elements: [] }));
    const c = new FhirClient("http://h/fhir", "k");
    expect((await c.getStructureDefinition("ds1", "Patient")).resourceType).toBe("Patient");
  });
  it("throws a normalized error from OperationOutcome", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ resourceType: "OperationOutcome", issue: [{ severity: "error", diagnostics: "bad" }] }, { status: 400 }));
    const c = new FhirClient("http://h/fhir", "k");
    await expect(c.read("ds1", "Patient", "x")).rejects.toThrow("bad");
  });
  it("throws FhirError on a non-JSON error body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>502</html>", { status: 502 }));
    const c = new FhirClient("http://h/fhir", "k");
    await expect(c.read("ds1", "Patient", "x")).rejects.toThrow("HTTP 502");
  });
  it("search accepts URLSearchParams", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ resourceType: "Bundle" }), { headers: { "content-type": "application/fhir+json" } }));
    const c = new FhirClient("http://h/fhir", "k");
    const p = new URLSearchParams(); p.append("_profile", "A"); p.append("_profile", "B");
    await c.search("ds1", "Patient", p);
    expect(fetchMock.mock.calls[0][0]).toBe("http://h/fhir/ds1/Patient?_profile=A&_profile=B");
  });
});
