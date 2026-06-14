import { describe, it, expect } from "vitest";
import { formatFhirValue } from "./fhirDisplay";

describe("formatFhirValue", () => {
  it("formats HumanName with family and given", () => {
    expect(formatFhirValue({ family: "Müller", given: ["Anna"] })).toBe("Anna Müller");
  });

  it("formats HumanName with prefix", () => {
    expect(formatFhirValue({ prefix: ["Dr."], given: ["Anna"], family: "Müller" })).toBe("Dr. Anna Müller");
  });

  it("formats boolean true as 'Yes'", () => {
    expect(formatFhirValue(true)).toBe("Yes");
  });

  it("formats boolean false as 'No'", () => {
    expect(formatFhirValue(false)).toBe("No");
  });

  it("formats CodeableConcept with text", () => {
    expect(formatFhirValue({ text: "Body weight" })).toBe("Body weight");
  });

  it("formats CodeableConcept with coding display", () => {
    expect(formatFhirValue({ coding: [{ display: "Body weight", code: "29463-7" }] })).toBe("Body weight");
  });

  it("formats Coding with display", () => {
    expect(formatFhirValue({ display: "Oral", code: "PO" })).toBe("Oral");
  });

  it("formats Coding with code only", () => {
    expect(formatFhirValue({ code: "PO" })).toBe("PO");
  });

  it("formats Quantity", () => {
    expect(formatFhirValue({ value: 70, unit: "kg" })).toBe("70 kg");
  });

  it("formats Reference", () => {
    expect(formatFhirValue({ reference: "Patient/p1" })).toBe("Patient/p1");
  });

  it("returns empty string for unknown object", () => {
    expect(formatFhirValue({ foo: "bar" })).toBe("");
  });

  it("returns empty string for null", () => {
    expect(formatFhirValue(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatFhirValue(undefined)).toBe("");
  });

  it("returns plain string unchanged", () => {
    expect(formatFhirValue("hello")).toBe("hello");
  });

  it("converts number to string", () => {
    expect(formatFhirValue(42)).toBe("42");
  });

  it("formats array of HumanNames joined", () => {
    expect(
      formatFhirValue([
        { family: "Müller", given: ["Anna"] },
        { family: "Schmidt", given: ["Bob"] },
      ])
    ).toBe("Anna Müller, Bob Schmidt");
  });

  it("filters empty items from array", () => {
    expect(formatFhirValue(["hello", null, "world"])).toBe("hello, world");
  });

  it("formats Period", () => {
    expect(formatFhirValue({ start: "2020-01-01", end: "2021-01-01" })).toBe("2020-01-01 – 2021-01-01");
  });

  it("formats Address with city and line", () => {
    expect(formatFhirValue({ line: ["123 Main St"], city: "Springfield", postalCode: "12345" })).toBe(
      "123 Main St, Springfield, 12345"
    );
  });
});
