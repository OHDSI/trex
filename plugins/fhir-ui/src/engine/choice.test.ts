import { describe, it, expect } from "vitest";
import { capType, choiceProp, activeChoiceType } from "./choice";

describe("capType", () => {
  it("capitalizes the first character", () => {
    expect(capType("string")).toBe("String");
    expect(capType("Quantity")).toBe("Quantity");
    expect(capType("codeableConcept")).toBe("CodeableConcept");
    expect(capType("boolean")).toBe("Boolean");
  });

  it("handles single character", () => {
    expect(capType("a")).toBe("A");
  });
});

describe("choiceProp", () => {
  it("combines base name with capitalized type", () => {
    expect(choiceProp("value", "string")).toBe("valueString");
    expect(choiceProp("value", "Quantity")).toBe("valueQuantity");
    expect(choiceProp("value", "CodeableConcept")).toBe("valueCodeableConcept");
    expect(choiceProp("value", "boolean")).toBe("valueBoolean");
    expect(choiceProp("onset", "dateTime")).toBe("onsetDateTime");
  });
});

describe("activeChoiceType", () => {
  it("detects the type that is populated in the model", () => {
    const model = { valueQuantity: { value: 72, unit: "kg" } };
    const result = activeChoiceType(model, [], "value", ["string", "Quantity", "boolean"]);
    expect(result).toBe("Quantity");
  });

  it("detects a primitive type that is populated in the model", () => {
    const model = { valueString: "hello" };
    const result = activeChoiceType(model, [], "value", ["string", "Quantity", "boolean"]);
    expect(result).toBe("string");
  });

  it("defaults to the first type when none are set", () => {
    const model = {};
    const result = activeChoiceType(model, [], "value", ["string", "Quantity", "boolean"]);
    expect(result).toBe("string");
  });

  it("uses basePath when traversing nested objects", () => {
    const model = { component: [{ valueBoolean: true }] };
    const result = activeChoiceType(model, ["component", 0], "value", ["string", "boolean"]);
    expect(result).toBe("boolean");
  });

  it("defaults to first type when model is null/empty", () => {
    const result = activeChoiceType({}, [], "value", ["Quantity", "CodeableConcept"]);
    expect(result).toBe("Quantity");
  });
});
