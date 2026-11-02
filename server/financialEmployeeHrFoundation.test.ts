import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getCairoBusinessDate,
  selectEffectiveEmployeeSalaryRate,
} from "../shared/financialEmployeeSalaryRates";

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Financial employee HR foundation", () => {
  it("uses Africa/Cairo calendar dates across winter and summer offset boundaries", () => {
    expect(getCairoBusinessDate(new Date("2026-01-01T22:30:00.000Z"))).toBe("2026-01-02");
    expect(getCairoBusinessDate(new Date("2026-04-30T21:30:00.000Z"))).toBe("2026-05-01");
  });

  it("selects the salary rate in effect on the payroll calculation date", () => {
    const rates = [
      { effectiveFrom: "2026-01-01", monthlySalary: "12000" },
      { effectiveFrom: "2026-02-12", monthlySalary: "14500" },
      { effectiveFrom: "2026-04-01", monthlySalary: "16000" },
    ];

    expect(selectEffectiveEmployeeSalaryRate(rates, "2025-12-31")).toBeNull();
    expect(selectEffectiveEmployeeSalaryRate(rates, "2026-02-11")?.monthlySalary).toBe("12000");
    expect(selectEffectiveEmployeeSalaryRate(rates, "2026-02-12")?.monthlySalary).toBe("14500");
    expect(selectEffectiveEmployeeSalaryRate(rates, "2026-10-27")?.monthlySalary).toBe("16000");
  });

  it("keeps the HR self-service link explicit, unique, and Financial-owned", () => {
    const schema = read("drizzle/schema.ts");
    const financialDb = read("server/finDb.ts");
    const financialRouter = read("server/finRouter.ts");

    expect(schema).toContain('crmUserId: int("crmUserId")');
    expect(schema).toContain('uniqueIndex("fin_employees_crm_user_unique").on(table.crmUserId)');
    expect(schema).toContain('export const finEmployeeSalaryRates = mysqlTable("finEmployeeSalaryRates"');
    expect(schema).toContain('uniqueIndex("fin_employee_salary_rates_employee_effective_unique")');
    expect(financialDb).toContain("assertAvailableCrmUserLink");
    expect(financialDb).toContain("getCairoBusinessDate");
    expect(financialDb).toContain("finEmployeeSalaryRates");
    expect(financialRouter).toContain("listAssignableCrmUsers: finAdminProcedure");
    expect(financialRouter).toContain("salaryRates: finAdminProcedure");
    expect(financialRouter).toContain("crmUserId: z.number().int().positive().nullable().optional()");
  });
});
