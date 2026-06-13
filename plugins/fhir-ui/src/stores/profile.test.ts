import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useProfileStore } from "./profile";
const sd = { resourceType: "Patient", kind: "resource", isAbstract: false, elements: [{ path: "Patient.gender", name: "gender", typeCodes: ["code"], min: 0, max: "1", isArray: false, isChoice: false, children: [] }] };
describe("profileStore", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("caches a fetched StructureDefinition (one network call)", async () => {
    const client = { getStructureDefinition: vi.fn().mockResolvedValue(sd) } as any;
    const store = useProfileStore(); store.init(client, "ds1");
    const a = await store.getDefinition("Patient"); const b = await store.getDefinition("Patient");
    expect(a).toBe(b); expect(client.getStructureDefinition).toHaveBeenCalledTimes(1);
  });
  it("resolves search params from the capability statement", async () => {
    const client = { metadata: vi.fn().mockResolvedValue({ resourceType: "CapabilityStatement",
      rest: [{ resource: [{ type: "Patient", searchParam: [{ name: "gender", type: "token" }] }] }] }) } as any;
    const store = useProfileStore(); store.init(client, "ds1");
    expect(await store.getSearchParams("Patient")).toEqual([{ name: "gender", type: "token" }]);
  });
});
