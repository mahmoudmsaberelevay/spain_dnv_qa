import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), getDb: vi.fn() }));

vi.mock("./db", () => ({ getDb: mocks.getDb }));

import { createCouncilDecision } from "./aiCouncilDb";

const decisionInput = {
  councilCaseId: 14,
  chairOpinionId: 21,
  decision: "proceed" as const,
  confidence: 80,
  summary: "Proceed with the recorded safeguards.",
  rationale: "The specialist views are sufficiently aligned.",
  conditions: ["Approve the budget"],
  nextSteps: ["Assign delivery owner"],
  unresolvedConflicts: "No material conflict remains.",
  finalizedByUserId: 3,
};

describe("Administrative AI Council decision persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists a Chairperson decision separately after confirming no prior final decision exists", async () => {
    const storedDecision = { id: 44, ...decisionInput };
    mocks.select
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [storedDecision] }) }) });
    mocks.insert.mockReturnValue({ values: async () => [{ insertId: 44 }] });
    mocks.getDb.mockResolvedValue({ select: mocks.select, insert: mocks.insert });

    await expect(createCouncilDecision(decisionInput)).resolves.toEqual(storedDecision);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0][0]).toBeDefined();
  });

  it("prevents a duplicate final decision from overwriting the existing governance record", async () => {
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{ id: 43, ...decisionInput }] }) }) });
    mocks.getDb.mockResolvedValue({ select: mocks.select, insert: mocks.insert });

    await expect(createCouncilDecision(decisionInput)).rejects.toThrow("already exists");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
