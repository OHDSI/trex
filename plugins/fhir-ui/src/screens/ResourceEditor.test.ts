import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import ResourceEditor from "./ResourceEditor.vue";
const sd = { resourceType: "Patient", kind: "resource", isAbstract: false,
  elements: [{ path: "Patient.birthDate", name: "birthDate", typeCodes: ["date"], min: 1, max: "1", isArray: false, isChoice: false, children: [] }] };
const client = {
  read: vi.fn().mockResolvedValue({ resourceType: "Patient", id: "p1", birthDate: "1990-01-01" }),
  update: vi.fn().mockResolvedValue({ resourceType: "Patient", id: "p1" }),
};
vi.mock("@/composables/useFhir", () => ({ useFhir: () => ({ client, profile: { getDefinition: vi.fn().mockResolvedValue(sd) } }) }));
it("loads the instance and saves via update", async () => {
  const w = mount(ResourceEditor, { props: { dataset: "ds1", type: "Patient", id: "p1" },
    global: { plugins: [createVuetify({ components })], stubs: { RouterLink: true } } });
  await flushPromises();
  expect(w.find('[data-field="Patient.birthDate"]').exists()).toBe(true);
  await w.find('[data-save]').trigger("click");
  await flushPromises();
  expect(client.update).toHaveBeenCalledWith("ds1", "Patient", "p1", expect.objectContaining({ resourceType: "Patient" }));
});
