import { it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import QuestionnaireBuilder from "./QuestionnaireBuilder.vue";

const client = {
  read: vi.fn().mockResolvedValue({
    resourceType: "Questionnaire",
    id: "intake",
    title: "Intake",
    status: "draft",
    item: [{ linkId: "a", text: "Name", type: "string" }],
  }),
  update: vi.fn().mockResolvedValue({}),
};
vi.mock("@/composables/useFhir", () => ({ useFhir: () => ({ client, profile: {} }) }));

it("shows the item editor and a live preview", async () => {
  const w = mount(QuestionnaireBuilder, {
    props: { dataset: "ds1", id: "intake" },
    global: { plugins: [createVuetify({ components })], stubs: { RouterLink: true } },
  });
  await flushPromises();
  expect(w.find('[data-builder-edit]').exists()).toBe(true);
  expect(w.find('[data-builder-preview]').exists()).toBe(true);
  expect(w.find('[data-q="a"]').exists()).toBe(true); // preview rendered the item
});
