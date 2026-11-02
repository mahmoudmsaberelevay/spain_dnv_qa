import { ELEVAY_TIME_ZONE } from "./financialEmployeeSalaryRates";
import {
  listHrDates,
  type HrPayrollDayStatus,
  type HrPayrollResult,
} from "./hrPayroll";

/** Structural subset of HrAttendanceDashboard.Employee; no user, GPS or email fields. */
export type HrAttendanceReportSourceEmployee = {
  readonly id: number;
  readonly name: string;
  readonly payroll: Omit<HrPayrollResult, "days"> & {
    readonly coveredBaseSalary: number;
    readonly cycleBreakdown: readonly HrAttendanceReportCycle[];
    readonly days: readonly {
      readonly date: string;
      readonly status: string;
      readonly lateMinutes: number;
      readonly earlyMinutes: number;
      readonly missingMinutes: number;
    }[];
  };
};

export type HrAttendanceReportCycle = {
  readonly from: string;
  readonly to: string;
  readonly coveredFrom: string;
  readonly coveredTo: string;
  readonly salary: number;
  readonly fullCycleWorkingDays: number;
  readonly workingDays: number;
  readonly coveredBaseSalary: number;
  readonly totalDeduction: number;
  readonly equivalentDays: number;
  readonly incompleteDeductionDays: number;
};

export type HrAttendanceReportInput = {
  readonly from: string;
  readonly to: string;
  readonly employees: readonly HrAttendanceReportSourceEmployee[];
  /** A display name, not a login/email. Email-like substrings are removed. */
  readonly generatedBy: string;
  /** Required here to keep the report helper deterministic; the browser API supplies a default. */
  readonly generatedAt: Date;
};

export const HR_ATTENDANCE_STATUS_LABELS: Record<HrPayrollDayStatus, string> = {
  present: "Present",
  credited: "Present - rollout credit (no recorded punch)",
  absent: "Absent",
  incomplete: "Incomplete punch",
  leave: "Approved paid leave",
  future: "Future - not evaluated",
  in_progress: "Shift in progress - not finalized",
  unconfigured: "No schedule configured",
  holiday: "Public holiday",
  weekend: "Weekend",
};

export type HrAttendanceReportDay = {
  date: string;
  status: HrPayrollDayStatus;
  statusLabel: string;
  lateMinutes: number;
  earlyMinutes: number;
  /** Already includes late + early for a present day; do not add them again. */
  missingMinutes: number;
  absenceMinutes: number;
  incompletePenaltyMinutes: number;
};

const SUMMARY_FIELDS = [
  "workingDays",
  "evaluatedDays",
  "lateMinutes",
  "earlyMinutes",
  "absentDays",
  "incompleteDays",
  "incompleteDeductionDays",
  "totalLostMinutes",
  "lostHours",
  "equivalentDays",
  "dailyRate",
  "hourlyRate",
  "minuteRate",
  "totalDeduction",
  "netSalary",
  "coveredBaseSalary",
] as const;
type Summary = Pick<
  HrAttendanceReportSourceEmployee["payroll"],
  (typeof SUMMARY_FIELDS)[number]
>;

export type HrAttendanceReportEmployee = Summary & {
  id: number;
  name: string;
  absenceMinutes: number;
  incompletePenaltyMinutes: number;
  days: HrAttendanceReportDay[];
  cycleBreakdown: HrAttendanceReportCycle[];
};

const TOTAL_FIELDS = [
  "workingDays",
  "evaluatedDays",
  "lateMinutes",
  "earlyMinutes",
  "absentDays",
  "absenceMinutes",
  "incompleteDays",
  "incompleteDeductionDays",
  "incompletePenaltyMinutes",
  "totalLostMinutes",
  "lostHours",
  "equivalentDays",
  "totalDeduction",
  "coveredBaseSalary",
  "netSalary",
] as const;
export type HrAttendanceReportTotals = Record<
  (typeof TOTAL_FIELDS)[number],
  number
>;
export type HrAttendanceReport = {
  from: string;
  to: string;
  timeZone: typeof ELEVAY_TIME_ZONE;
  calendarDays: number;
  generatedAt: string;
  generatedBy: string;
  employees: HrAttendanceReportEmployee[];
  totals: HrAttendanceReportTotals;
};

/** Do not accidentally print login identities or embedded control characters. */
export function attendanceReportDisplayName(
  value: string,
  fallback: string
): string {
  if (typeof value !== "string") return fallback;
  return (
    value
      .replace(/[^\s<>]+@[^\s<>]+/g, "")
      .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || fallback
  );
}

function nonNegative(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(
      `Invalid attendance report ${label}: expected a finite non-negative number`
    );
  }
  return value;
}
function sameAmount(left: number, right: number): boolean {
  return (
    Math.abs(left - right) <=
    1e-7 * Math.max(1, Math.abs(left), Math.abs(right))
  );
}

/**
 * Pure projection of an overview fetched for EXACTLY this inclusive Cairo period.
 * Reject mismatched daily coverage instead of exporting stale totals under a new
 * date label. Never infer absence from missing records or recalculate a wage,
 * schedule denominator, or the full-cycle incomplete-punch sequence.
 */
export function buildHrAttendanceReport(
  input: HrAttendanceReportInput
): HrAttendanceReport {
  const dates = listHrDates(input.from, input.to);
  if (
    !Array.isArray(input.employees as unknown) ||
    input.employees.length === 0
  ) {
    throw new Error("Choose at least one employee to export");
  }
  if (
    !(input.generatedAt instanceof Date) ||
    !Number.isFinite(input.generatedAt.getTime())
  ) {
    throw new Error("Attendance report generatedAt must be a valid Date");
  }
  const employees = input.employees.map(employee => {
    const payroll = employee.payroll;
    if (
      !payroll ||
      !Array.isArray(payroll.days as unknown) ||
      payroll.days.length !== dates.length
    ) {
      throw new Error(
        "Attendance payroll must cover exactly the selected period; refresh the overview"
      );
    }
    const summary = Object.fromEntries(
      SUMMARY_FIELDS.map(field => [field, nonNegative(payroll[field], field)])
    ) as Summary;
    const byDate = new Map(payroll.days.map(day => [day.date, day]));
    if (byDate.size !== dates.length || dates.some(date => !byDate.has(date))) {
      throw new Error(
        "Attendance payroll dates must match the selected period with no duplicates"
      );
    }
    const days = dates.map(date => {
      const source = byDate.get(date)!;
      if (
        !Object.prototype.hasOwnProperty.call(
          HR_ATTENDANCE_STATUS_LABELS,
          source.status
        )
      ) {
        throw new Error(
          "Unrecognized attendance payroll status; refresh the overview"
        );
      }
      const status = source.status as HrPayrollDayStatus;
      const lateMinutes = nonNegative(source.lateMinutes, "daily late minutes");
      const earlyMinutes = nonNegative(
        source.earlyMinutes,
        "daily early-exit minutes"
      );
      const missingMinutes = nonNegative(
        source.missingMinutes,
        "daily missing minutes"
      );
      // Approved paid leave, future/in-progress dates and non-working dates are
      // never silently converted to absence, even in a malformed source snapshot.
      if (status === "present") {
        if (!sameAmount(missingMinutes, lateMinutes + earlyMinutes)) {
          throw new Error(
            "Present-day lost minutes must already include late and early-exit minutes"
          );
        }
      } else if (
        lateMinutes ||
        earlyMinutes ||
        (!["absent", "incomplete"].includes(status) && missingMinutes)
      ) {
        throw new Error(
          "Only finalized attendance may carry payroll penalties"
        );
      }
      return {
        date,
        status,
        statusLabel: HR_ATTENDANCE_STATUS_LABELS[status],
        lateMinutes,
        earlyMinutes,
        missingMinutes,
        absenceMinutes: status === "absent" ? missingMinutes : 0,
        incompletePenaltyMinutes: status === "incomplete" ? missingMinutes : 0,
      };
    });
    const sum = (
      field:
        | "missingMinutes"
        | "lateMinutes"
        | "earlyMinutes"
        | "absenceMinutes"
        | "incompletePenaltyMinutes"
    ) => days.reduce((total, day) => total + day[field], 0);
    if (
      !sameAmount(sum("missingMinutes"), summary.totalLostMinutes) ||
      !sameAmount(sum("lateMinutes"), summary.lateMinutes) ||
      !sameAmount(sum("earlyMinutes"), summary.earlyMinutes) ||
      days.filter(day => day.status === "absent").length !==
        summary.absentDays ||
      days.filter(day => day.status === "incomplete").length !==
        summary.incompleteDays ||
      days.filter(day => day.status === "incomplete" && day.missingMinutes > 0)
        .length !== summary.incompleteDeductionDays
    ) {
      throw new Error(
        "Attendance daily rows and payroll summary disagree; refresh the overview"
      );
    }
    // Explicit field projection: never spread an employee, payroll or daily source
    // object (they may grow sensitive user/location fields in the future).
    const cycleBreakdown = payroll.cycleBreakdown.map(cycle => ({
      from: cycle.from,
      to: cycle.to,
      coveredFrom: cycle.coveredFrom,
      coveredTo: cycle.coveredTo,
      salary: nonNegative(cycle.salary, "cycle salary"),
      fullCycleWorkingDays: nonNegative(
        cycle.fullCycleWorkingDays,
        "cycle working days"
      ),
      workingDays: nonNegative(cycle.workingDays, "covered working days"),
      coveredBaseSalary: nonNegative(
        cycle.coveredBaseSalary,
        "cycle base salary"
      ),
      totalDeduction: nonNegative(cycle.totalDeduction, "cycle deduction"),
      equivalentDays: nonNegative(
        cycle.equivalentDays,
        "cycle equivalent days"
      ),
      incompleteDeductionDays: nonNegative(
        cycle.incompleteDeductionDays,
        "cycle incomplete penalties"
      ),
    }));
    return {
      id: employee.id,
      name: attendanceReportDisplayName(employee.name, "Unnamed employee"),
      ...summary,
      absenceMinutes: sum("absenceMinutes"),
      incompletePenaltyMinutes: sum("incompletePenaltyMinutes"),
      days,
      cycleBreakdown,
    };
  });
  const totals = Object.fromEntries(
    TOTAL_FIELDS.map(field => [
      field,
      employees.reduce((total, employee) => total + employee[field], 0),
    ])
  ) as HrAttendanceReportTotals;
  return {
    from: input.from,
    to: input.to,
    timeZone: ELEVAY_TIME_ZONE,
    calendarDays: dates.length,
    generatedAt: input.generatedAt.toISOString(),
    generatedBy: attendanceReportDisplayName(
      input.generatedBy,
      "HR administrator"
    ),
    employees,
    totals,
  };
}
