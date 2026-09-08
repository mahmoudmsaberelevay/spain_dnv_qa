import { describe, expect, it, vi } from "vitest";
import { generateProgramProposal } from "./marketingProposalService";

const llmResponse = (content: string) => ({
  id: "proposal-test",
  created: 0,
  model: "gemini-3-flash-preview",
  choices: [{
    index: 0,
    message: { role: "assistant" as const, content },
    finish_reason: "stop",
  }],
});

describe("Marketing proposal generation", () => {
  it("uses the current structured-output model and returns an AI proposal", async () => {
    const llm = vi.fn().mockResolvedValue(llmResponse(JSON.stringify({
      programSummary: "A factual programme overview.",
      recommendation: "A careful ELEVAY recommendation.",
    })));

    const result = await generateProgramProposal({ programKey: "dominica", investmentType: "donation", familyMembers: 1 }, llm);

    expect(result.generationMode).toBe("ai");
    expect(result.breakdown.totalCost).toBe(110500);
    expect(llm).toHaveBeenCalledWith(expect.objectContaining({
      model: "gemini-3-flash-preview",
      response_format: expect.objectContaining({ type: "json_schema" }),
    }));
  });

  it("returns a complete deterministic proposal when the AI service is unavailable", async () => {
    const result = await generateProgramProposal(
      { programKey: "grenada", investmentType: "real_estate", familyMembers: 2 },
      vi.fn().mockRejectedValue(new Error("upstream unavailable")),
    );

    expect(result.generationMode).toBe("standard");
    expect(result.programSummary.length).toBeGreaterThan(40);
    expect(result.recommendation).toContain("ELEVAY recommends");
    expect(result.breakdown.totalCost).toBeGreaterThan(result.breakdown.investmentCost);
  });

  it("rejects an unavailable investment route instead of returning an empty proposal", async () => {
    await expect(generateProgramProposal(
      { programKey: "sao_tome", investmentType: "real_estate", familyMembers: 1 },
      vi.fn(),
    )).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
