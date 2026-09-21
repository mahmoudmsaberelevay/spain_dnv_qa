import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  enforceQualifierCommissionMarketingSource,
  hasPositiveQualifierCommission,
} from "../shared/commissionSourcePolicy";
import { resolveCommissionSigningDateRange } from "../shared/commissionSigningDateFilter";

const commissionPage = readFileSync(new URL("../client/src/pages/FinCommissions.tsx", import.meta.url), "utf8");
const finRouter = readFileSync(new URL("./finRouter.ts", import.meta.url), "utf8");
const finDb = readFileSync(new URL("./finDb.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0083_commission_qualifier_marketing_source.sql", import.meta.url), "utf8");

describe("Commission Database qualifier source policy", () => {
  it("recognizes only positive Qualifier Commission amounts", () => {
    expect(hasPositiveQualifierCommission(1)).toBe(true);
    expect(hasPositiveQualifierCommission("0.01")).toBe(true);
    expect(hasPositiveQualifierCommission(0)).toBe(false);
    expect(hasPositiveQualifierCommission("0.00")).toBe(false);
    expect(hasPositiveQualifierCommission(-1)).toBe(false);
    expect(hasPositiveQualifierCommission(null)).toBe(false);
  });

  it("overrides another source with Marketing when Qualifier Commission is positive", () => {
    expect(enforceQualifierCommissionMarketingSource({
      leadSource: "Referal" as const,
      qualifierCommissionAmount: 200,
    })).toEqual({ leadSource: "Marketing", qualifierCommissionAmount: 200 });
  });

  it("preserves the selected source when Qualifier Commission is absent or zero", () => {
    expect(enforceQualifierCommissionMarketingSource({
      leadSource: "Sales Mining" as const,
      qualifierCommissionAmount: 0,
    })).toEqual({ leadSource: "Sales Mining", qualifierCommissionAmount: 0 });
  });

  it("enforces the policy in the form, API transformer, and persistence layer", () => {
    expect(commissionPage).toContain("Automatically set to Marketing because Qualifier Commission is greater than zero.");
    expect(commissionPage).toContain("disabled={qualifierForcesMarketing}");
    expect(finRouter).toContain("enforceQualifierCommissionMarketingSource(input)");
    expect(finDb.match(/enforceQualifierCommissionMarketingSource/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("backfills only positive qualifier records that are not already Marketing", () => {
    expect(migration).toContain("COALESCE(`qualifierCommissionAmount`, 0) > 0");
    expect(migration).toContain("`leadSource` IS NULL OR `leadSource` <> 'Marketing'");
    expect(migration).not.toMatch(/DELETE|DROP|TRUNCATE/i);
  });
});

describe("Commission Database signing-date filters", () => {
  const now = new Date(2026, 8, 21, 12, 0, 0, 0);

  it("calculates This Day, This Week, This Month, and This Year", () => {
    expect(resolveCommissionSigningDateRange("this_day", "", "", now)).toEqual({
      signingDateFrom: "2026-09-21",
      signingDateTo: "2026-09-21",
    });
    expect(resolveCommissionSigningDateRange("this_week", "", "", now)).toEqual({
      signingDateFrom: "2026-09-21",
      signingDateTo: "2026-09-27",
    });
    expect(resolveCommissionSigningDateRange("this_month", "", "", now)).toEqual({
      signingDateFrom: "2026-09-01",
      signingDateTo: "2026-09-30",
    });
    expect(resolveCommissionSigningDateRange("this_year", "", "", now)).toEqual({
      signingDateFrom: "2026-01-01",
      signingDateTo: "2026-12-31",
    });
  });

  it("passes custom date bounds and leaves All Signing Dates unbounded", () => {
    expect(resolveCommissionSigningDateRange("custom", "2026-07-01", "2026-07-31", now)).toEqual({
      signingDateFrom: "2026-07-01",
      signingDateTo: "2026-07-31",
    });
    expect(resolveCommissionSigningDateRange("all", "", "", now)).toEqual({});
  });

  it("exposes every requested preset and applies normalized backend bounds", () => {
    for (const label of ["This Day", "This Week", "This Month", "This Year", "Custom Range"]) {
      expect(commissionPage).toContain(`>${label}</SelectItem>`);
    }
    expect(commissionPage).toContain('aria-label="Commission signing date from"');
    expect(commissionPage).toContain('aria-label="Commission signing date to"');
    expect(finRouter.match(/normalizeFinancialDateRange\(input\.signingDateFrom, input\.signingDateTo\)/g)?.length).toBe(2);
    expect(finDb.match(/gte\(finCommissions\.signingDate/g)?.length).toBe(2);
    expect(finDb.match(/lte\(finCommissions\.signingDate/g)?.length).toBe(2);
  });
});
