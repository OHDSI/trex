import { it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import { createRouter, createMemoryHistory } from "vue-router";
import ResourceEditor from "./ResourceEditor.vue";
import { FhirError } from "@/services/fhirClient";

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }],
});

const sd = { resourceType: "Patient", kind: "resource", isAbstract: false,
  elements: [{ path: "Patient.birthDate", name: "birthDate", typeCodes: ["date"], min: 1, max: "1", isArray: false, isChoice: false, children: [] }] };

const readMock = vi.fn().mockResolvedValue({ resourceType: "Patient", id: "p1", birthDate: "1990-01-01" });
const updateMock = vi.fn().mockResolvedValue({ resourceType: "Patient", id: "p1" });
const client = { read: readMock, update: updateMock };

vi.mock("@/composables/useFhir", () => ({ useFhir: () => ({ client, profile: { getDefinition: vi.fn().mockResolvedValue(sd) } }) }));

beforeEach(() => {
  readMock.mockResolvedValue({ resourceType: "Patient", id: "p1", birthDate: "1990-01-01" });
  updateMock.mockResolvedValue({ resourceType: "Patient", id: "p1" });
});

it("loads the instance and saves via update", async () => {
  const w = mount(ResourceEditor, { props: { dataset: "ds1", type: "Patient", id: "p1" },
    global: { plugins: [createVuetify({ components }), router] } });
  await flushPromises();
  expect(w.find('[data-field="Patient.birthDate"]').exists()).toBe(true);
  await w.find('[data-save]').trigger("click");
  await flushPromises();
  expect(updateMock).toHaveBeenCalledWith("ds1", "Patient", "p1", expect.objectContaining({ resourceType: "Patient" }));
});

it("shows load error and hides Save when client.read rejects", async () => {
  readMock.mockRejectedValue(new FhirError("Patient/x not found", 404));
  const w = mount(ResourceEditor, { props: { dataset: "ds1", type: "Patient", id: "p1" },
    global: { plugins: [createVuetify({ components }), router] } });
  await flushPromises();
  expect(w.find('[data-load-error]').exists()).toBe(true);
  expect(w.find('[data-save]').exists()).toBe(false);
});
