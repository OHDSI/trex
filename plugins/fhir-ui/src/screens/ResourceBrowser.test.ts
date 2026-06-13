import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import { createRouter, createMemoryHistory } from "vue-router";
import ResourceBrowser from "./ResourceBrowser.vue";

const mockGetResourceTypes = vi.fn().mockResolvedValue(["Patient", "Observation", "Questionnaire"]);

vi.mock("@/composables/useFhir", () => ({
  useFhir: () => ({
    client: {},
    profile: {
      getResourceTypes: mockGetResourceTypes,
      getSearchParams: vi.fn().mockResolvedValue([]),
    },
  }),
}));

vi.mock("@atlas-ui", () => ({
  AtlasPageShell: { template: '<div><slot /></div>', props: ["eyebrow", "title"] },
  AtlasCard: { template: '<div><slot /></div>', props: ["interactive", "padding"] },
  AtlasAlert: { template: '<div data-error class="alert">{{ title }}</div>', props: ["severity", "title"] },
  AtlasProgressCircular: { template: '<div class="progress" />', props: ["indeterminate"] },
  AtlasIconButton: { template: '<button v-bind="$attrs" />', props: ["icon", "ariaLabel"] },
}));

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }] });

const mountOptions = () => ({
  props: { dataset: "ds1" },
  global: { plugins: [createVuetify({ components }), createTestingPinia(), router], stubs: { RouterLink: { template: '<a v-bind="$attrs" data-rt-card><slot /></a>', props: ["to"] } } },
});

it("renders a card per resource type", async () => {
  mockGetResourceTypes.mockResolvedValueOnce(["Patient", "Observation", "Questionnaire"]);
  const w = mount(ResourceBrowser, mountOptions());
  await flushPromises();
  expect(w.findAll('[data-rt-card]').length).toBe(3);
});

it("shows error alert when getResourceTypes rejects", async () => {
  mockGetResourceTypes.mockRejectedValueOnce(new Error("Server unavailable"));
  const w = mount(ResourceBrowser, mountOptions());
  await flushPromises();
  expect(w.find('[data-error]').exists()).toBe(true);
  expect(w.findAll('[data-rt-card]').length).toBe(0);
});
