import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ui = readFileSync(new URL("../client/src/pages/CommissionReceipts.tsx", import.meta.url), "utf8");
const router = readFileSync(new URL("./finRouter.ts", import.meta.url), "utf8");

describe("Commission employee picker privacy and feedback", () => {
  it("uses commission-only employee options instead of the salary-sensitive employee list", () => {
    expect(ui).toContain("trpc.financial.commissionReceipts.employeeOptions.useQuery()");
    expect(ui).not.toContain("trpc.financial.employees.list.useQuery()");
    expect(router).toContain("employeeOptions: finProcedure.query");
    expect(router).toContain("userId: ctx.user.id");
    expect(router).toContain('isFinancialAdmin: ctx.finRole === "admin"');
  });
  it("shows loading, failure, retry and empty-list feedback", () => {
    expect(ui).toContain("Loading employees...");
    expect(ui).toContain("Unable to load employee names:");
    expect(ui).toContain("Retry employee list");
    expect(ui).toContain("No active employees available.");
    expect(ui).toContain('role="alert"');
  });
  it("does not grant Madonna unrelated Financial administration", () => {
    const admins = router.slice(router.indexOf("const ADMIN_EMAILS"), router.indexOf("const READONLY_EMAILS"));
    expect(admins).not.toContain("madonna.adel@elevay.com");
    const employeeRouter = router.slice(router.indexOf("const employeesRouter"), router.indexOf("const finClientsRouter"));
    expect(employeeRouter).toContain("list: finAdminProcedure");
    expect(employeeRouter).toContain("salaryRates: finAdminProcedure");
    expect(employeeRouter).toContain("create: finAdminProcedure");
    expect(employeeRouter).toContain("update: finAdminProcedure");
    expect(employeeRouter).toContain("delete: finAdminProcedure");
  });
});
