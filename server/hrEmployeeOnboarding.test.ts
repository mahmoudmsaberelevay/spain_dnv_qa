import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { assertHrEmployeeOnboarding } from "../shared/hrEmployeeOnboarding";

describe("HR employee onboarding policy", () => {
  it.each([
    {},
    { crmUserId: null },
    { hrSelfServiceRequired: true, isActive: true, crmUserId: null },
  ])("rejects active staff without their real CRM identity", employee => {
    expect(() => assertHrEmployeeOnboarding(employee)).toThrow(
      "Select the employee's CRM login"
    );
  });
  it("accepts explicitly linked staff and intentional financial-only records", () => {
    expect(() =>
      assertHrEmployeeOnboarding({ crmUserId: 933870 })
    ).not.toThrow();
    expect(() =>
      assertHrEmployeeOnboarding({
        hrSelfServiceRequired: false,
        crmUserId: null,
      })
    ).not.toThrow();
    expect(() =>
      assertHrEmployeeOnboarding({ isActive: false, crmUserId: null })
    ).not.toThrow();
  });
  it("enforces the resulting state on creation, activation, and identity updates", () => {
    const source = fs.readFileSync("server/finDb.ts", "utf8");
    expect(source).toContain("assertHrEmployeeOnboarding(data)");
    expect(source).toContain("data.isActive === true");
    expect(source).toContain("data.crmUserId !== undefined");
    expect(source).toContain(
      "hrSelfServiceRequired: data.hrSelfServiceRequired ?? true"
    );
    const ui = fs.readFileSync("client/src/pages/FinEmployees.tsx", "utf8");
    expect(ui).toContain("CRM login (required for staff)");
    expect(ui).toContain('newHrRequired && newCrmUserId === "unlinked"');
  });
  it("does not infer staff eligibility or invent profiles or payroll", () => {
    const service = fs.readFileSync(
      "server/hrEmployeeOnboardingService.ts",
      "utf8"
    );
    expect(service).not.toContain("createEmployee(");
    expect(service).not.toContain(".insert(");
    expect(service).not.toContain("finEmployeeSalaryRates");
    expect(service).toContain("assertAdmin(actorUserId)");
    expect(service).toContain("isNull(finEmployees.crmUserId)");
  });
  it("keeps nonstaff outside attendance, leave, and deduction previews", () => {
    for (const file of [
      "server/hrAttendanceService.ts",
      "server/hrManagementService.ts",
    ]) {
      expect(fs.readFileSync(file, "utf8")).toContain(
        "employee.hrSelfServiceRequired === false"
      );
    }
    expect(fs.readFileSync("server/hrManagementService.ts", "utf8")).toContain(
      "employee.hrSelfServiceRequired !== false"
    );
  });
});
