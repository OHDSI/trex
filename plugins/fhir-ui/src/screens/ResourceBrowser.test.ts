import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import ResourceBrowser from "./ResourceBrowser.vue";

vi.mock("@/composables/useFhir", () => ({
  useFhir: () => ({
    client: {},
    profile: {
      getResourceTypes: vi.fn().mockResolvedValue(["Patient", "Observation", "Questionnaire"]),
      getSearchParams: vi.fn().mockResolvedValue([]),
    },
  }),
}));

it("renders a card per resource type", async () => {
  const w = mount(ResourceBrowser, {
    props: { dataset: "ds1" },
    global: { plugins: [createVuetify({ components }), createTestingPinia()], stubs: { RouterLink: true } },
  });
  await flushPromises();
  expect(w.findAll('[data-rt-card]').length).toBe(3);
});
