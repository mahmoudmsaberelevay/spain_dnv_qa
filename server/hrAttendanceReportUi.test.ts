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
});
