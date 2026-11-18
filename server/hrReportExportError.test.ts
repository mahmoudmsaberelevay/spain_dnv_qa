import { describe, expect, it } from "vitest";
import { hrReportExportErrorMessage } from "../shared/hrReportExportError";

describe("HR PDF export module recovery", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://example.test/assets/hrAttendancePdf-old.js",
    "error loading dynamically imported module",
    "Importing a module script failed.",
    "Loading chunk 102 failed.",
    "Unable to preload CSS for /assets/old.css",
  ])(
    "explains reload recovery without printing module addresses for %s",
    message => {
      const result = hrReportExportErrorMessage(new Error(message));
      expect(result).toContain("Save any unsaved changes");
      expect(result).toContain("refresh this page and export again");
      expect(result).toContain("No attendance or salary record was changed");
      expect(result).not.toMatch(/https:|\/assets\/|old\.js/);
    }
  );
  it("retains actionable payroll coverage validation rather than incorrectly calling it a stale module", () => {
    const message =
      "Attendance payroll must cover exactly the selected period; refresh the overview";
    expect(hrReportExportErrorMessage(new Error(message))).toBe(message);
  });
  it.each([null, undefined, 0, {}])(
    "handles non-Error failures without throwing",
    value => {
      expect(hrReportExportErrorMessage(value)).toBe(
        "The HR report could not be exported. Please try again."
      );
    }
  );
});
