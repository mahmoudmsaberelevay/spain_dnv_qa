import { describe, expect, it } from "vitest";
import { SPECIALIST_ROLES } from "./aiCouncilService";

describe("Administrative AI Council orchestration module", () => {
  it("loads the independent specialist role configuration", () => {
    expect(SPECIALIST_ROLES).toEqual([
      "strategy",
      "critical_review",
      "research_execution",
      "financial",
      "opposition",
    ]);
  });
});
