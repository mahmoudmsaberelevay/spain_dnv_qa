import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  hrPayrollCycleForDate,
  hrPayrollCycleForMonth,
} from "../shared/hrReportPeriod";

const dashboard = readFileSync(
  new URL("../client/src/pages/HrAttendanceDashboard.tsx", import.meta.url),
  "utf8"
);
const workspace = readFileSync(
  new URL("../client/src/components/HrAdminReports.tsx", import.meta.url),
  "utf8"
);

describe("HR payroll report period selection", () => {
  it.each([
    ["2026-11-03", false, "2026-10-27", "2026-11-26"],
    ["2026-11-26", false, "2026-10-27", "2026-11-26"],
    ["2026-11-27", false, "2026-11-27", "2026-12-26"],
    ["2026-12-31", false, "2026-12-27", "2027-01-26"],
    ["2027-01-01", true, "2026-11-27", "2026-12-26"],
    ["2026-11-26", true, "2026-09-27", "2026-10-26"],
    ["2026-11-27", true, "2026-10-27", "2026-11-26"],
  ])(
    "selects the correct containing/completed cycle for %s",
    (date, completed, from, to) => {
      expect(
        hrPayrollCycleForDate(date as string, completed as boolean)
      ).toEqual({ from, to });
    }
  );
  it("names a selected cycle by its closing month, across New Year", () => {
    expect(hrPayrollCycleForMonth("2027-01")).toEqual({
      from: "2026-12-27",
      to: "2027-01-26",
    });
    expect(() => hrPayrollCycleForMonth("2026-13")).toThrow();
    expect(() => hrPayrollCycleForDate("2026-02-30")).toThrow();
  });
});

describe("HR reporting workspace integration", () => {
  it("exports annual history from the applied year, not the payroll date range, without mutations", () => {
    const handler = dashboard.slice(
      dashboard.indexOf("async function exportVacationReport("),
      dashboard.indexOf("function apply(next:")
    );
    expect(handler).toMatch(/if\s*\(\s*exportDisabled/);
    expect(handler).toContain("year: filters.year");
    expect(handler).toContain("employees: selected");
    expect(handler).toContain("requests,");
    expect(handler).toContain("generatedBy: user?.name");
    expect(handler).toContain('import("@/lib/hrVacationPdf")');
    expect(handler).not.toMatch(/mutate|fetch\(|storagePut|from: filters/);
  });
  it("offers separate team and employee exports, complete annual history, and unambiguous timing units", () => {
    for (const text of [
      "Attendance & deductions",
      "Annual vacation ledger",
      "Export attendance PDF",
      "Export vacation PDF",
      "Late minutes",
      "Late hours",
      "Late equivalent days",
      "Recorded attendance hours",
      "Full vacation history / PDF",
      "yearDays",
      "decisionReason",
      "reviewedAt",
      "No vacation requests during",
      "Preview only — no financial posting",
    ])
      expect(workspace).toContain(text);
    expect(workspace).toContain("onAttendancePdf([employee.id])");
    expect(workspace).toContain("onVacationPdf([employee.id])");
    expect(workspace).toContain("const ids = visible.map");
    expect(workspace).not.toMatch(/\.useMutation\(|mutateAsync|storagePut/);
  });
  it("supports readable report navigation, search, sort, pagination and resizable columns", () => {
    for (const text of [
      'type="search"',
      'id="hr-report-sort"',
      "Previous report page",
      "Next report page",
      'id="hr-report-page-size"',
      "resize-x",
      'scope="col"',
      "Exports include all matching rows.",
    ])
      expect(workspace).toContain(text);
    expect(dashboard).toContain("overview.isFetching");
    expect(dashboard).toContain("unappliedFilters");
    expect(dashboard).toContain("access.data.isHrAdmin === true");
    expect(workspace).toContain("grid-cols-[minmax(0,1fr)]");
    expect(dashboard).toContain("hrPayrollCycleForMonth(event.target.value)");
  });
});
