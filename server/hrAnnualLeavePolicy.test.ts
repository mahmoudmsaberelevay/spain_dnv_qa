import { describe, expect, it } from "vitest";
import { getHrDefaultAnnualLeaveDays } from "../shared/hrAnnualLeavePolicy";
import { getCairoBusinessDate } from "../shared/financialEmployeeSalaryRates";

describe("owner-approved annual leave policy", () => {
  it("gives 20 days for 2026 and 22 for every later calendar year", () => {
    expect(getHrDefaultAnnualLeaveDays(2026)).toBe(20);
    for (const year of [2027, 2028, 2030, 2040, 9999]) {
      expect(getHrDefaultAnnualLeaveDays(year)).toBe(22);
    }
  });

  it("does not retrospectively grant leave before the policy starts", () => {
    expect(getHrDefaultAnnualLeaveDays(2025)).toBe(0);
  });

  it("resets on 1 January in Cairo, not the UTC day or payroll-cycle boundary", () => {
    for (const [instant, expectedYear, expectedDays] of [
      ["2026-12-31T21:59:59Z", 2026, 20],
      ["2026-12-31T22:00:00Z", 2027, 22],
    ] as const) {
      const year = Number(getCairoBusinessDate(new Date(instant)).slice(0, 4));
      expect(year).toBe(expectedYear);
      expect(getHrDefaultAnnualLeaveDays(year)).toBe(expectedDays);
    }
  });

  it("rejects invalid years rather than silently choosing an allowance", () => {
    for (const year of [NaN, Infinity, 2026.5, 999, 10000]) {
      expect(() => getHrDefaultAnnualLeaveDays(year)).toThrow(RangeError);
    }
  });
});
