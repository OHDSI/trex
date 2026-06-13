import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import SDFormRenderer from "./SDFormRenderer.vue";
import type { ParsedStructureDefinition } from "@/types/fhir";

vi.mock("@atlas-ui", () => ({
  AtlasTextField: { template: '<input :data-atlas-text-field="label" />', props: ["modelValue", "label", "type"] },
  AtlasSwitch: { template: '<input type="checkbox" :data-atlas-switch="label" />', props: ["modelValue", "label"] },
  AtlasSelect: { template: '<select :data-atlas-select="label" />', props: ["modelValue", "label", "items"] },
  AtlasCard: { template: '<div class="atlas-card"><slot /><slot name="append" /></div>', props: ["padding", "interactive"] },
  AtlasButton: { template: '<button v-bind="$attrs"><slot /></button>', props: ["variant"] },
  AtlasIconButton: { template: '<button v-bind="$attrs" />', props: ["icon"] },
}));

const vuetify = createVuetify({ components });

const patientSD: ParsedStructureDefinition = {
  resourceType: "Patient", kind: "resource", isAbstract: false,
  elements: [
    { path: "Patient.gender", name: "gender", typeCodes: ["code"], min: 0, max: "1", isArray: false, isChoice: false, children: [] },
    { path: "Patient.birthDate", name: "birthDate", typeCodes: ["date"], min: 1, max: "1", isArray: false, isChoice: false, children: [] },
    { path: "Patient.name", name: "name", typeCodes: ["HumanName"], min: 0, max: "*", isArray: true, isChoice: false,
      children: [ { path: "Patient.name.family", name: "family", typeCodes: ["string"], min: 0, max: "1", isArray: false, isChoice: false, children: [] } ] },
  ],
};

function render(model: any) {
  return mount(SDFormRenderer, { props: { definition: patientSD, modelValue: model }, global: { plugins: [vuetify] } });
}

describe("SDFormRenderer", () => {
  it("renders a leaf field per primitive element", () => {
    const w = render({ resourceType: "Patient" });
    expect(w.find('[data-field="Patient.gender"]').exists()).toBe(true);
    expect(w.find('[data-field="Patient.birthDate"]').exists()).toBe(true);
  });

  it("marks a required (min>=1) element", () => {
    const w = render({ resourceType: "Patient" });
    expect(w.find('[data-field="Patient.birthDate"]').attributes("data-required")).toBe("true");
  });

  it("renders a repeating element as an add-able group", () => {
    const w = render({ resourceType: "Patient", name: [{ family: "X" }] });
    expect(w.find('[data-repeat="Patient.name"]').exists()).toBe(true);
    expect(w.find('[data-add="Patient.name"]').exists()).toBe(true);
  });

  it("collapses elements beyond the common set into an advanced section", () => {
    const w = render({ resourceType: "Patient" });
    // birthDate (required) and name (has data) are common; gender (optional, empty) is advanced
    expect(w.find('[data-advanced-toggle]').exists()).toBe(true);
  });
});
