import { describe, it, expect } from "vitest";
import { vuetify } from "./vuetify";

describe("vuetify theme", () => {
  it("uses the teal primary override", () => {
    const light = vuetify.theme.themes.value.light;
    expect(light.colors.primary.toLowerCase()).toBe("#0f766e");
  });
});
