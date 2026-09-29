import { describe, expect, it } from "vitest";
import {
  BRAND_DISCOVERY_QUESTIONS,
  BRAND_DISCOVERY_TOTAL_QUESTIONS,
  buildBrandBookProposal,
  calculateNextBrandDiscoveryQuestion,
  getBrandDiscoveryQuestion,
  isBrandDiscoveryComplete,
} from "../shared/marketingBrandDiscovery";

describe("ELEVAY Brand Discovery contract", () => {
  it("keeps the authoritative 35 questions in exact one-question sequence", () => {
    expect(BRAND_DISCOVERY_TOTAL_QUESTIONS).toBe(35);
    expect(BRAND_DISCOVERY_QUESTIONS.map(question => question.number)).toEqual(Array.from({ length: 35 }, (_, index) => index + 1));
    expect(getBrandDiscoveryQuestion(1).prompt).toBe("In one sentence, what should Elevay be known for?");
    expect(getBrandDiscoveryQuestion(35).prompt).toBe("What should be fixed permanently in the brand system, and where do you want room to experiment?");
    expect(() => getBrandDiscoveryQuestion(36)).toThrow("Invalid Brand Discovery question number");
  });

  it("resumes at the first unanswered question and only completes after all 35", () => {
    expect(calculateNextBrandDiscoveryQuestion([])).toBe(1);
    expect(calculateNextBrandDiscoveryQuestion([1, 2, 4])).toBe(3);
    expect(isBrandDiscoveryComplete(Array.from({ length: 34 }, (_, index) => index + 1))).toBe(false);
    expect(calculateNextBrandDiscoveryQuestion(Array.from({ length: 35 }, (_, index) => index + 1))).toBeNull();
    expect(isBrandDiscoveryComplete(Array.from({ length: 35 }, (_, index) => index + 1))).toBe(true);
  });

  it("keeps unknown answers as owner decision gaps and makes the proposal explicitly unapproved", () => {
    const proposal = buildBrandBookProposal({
      sessionId: 88,
      sessionVersion: 3,
      answers: BRAND_DISCOVERY_QUESTIONS.map(question => ({
        questionNumber: question.number,
        answerText: `answer ${question.number}`,
        decisionStatus: question.number === 10 ? "unknown" : "answered",
      })),
    });

    expect(proposal.status).toBe("proposed");
    expect(proposal.approvals.complete).toBe(false);
    expect(proposal.missingDecisions).toEqual([expect.objectContaining({ questionNumber: 10, owner: "Mahmoud Saber" })]);
    expect(proposal.designTokens.socialRules).toContain("no guarantees");
    expect(proposal.designTokens.socialRules).toContain("no passport imagery");
  });
});
