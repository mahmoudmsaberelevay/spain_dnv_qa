import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./clientChatService.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../client/src/components/ClientDocumentationEmployeeAccess.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../client/src/pages/ClientDocDetail.tsx", import.meta.url), "utf8");

describe("Client Documentation Employees with access", () => {
  it("requires full Client Documentation access to manage folder employees", () => {
    expect(service).toContain('access.clientDocs !== "full"');
    expect(service).toContain("Full Client Documentation access is required to manage employees");
    expect(service).toContain('access.clientDocs === "full"');
    expect(service).toContain("Every selected employee must have full Client Documentation access");
  });

  it("uses existing chat participants as the authoritative folder access list", () => {
    expect(service).toContain("listClientDocumentationEmployeeAccess");
    expect(service).toContain("updateClientDocumentationEmployeeAccess");
    expect(service).toContain('participantType: "staff"');
    expect(service).toContain('status: "active"');
    expect(service).toContain('canViewInternal: true');
    expect(service).toContain('status: "revoked"');
  });

  it("protects the creator, manager, consultant, and paralegal from accidental removal", () => {
    expect(service).toContain("clientCase.userId");
    expect(service).toContain("resolveAssignedStaff(db, clientCase.consultant, clientCase.paralegal)");
    expect(service).toContain("const targetIds = new Set<number>");
    expect(component).toContain("The creator, assigned consultant, and assigned paralegal remain protected");
    expect(component).toContain("employee.mandatory");
  });

  it("exposes audited protected list and bulk update procedures", () => {
    expect(router).toContain("employeeAccess: protectedProcedure");
    expect(router).toContain("updateEmployeeAccess: protectedProcedure");
    expect(router).toContain('z.array(z.number().int().positive()).max(100)');
    expect(service).toContain('action: "folder_employee_access_updated"');
    expect(service).toContain('eventType: "participant_changed"');
  });

  it("renders a searchable multi-select after the folder is created", () => {
    expect(detail).toContain("<ClientDocumentationEmployeeAccess clientCaseId={clientId} />");
    expect(component).toContain("Employees with access");
    expect(component).toContain("Choose employees");
    expect(component).toContain("Search employee name or email");
    expect(component).toContain("Selected employees can open this Client Documentation folder and participate in its Chat");
  });
});
