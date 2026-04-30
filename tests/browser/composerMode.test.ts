import { describe, expect, test, vi } from "vitest";
import {
  buildComposerModeExpressionForTest,
  ensureComposerMode,
} from "../../src/browser/actions/composerMode.js";

describe("composer mode selection", () => {
  test("builds a Deep research selector expression", () => {
    const expression = buildComposerModeExpressionForTest("deep-research");
    expect(expression).toContain("Deep research");
    expect(expression).toContain("deep research");
    expect(expression).toContain("dispatchClickSequence");
  });

  test("logs successful selection", async () => {
    const Runtime = {
      evaluate: vi.fn(async () => ({
        result: { value: { status: "switched", label: "Deep research" } },
      })),
    };
    const logger = vi.fn();

    await ensureComposerMode(Runtime as never, "deep-research", logger as never);

    expect(Runtime.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        awaitPromise: true,
        returnByValue: true,
      }),
    );
    expect(logger).toHaveBeenCalledWith("Composer mode: Deep research");
  });

  test("throws with available options when Deep research is missing", async () => {
    const Runtime = {
      evaluate: vi.fn(async () => ({
        result: { value: { status: "option-not-found", availableOptions: ["Create image"] } },
      })),
    };
    const logger = vi.fn();

    await expect(
      ensureComposerMode(Runtime as never, "deep-research", logger as never),
    ).rejects.toThrow(/Available options: Create image/);
  });
});
