import { it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import { createRouter, createMemoryHistory } from "vue-router";
import GlobalSearch from "./GlobalSearch.vue";
import { useFhir } from "@/composables/useFhir";

vi.mock("@atlas-ui", () => ({
  AtlasPageShell: { template: '<div><slot name="actions" /><slot /></div>', props: ["eyebrow", "title"] },
  AtlasCard: { template: '<div><slot /></div>', props: ["padding"] },
  AtlasAlert: { template: '<div class="alert">{{ title }}</div>', props: ["severity", "title"] },
  AtlasProgressCircular: { template: '<div class="progress" />', props: ["indeterminate"] },
}));

vi.mock("@/composables/useFhir");

const mockBundle = {
  resourceType: "Bundle",
  type: "searchset",
  total: 2,
  entry: [
    {
      resource: {
        resourceType: "Patient",
        id: "p1",
        name: [{ family: "Müller", given: ["Anna"] }],
      },
      search: { mode: "match" },
    },
    {
      resource: {
        resourceType: "Observation",
        id: "o1",
        code: { text: "Body weight" },
      },
      search: { mode: "match" },
    },
  ],
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }],
});

function mountGlobalSearch(q = "test") {
  const mockGlobalSearch = vi.fn().mockResolvedValue(mockBundle);
  vi.mocked(useFhir).mockReturnValue({
    client: { globalSearch: mockGlobalSearch } as any,
    profile: {} as any,
  });
  const w = mount(GlobalSearch, {
    props: { dataset: "ds1", q },
    global: { plugins: [createVuetify({ components }), router] },
  });
  return { w, mockGlobalSearch };
}

it("calls globalSearch on mount and renders results grouped by resourceType", async () => {
  const { w, mockGlobalSearch } = mountGlobalSearch("Müller");
  await flushPromises();
  expect(mockGlobalSearch).toHaveBeenCalledWith("ds1", "Müller");
  const html = w.html();
  // Both resourceType group headers must appear
  expect(html).toContain("Patient");
  expect(html).toContain("Observation");
});

it("renders a row for each entry in each group", async () => {
  const { w } = mountGlobalSearch("weight");
  await flushPromises();
  // Patient row shows formatted name; Observation row shows code
  const html = w.html();
  expect(html).toContain("Anna Müller");
  expect(html).toContain("Body weight");
});

it("shows empty state when no results", async () => {
  vi.mocked(useFhir).mockReturnValue({
    client: {
      globalSearch: vi.fn().mockResolvedValue({ resourceType: "Bundle", type: "searchset", total: 0, entry: [] }),
    } as any,
    profile: {} as any,
  });
  const w = mount(GlobalSearch, {
    props: { dataset: "ds1", q: "noop" },
    global: { plugins: [createVuetify({ components }), router] },
  });
  await flushPromises();
  expect(w.find("[data-empty]").exists()).toBe(true);
});

it("shows error alert when globalSearch rejects", async () => {
  vi.mocked(useFhir).mockReturnValue({
    client: {
      globalSearch: vi.fn().mockRejectedValue(new Error("Network error")),
    } as any,
    profile: {} as any,
  });
  const w = mount(GlobalSearch, {
    props: { dataset: "ds1", q: "fail" },
    global: { plugins: [createVuetify({ components }), router] },
  });
  await flushPromises();
  expect(w.find(".alert").exists()).toBe(true);
});

it("renders nothing when q is empty", async () => {
  const mockGlobalSearch = vi.fn();
  vi.mocked(useFhir).mockReturnValue({
    client: { globalSearch: mockGlobalSearch } as any,
    profile: {} as any,
  });
  const w = mount(GlobalSearch, {
    props: { dataset: "ds1", q: "" },
    global: { plugins: [createVuetify({ components }), router] },
  });
  await flushPromises();
  expect(mockGlobalSearch).not.toHaveBeenCalled();
  expect(w.find("[data-empty]").exists()).toBe(false);
});
