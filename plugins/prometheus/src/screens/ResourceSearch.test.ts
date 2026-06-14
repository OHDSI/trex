import { it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import { createRouter, createMemoryHistory } from "vue-router";
import ResourceSearch from "./ResourceSearch.vue";
import { useFhir } from "@/composables/useFhir";

vi.mock("@atlas-ui", () => ({
  AtlasPageShell: { template: '<div><slot name="actions" /><slot /></div>', props: ["eyebrow", "title"] },
  AtlasCard: { template: '<div><slot /></div>', props: ["padding"] },
  AtlasTextField: { template: '<input :data-filter="label" />', props: ["modelValue", "label"] },
  AtlasButton: { template: '<button v-bind="$attrs"><slot /></button>', props: ["variant"] },
  AtlasAlert: { template: '<div class="alert">{{ title }}</div>', props: ["severity", "title"] },
  AtlasDataTable: {
    template: `<div class="data-table">
      <div v-for="h in headers" :key="h.key" class="header-cell">{{ h.title }}</div>
      <div v-if="!items || items.length === 0" class="no-data">{{ noDataText }}</div>
      <div v-for="item in items" :key="item.id" class="row-cell" @click="$emit('click:row', $event, { item })">
        <span v-for="h in headers" :key="h.key">{{ item[h.key] }}</span>
      </div>
    </div>`,
    props: ["headers", "items", "loading", "noDataText", "hideDefaultFooter"],
    emits: ["click:row"],
  },
}));

vi.mock("@/composables/useFhir");

const mockSearchParams = [{ name: "gender", type: "token" }];
const mockDefinition = { elements: [{ name: "name" }, { name: "gender" }, { name: "birthDate" }] };
const mockResource = { resourceType: "Patient", id: "p1", name: [{ family: "Müller", given: ["Anna"] }], gender: "female" };

function makeFhirMock(entries: unknown[] = [mockResource]) {
  return {
    client: {
      search: vi.fn().mockResolvedValue({ resourceType: "Bundle", total: entries.length, entry: entries.map((r) => ({ resource: r })) }),
    },
    profile: {
      getSearchParams: vi.fn().mockResolvedValue(mockSearchParams),
      getDefinition: vi.fn().mockResolvedValue(mockDefinition),
    },
  };
}

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }] });

function mountSearch(fhirMock = makeFhirMock()) {
  vi.mocked(useFhir).mockReturnValue(fhirMock as any);
  return mount(ResourceSearch, {
    props: { dataset: "ds1", type: "Patient" },
    global: { plugins: [createVuetify({ components }), router] },
  });
}

it("renders a filter field per search param", async () => {
  const w = mountSearch();
  await flushPromises();
  expect(w.find('[data-filter="gender"]').exists()).toBe(true);
});

it("renders formatted name values, not raw JSON", async () => {
  const w = mountSearch();
  await flushPromises();
  const html = w.html();
  expect(html).toContain("Anna Müller");
  expect(html).not.toContain('{"family"');
  expect(html).not.toContain('"given"');
});

it("shows 'No Patient found' when there are no results", async () => {
  const w = mountSearch(makeFhirMock([]));
  await flushPromises();
  expect(w.html()).toContain("No Patient found");
});

it("derives columns from StructureDefinition elements", async () => {
  const w = mountSearch();
  await flushPromises();
  const html = w.html();
  // Headers from SD: id, name, gender, birthDate → humanized: Id, Name, Gender, Birth date
  expect(html).toContain("Name");
  expect(html).toContain("Gender");
});

it("renders a [data-new] button in the actions slot", async () => {
  const w = mountSearch();
  await flushPromises();
  expect(w.find('[data-new]').exists()).toBe(true);
});
