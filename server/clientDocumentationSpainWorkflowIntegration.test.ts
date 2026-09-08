import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const schema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");
const migration = readFileSync(resolve(root, "drizzle/0067_client_documentation_spain_milestones.sql"), "utf8");
const router = readFileSync(resolve(root, "server/routers.ts"), "utf8");
const service = readFileSync(resolve(root, "server/clientDocumentationSpainWorkflow.ts"), "utf8");
const profile = readFileSync(resolve(root, "client/src/pages/ClientDocDetail.tsx"), "utf8");
const documentRow = readFileSync(resolve(root, "client/src/components/ClientDocumentWorkflowRow.tsx"), "utf8");
const milestones = readFileSync(resolve(root, "client/src/components/ClientDocumentationSpainMilestones.tsx"), "utf8");
const dashboard = readFileSync(resolve(root, "client/src/pages/ClientDocsDashboard.tsx"), "utf8");
const portal = readFileSync(resolve(root, "server/clientPortalRoutes.ts"), "utf8");

describe("Client Documentation Spain workflow integration", () => {
  it("adds every requested additive case and document field", () => {
    for (const field of ["documentLink", "mofaSubmitted", "mofaReceived", "embassySubmitted", "embassyReceived", "spainTeamReceivedDate", "submissionReceiptLink", "approvalLetterLink", "travelDate", "ticketLink", "hotelLink", "arrivalConfirmedDate", "biometricsAppointmentDate", "bankAccountCompletedDate", "residencyCardReadyDate"]) {
      expect(schema).toContain(field);
    }
    expect(schema).toContain('"spain_team_received"');
  });

  it("conservatively maps completed legacy attestations and never deletes history", () => {
    expect(migration).toContain("`mofaSubmitted` = TRUE");
    expect(migration).toContain("`mofaReceived` = TRUE");
    expect(migration).toContain("`embassySubmitted` = TRUE");
    expect(migration).toContain("`embassyReceived` = TRUE");
    expect(migration).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
  });

  it("protects workflow actions behind authenticated procedures and audit logs", () => {
    for (const procedure of ["setDocumentLink", "recordDocumentAuthorityMilestone", "recordSpainMilestone", "updateStage"]) {
      expect(router).toContain(`${procedure}: protectedProcedure`);
    }
    expect(router).toContain("writeAuditLog");
    expect(router).toContain("Record Submitted to MOFA and Received from MOFA separately for each document");
    expect(router).toContain("Record Submitted to Embassy and Received from Embassy separately for each document");
    expect(service).toContain("DOCUMENT_NOT_RECEIVED");
    expect(service).toContain("MOFA_NOT_RECEIVED");
    expect(service).toContain("SPAIN_TEAM_NOT_RECEIVED");
    expect(service).toContain("APPLICATION_NOT_APPROVED");
  });

  it("renders document links and four separate authority lifecycle actions", () => {
    expect(profile).toContain("ClientDocumentWorkflowRow");
    expect(documentRow).toContain("Document Drive Link");
    expect(profile).not.toContain('action: "submission" as ActionType');
    expect(profile).not.toContain('activeAction === "mofa"');
    expect(profile).not.toContain('activeAction === "embassy"');
    for (const label of ["Submitted to MOFA", "Received from MOFA", "Submitted to Embassy", "Received from Embassy"]) {
      expect(documentRow).toContain(label);
    }
  });

  it("renders every requested Spain milestone and required evidence link", () => {
    expect(profile).toContain("Spain Team Received");
    expect(profile).toContain("Submission Receipt Link");
    expect(profile).toContain("Approval Letter Link");
    for (const label of ["Submitted to Spanish Sworn Translator", "Travel to Spain", "Arrival Confirmed", "Biometrics Appointment", "Biometrics Completed", "Bank Account Completed", "Residency Card Ready for Collection"]) {
      expect(milestones).toContain(label);
    }
    expect(milestones).toContain("Ticket Drive link");
    expect(milestones).toContain("Hotel Drive link");
  });

  it("updates reports and authorized Client Portal projections for the new stage and milestones", () => {
    expect(dashboard).toContain('spain_team_received');
    expect(router).toContain("mofaReceived || d.mofaAttested");
    expect(router).toContain("embassyReceived || d.embassyAttested");
    expect(portal).toContain('key: "spain_team_received"');
    expect(portal).toContain("documentLink: clientDocuments.documentLink");
    expect(portal).toContain("submissionReceipt: owned.clientCase.submissionReceiptLink");
    expect(portal).toContain("residencyCardReadyDate");
  });
});
