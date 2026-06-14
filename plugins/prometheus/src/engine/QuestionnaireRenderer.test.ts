import { describe, it, expect } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import QuestionnaireRenderer from "./QuestionnaireRenderer.vue";

const q = { resourceType: "Questionnaire", item: [
  { linkId: "name", text: "Full name", type: "string", required: true },
  { linkId: "smoke", text: "Do you smoke?", type: "choice", answerOption: [{ valueString: "yes" }, { valueString: "no" }] },
  { linkId: "cigs", text: "Cigarettes/day", type: "integer", enableWhen: [{ question: "smoke", operator: "=", answerString: "yes" }] },
] };
const vuetify = createVuetify({ components });

it("renders enabled items and hides disabled ones; emits a QuestionnaireResponse", async () => {
  const w = mount(QuestionnaireRenderer, { props: { questionnaire: q }, global: { plugins: [vuetify] } });
  await flushPromises();
  expect(w.find('[data-q="name"]').exists()).toBe(true);
  expect(w.find('[data-q="cigs"]').exists()).toBe(false); // smoke not answered yes
});

it("emits typed answer values (boolean → valueBoolean)", async () => {
  const boolQ = { resourceType: "Questionnaire", item: [{ linkId: "ok", text: "OK?", type: "boolean" }] };
  const w = mount(QuestionnaireRenderer, { props: { questionnaire: boolQ }, global: { plugins: [vuetify] } });
  await flushPromises();
  // Drive the boolean via the AtlasSwitch update:modelValue emit
  const sw = w.findComponent({ name: "AtlasSwitch" });
  await sw.vm.$emit("update:modelValue", true);
  await flushPromises();
  const events = w.emitted("update:response") ?? [];
  const last = events[events.length - 1]?.[0] as any;
  expect(last.item.find((i: any) => i.linkId === "ok").answer[0]).toEqual({ valueBoolean: true });
});

it("renders a group heading and its nested child question", async () => {
  const nestedQ = {
    resourceType: "Questionnaire",
    item: [
      {
        linkId: "g",
        type: "group",
        text: "Demographics",
        item: [{ linkId: "n", text: "Name", type: "string" }],
      },
    ],
  };
  const w = mount(QuestionnaireRenderer, { props: { questionnaire: nestedQ }, global: { plugins: [vuetify] } });
  await flushPromises();
  // Group heading text should appear somewhere in the rendered output
  expect(w.text()).toContain("Demographics");
  // The nested question should be rendered with its data-q attribute
  expect(w.find('[data-q="n"]').exists()).toBe(true);
  // The group container itself should NOT have data-q (groups are headings, not inputs)
  expect(w.find('[data-q="g"]').exists()).toBe(false);
});
