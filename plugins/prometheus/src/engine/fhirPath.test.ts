import { describe, it, expect } from "vitest";
import { getAt, setAt } from "./fhirPath";

describe("fhirPath", () => {
  it("gets a nested value", () => {
    expect(getAt({ name: [{ family: "Smith" }] }, ["name", 0, "family"])).toBe("Smith");
  });
  it("sets a nested value immutably-ish, creating containers", () => {
    const obj: any = {};
    setAt(obj, ["name", 0, "family"], "Jones");
    expect(obj.name[0].family).toBe("Jones");
  });
});
