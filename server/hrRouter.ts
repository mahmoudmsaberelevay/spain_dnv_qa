import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { auditCtxFromTrpc, writeAuditLog } from "./auditLog";
import {
  clockInForCrmUser,
  clockOutForCrmUser,
  getHrAttendanceReport,
  getMyHrAttendance,
  HrAttendanceError,
} from "./hrAttendanceService";

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

function toHrTrpcError(error: unknown): never {
  if (error instanceof HrAttendanceError) {
    const code = error.reason === "INVALID_RANGE" ? "BAD_REQUEST" : "PRECONDITION_FAILED";
    throw new TRPCError({ code, message: error.message });
  }
  throw error;
}

/**
 * HR is deliberately separate from Financial. Employee self-service is always
 * scoped from ctx.user.id through finEmployees.crmUserId; no self-service
 * endpoint accepts an employee ID or user ID from the browser.
 */
export const hrRouter = router({
  attendance: router({
    me: protectedProcedure.query(async ({ ctx }) => getMyHrAttendance(ctx.user.id)),

    clockIn: protectedProcedure.mutation(async ({ ctx }) => {
      try {
        const result = await clockInForCrmUser(ctx.user.id);
        if (result.created) {
          await writeAuditLog(
            auditCtxFromTrpc(ctx),
            "create",
            "hr_attendance",
            result.attendance.id,
            `Clocked in for ${result.attendance.attendanceDate}`,
          );
        }
        return result;
      } catch (error) {
        return toHrTrpcError(error);
      }
    }),

    clockOut: protectedProcedure.mutation(async ({ ctx }) => {
      try {
        const result = await clockOutForCrmUser(ctx.user.id);
        await writeAuditLog(
          auditCtxFromTrpc(ctx),
          "update",
          "hr_attendance",
          result.attendance.id,
          `Clocked out for ${result.attendance.attendanceDate}`,
        );
        return result;
      } catch (error) {
        return toHrTrpcError(error);
      }
    }),

    report: adminProcedure
      .input(z.object({
        from: dateKeySchema,
        to: dateKeySchema,
        employeeId: z.number().int().positive().optional(),
      }).optional())
      .query(async ({ input }) => {
        try {
          return await getHrAttendanceReport(input ?? {});
        } catch (error) {
          return toHrTrpcError(error);
        }
      }),
  }),
});
