import { describe, it, expect } from "vitest";
import { vuetify } from "./vuetify";

describe("vuetify theme", () => {
  it("uses the Atlas primary color", () => {
    const light = vuetify.theme.themes.value.light;
    expect(light.colors.primary.toLowerCase()).toBe("#1f425a");
  });
});
