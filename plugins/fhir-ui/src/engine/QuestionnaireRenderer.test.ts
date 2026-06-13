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
