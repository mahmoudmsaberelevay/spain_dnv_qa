import { describe, expect, it } from "vitest";
import {
  CLIENT_PORTAL_MAX_DOCUMENTATION_ASSIGNMENTS,
  isValidClientPortalDocumentationAssignment,
} from "../shared/clientPortalDocumentationAssignments";
import {
  clientPortalCreateAccountInput,
  clientPortalDocumentationAssignmentInput,
} from "./clientPortalAdminRouter";
import { replaceClientPortalAssignments } from "./clientPortalAssignmentService";

const allListedCaseIds = Array.from(
  { length: CLIENT_PORTAL_MAX_DOCUMENTATION_ASSIGNMENTS },
  (_, index) => index + 1,
);

const validAccountInput = {
  caseIds: allListedCaseIds,
  primaryCaseId: 1,
  username: "full.client.access",
  email: "full.client.access@example.com",
  password: "Elevay!2026Safe",
  locale: "en" as const,
};

describe("Client Portal full listed documentation access", () => {
  it("accepts an explicit assignment for every listed Client Documentation folder", () => {
    expect(isValidClientPortalDocumentationAssignment(allListedCaseIds, 1)).toBe(true);
    expect(clientPortalCreateAccountInput.safeParse(validAccountInput).success).toBe(true);
    expect(
      clientPortalDocumentationAssignmentInput.safeParse({
        portalUserPublicId: "00000000-0000-4000-8000-000000000001",
        caseIds: allListedCaseIds,
        primaryCaseId: 1,
      }).success,
    ).toBe(true);
  });

  it("rejects only requests beyond the explicit bounded listing", async () => {
    const tooManyCaseIds = [...allListedCaseIds, CLIENT_PORTAL_MAX_DOCUMENTATION_ASSIGNMENTS + 1];
    expect(isValidClientPortalDocumentationAssignment(tooManyCaseIds, 1)).toBe(false);
    expect(clientPortalCreateAccountInput.safeParse({ ...validAccountInput, caseIds: tooManyCaseIds }).success).toBe(false);
    expect(
      clientPortalDocumentationAssignmentInput.safeParse({
        portalUserPublicId: "00000000-0000-4000-8000-000000000001",
        caseIds: tooManyCaseIds,
        primaryCaseId: 1,
      }).success,
    ).toBe(false);
    await expect(
      replaceClientPortalAssignments({
        portalUserPublicId: "00000000-0000-4000-8000-000000000001",
        caseIds: tooManyCaseIds,
        primaryCaseId: 1,
        actorUserId: 1,
        actorName: "ELEVAY Team",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
