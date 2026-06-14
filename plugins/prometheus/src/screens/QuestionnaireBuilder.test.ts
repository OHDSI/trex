import { it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import { createRouter, createMemoryHistory } from "vue-router";
import QuestionnaireBuilder from "./QuestionnaireBuilder.vue";

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }] });

const client = {
  read: vi.fn().mockResolvedValue({
    resourceType: "Questionnaire",
    id: "intake",
    title: "Intake",
    status: "draft",
    item: [{ linkId: "a", text: "Name", type: "string" }],
  }),
  update: vi.fn().mockResolvedValue({}),
  create: vi.fn().mockResolvedValue({ id: "q99" }),
};
vi.mock("@/composables/useFhir", () => ({ useFhir: () => ({ client, profile: {} }) }));

const mountOptions = (id: string) => ({
  props: { dataset: "ds1", id },
  global: { plugins: [createVuetify({ components }), router], stubs: { RouterLink: true } },
});

it("shows the item editor and a live preview", async () => {
  const w = mount(QuestionnaireBuilder, mountOptions("intake"));
  await flushPromises();
  expect(w.find('[data-builder-edit]').exists()).toBe(true);
  expect(w.find('[data-builder-preview]').exists()).toBe(true);
  expect(w.find('[data-q="a"]').exists()).toBe(true); // preview rendered the item
});

it("id=new: does not call client.read and renders a Title field", async () => {
  client.read.mockClear();
  const w = mount(QuestionnaireBuilder, mountOptions("new"));
  await flushPromises();
  expect(client.read).not.toHaveBeenCalled();
  expect(w.find('[data-builder-edit]').exists()).toBe(true);
  // Title field should be present (AtlasTextField with label="Title")
  const html = w.html();
  expect(html).toContain("Title");
});
