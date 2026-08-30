import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import SDFormRenderer from "./SDFormRenderer.vue";
import type { ParsedStructureDefinition } from "@/types/fhir";

vi.mock("@atlas-ui", () => ({
  AtlasTextField: { template: '<input :data-atlas-text-field="label" :value="modelValue" />', props: ["modelValue", "label", "type"] },
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

// B1: primitive repeating array renders editable fields
describe("SDFormRenderer — primitive repeating arrays (B1)", () => {
  const humanNameSD: ParsedStructureDefinition = {
    resourceType: "Patient", kind: "resource", isAbstract: false,
    elements: [
      {
        path: "Patient.name",
        name: "name",
        typeCodes: ["HumanName"],
        min: 1,
        max: "*",
        isArray: true,
        isChoice: false,
        children: [
          // given is a primitive string[] inside HumanName
          {
            path: "Patient.name.given",
            name: "given",
            typeCodes: ["string"],
            min: 0,
            max: "*",
            isArray: true,
            isChoice: false,
            children: [], // primitive array — no children
          },
          {
            path: "Patient.name.family",
            name: "family",
            typeCodes: ["string"],
            min: 0,
            max: "1",
            isArray: false,
            isChoice: false,
            children: [],
          },
        ],
      },
    ],
  };

  it("renders an editable field for each primitive array item", () => {
    const model = {
      resourceType: "Patient",
      name: [{ given: ["Anna"], family: "Smith" }],
    };
    const w = mount(SDFormRenderer, {
      props: { definition: humanNameSD, modelValue: model },
      global: { plugins: [vuetify] },
    });

    // The outer name array renders (complex array)
    expect(w.find('[data-repeat="Patient.name"]').exists()).toBe(true);

    // Inside the name item, given is a primitive array — should have [data-field] for given
    expect(w.find('[data-repeat="Patient.name.given"]').exists()).toBe(true);
    // The primitive item widget should exist and show the value "Anna"
    const input = w.find('[data-repeat="Patient.name.given"] input');
    expect(input.exists()).toBe(true);
    // The mock AtlasTextField renders :value="modelValue", so the input should have value "Anna"
    expect((input.element as HTMLInputElement).value).toBe("Anna");
  });
});

// B2: empty resource shows fields via first-6 fallback
describe("SDFormRenderer — empty-resource progressive disclosure fallback (B2)", () => {
  const allOptionalSD: ParsedStructureDefinition = {
    resourceType: "Observation", kind: "resource", isAbstract: false,
    elements: [
      { path: "Observation.status", name: "status", typeCodes: ["code"], min: 0, max: "1", isArray: false, isChoice: false, children: [] },
      { path: "Observation.code", name: "code", typeCodes: ["CodeableConcept"], min: 0, max: "1", isArray: false, isChoice: false,
        children: [{ path: "Observation.code.text", name: "text", typeCodes: ["string"], min: 0, max: "1", isArray: false, isChoice: false, children: [] }] },
      { path: "Observation.value", name: "value", typeCodes: ["string"], min: 0, max: "1", isArray: false, isChoice: false, children: [] },
    ],
  };

  it("shows fields even when all elements are optional and model is empty", () => {
    const w = mount(SDFormRenderer, {
      props: { definition: allOptionalSD, modelValue: { resourceType: "Observation" } },
      global: { plugins: [vuetify] },
    });

    // At least one data-field or group must be visible (NOT everything hidden behind advanced)
    const hasField = w.find('[data-field]').exists();
    const hasGroup = w.find('.group-card').exists() || w.find('[data-repeat]').exists();
    expect(hasField || hasGroup).toBe(true);
  });
});
