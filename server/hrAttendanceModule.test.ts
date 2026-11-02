import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatAttendanceDuration,
  getAttendanceDurationMinutes,
  getCairoMonthBounds,
  resolveHrAttendanceRange,
} from "../shared/hrAttendance";

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("separate HR attendance module", () => {
  it("uses Cairo dates and server timestamp durations for attendance reporting", () => {
    expect(getCairoMonthBounds(new Date("2026-04-30T21:30:00.000Z"))).toEqual({ from: "2026-05-01", to: "2026-05-31" });
    expect(resolveHrAttendanceRange("2026-05-01", "2026-05-31")).toEqual({ from: "2026-05-01", to: "2026-05-31" });
    expect(() => resolveHrAttendanceRange("2026-05-31", "2026-05-01")).toThrow("start date");
    expect(getAttendanceDurationMinutes({ checkInAt: new Date("2026-05-01T06:00:00.000Z"), checkOutAt: new Date("2026-05-01T14:35:00.000Z") })).toBe(515);
    expect(formatAttendanceDuration(515)).toBe("8h 35m");
  });

  it("keeps attendance identity explicit, one-per-day, and separate from Financial salary ownership", () => {
    const schema = read("drizzle/schema.ts");
    const migration = read("drizzle/0118_hr_attendance_module.sql");
    expect(schema).toContain('export const hrAttendance = mysqlTable("hrAttendance"');
    expect(schema).toContain('attendanceDate: date("attendanceDate", { mode: "string" }).notNull()');
    expect(schema).toContain('uniqueIndex("hr_attendance_employee_date_unique").on(table.employeeId, table.attendanceDate)');
    expect(migration).toContain('UNIQUE(`employeeId`, `attendanceDate`)');
    expect(migration).toContain("Financial remains the owner of employee and salary data");
  });

  it("derives every self-service action from the signed-in CRM user and reserves reports for administrators", () => {
    const router = read("server/hrRouter.ts");
    const service = read("server/hrAttendanceService.ts");
    expect(router).toContain("me: protectedProcedure");
    expect(router).toContain("clockIn: protectedProcedure");
    expect(router).toContain("clockOut: protectedProcedure");
    expect(router).toContain("report: adminProcedure");
    expect(router).toContain("clockInForCrmUser(ctx.user.id)");
    expect(router).toContain("clockOutForCrmUser(ctx.user.id)");
    const clockInBlock = router.split("clockIn: protectedProcedure")[1].split("clockOut: protectedProcedure")[0];
    const clockOutBlock = router.split("clockOut: protectedProcedure")[1].split("report: adminProcedure")[0];
    expect(clockInBlock).not.toContain("employeeId:");
    expect(clockOutBlock).not.toContain("employeeId:");
    expect(service).toContain("eq(finEmployees.crmUserId, crmUserId)");
    expect(service).toContain("requireActiveEmployeeForCrmUser");
    expect(service).toContain("getCairoBusinessDate(now)");
    expect(service).toContain("isNull(hrAttendance.checkOutAt)");
    expect(service).toContain("A late clock-out must be resolved before a new Cairo-day record is opened");
  });

  it("registers a separate HR dashboard and hides reports from non-administrators in navigation", () => {
    const app = read("client/src/App.tsx");
    const desktopNav = read("client/src/components/DashboardLayout.tsx");
    const mobileNav = read("client/src/components/MobileLayout.tsx");
    const home = read("client/src/pages/ElevayHome.tsx");
    expect(app).toContain('import HrAttendanceDashboard from "./pages/HrAttendanceDashboard"');
    expect(app).toContain('path="/hr/reports"');
    expect(app).toContain('path="/hr"');
    expect(desktopNav).toContain('id: "hr"');
    expect(desktopNav).toContain("adminOnly: true");
    expect(mobileNav).toContain('id: "hr"');
    expect(mobileNav).toContain("adminOnly: true");
    expect(home).toContain('id: "hr"');
  });
});
