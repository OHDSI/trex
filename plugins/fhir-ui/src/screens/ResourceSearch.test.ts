import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import ResourceSearch from "./ResourceSearch.vue";

const client = { search: vi.fn().mockResolvedValue({ resourceType: "Bundle", total: 1, entry: [{ resource: { resourceType: "Patient", id: "p1", gender: "female" } }] }) };
vi.mock("@/composables/useFhir", () => ({
  useFhir: () => ({ client, profile: { getSearchParams: vi.fn().mockResolvedValue([{ name: "gender", type: "token" }]) } }),
}));

it("renders a filter field per search param and a results row per entry", async () => {
  const w = mount(ResourceSearch, { props: { dataset: "ds1", type: "Patient" },
    global: { plugins: [createVuetify({ components })], stubs: { RouterLink: true } } });
  await flushPromises();
  expect(w.find('[data-filter="gender"]').exists()).toBe(true);
  expect(w.findAll('[data-result-row]').length).toBe(1);
});
