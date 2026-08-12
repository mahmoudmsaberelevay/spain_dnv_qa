import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserModuleAccess: vi.fn(),
  isOwner: vi.fn(),
  listCouncilCases: vi.fn(),
  getCouncilCaseWorkspace: vi.fn(),
  startCouncilReviews: vi.fn(),
  syncManusCouncilOpinion: vi.fn(),
  finalizeCouncilDecision: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("./permissionsRouter", () => ({ getUserModuleAccess: mocks.getUserModuleAccess, isOwner: mocks.isOwner }));
vi.mock("./aiCouncilDb", () => ({ listCouncilCases: mocks.listCouncilCases, getCouncilCaseWorkspace: mocks.getCouncilCaseWorkspace, createCouncilCase: vi.fn(), updateCouncilCase: vi.fn() }));
vi.mock("./aiCouncilService", () => ({ startCouncilReviews: mocks.startCouncilReviews, syncManusCouncilOpinion: mocks.syncManusCouncilOpinion, finalizeCouncilDecision: mocks.finalizeCouncilDecision }));
vi.mock("./auditLog", () => ({ auditCtxFromTrpc: vi.fn(() => ({})), writeAuditLog: mocks.writeAuditLog }));

import { aiCouncilRouter } from "./aiCouncilRouter";

function caller() {
  return aiCouncilRouter.createCaller({
    user: { id: 8, openId: "council-tester", email: "team@elevay.com", name: "Council Tester", role: "user" },
    req: { headers: {} },
    res: {},
  } as any);
}

describe("Administrative AI Council authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isOwner.mockReturnValue(false);
    mocks.getCouncilCaseWorkspace.mockResolvedValue({ councilCase: { id: 1, status: "ready_for_decision" }, opinions: [], decision: undefined });
  });

  it("denies a user with no council access from reading cases", async () => {
    mocks.getUserModuleAccess.mockResolvedValue({ aiCouncil: "none" });
    await expect(caller().list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.listCouncilCases).not.toHaveBeenCalled();
  });

  it("allows a viewer to read, but prevents starting provider reviews", async () => {
    mocks.getUserModuleAccess.mockResolvedValue({ aiCouncil: "viewer" });
    mocks.listCouncilCases.mockResolvedValue([]);
    await expect(caller().list()).resolves.toEqual([]);
    await expect(caller().startReviews({ councilCaseId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.startCouncilReviews).not.toHaveBeenCalled();
  });

  it("allows a full-access user to start reviews and issue the final decision", async () => {
    mocks.getUserModuleAccess.mockResolvedValue({ aiCouncil: "full" });
    mocks.startCouncilReviews.mockResolvedValue({ councilCase: { id: 1, status: "running" }, opinions: [], decision: undefined });
    mocks.finalizeCouncilDecision.mockResolvedValue({ id: 10, decision: "proceed" });

    await expect(caller().startReviews({ councilCaseId: 1 })).resolves.toMatchObject({ councilCase: { status: "running" } });
    await expect(caller().finalizeDecision({ councilCaseId: 1 })).resolves.toMatchObject({ decision: "proceed" });
    expect(mocks.startCouncilReviews).toHaveBeenCalledWith(1);
    expect(mocks.finalizeCouncilDecision).toHaveBeenCalledWith(1, 8);
    expect(mocks.writeAuditLog).toHaveBeenCalledTimes(2);
  });
});
