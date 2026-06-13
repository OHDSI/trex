import { describe, it, expect } from "vitest";
import { widgetFor } from "./widgetRegistry";
import StringWidget from "./widgets/StringWidget.vue";
import BooleanWidget from "./widgets/BooleanWidget.vue";
import DateWidget from "./widgets/DateWidget.vue";
import CodeWidget from "./widgets/CodeWidget.vue";

describe("widgetRegistry", () => {
  it("maps primitive datatypes to widgets", () => {
    expect(widgetFor("string")).toBe(StringWidget);
    expect(widgetFor("boolean")).toBe(BooleanWidget);
    expect(widgetFor("date")).toBe(DateWidget);
    expect(widgetFor("dateTime")).toBe(DateWidget);
    expect(widgetFor("code")).toBe(CodeWidget);
  });
  it("falls back to StringWidget for unknown primitives", () => {
    expect(widgetFor("uri")).toBe(StringWidget);
  });
  it("returns null for complex types (handled by recursion, not a leaf widget)", () => {
    expect(widgetFor("HumanName")).toBeNull();
  });
});
