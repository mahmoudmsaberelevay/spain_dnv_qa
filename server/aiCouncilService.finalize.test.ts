import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCouncilDecision: vi.fn(),
  createCouncilOpinion: vi.fn(),
  getCouncilCaseWorkspace: vi.fn(),
  getLatestCouncilOpinion: vi.fn(),
  getNextCouncilOpinionAttempt: vi.fn(),
  updateCouncilCase: vi.fn(),
  updateCouncilOpinion: vi.fn(),
  requestOpenAiJson: vi.fn(),
}));

vi.mock("./aiCouncilDb", () => ({
  COUNCIL_ROLES: ["strategy", "critical_review", "research_execution", "financial", "opposition", "chairperson"],
  createCouncilDecision: mocks.createCouncilDecision,
  createCouncilOpinion: mocks.createCouncilOpinion,
  getCouncilCaseWorkspace: mocks.getCouncilCaseWorkspace,
  getCouncilOpinionByExternalTaskId: vi.fn(),
  getLatestCouncilOpinion: mocks.getLatestCouncilOpinion,
  getNextCouncilOpinionAttempt: mocks.getNextCouncilOpinionAttempt,
  updateCouncilCase: mocks.updateCouncilCase,
  updateCouncilOpinion: mocks.updateCouncilOpinion,
}));
vi.mock("./aiCouncilProviders", () => ({
  chairDecisionJsonSchema: {},
  chairDecisionSchema: {},
  createManusCouncilTask: vi.fn(),
  formatSpecialistOpinion: vi.fn(),
  getManusTaskEvents: vi.fn(),
  requestAnthropicJson: vi.fn(),
  requestOpenAiJson: mocks.requestOpenAiJson,
  specialistOpinionJsonSchema: {},
  specialistOpinionSchema: { parse: vi.fn() },
}));

import { finalizeCouncilDecision } from "./aiCouncilService";

describe("Administrative AI Council finalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const specialistOpinions = ["strategy", "critical_review", "research_execution", "financial", "opposition"].map((role, index) => ({
      id: index + 1,
      role,
      provider: role === "research_execution" ? "Manus" : "OpenAI",
      status: "completed",
      structuredContent: { executiveSummary: `${role} completed` },
      content: `${role} completed`,
    }));
    mocks.getCouncilCaseWorkspace.mockResolvedValue({
      councilCase: { id: 1, title: "Program expansion", brief: "Assess a proposed program expansion.", financialAssumptions: "Budget pending", status: "ready_for_decision" },
      opinions: specialistOpinions,
      decision: undefined,
    });
    mocks.getNextCouncilOpinionAttempt.mockResolvedValue(1);
    mocks.createCouncilOpinion.mockResolvedValue({ id: 90, role: "chairperson", status: "running" });
    mocks.requestOpenAiJson.mockResolvedValue({
      decision: "proceed_with_conditions",
      confidence: 78,
      summary: "Proceed once the listed safeguards are met.",
      rationale: "The specialist opinions agree on the strategic path but require budget evidence.",
      conditions: ["Approve the budget."],
      nextSteps: ["Assign a delivery owner."],
      unresolvedConflicts: "No unresolved material conflict.",
    });
    mocks.updateCouncilOpinion.mockResolvedValue({ id: 90, role: "chairperson", status: "completed" });
    mocks.createCouncilDecision.mockResolvedValue({ id: 44, decision: "proceed_with_conditions" });
    mocks.updateCouncilCase.mockResolvedValue(undefined);
  });

  it("stores the governance decision separately and updates only the dedicated Chairperson opinion", async () => {
    await expect(finalizeCouncilDecision(1, 3)).resolves.toMatchObject({ id: 44 });

    expect(mocks.createCouncilDecision).toHaveBeenCalledWith(expect.objectContaining({
      councilCaseId: 1,
      chairOpinionId: 90,
      finalizedByUserId: 3,
      decision: "proceed_with_conditions",
    }));
    expect(mocks.updateCouncilOpinion).toHaveBeenCalledWith(90, expect.objectContaining({ status: "completed" }));
    expect(mocks.updateCouncilOpinion.mock.calls.every(([opinionId]) => opinionId === 90)).toBe(true);
    expect(mocks.updateCouncilCase).toHaveBeenCalledWith(1, { status: "finalized" });
  });
});
