import { describe, expect, it } from "vitest";
import { normalizeWeeklyProgramKey, weeklyProgramKeyInput } from "../shared/marketingWeeklyProgramKey";

describe("Weekly plan programme input", () => {
  it("accepts the existing canonical key and normalizes a readable programme name", () => {
    expect(normalizeWeeklyProgramKey("spain_dnv")).toBe("spain_dnv");
    expect(normalizeWeeklyProgramKey("Spain DNV")).toBe("spain_dnv");
    expect(normalizeWeeklyProgramKey(" Malta MPRP ")).toBe("malta_mprp");
    expect(normalizeWeeklyProgramKey("St. Kitts")).toBe("st_kitts");
    expect(normalizeWeeklyProgramKey("Greece-Golden Visa")).toBe("greece_golden_visa");
  });

  it("rejects unsafe or ambiguous characters with an actionable message", () => {
    const invalid = weeklyProgramKeyInput.safeParse("Spain DNV & Malta");
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.error.issues[0]?.message).toContain("Use English letters");
    expect(weeklyProgramKeyInput.safeParse("@malta").success).toBe(false);
    expect(weeklyProgramKeyInput.safeParse(" ").success).toBe(false);
  });
});
