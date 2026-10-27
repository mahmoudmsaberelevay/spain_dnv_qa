import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getFinancialDatePresetRange,
  matchFinancialDatePreset,
} from "../shared/financialDatePresets";

const finDbSource = readFileSync(new URL("./finDb.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./finRouter.ts", import.meta.url), "utf8");
const filterBarSource = readFileSync(new URL("../client/src/components/FinFilterBar.tsx", import.meta.url), "utf8");
const incomeSource = readFileSync(new URL("../client/src/pages/FinIncome.tsx", import.meta.url), "utf8");
const expensesSource = readFileSync(new URL("../client/src/pages/FinExpenses.tsx", import.meta.url), "utf8");
const transfersSource = readFileSync(new URL("../client/src/pages/FinTransfers.tsx", import.meta.url), "utf8");

function dateKey(value?: Date) {
  return value ? [value.getFullYear(), value.getMonth() + 1, value.getDate()].join("-") : undefined;
}

describe("Financial Module transaction filters", () => {
  it("provides the requested deterministic date presets, including a Saturday-start Cairo business week", () => {
    const now = new Date(2026, 9, 27, 15, 0, 0, 0); // Tuesday, 27 October 2026

    expect(dateKey(getFinancialDatePresetRange("today", now).from)).toBe("2026-10-27");
    expect(dateKey(getFinancialDatePresetRange("yesterday", now).from)).toBe("2026-10-26");
    expect(dateKey(getFinancialDatePresetRange("this_week", now).from)).toBe("2026-10-24");
    expect(dateKey(getFinancialDatePresetRange("this_month", now).from)).toBe("2026-10-1");
    expect(dateKey(getFinancialDatePresetRange("this_year", now).from)).toBe("2026-1-1");
    expect(getFinancialDatePresetRange("all", now)).toEqual({});

    const month = getFinancialDatePresetRange("this_month", now);
    expect(matchFinancialDatePreset(month, now)).toBe("this_month");
    expect(matchFinancialDatePreset({ from: new Date(2026, 9, 2), to: new Date(2026, 9, 7) }, now)).toBe("custom");
  });

  it("applies exact From account and To account filters consistently to list and count queries", () => {
    expect(routerSource).toContain("fromAccountId: z.number().optional()");
    expect(routerSource).toContain("toAccountId: z.number().optional()");
    expect(finDbSource).toContain("eq(finTransactions.fromAccountId, filters.fromAccountId)");
    expect(finDbSource).toContain("eq(finTransactions.toAccountId, filters.toAccountId)");
  });

  it("offers requested UI controls and includes their values in the matching transaction views", () => {
    expect(filterBarSource).toContain('label: "Today"');
    expect(filterBarSource).toContain('label: "Yesterday"');
    expect(filterBarSource).toContain('label: "This week"');
    expect(filterBarSource).toContain('label: "This month"');
    expect(filterBarSource).toContain('label: "This year"');
    expect(filterBarSource).toContain('label: "Custom range"');
    expect(filterBarSource).toContain('placeholder="Search description..."');
    expect(filterBarSource).toContain('renderAccountSelect("From account"');
    expect(filterBarSource).toContain('renderAccountSelect("To account"');
    expect(incomeSource).toContain("accountId: filters.accountId");
    expect(expensesSource).toContain("accountId: filters.accountId");
    expect(transfersSource).toContain("fromAccountId: filters.fromAccountId");
    expect(transfersSource).toContain("toAccountId: filters.toAccountId");
    expect(transfersSource).toContain("descriptionSearch: filters.descriptionSearch");
  });
});
