import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../client/src/pages/HrAttendanceDashboard.tsx", import.meta.url),
  "utf8"
);

describe("HR Admin PDF export integration", () => {
  it("exports only the applied server-report period and selected employees", () => {
    const handler = page.slice(
      page.indexOf("async function exportReport("),
      page.indexOf("function apply(next:")
    );
    expect(handler).toContain("if (exportDisabled || !selected.length) return");
    expect(handler).toContain("from: filters.from");
    expect(handler).toContain("to: filters.to");
    expect(handler).toContain("employees: selected");
    expect(handler).toContain('import("@/lib/hrAttendancePdf")');
    expect(handler).toContain("await exportHrAttendancePdf(report)");
    expect(handler).not.toMatch(/mutate|fetch\(|storagePut/);
  });

  it("blocks export during a report refetch or when date inputs have not been applied", () => {
    expect(page).toContain("draft.from !== filters.from");
    expect(page).toContain("draft.to !== filters.to");
    expect(page).toMatch(
      /const exportDisabled[\s\S]{0,250}overview\.isFetching[\s\S]{0,250}unappliedFilters/
    );
    expect(page).toContain("exportReport(visibleEmployees)");
    expect(page).toContain("exportReport([employee])");
    expect(page).toContain("Export attendance PDF");
    expect(page).toContain("Employee PDF");
  });

  it("keeps the export inside the verified named-administrator component", () => {
    expect(page).toContain("access.data.isHrAdmin === true");
    expect(page).toContain("function HrAdmin()");
    const admin = page.slice(
      page.indexOf("function HrAdmin()"),
      page.indexOf("function EmployeePreview(")
    );
    expect(admin).toContain("trpc.hr.admin.overview.useQuery(filters");
    expect(admin).toContain("async function exportReport(");
    expect(admin).toContain("Deductions remain previews only.");
  });

  it("describes one half-day deduction per incomplete working day and displays precision-aware rates", () => {
    expect(page).toContain("Charged incomplete dates (half day each)");
    expect(page).toContain(
      "punch deducts half a day; no punches deduct a full day"
    );
    expect(page).toContain("numberLabel(payroll.minuteRate, 6)");
    expect(page).not.toMatch(/3:1|Three\s+finalized incomplete/);
  });

  it("highlights daily late minutes yellow and no-shows red without relying on color alone", () => {
    expect(page).toContain('day.status === "absent"');
    expect(page).toContain("bg-red-100");
    expect(page).toContain("bg-yellow-100");
    expect(page).toContain("No show (full day)");
    expect(page).toContain("Incomplete punch (half day)");
  });

  it("uses a safe stale-module message for both HR exports without auto-reloading forms", () => {
    const handlers = page.slice(
      page.indexOf("async function exportReport("),
      page.indexOf("function apply(next:")
    );
    expect(
      handlers.match(/toast\.error\(hrReportExportErrorMessage\(error\)\)/g)
    ).toHaveLength(2);
    expect(handlers).not.toMatch(
      /location\.reload|window\.location|sessionStorage/
    );
  });
});
