import { describe, it, expect } from "vitest";
import { isEnabled } from "./enableWhen";

describe("enableWhen", () => {
  it("shows when no enableWhen", () => {
    expect(isEnabled({ linkId: "a", type: "string" } as any, {})).toBe(true);
  });
  it("evaluates a single = condition against answers", () => {
    const item = { linkId: "b", type: "integer", enableWhen: [{ question: "smoke", operator: "=", answerString: "yes" }] } as any;
    expect(isEnabled(item, { smoke: "yes" })).toBe(true);
    expect(isEnabled(item, { smoke: "no" })).toBe(false);
  });
});
