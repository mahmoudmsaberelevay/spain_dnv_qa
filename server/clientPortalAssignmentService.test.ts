import { describe, expect, it } from "vitest";
import { planClientPortalAssignmentChanges } from "./clientPortalAssignmentService";

describe("Client Portal documentation assignment planning", () => {
  it("soft-revokes removed access, restores historical access, and adds new folders", () => {
    const existing = [
      { id: 11, clientCaseId: 101, accessRevokedAt: null },
      { id: 12, clientCaseId: 102, accessRevokedAt: null },
      { id: 13, clientCaseId: 103, accessRevokedAt: new Date("2026-01-01T00:00:00Z") },
    ];
    expect(planClientPortalAssignmentChanges(existing, [102, 103, 104])).toEqual({
      revokeIds: [11],
      restoreIds: [13],
      addCaseIds: [104],
    });
  });

  it("makes an unchanged selection a no-op", () => {
    const existing = [
      { id: 21, clientCaseId: 201, accessRevokedAt: null },
      { id: 22, clientCaseId: 202, accessRevokedAt: null },
    ];
    expect(planClientPortalAssignmentChanges(existing, [201, 202])).toEqual({ revokeIds: [], restoreIds: [], addCaseIds: [] });
  });
});
