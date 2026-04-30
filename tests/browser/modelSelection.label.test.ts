import { describe, expect, it } from "vitest";
import {
  buildModelMatchersLiteralForTest,
  buildModelSelectionExpressionForTest,
} from "../../src/browser/actions/modelSelection.js";

const expectSome = (arr: string[], predicate: (s: string) => boolean) => {
  expect(arr.some(predicate)).toBe(true);
};

describe("browser model selection arbitrary labels", () => {
  it("accepts custom label tokens (e.g., 5.1 Instant)", () => {
    const { labelTokens, testIdTokens } = buildModelMatchersLiteralForTest("5.1 Instant");
    expectSome(labelTokens, (t) => t.includes("5.1"));
    expectSome(labelTokens, (t) => t.includes("instant"));
    // We still generate reasonable testid-based hints for 5.1 models
    expectSome(testIdTokens, (t) => t.includes("gpt-5-1"));
  });

  it("accepts Thinking label", () => {
    const { labelTokens } = buildModelMatchersLiteralForTest("Thinking");
    expectSome(labelTokens, (t) => t.includes("thinking"));
  });

  it("accepts Extended Pro as an exact picker label", () => {
    const { labelTokens, testIdTokens } = buildModelMatchersLiteralForTest("Extended Pro");
    expectSome(labelTokens, (t) => t.includes("extended"));
    expectSome(labelTokens, (t) => t.includes("pro"));
    expectSome(testIdTokens, (t) => t.includes("extended-pro"));
  });

  it("does not allow Extended Pro to fall back to a generic Pro option", () => {
    const expression = buildModelSelectionExpressionForTest("Extended Pro");
    expect(expression).toContain("const wantsExtended = normalizedTarget.includes('extended')");
    expect(expression).toContain("wantsExtended && !normalizedText.includes('extended')");
  });
});
