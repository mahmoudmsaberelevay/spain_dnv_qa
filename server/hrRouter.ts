import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { auditCtxFromTrpc, writeAuditLog } from "./auditLog";
import { isHrAdministrator } from "../shared/hrAccess";
import { assertHrAttendanceDate } from "../shared/hrAttendance";
import {
  clockInForCrmUser,
  clockOutForCrmUser,
  getHrAttendanceReport,
  getMyHrAttendance,
  HrAttendanceError,
} from "./hrAttendanceService";
import {
  createHrLeaveRequest,
  getHrAdminOverview,
  getMyHrLeave,
  reviewHrLeaveRequest,
  setHrLeaveEntitlement,
  saveHrSchedule,
  saveHrSalary,
  saveHrHoliday,
  removeHrHoliday,
  HrManagementError,
} from "./hrManagementService";
import {
  getHrVerificationStatus,
  getHrVerificationSettings,
  validateHrPunch,
  recordHrPunchAttempt,
  saveHrVerificationSettings,
  getHrRecentPunchAttempts,
} from "./hrVerificationService";

const hrAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isHrAdministrator(ctx.user))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "HR Admin is restricted to Mahmoud, Madonna, and Ziad.",
    });
  return next({ ctx });
});
const dateKey = z.string().refine(value => {
  try {
    assertHrAttendanceDate(value);
    return true;
  } catch {
    return false;
  }
}, "Use a valid YYYY-MM-DD date");
const reason = z.string().trim().min(3).max(1000);
const year = z.number().int().min(2020).max(2100);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const punchInput = z
  .object({
    location: z
      .object({
        latitude: z.number().finite().min(-90).max(90),
        longitude: z.number().finite().min(-180).max(180),
        accuracy: z.number().finite().min(0).max(100000),
        capturedAt: z.number().finite().positive(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .optional();
function translate(error: unknown): never {
  if (error instanceof HrAttendanceError || error instanceof HrManagementError)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: error.message,
    });
  throw error;
}
async function business<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (error) {
    return translate(error);
  }
}
async function audit(
  ctx: any,
  entity: string,
  id: number | undefined,
  message: string
) {
  await writeAuditLog(
    auditCtxFromTrpc(ctx),
    "update",
    entity,
    id,
    message.slice(0, 1000)
  );
}

/** HR employee identity is exclusively ctx.user.id -> finEmployees.crmUserId. */
export const hrRouter = router({
  access: protectedProcedure.query(({ ctx }) => ({
    isHrAdmin: isHrAdministrator(ctx.user),
  })),
  attendance: router({
    me: protectedProcedure.query(({ ctx }) => getMyHrAttendance(ctx.user.id)),
    verification: protectedProcedure.query(() => getHrVerificationStatus()),
    clockIn: protectedProcedure
      .input(punchInput)
      .mutation(async ({ ctx, input }) => {
        const now = new Date();
        const proof = await validateHrPunch(input?.location, now);
        if (!proof.accepted) {
          await recordHrPunchAttempt(
            ctx.user.id,
            "in",
            false,
            proof.message,
            input?.location,
            proof.distanceMeters,
            ctx.req.headers["user-agent"]
          );
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: proof.message,
          });
        }
        return business(async () => {
          const result = await clockInForCrmUser(ctx.user.id, now).catch(
            async error => {
              await recordHrPunchAttempt(
                ctx.user.id,
                "in",
                false,
                error instanceof HrAttendanceError
                  ? error.message
                  : "Attendance action unavailable",
                input?.location,
                proof.distanceMeters,
                ctx.req.headers["user-agent"]
              );
              throw error;
            }
          );
          await recordHrPunchAttempt(
            ctx.user.id,
            "in",
            true,
            result.created
              ? "Clock-in recorded"
              : "Idempotent existing attendance",
            input?.location,
            proof.distanceMeters,
            ctx.req.headers["user-agent"]
          );
          if (result.created)
            await audit(
              ctx,
              "hr_attendance",
              result.attendance.id,
              `Clocked in for ${result.attendance.attendanceDate}`
            );
          return result;
        });
      }),
    clockOut: protectedProcedure
      .input(punchInput)
      .mutation(async ({ ctx, input }) => {
        const now = new Date();
        const proof = await validateHrPunch(input?.location, now);
        if (!proof.accepted) {
          await recordHrPunchAttempt(
            ctx.user.id,
            "out",
            false,
            proof.message,
            input?.location,
            proof.distanceMeters,
            ctx.req.headers["user-agent"]
          );
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: proof.message,
          });
        }
        return business(async () => {
          const result = await clockOutForCrmUser(ctx.user.id, now).catch(
            async error => {
              await recordHrPunchAttempt(
                ctx.user.id,
                "out",
                false,
                error instanceof HrAttendanceError
                  ? error.message
                  : "Attendance action unavailable",
                input?.location,
                proof.distanceMeters,
                ctx.req.headers["user-agent"]
              );
              throw error;
            }
          );
          await recordHrPunchAttempt(
            ctx.user.id,
            "out",
            true,
            "Clock-out recorded",
            input?.location,
            proof.distanceMeters,
            ctx.req.headers["user-agent"]
          );
          await audit(
            ctx,
            "hr_attendance",
            result.attendance.id,
            `Clocked out for ${result.attendance.attendanceDate}`
          );
          return result;
        });
      }),
    report: hrAdminProcedure
      .input(
        z
          .object({
            from: dateKey.optional(),
            to: dateKey.optional(),
            employeeId: z.number().int().positive().optional(),
          })
          .strict()
          .optional()
      )
      .query(({ input }) => business(() => getHrAttendanceReport(input ?? {}))),
  }),
  leave: router({
    mine: protectedProcedure
      .input(z.object({ year }).strict())
      .query(({ ctx, input }) =>
        business(() => getMyHrLeave(ctx.user.id, input.year))
      ),
    create: protectedProcedure
      .input(z.object({ fromDate: dateKey, toDate: dateKey, reason }).strict())
      .mutation(({ ctx, input }) =>
        business(async () => {
          const result = await createHrLeaveRequest(ctx.user.id, input);
          await audit(
            ctx,
            "hr_leave_request",
            result.id,
            `Leave requested ${input.fromDate} to ${input.toDate}: ${input.reason}`
          );
          return result;
        })
      ),
  }),
  admin: router({
    overview: hrAdminProcedure
      .input(z.object({ from: dateKey, to: dateKey, year }).strict())
      .query(({ input }) => business(() => getHrAdminOverview(input))),
    settings: hrAdminProcedure.query(() => getHrVerificationSettings()),
    punchAttempts: hrAdminProcedure.query(() => getHrRecentPunchAttempts()),
    saveSchedule: hrAdminProcedure
      .input(
        z
          .object({
            employeeId: z.number().int().positive(),
            startTime: time,
            endTime: time,
            graceMinutes: z.number().int().min(0).max(120),
            effectiveFrom: dateKey,
            reason,
          })
          .strict()
      )
      .mutation(({ ctx, input }) =>
        business(async () => {
          const result = await saveHrSchedule(ctx.user.id, input);
          await audit(
            ctx,
            "hr_schedule",
            input.employeeId,
            `Schedule ${input.startTime}-${input.endTime} from ${input.effectiveFrom}: ${input.reason}`
          );
          return result;
        })
      ),
    saveSalary: hrAdminProcedure
      .input(
        z
          .object({
            employeeId: z.number().int().positive(),
            salary: z.number().finite().min(0).max(1e8),
            effectiveFrom: dateKey,
            reason,
          })
          .strict()
      )
      .mutation(({ ctx, input }) =>
        business(async () => {
          const result = await saveHrSalary(ctx.user.id, input);
          await audit(
            ctx,
            "hr_salary",
            input.employeeId,
            `Financial salary ${input.salary} EGP effective ${input.effectiveFrom}: ${input.reason}`
          );
          return result;
        })
      ),
    saveEntitlement: hrAdminProcedure
      .input(
        z
          .object({
            employeeId: z.number().int().positive(),
            year,
            totalDays: z.number().int().min(0).max(366),
            reason,
          })
          .strict()
      )
      .mutation(({ ctx, input }) =>
        business(async () => {
          const result = await setHrLeaveEntitlement(ctx.user.id, input);
          await audit(
            ctx,
            "hr_leave_entitlement",
            input.employeeId,
            `${input.year} allowance ${input.totalDays} days: ${input.reason}`
          );
          return result;
        })
      ),
    saveHoliday: hrAdminProcedure
      .input(
        z
          .object({
            holidayDate: dateKey,
            name: z.string().trim().min(2).max(160),
          })
          .strict()
      )
      .mutation(({ ctx, input }) =>
        business(async () => {
          const result = await saveHrHoliday(ctx.user.id, input);
          await audit(
            ctx,
            "hr_holiday",
            undefined,
            `Holiday ${input.holidayDate}: ${input.name}`
          );
          return result;
        })
      ),
    removeHoliday: hrAdminProcedure
      .input(z.object({ id: z.number().int().positive(), reason }).strict())
      .mutation(({ ctx, input }) =>
        business(async () => {
          const result = await removeHrHoliday(ctx.user.id, input);
          await audit(
            ctx,
            "hr_holiday",
            input.id,
            `Holiday removed: ${input.reason}`
          );
          return result;
        })
      ),
    reviewLeave: hrAdminProcedure
      .input(
        z
          .object({
            requestId: z.number().int().positive(),
            decision: z.enum(["approved", "rejected"]),
            reason,
          })
          .strict()
      )
      .mutation(({ ctx, input }) =>
        business(async () => {
          const result = await reviewHrLeaveRequest(ctx.user.id, input);
          await audit(
            ctx,
            "hr_leave_request",
            input.requestId,
            `Leave ${input.decision}: ${input.reason}`
          );
          return result;
        })
      ),
    saveVerification: hrAdminProcedure
      .input(
        z
          .object({
            verificationMethod: z.enum([
              "pending",
              "geofence",
              "strict_wifi",
              "both",
            ]),
            officeLatitude: z.number().finite().min(-90).max(90),
            officeLongitude: z.number().finite().min(-180).max(180),
            radiusMeters: z.number().int().min(10).max(1000),
            maxAccuracyMeters: z.number().int().min(5).max(100),
            reason,
          })
          .strict()
      )
      .mutation(({ ctx, input }) =>
        business(async () => {
          const result = await saveHrVerificationSettings(ctx.user.id, input);
          await audit(
            ctx,
            "hr_verification",
            1,
            `Verification ${input.verificationMethod}, radius ${input.radiusMeters}m: ${input.reason}`
          );
          return result;
        })
      ),
  }),
});
