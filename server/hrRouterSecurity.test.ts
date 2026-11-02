import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  clockIn: vi.fn(),
  clockOut: vi.fn(),
  overview: vi.fn(),
  leave: vi.fn(),
  create: vi.fn(),
  validate: vi.fn(),
  attempts: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("./auditLog", () => ({
  auditCtxFromTrpc: vi.fn(() => ({})),
  writeAuditLog: vi.fn(),
}));
vi.mock("./hrAttendanceService", () => ({
  HrAttendanceError: class extends Error {},
  getMyHrAttendance: mocks.me,
  clockInForCrmUser: mocks.clockIn,
  clockOutForCrmUser: mocks.clockOut,
  getHrAttendanceReport: vi.fn(),
}));
vi.mock("./hrManagementService", () => ({
  HrManagementError: class extends Error {},
  getMyHrLeave: mocks.leave,
  createHrLeaveRequest: mocks.create,
  getHrAdminOverview: mocks.overview,
  reviewHrLeaveRequest: vi.fn(),
  setHrLeaveEntitlement: vi.fn(),
  saveHrSchedule: vi.fn(),
  saveHrSalary: vi.fn(),
  saveHrHoliday: vi.fn(),
  removeHrHoliday: vi.fn(),
}));
vi.mock("./hrVerificationService", () => ({
  getHrVerificationStatus: vi.fn(),
  getHrVerificationSettings: mocks.settings,
  validateHrPunch: mocks.validate,
  recordHrPunchAttempt: mocks.attempts,
  saveHrVerificationSettings: vi.fn(),
  getHrRecentPunchAttempts: vi.fn(),
}));
import { hrRouter } from "./hrRouter";
function context(id: number, role: "admin" | "user" = "user"): TrpcContext {
  return {
    user: { id, role } as TrpcContext["user"],
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.overview.mockResolvedValue({ employees: [] });
  mocks.leave.mockResolvedValue({ requests: [] });
  mocks.validate.mockResolvedValue({
    accepted: false,
    message: "Attendance blocked",
    distanceMeters: null,
  });
  mocks.clockIn.mockResolvedValue({
    created: true,
    attendance: { id: 7, attendanceDate: "2026-11-02" },
  });
  mocks.clockOut.mockResolvedValue({
    attendance: { id: 7, attendanceDate: "2026-11-02" },
  });
});
describe("HR server security", () => {
  it("denies HR Admin even to an unrelated CRM administrator", async () => {
    const caller = hrRouter.createCaller(context(900, "admin"));
    await expect(
      caller.admin.overview({
        from: "2026-11-01",
        to: "2026-11-30",
        year: 2026,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.settings()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.admin.punchAttempts()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.overview).not.toHaveBeenCalled();
    expect(mocks.settings).not.toHaveBeenCalled();
    await expect(caller.access()).resolves.toEqual({ isHrAdmin: false });
  });
  it("allows only the verified named administrators regardless of their generic CRM role", async () => {
    for (const id of [1, 120001, 191, 933743]) {
      const caller = hrRouter.createCaller(context(id));
      await expect(caller.access()).resolves.toEqual({ isHrAdmin: true });
      await expect(
        caller.admin.overview({
          from: "2026-11-01",
          to: "2026-11-30",
          year: 2026,
        })
      ).resolves.toEqual({ employees: [] });
    }
  });
  it("protects every HR administrative mutation", async () => {
    const caller = hrRouter.createCaller(context(900, "admin"));
    const calls = [
      () =>
        caller.admin.saveSchedule({
          employeeId: 7,
          startTime: "09:00",
          endTime: "17:00",
          graceMinutes: 0,
          effectiveFrom: "2026-11-03",
          reason: "Schedule assigned",
        }),
      () =>
        caller.admin.saveSalary({
          employeeId: 7,
          salary: 10000,
          effectiveFrom: "2026-11-03",
          reason: "Salary assigned",
        }),
      () =>
        caller.admin.saveEntitlement({
          employeeId: 7,
          year: 2026,
          totalDays: 21,
          reason: "Annual allowance",
        }),
      () =>
        caller.admin.saveHoliday({
          holidayDate: "2026-11-03",
          name: "Office holiday",
        }),
      () =>
        caller.admin.removeHoliday({
          id: 1,
          reason: "Office holiday cancelled",
        }),
      () =>
        caller.admin.reviewLeave({
          requestId: 1,
          decision: "approved",
          reason: "Approved annual leave",
        }),
      () =>
        caller.admin.saveVerification({
          verificationMethod: "geofence",
          officeLatitude: 30,
          officeLongitude: 31,
          radiusMeters: 100,
          maxAccuracyMeters: 50,
          reason: "Verified office location",
        }),
      () => caller.attendance.report({ from: "2026-11-01", to: "2026-11-30" }),
    ];
    for (const call of calls)
      await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("scopes employee reads and leave requests to the authenticated CRM identity", async () => {
    const caller = hrRouter.createCaller(context(900));
    await caller.attendance.me();
    expect(mocks.me).toHaveBeenCalledWith(900);
    await caller.leave.mine({ year: 2026 });
    expect(mocks.leave).toHaveBeenCalledWith(900, 2026);
    mocks.create.mockResolvedValue({ id: 11 });
    await caller.leave.create({
      fromDate: "2026-11-10",
      toDate: "2026-11-11",
      reason: "Family vacation",
    });
    expect(mocks.create).toHaveBeenCalledWith(900, {
      fromDate: "2026-11-10",
      toDate: "2026-11-11",
      reason: "Family vacation",
    });
  });
  it("rejects both clock actions before writes when verification fails", async () => {
    const caller = hrRouter.createCaller(context(900));
    await expect(caller.attendance.clockIn()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    await expect(caller.attendance.clockOut()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(mocks.clockIn).not.toHaveBeenCalled();
    expect(mocks.clockOut).not.toHaveBeenCalled();
    expect(mocks.attempts).toHaveBeenCalledTimes(2);
  });
  it("rejects caller-selected Wi-Fi names or another employee ID as proof", async () => {
    const caller = hrRouter.createCaller(context(900));
    await expect(
      caller.attendance.clockIn({ ssid: "ELEVAY" } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.attendance.clockOut({ employeeId: 7 } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.clockIn).not.toHaveBeenCalled();
    expect(mocks.clockOut).not.toHaveBeenCalled();
  });
  it("uses server time and own employee identity only after successful verification", async () => {
    mocks.validate.mockResolvedValue({
      accepted: true,
      message: "Office accepted",
      distanceMeters: 0,
    });
    const caller = hrRouter.createCaller(context(900));
    const location = {
      latitude: 30.0712522,
      longitude: 30.9468691,
      accuracy: 10,
      capturedAt: Date.now(),
    };
    await caller.attendance.clockIn({ location });
    await caller.attendance.clockOut({ location });
    expect(mocks.clockIn).toHaveBeenCalledWith(900, expect.any(Date));
    expect(mocks.clockOut).toHaveBeenCalledWith(900, expect.any(Date));
  });
  it("requires an authenticated CRM account", async () => {
    const caller = hrRouter.createCaller({ ...context(900), user: null });
    await expect(caller.access()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.attendance.clockIn()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
