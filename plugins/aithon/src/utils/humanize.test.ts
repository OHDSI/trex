import { describe, it, expect } from "vitest";
import { humanize } from "./humanize";

describe("humanize", () => {
  it('converts "birthDate" to "Birth date"', () => {
    expect(humanize("birthDate")).toBe("Birth date");
  });

  it('converts "Patient.postalCode" to "Postal code"', () => {
    expect(humanize("Patient.postalCode")).toBe("Postal code");
  });

  it('converts "Patient.name" to "Name"', () => {
    expect(humanize("Patient.name")).toBe("Name");
  });

  it('converts plain snake_case to readable', () => {
    expect(humanize("given_name")).toBe("Given name");
  });
});
