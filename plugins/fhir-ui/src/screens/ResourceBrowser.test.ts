import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import { createRouter, createMemoryHistory } from "vue-router";
import ResourceBrowser from "./ResourceBrowser.vue";

const mockGetResourceTypes = vi.fn().mockResolvedValue(["Patient", "Observation", "Questionnaire"]);
const mockGetCounts = vi.fn().mockResolvedValue({ counts: { Patient: 2, Observation: 1, Questionnaire: 0 } });

vi.mock("@/composables/useFhir", () => ({
  useFhir: () => ({
    client: {
      getCounts: mockGetCounts,
    },
    profile: {
      getResourceTypes: mockGetResourceTypes,
      getSearchParams: vi.fn().mockResolvedValue([]),
    },
  }),
}));

vi.mock("@atlas-ui", () => ({
  AtlasPageShell: { template: '<div><slot name="actions" /><slot /></div>', props: ["eyebrow", "title"] },
  AtlasCard: { template: '<div><slot /></div>', props: ["interactive", "padding"] },
  AtlasAlert: { template: '<div data-error class="alert">{{ title }}</div>', props: ["severity", "title"] },
  AtlasProgressCircular: { template: '<div class="progress" />', props: ["indeterminate"] },
  AtlasIconButton: { template: '<button v-bind="$attrs" />', props: ["icon", "ariaLabel"] },
  AtlasButton: { template: '<button v-bind="$attrs"><slot /></button>', props: ["variant"] },
  AtlasDialog: { template: '<div v-if="modelValue"><slot /></div>', props: ["modelValue", "title", "maxWidth", "showClose"] },
  AtlasAutocomplete: { template: '<div />', props: ["modelValue", "items", "label", "placeholder", "clearable"] },
}));

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }] });

const mountOptions = () => ({
  props: { dataset: "ds1" },
  global: { plugins: [createVuetify({ components }), createTestingPinia(), router], stubs: { RouterLink: { template: '<a v-bind="$attrs" data-rt-card><slot /></a>', props: ["to"] } } },
});

it("renders only cards for resource types with count > 0", async () => {
  mockGetResourceTypes.mockResolvedValueOnce(["Patient", "Observation", "Questionnaire"]);
  mockGetCounts.mockResolvedValueOnce({ counts: { Patient: 2, Observation: 1, Questionnaire: 0 } });
  const w = mount(ResourceBrowser, mountOptions());
  await flushPromises();
  expect(w.findAll('[data-rt-card]').length).toBe(2);
});

it("hides resource types with count 0 (Questionnaire hidden)", async () => {
  mockGetResourceTypes.mockResolvedValueOnce(["Patient", "Observation", "Questionnaire"]);
  mockGetCounts.mockResolvedValueOnce({ counts: { Patient: 2, Observation: 1, Questionnaire: 0 } });
  const w = mount(ResourceBrowser, mountOptions());
  await flushPromises();
  const cards = w.findAll('[data-rt-card]');
  const cardTexts = cards.map((c) => c.text());
  expect(cardTexts.some((t) => t.includes("Questionnaire"))).toBe(false);
});

it("shows [data-new-resource] button", async () => {
  const w = mount(ResourceBrowser, mountOptions());
  await flushPromises();
  expect(w.find('[data-new-resource]').exists()).toBe(true);
});

it("shows error alert when getResourceTypes rejects", async () => {
  mockGetResourceTypes.mockRejectedValueOnce(new Error("Server unavailable"));
  const w = mount(ResourceBrowser, mountOptions());
  await flushPromises();
  expect(w.find('[data-error]').exists()).toBe(true);
  expect(w.findAll('[data-rt-card]').length).toBe(0);
});
