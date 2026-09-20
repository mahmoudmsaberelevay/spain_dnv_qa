import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  calendarDateToDateOnly,
  dateToBusinessDateOnly,
  financialDateBoundaryToDateOnly,
  isWithinFinancialDateRange,
  normalizeFinancialDateRange,
} from "../shared/financialDateRange";

const routerSource = readFileSync(new URL("./finRouter.ts", import.meta.url), "utf8");
const reportsSource = readFileSync(new URL("../client/src/pages/FinReports.tsx", import.meta.url), "utf8");
const detailedSource = readFileSync(new URL("../client/src/pages/FinReport.tsx", import.meta.url), "utf8");
const filterBarSource = readFileSync(new URL("../client/src/components/FinFilterBar.tsx", import.meta.url), "utf8");


describe("financial report date ranges", () => {
  it("keeps a one-day range inclusive through the final millisecond", () => {
    const range = normalizeFinancialDateRange("2026-09-20", "2026-09-20");

    expect(range.from?.toISOString()).toBe("2026-09-20T00:00:00.000Z");
    expect(range.to?.toISOString()).toBe("2026-09-20T23:59:59.999Z");
    expect(isWithinFinancialDateRange("2026-09-20T00:00:00.000Z", "2026-09-20", "2026-09-20")).toBe(true);
    expect(isWithinFinancialDateRange("2026-09-20T23:59:59.999Z", "2026-09-20", "2026-09-20")).toBe(true);
    expect(isWithinFinancialDateRange("2026-09-19T23:59:59.999Z", "2026-09-20", "2026-09-20")).toBe(false);
    expect(isWithinFinancialDateRange("2026-09-21T00:00:00.000Z", "2026-09-20", "2026-09-20")).toBe(false);
  });

  it("interprets calendar Date values using the Cairo business day", () => {
    const cairoMidnightInstant = new Date("2026-09-19T21:00:00.000Z");

    expect(dateToBusinessDateOnly(cairoMidnightInstant)).toBe("2026-09-20");
    expect(financialDateBoundaryToDateOnly(cairoMidnightInstant)).toBe("2026-09-20");
    const range = normalizeFinancialDateRange(cairoMidnightInstant, cairoMidnightInstant);
    expect(range.from?.toISOString()).toBe("2026-09-20T00:00:00.000Z");
    expect(range.to?.toISOString()).toBe("2026-09-20T23:59:59.999Z");
  });

  it("serializes browser calendar selections as stable date-only values", () => {
    const localCalendarSelection = new Date(2026, 8, 20, 0, 0, 0, 0);

    expect(calendarDateToDateOnly(localCalendarSelection)).toBe("2026-09-20");
  });

  it("safely normalizes a reversed range", () => {
    const range = normalizeFinancialDateRange("2026-09-20", "2026-09-01");

    expect(range.fromDateOnly).toBe("2026-09-01");
    expect(range.toDateOnly).toBe("2026-09-20");
  });

  it("keeps empty boundaries as the All Time range", () => {
    expect(normalizeFinancialDateRange(undefined, undefined)).toEqual({
      fromDateOnly: undefined,
      toDateOnly: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it("rejects malformed or impossible date-only values", () => {
    expect(() => normalizeFinancialDateRange("20/09/2026", undefined)).toThrow("YYYY-MM-DD");
    expect(() => normalizeFinancialDateRange("2026-02-30", undefined)).toThrow("valid calendar day");
  });

  it("wires deterministic dates through every Financial Reports view", () => {
    expect(routerSource).toContain("normalizeFinancialDateRange(input.from, input.to)");
    expect(routerSource).toContain("normalizeFinancialDateRange(input.dateFrom, input.dateTo)");
    expect(reportsSource).toContain("isWithinFinancialDateRange(tx.transactionDate");
    expect(reportsSource).toContain("Statement ({visibleTransactions.length} transactions)");
    expect(detailedSource).toContain("calendarDateToDateOnly(filters.from)");
    expect(detailedSource).toContain("calendarDateToDateOnly(filters.to)");
    expect(filterBarSource).toContain("FINANCIAL_REPORT_ALL_TIME_LABEL");
  });
});
