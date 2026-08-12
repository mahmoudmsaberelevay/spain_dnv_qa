import { describe, expect, it } from "vitest";
import { prepareThoughtfulArabicScript } from "./elevenLabsTts";

describe("prepareThoughtfulArabicScript", () => {
  it("adds the approved thoughtful delivery tag to a plain script", () => {
    expect(prepareThoughtfulArabicScript("السلام عليكم")).toBe("[thoughtful] السلام عليكم");
  });

  it("preserves an existing thoughtful delivery tag", () => {
    expect(prepareThoughtfulArabicScript("[thoughtful] السلام عليكم")).toBe("[thoughtful] السلام عليكم");
  });
});
