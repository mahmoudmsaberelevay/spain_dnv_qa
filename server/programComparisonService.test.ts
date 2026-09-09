import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeLLM } = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM }));

import {
  comparePrograms,
  PROGRAM_COMPARISON_OPTIONS,
  validateProgramComparisonKeys,
} from "./programComparisonService";

const resultFor = (keys: string[]) => ({
  programs: keys.map(programKey => ({
    programKey,
    governmentCost: "Verify before filing",
    processingTime: "Varies by authority",
    familyIncluded: "Eligible family may apply",
    investmentType: "Qualifying route",
    qualification: "Current rules apply",
    routeToCitizenship: "No guaranteed direct route",
    routeToPR: "Depends on the selected pathway",
    renewal: "Continued eligibility required",
  })),
  summary: "A factual comparison based only on the supplied ELEVAY program data.",
});

describe("programComparisonService", () => {
  beforeEach(() => {
    invokeLLM.mockReset();
  });

  it("offers all 18 shared Residency and Citizenship programs", () => {
    expect(PROGRAM_COMPARISON_OPTIONS).toHaveLength(18);
    expect(PROGRAM_COMPARISON_OPTIONS.filter(item => item.category === "residency")).toHaveLength(8);
    expect(PROGRAM_COMPARISON_OPTIONS.filter(item => item.category === "citizenship")).toHaveLength(10);
    expect(PROGRAM_COMPARISON_OPTIONS.find(item => item.key === "spain_dnv")?.labelAr).toContain("إسبانيا");
  });

  it("requires 2 to 6 unique supported program keys", () => {
    expect(() => validateProgramComparisonKeys(["spain_dnv"])).toThrow();
    expect(() => validateProgramComparisonKeys(["spain_dnv", "unknown"])).toThrow();
    expect(() => validateProgramComparisonKeys(["dominica", "dominica"])).toThrow("duplicate_programs");
    expect(validateProgramComparisonKeys(["spain_dnv", "dominica"])).toEqual(["spain_dnv", "dominica"]);
  });

  it("uses GPT-5 mini, strict JSON schema, supplied facts, and Arabic when requested", async () => {
    invokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(resultFor(["spain_dnv", "dominica"])) } }] });

    const result = await comparePrograms({ programKeys: ["spain_dnv", "dominica"], locale: "ar" });
    const request = invokeLLM.mock.calls[0][0];

    expect(request.model).toBe("gpt-5-mini");
    expect(request.response_format.json_schema.strict).toBe(true);
    expect(request.messages[0].content).toContain("Write in Arabic");
    expect(request.messages[1].content).toContain("Official Source:");
    expect(request.messages[1].content).toContain("verify before filing");
    expect(result.programs).toEqual(["spain_dnv", "dominica"]);
    expect(result.locale).toBe("ar");
    expect(result.model).toBe("gpt-5-mini");
    expect(result.disclaimer).toContain("معلوماتية");
  });

  it("rejects malformed or mismatched model output", async () => {
    invokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(resultFor(["spain_dnv", "grenada"])) } }] });
    await expect(comparePrograms({ programKeys: ["spain_dnv", "dominica"] })).rejects.toThrow("comparison_response_program_mismatch");
  });
});
