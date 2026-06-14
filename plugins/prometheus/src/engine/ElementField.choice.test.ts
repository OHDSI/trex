import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import SDFormRenderer from "./SDFormRenderer.vue";
import type { ParsedStructureDefinition, ElementInfo } from "@/types/fhir";

vi.mock("@atlas-ui", () => ({
  AtlasTextField: { template: '<input :data-atlas-text-field="label" :value="modelValue" />', props: ["modelValue", "label", "type"] },
  AtlasSwitch: { template: '<input type="checkbox" :data-atlas-switch="label" />', props: ["modelValue", "label"] },
  AtlasSelect: {
    template: '<select :data-atlas-select="label"><option v-for="item in items" :key="item" :value="item">{{ item }}</option></select>',
    props: ["modelValue", "label", "items"],
  },
  AtlasCard: { template: '<div class="atlas-card"><slot /><slot name="append" /></div>', props: ["padding", "interactive"] },
  AtlasButton: { template: '<button v-bind="$attrs"><slot /></button>', props: ["variant"] },
  AtlasIconButton: { template: '<button v-bind="$attrs" />', props: ["icon"] },
}));

const vuetify = createVuetify({ components });

const quantityChildren: ElementInfo[] = [
  { path: "Observation.value.value", name: "value", typeCodes: ["decimal"], min: 0, max: "1", isArray: false, isChoice: false, children: [] },
  { path: "Observation.value.unit", name: "unit", typeCodes: ["string"], min: 0, max: "1", isArray: false, isChoice: false, children: [] },
];

const choiceElement: ElementInfo = {
  path: "Observation.value",
  name: "value",
  typeCodes: ["string", "Quantity"],
  isChoice: true,
  min: 0,
  max: "1",
  isArray: false,
  children: [],
  childrenByType: {
    Quantity: quantityChildren,
  },
};

const observationSD: ParsedStructureDefinition = {
  resourceType: "Observation",
  kind: "resource",
  isAbstract: false,
  elements: [choiceElement],
};

function render(model: any) {
  return mount(SDFormRenderer, {
    props: { definition: observationSD, modelValue: model },
    global: { plugins: [vuetify] },
  });
}

describe("ElementField — choice [x] element (string active)", () => {
  it("renders the choice container with data-choice-type=string when valueString is populated", () => {
    const w = render({ resourceType: "Observation", valueString: "hello" });
    const container = w.find('[data-choice-type="string"]');
    expect(container.exists()).toBe(true);
  });

  it("renders an input with the valueString value when type is string", () => {
    const w = render({ resourceType: "Observation", valueString: "hello" });
    // The primitive widget renders an input via AtlasTextField stub
    const input = w.find('input[data-atlas-text-field]');
    expect(input.exists()).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe("hello");
  });

  it("renders the type picker select with the correct options", () => {
    const w = render({ resourceType: "Observation", valueString: "hello" });
    const typeSelect = w.find('select[data-atlas-select="Value type"]');
    expect(typeSelect.exists()).toBe(true);
    const options = typeSelect.findAll("option");
    const optionValues = options.map((o) => o.element.value);
    expect(optionValues).toContain("string");
    expect(optionValues).toContain("Quantity");
  });
});

describe("ElementField — choice [x] element (Quantity active)", () => {
  it("renders the choice container with data-choice-type=Quantity when valueQuantity is populated", () => {
    const w = render({ resourceType: "Observation", valueQuantity: { value: 72, unit: "kg" } });
    const container = w.find('[data-choice-type="Quantity"]');
    expect(container.exists()).toBe(true);
  });

  it("renders Quantity sub-fields (value and unit) from childrenByType", () => {
    const w = render({ resourceType: "Observation", valueQuantity: { value: 72, unit: "kg" } });
    // The Quantity children should be rendered via ElementField recursion
    // value child renders a data-field for Observation.value.value
    const valueField = w.find('[data-field="Observation.value.value"]');
    expect(valueField.exists()).toBe(true);
    // unit child renders a data-field for Observation.value.unit
    const unitField = w.find('[data-field="Observation.value.unit"]');
    expect(unitField.exists()).toBe(true);
  });

  it("shows the unit value in the unit input", () => {
    const w = render({ resourceType: "Observation", valueQuantity: { value: 72, unit: "kg" } });
    const inputs = w.findAll('input[data-atlas-text-field]');
    const unitInput = inputs.find((i) => (i.element as HTMLInputElement).value === "kg");
    expect(unitInput).toBeDefined();
  });
});

describe("ElementField — choice [x] progressive disclosure", () => {
  it("treats a populated choice (valueString) as having a value for disclosure", () => {
    // With valueString set the element should appear in common, not only advanced
    const w = render({ resourceType: "Observation", valueString: "test" });
    // If correctly in common, the choice container is visible (not hidden behind advanced toggle)
    const container = w.find('[data-choice-type]');
    expect(container.exists()).toBe(true);
  });

  it("spans full width (span-2) for choice elements", () => {
    const w = render({ resourceType: "Observation", valueString: "hello" });
    const cell = w.find('.sd-form-cell.span-2');
    expect(cell.exists()).toBe(true);
  });
});
