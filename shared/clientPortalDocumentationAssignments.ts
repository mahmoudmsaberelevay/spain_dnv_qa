export const CLIENT_PORTAL_MAX_DOCUMENTATION_ASSIGNMENTS = 1_000;

/**
 * Client Portal access is always an explicit, auditable list of Client
 * Documentation folders. This permits full access to every folder shown in
 * the administration screen while preventing unbounded request payloads.
 */
export function isValidClientPortalDocumentationAssignment(
  caseIds: readonly number[],
  primaryCaseId: number,
) {
  return (
    caseIds.length >= 1 &&
    caseIds.length <= CLIENT_PORTAL_MAX_DOCUMENTATION_ASSIGNMENTS &&
    caseIds.includes(primaryCaseId)
  );
}
