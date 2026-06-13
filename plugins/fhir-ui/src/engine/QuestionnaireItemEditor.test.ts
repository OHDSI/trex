import { it, expect } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import QuestionnaireItemEditor from "./QuestionnaireItemEditor.vue";

const items = [{ linkId: "a", text: "Full name", type: "string" }];
const vuetify = createVuetify({ components });

it("renders a row per item and adds a question", async () => {
  const w = mount(QuestionnaireItemEditor, { props: { modelValue: items }, global: { plugins: [vuetify] } });
  await flushPromises();
  expect(w.findAll('[data-q-row]').length).toBe(1);
  await w.find('[data-add-question]').trigger("click");
  await flushPromises();
  expect(w.emitted("update:modelValue")).toBeTruthy();
  const emitted = w.emitted("update:modelValue")!;
  const last = (emitted[emitted.length - 1] as any[])[0];
  expect(last.length).toBe(2);
});

it("renders existing answerOption entries and adds a new option for choice questions", async () => {
  const choiceItems = [{ linkId: "a", text: "Smoke?", type: "choice", answerOption: [{ valueString: "Yes" }] }];
  const w = mount(QuestionnaireItemEditor, { props: { modelValue: choiceItems }, global: { plugins: [vuetify] } });
  await flushPromises();
  // Existing option row renders
  expect(w.find('[data-option-row="0"]').exists()).toBe(true);
  // Click "Add option"
  await w.find('[data-add-option]').trigger("click");
  await flushPromises();
  expect(w.emitted("update:modelValue")).toBeTruthy();
  const emitted = w.emitted("update:modelValue")!;
  const last = (emitted[emitted.length - 1] as any[])[0];
  expect(last[0].answerOption.length).toBe(2);
});

it("renders a nested editor for a group item; clicking nested '+ Add question' adds a child to the group", async () => {
  const groupItems = [{ linkId: "g", text: "Demographics", type: "group", item: [] }];
  const w = mount(QuestionnaireItemEditor, { props: { modelValue: groupItems }, global: { plugins: [vuetify] } });
  await flushPromises();
  // The group row should render
  expect(w.findAll('[data-q-row]').length).toBe(1);
  // There should be at least two [data-add-question] buttons: the nested one (inside card) and the top-level one
  const addBtns = w.findAll('[data-add-question]');
  expect(addBtns.length).toBeGreaterThanOrEqual(2);
  // The nested editor renders inside the group card, so its button comes first in DOM order (index 0)
  await addBtns[0].trigger("click");
  await flushPromises();
  expect(w.emitted("update:modelValue")).toBeTruthy();
  const emitted = w.emitted("update:modelValue")!;
  const last = (emitted[emitted.length - 1] as any[])[0];
  // The top-level array still has 1 item (the group)
  expect(last.length).toBe(1);
  // The group's item array gained a child
  expect(last[0].item.length).toBe(1);
});
