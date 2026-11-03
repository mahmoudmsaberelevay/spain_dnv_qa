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
  onboarding: vi.fn(),
  linkEmployee: vi.fn(),
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
vi.mock("./hrEmployeeOnboardingService", () => ({
  HrOnboardingError: class HrOnboardingError extends Error {},
  getHrEmployeeOnboarding: mocks.onboarding,
  linkHrEmployeeLogin: mocks.linkEmployee,
}));
import { HrOnboardingError } from "./hrEmployeeOnboardingService";
import { writeAuditLog } from "./auditLog";
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
  mocks.onboarding.mockResolvedValue({
    employees: [],
    users: [],
    summary: { unlinkedEmployees: 0, unlinkedUsers: 0 },
  });
  mocks.linkEmployee.mockResolvedValue({
    employeeId: 7,
    userId: 42,
    changed: true,
  });
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
  it.each([1, 120001, 191, 933743])(
    "never bypasses strict location checks for named HR administrator %i",
    async id => {
      const caller = hrRouter.createCaller(context(id, "admin"));
      await expect(caller.attendance.clockIn()).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
      await expect(caller.attendance.clockOut()).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
      expect(mocks.validate).toHaveBeenCalledTimes(2);
      expect(mocks.clockIn).not.toHaveBeenCalled();
      expect(mocks.clockOut).not.toHaveBeenCalled();
    }
  );
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
  it.each([
    [900, "user", false],
    [901, "admin", false],
    [1, "admin", true],
    [120001, "user", true],
    [933743, "user", true],
    [191, "admin", true],
  ] as const)(
    "allows CRM user %i (%s) their own daily actions and vacation requests",
    async (id, role, isHrAdmin) => {
      mocks.validate.mockResolvedValue({
        accepted: true,
        message: "Office accepted",
        distanceMeters: 999,
      });
      mocks.create.mockResolvedValue({ id: 11 });
      const caller = hrRouter.createCaller(context(id, role));
      await expect(caller.access()).resolves.toEqual({ isHrAdmin });
      await caller.attendance.me();
      await caller.attendance.clockIn({
        location: {
          latitude: 30.0715683,
          longitude: 30.9468446,
          accuracy: 10,
          capturedAt: Date.now(),
        },
      });
      await caller.attendance.clockOut({
        location: {
          latitude: 30.0715683,
          longitude: 30.9468446,
          accuracy: 10,
          capturedAt: Date.now(),
        },
      });
      await caller.leave.mine({ year: 2026 });
      await caller.leave.create({
        fromDate: "2026-11-10",
        toDate: "2026-11-11",
        reason: "Annual vacation",
      });
      expect(mocks.me).toHaveBeenCalledWith(id);
      expect(mocks.clockIn).toHaveBeenCalledWith(id, expect.any(Date));
      expect(mocks.clockOut).toHaveBeenCalledWith(id, expect.any(Date));
      expect(mocks.leave).toHaveBeenCalledWith(id, 2026);
      expect(mocks.create).toHaveBeenCalledWith(
        id,
        expect.objectContaining({ reason: "Annual vacation" })
      );
    }
  );
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

describe("HR onboarding router security", () => {
  const linkInput = {
    employeeId: 7,
    userId: 42,
    reason: "Explicit staff login link",
  };

  it.each([
    [900, "admin"],
    [901, "user"],
  ] as const)(
    "denies onboarding inventory and links to unrelated CRM account %i (%s)",
    async (id, role) => {
      const caller = hrRouter.createCaller(context(id, role));
      await expect(caller.admin.onboarding()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(caller.admin.linkEmployee(linkInput)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(mocks.onboarding).not.toHaveBeenCalled();
      expect(mocks.linkEmployee).not.toHaveBeenCalled();
      expect(writeAuditLog).not.toHaveBeenCalled();
    }
  );

  it("requires authentication for both onboarding APIs", async () => {
    const caller = hrRouter.createCaller({ ...context(1), user: null });
    await expect(caller.admin.onboarding()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.admin.linkEmployee(linkInput)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(mocks.onboarding).not.toHaveBeenCalled();
    expect(mocks.linkEmployee).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it.each([1, 120001, 191, 933743])(
    "allows named actor %i with either generic CRM role and forwards only explicit IDs",
    async id => {
      for (const role of ["user", "admin"] as const) {
        const caller = hrRouter.createCaller(context(id, role));
        await expect(caller.admin.onboarding()).resolves.toEqual({
          employees: [],
          users: [],
          summary: { unlinkedEmployees: 0, unlinkedUsers: 0 },
        });
        await expect(
          caller.admin.linkEmployee({
            ...linkInput,
            reason: "  Explicit staff login link  ",
          })
        ).resolves.toEqual({ employeeId: 7, userId: 42, changed: true });
        expect(mocks.onboarding).toHaveBeenLastCalledWith(id);
        expect(mocks.linkEmployee).toHaveBeenLastCalledWith(id, linkInput);
      }
      expect(mocks.onboarding).toHaveBeenCalledTimes(2);
      expect(mocks.linkEmployee).toHaveBeenCalledTimes(2);
      expect(writeAuditLog).toHaveBeenCalledTimes(2);
      expect(writeAuditLog).toHaveBeenLastCalledWith(
        {},
        "update",
        "hr_employee_login",
        7,
        "CRM user 42 linked explicitly: Explicit staff login link"
      );
    }
  );

  it.each([
    { salary: 1 },
    { name: "Forged financial name" },
    { salary: 1, name: "Forged financial name" },
    { crmUserId: 999 },
    { hrSelfServiceRequired: false },
    { isActive: false },
    { email: "lookalike@elevay.com" },
    { actorUserId: 900 },
  ])(
    "rejects non-whitelisted link properties %j before the service",
    async extra => {
      const caller = hrRouter.createCaller(context(1));
      await expect(
        caller.admin.linkEmployee({ ...linkInput, ...extra } as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mocks.linkEmployee).not.toHaveBeenCalled();
      expect(writeAuditLog).not.toHaveBeenCalled();
    }
  );

  it.each([
    { employeeId: 0 },
    { employeeId: -1 },
    { employeeId: 1.5 },
    { employeeId: "7" },
    { userId: 0 },
    { userId: -1 },
    { userId: 1.5 },
    { userId: "42" },
    { reason: "" },
    { reason: " ab " },
    { reason: "x".repeat(1001) },
  ])("rejects invalid link input %j before the service", async invalid => {
    const caller = hrRouter.createCaller(context(191));
    await expect(
      caller.admin.linkEmployee({ ...linkInput, ...invalid } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.linkEmployee).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("translates the mocked onboarding error class to a friendly precondition failure for both APIs", async () => {
    const caller = hrRouter.createCaller(context(1));
    const inventoryMessage =
      "Database unavailable. No employee links were changed.";
    mocks.onboarding.mockRejectedValueOnce(
      new HrOnboardingError(inventoryMessage)
    );
    await expect(caller.admin.onboarding()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: inventoryMessage,
    });
    const linkMessage = "This CRM login is already linked to another employee.";
    mocks.linkEmployee.mockRejectedValueOnce(
      new HrOnboardingError(linkMessage)
    );
    await expect(caller.admin.linkEmployee(linkInput)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: linkMessage,
    });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("does not translate an unrelated error into an onboarding business failure", async () => {
    mocks.linkEmployee.mockRejectedValueOnce(new Error("Database timeout"));
    const caller = hrRouter.createCaller(context(1));
    await expect(caller.admin.linkEmployee(linkInput)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database timeout",
    });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("does not audit an idempotent unchanged link", async () => {
    mocks.linkEmployee.mockResolvedValueOnce({
      employeeId: 7,
      userId: 42,
      changed: false,
    });
    const caller = hrRouter.createCaller(context(933743));
    await expect(caller.admin.linkEmployee(linkInput)).resolves.toEqual({
      employeeId: 7,
      userId: 42,
      changed: false,
    });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it.each([1, 120001, 191, 933743])(
    "keeps named administrator %i self-service reads scoped to their own CRM identity",
    async id => {
      const caller = hrRouter.createCaller(context(id, "admin"));
      await caller.attendance.me();
      await caller.leave.mine({ year: 2026 });
      expect(mocks.me.mock.calls).toEqual([[id]]);
      expect(mocks.leave.mock.calls).toEqual([[id, 2026]]);
      await expect(
        caller.leave.mine({ year: 2026, employeeId: 7 } as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        caller.leave.create({
          fromDate: "2026-11-10",
          toDate: "2026-11-11",
          reason: "Annual leave",
          employeeId: 7,
        } as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mocks.leave).toHaveBeenCalledTimes(1);
      expect(mocks.create).not.toHaveBeenCalled();
    }
  );
});
