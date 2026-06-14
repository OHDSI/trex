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

  describe("enableBehavior", () => {
    const twoConditions = [
      { question: "q1", operator: "=", answerString: "a" },
      { question: "q2", operator: "=", answerString: "b" },
    ];

    it('enableBehavior "any": enabled when EITHER condition matches', () => {
      const item = { linkId: "x", type: "string", enableWhen: twoConditions, enableBehavior: "any" } as any;
      // Neither match → disabled
      expect(isEnabled(item, { q1: "no", q2: "no" })).toBe(false);
      // Only q1 matches → enabled
      expect(isEnabled(item, { q1: "a", q2: "no" })).toBe(true);
      // Only q2 matches → enabled
      expect(isEnabled(item, { q1: "no", q2: "b" })).toBe(true);
      // Both match → enabled
      expect(isEnabled(item, { q1: "a", q2: "b" })).toBe(true);
    });

    it('enableBehavior "all" (explicit): enabled only when BOTH conditions match', () => {
      const item = { linkId: "x", type: "string", enableWhen: twoConditions, enableBehavior: "all" } as any;
      // Only q1 matches → disabled
      expect(isEnabled(item, { q1: "a", q2: "no" })).toBe(false);
      // Only q2 matches → disabled
      expect(isEnabled(item, { q1: "no", q2: "b" })).toBe(false);
      // Both match → enabled
      expect(isEnabled(item, { q1: "a", q2: "b" })).toBe(true);
    });

    it("default (no enableBehavior): behaves like \"all\" — enabled only when BOTH conditions match", () => {
      const item = { linkId: "x", type: "string", enableWhen: twoConditions } as any;
      expect(isEnabled(item, { q1: "a", q2: "no" })).toBe(false);
      expect(isEnabled(item, { q1: "a", q2: "b" })).toBe(true);
    });
  });
});
