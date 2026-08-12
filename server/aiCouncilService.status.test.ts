import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCouncilCaseWorkspace: vi.fn(),
  getLatestCouncilOpinion: vi.fn(),
  updateCouncilCase: vi.fn(),
  updateCouncilOpinion: vi.fn(),
  getManusTaskEvents: vi.fn(),
  parseSpecialistOpinion: vi.fn(),
}));

vi.mock("./aiCouncilDb", () => ({
  COUNCIL_ROLES: ["strategy", "critical_review", "research_execution", "financial", "opposition", "chairperson"],
  createCouncilDecision: vi.fn(),
  createCouncilOpinion: vi.fn(),
  getCouncilCaseWorkspace: mocks.getCouncilCaseWorkspace,
  getCouncilOpinionByExternalTaskId: vi.fn(),
  getLatestCouncilOpinion: mocks.getLatestCouncilOpinion,
  getNextCouncilOpinionAttempt: vi.fn(),
  updateCouncilCase: mocks.updateCouncilCase,
  updateCouncilOpinion: mocks.updateCouncilOpinion,
}));
vi.mock("./aiCouncilProviders", () => ({
  chairDecisionJsonSchema: {},
  chairDecisionSchema: {},
  createManusCouncilTask: vi.fn(),
  formatSpecialistOpinion: vi.fn(),
  getManusTaskEvents: mocks.getManusTaskEvents,
  requestAnthropicJson: vi.fn(),
  requestOpenAiJson: vi.fn(),
  specialistOpinionJsonSchema: {},
  specialistOpinionSchema: { parse: mocks.parseSpecialistOpinion },
}));

import { recomputeCouncilCaseStatus, syncManusCouncilOpinion } from "./aiCouncilService";

const specialistRoles = ["strategy", "critical_review", "research_execution", "financial", "opposition"];

describe("Administrative AI Council orchestration status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCouncilCaseWorkspace.mockResolvedValue({ councilCase: { id: 1, status: "running" }, opinions: [], decision: undefined });
    mocks.updateCouncilCase.mockResolvedValue(undefined);
    mocks.updateCouncilOpinion.mockImplementation(async (id: number, update: Record<string, unknown>) => ({ id, ...update }));
  });

  function setLatestStatuses(statuses: Record<string, string | undefined>) {
    mocks.getLatestCouncilOpinion.mockImplementation(async (_caseId: number, role: string) => {
      const status = statuses[role];
      return status ? { role, status } : undefined;
    });
  }

  it("marks a case as awaiting Manus while the asynchronous research task is running", async () => {
    setLatestStatuses({ strategy: "completed", critical_review: "completed", research_execution: "running", financial: "completed", opposition: "completed" });
    await recomputeCouncilCaseStatus(1);
    expect(mocks.updateCouncilCase).toHaveBeenCalledWith(1, { status: "awaiting_manus" });
  });

  it("marks a case ready only once every required specialist output is completed or unavailable", async () => {
    setLatestStatuses(Object.fromEntries(specialistRoles.map((role) => [role, "completed"])));
    await recomputeCouncilCaseStatus(1);
    expect(mocks.updateCouncilCase).toHaveBeenCalledWith(1, { status: "ready_for_decision" });
  });

  it("marks a case failed when a specialist review is unavailable because of an execution failure", async () => {
    setLatestStatuses({ strategy: "completed", critical_review: "failed", research_execution: "completed", financial: "completed", opposition: "completed" });
    await recomputeCouncilCaseStatus(1);
    expect(mocks.updateCouncilCase).toHaveBeenCalledWith(1, { status: "failed" });
  });

  it("records Manus clarification requests as needs-input and surfaces the case for follow-up", async () => {
    let researchStatus = "running";
    mocks.getLatestCouncilOpinion.mockImplementation(async (_caseId: number, role: string) => {
      if (role === "research_execution") return { id: 72, role, status: researchStatus, externalTaskId: "manus-task-72" };
      return { role, status: "completed" };
    });
    mocks.updateCouncilOpinion.mockImplementation(async (id: number, update: Record<string, unknown>) => {
      if (id === 72 && typeof update.status === "string") researchStatus = update.status;
      return { id, ...update };
    });
    mocks.getManusTaskEvents.mockResolvedValue([
      { type: "assistant_message", assistant_message: { content: "Please clarify the proposed revenue assumption." } },
      { type: "status_update", status_update: { agent_status: "waiting" } },
    ]);

    await syncManusCouncilOpinion(1);

    expect(mocks.updateCouncilOpinion).toHaveBeenCalledWith(72, expect.objectContaining({
      status: "needs_input",
      errorCode: "manus_needs_input",
    }));
    expect(mocks.updateCouncilCase).toHaveBeenCalledWith(1, { status: "failed" });
  });
});
