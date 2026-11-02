import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getHrAttendanceCreditDates,
  HR_ROLLOUT_CREDIT,
} from "../shared/hrAttendanceCredits";

describe("owner-approved one-off HR attendance credit", () => {
  it("covers only Oct27–Nov3 inclusive and begins regular enforcement on Wednesday Nov4", () => {
    expect(HR_ROLLOUT_CREDIT).toMatchObject({
      from: "2026-10-27",
      to: "2026-11-03",
      enforcementFrom: "2026-11-04",
    });
    expect(
      new Date(`${HR_ROLLOUT_CREDIT.enforcementFrom}T12:00:00Z`).getUTCDay()
    ).toBe(3);
    expect(getHrAttendanceCreditDates("2026-10-26", "2026-11-04")).toEqual([
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
    expect(getHrAttendanceCreditDates("2026-11-03", "2026-11-03")).toEqual([
      "2026-11-03",
    ]);
  });
  it("does not recur in later months or years and rejects invalid ranges", () => {
    expect(getHrAttendanceCreditDates("2026-11-04", "2026-12-31")).toEqual([]);
    expect(getHrAttendanceCreditDates("2027-10-27", "2027-11-03")).toEqual([]);
    expect(() =>
      getHrAttendanceCreditDates("2026-11-04", "2026-11-03")
    ).toThrow();
    expect(() =>
      getHrAttendanceCreditDates("2026-11-32", "2026-12-01")
    ).toThrow();
  });
  it("is applied by reporting only, not by a fabricated punch or location bypass", () => {
    const report = fs.readFileSync(
      new URL("./hrManagementService.ts", import.meta.url),
      "utf8"
    );
    expect(report).toContain(
      "attendanceCreditDates: getHrAttendanceCreditDates"
    );
    const punches = fs.readFileSync(
      new URL("./hrAttendanceService.ts", import.meta.url),
      "utf8"
    );
    expect(punches).not.toContain("HR_ROLLOUT_CREDIT");
    expect(punches).not.toContain("getHrAttendanceCreditDates");
    const screen = fs.readFileSync(
      new URL("../client/src/pages/HrAttendanceDashboard.tsx", import.meta.url),
      "utf8"
    );
    expect(screen).toContain("HR_ROLLOUT_CREDIT.enforcementFrom");
    expect(screen).toContain("Monthly salary");
    expect(screen).not.toContain("Salary ÷ scheduled working days");
  });
});
