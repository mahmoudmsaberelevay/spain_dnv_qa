import { ELEVAY_TIME_ZONE } from "./financialEmployeeSalaryRates";
import { assertHrAttendanceDate } from "./hrAttendance";
import {
  getHrMaternityBreakIntervals,
  hrMaternityBreakOverlapMinutes,
  hrScheduleTimeMinutes,
  validateHrMaternityBreaks,
  type HrMaternityBreakPolicy,
} from "./hrMaternityBreaks";

export const HR_SALARY_DAYS = 30;

const DAY_MS = 86_400_000;
const cairoFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: ELEVAY_TIME_ZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export type HrPayrollSchedule = HrMaternityBreakPolicy & {
  effectiveFrom: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
};

export type HrPayrollAttendance = {
  attendanceDate: string;
  checkInAt: Date | string;
  checkOutAt: Date | string | null;
};

export type HrPayrollInput = {
  from: string;
  to: string;
  now: Date;
  salary: number;
  schedules: HrPayrollSchedule[];
  attendance: HrPayrollAttendance[];
  holidays: string[];
  approvedLeaveDates: string[];
  attendanceCreditDates?: readonly string[];
};

export type HrPayrollDayStatus =
  | "weekend"
  | "holiday"
  | "unconfigured"
  | "future"
  | "in_progress"
  | "leave"
  | "present"
  | "credited"
  | "absent"
  | "incomplete";

export type HrPayrollDay = {
  date: string;
  status: HrPayrollDayStatus;
  lateMinutes: number;
  earlyMinutes: number;
  missingMinutes: number;
  /** Actual excluded late/early overlap, not an allowance or altered punches. */
  maternityExcusedMinutes?: number;
  /** Configured policy on an active scheduled working day, even if not used. */
  maternityBreakMinutes?: number;
};

export type HrPayrollResult = {
  workingDays: number;
  evaluatedDays: number;
  lateMinutes: number;
  earlyMinutes: number;
  absentDays: number;
  incompleteDays: number;
  incompleteDeductionDays: number;
  totalLostMinutes: number;
  lostHours: number;
  equivalentDays: number;
  dailyRate: number;
  hourlyRate: number;
  minuteRate: number;
  totalDeduction: number;
  netSalary: number;
  days: HrPayrollDay[];
};

/** Validate, rather than truncate or normalize, a Gregorian YYYY-MM-DD key. */
export function hrDateKey(value: string): string {
  if (typeof value !== "string")
    throw new Error("HR dates must use YYYY-MM-DD");
  return assertHrAttendanceDate(value);
}

/** Inclusive calendar dates; the 366-day limit applies before any filtering. */
export function listHrDates(from: string, to: string): string[] {
  const start = Date.parse(`${hrDateKey(from)}T00:00:00.000Z`);
  const end = Date.parse(`${hrDateKey(to)}T00:00:00.000Z`);
  if (start > end)
    throw new Error("HR start date must be on or before the end date");
  const count = (end - start) / DAY_MS + 1;
  if (count > 366)
    throw new Error("HR date ranges must contain at most 366 days");
  return Array.from({ length: count }, (_, index) =>
    new Date(start + index * DAY_MS).toISOString().slice(0, 10)
  );
}

function dateSet(dates: readonly string[]): Set<string> {
  return new Set(dates.map(hrDateKey));
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 5 || day === 6;
}

/** ELEVAY's working week is Sunday–Thursday, excluding public holidays. */
export function isHrWorkingDay(
  dateKey: string,
  holidayDateKeys: readonly string[] = []
): boolean {
  const date = hrDateKey(dateKey);
  const holidays = dateSet(holidayDateKeys);
  return !isWeekend(date) && !holidays.has(date);
}

/** Paid-leave usage split by calendar year, excluding weekends and holidays. */
export function countHrLeaveWorkingDays(
  from: string,
  to: string,
  holidays: readonly string[] = []
): { year: number; days: number }[] {
  const dates = listHrDates(from, to);
  const holidaySet = dateSet(holidays);
  const byYear = new Map<number, number>();
  for (const date of dates) {
    if (isWeekend(date) || holidaySet.has(date)) continue;
    const year = Number(date.slice(0, 4));
    byYear.set(year, (byYear.get(year) ?? 0) + 1);
  }
  return Array.from(byYear, ([year, days]) => ({ year, days }));
}

function instant(value: Date | string, label: string): Date {
  // Offsetless strings would depend on the machine's TZ and are not instants.
  if (typeof value === "string") {
    if (
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
        value
      )
    ) {
      throw new Error(
        `${label} must be a Date or an ISO timestamp with a timezone`
      );
    }
    hrDateKey(value.slice(0, 10));
  } else if (!(value instanceof Date)) {
    throw new Error(
      `${label} must be a Date or an ISO timestamp with a timezone`
    );
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()))
    throw new Error(`${label} must be a valid timestamp`);
  return parsed;
}

function cairoClock(value: Date): { date: string; minute: number } {
  const parts = new Map(
    cairoFormatter.formatToParts(value).map(part => [part.type, part.value])
  );
  return {
    date: `${parts.get("year")!.padStart(4, "0")}-${parts.get("month")}-${parts.get("day")}`,
    minute: Number(parts.get("hour")) * 60 + Number(parts.get("minute")),
  };
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value));
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * Pure preview: no clock reads, persistence, or host-local timezone arithmetic.
 *
 * workingDays includes the entire cycle's scheduled Sun–Thu dates (including
 * paid leave and future days), but excludes holidays and pre-configuration dates.
 * evaluatedDays includes only scheduled working days whose Cairo shift has ended.
 * Today is never finalized before endTime, even with an early complete checkout.
 * Explicit attendance credits have zero loss, including future/unconfigured dates;
 * credited scheduled working days also count as evaluated without altering punches.
 *
 * Each third finalized incomplete date carries one scheduled day's missingMinutes
 * for the cycle-level 3-for-1 rule. Other incomplete dates carry zero; none receive
 * late/early penalties. Absent dates carry their full span. Thus totalLostMinutes
 * sums days[].missingMinutes, while equivalentDays sums missingMinutes / that
 * date's span, not minutes divided by an arbitrary fixed eight-hour shift.
 *
 * Every day has a fixed salary / 30 weight, regardless of cycle length or the
 * number of scheduled days. hourlyRate/minuteRate divide that dailyRate by the
 * full cycle's average scheduled span (zero if none) and are informational when
 * spans vary; deductions use dailyRate * equivalentDays, capped at salary.
 * Only final monetary outputs are rounded.
 *
 * Schedules must be same-day shifts. Check-in must belong to attendanceDate in
 * Cairo; reversed or duplicate punches are rejected. Late next-day checkouts are
 * allowed and clamped to this shift's end, never wrapped into an early departure.
 */
export function calculateHrPayroll(input: HrPayrollInput): HrPayrollResult {
  const dates = listHrDates(input.from, input.to);
  if (
    typeof input.salary !== "number" ||
    !Number.isFinite(input.salary) ||
    input.salary < 0
  ) {
    throw new Error("HR salary must be a finite non-negative number");
  }
  if (!(input.now instanceof Date))
    throw new Error("HR now must be a valid Date");
  const now = cairoClock(instant(input.now, "HR now"));
  const holidays = dateSet(input.holidays);
  const leaveDates = dateSet(input.approvedLeaveDates);
  const creditDates = dateSet(input.attendanceCreditDates ?? []);
  const scheduleDates = new Set<string>();
  const schedules = input.schedules
    .map(schedule => {
      const effectiveFrom = hrDateKey(schedule.effectiveFrom);
      if (scheduleDates.has(effectiveFrom))
        throw new Error("Duplicate HR schedule effective date");
      scheduleDates.add(effectiveFrom);
      const start = hrScheduleTimeMinutes(schedule.startTime);
      const end = hrScheduleTimeMinutes(schedule.endTime);
      if (end <= start)
        throw new Error("HR schedule end must be after start on the same day");
      if (
        !Number.isInteger(schedule.graceMinutes) ||
        schedule.graceMinutes < 0 ||
        schedule.graceMinutes > 120
      ) {
        throw new Error("HR grace minutes must be an integer between 0 and 120");
      }
      return {
        effectiveFrom,
        start,
        end,
        span: end - start,
        grace: schedule.graceMinutes,
        maternity: validateHrMaternityBreaks(schedule),
      };
    })
    .sort((left, right) =>
      left.effectiveFrom.localeCompare(right.effectiveFrom)
    );

  const attendance = new Map<
    string,
    {
      checkIn: ReturnType<typeof cairoClock>;
      checkOut: ReturnType<typeof cairoClock> | null;
    }
  >();
  for (const record of input.attendance) {
    const date = hrDateKey(record.attendanceDate);
    if (attendance.has(date)) throw new Error("Duplicate HR attendance date");
    const checkInAt = instant(record.checkInAt, "HR check-in");
    const checkOutAt =
      record.checkOutAt === null
        ? null
        : instant(record.checkOutAt, "HR check-out");
    const checkIn = cairoClock(checkInAt);
    if (checkIn.date !== date)
      throw new Error("HR check-in must belong to its Cairo attendance date");
    if (checkOutAt && checkOutAt.getTime() < checkInAt.getTime()) {
      throw new Error("HR check-out must not precede check-in");
    }
    attendance.set(date, {
      checkIn,
      checkOut: checkOutAt ? cairoClock(checkOutAt) : null,
    });
  }

  const result: HrPayrollResult = {
    workingDays: 0,
    evaluatedDays: 0,
    lateMinutes: 0,
    earlyMinutes: 0,
    absentDays: 0,
    incompleteDays: 0,
    incompleteDeductionDays: 0,
    totalLostMinutes: 0,
    lostHours: 0,
    equivalentDays: 0,
    dailyRate: 0,
    hourlyRate: 0,
    minuteRate: 0,
    totalDeduction: 0,
    netSalary: 0,
    days: [],
  };
  let scheduledMinutes = 0;
  let scheduleIndex = -1;
  for (const date of dates) {
    while (
      scheduleIndex + 1 < schedules.length &&
      schedules[scheduleIndex + 1].effectiveFrom <= date
    ) {
      scheduleIndex += 1;
    }
    const schedule = schedules[scheduleIndex];
    const day: HrPayrollDay = {
      date,
      status: "unconfigured",
      lateMinutes: 0,
      earlyMinutes: 0,
      missingMinutes: 0,
      maternityExcusedMinutes: 0,
      maternityBreakMinutes: 0,
    };
    result.days.push(day);
    const maternityIntervals = schedule && !isWeekend(date) && !holidays.has(date)
      ? getHrMaternityBreakIntervals(schedule.maternity, date)
      : [];
    day.maternityBreakMinutes = maternityIntervals.reduce(
      (sum, slot) => sum + slot.endMinute - slot.startMinute, 0
    );
    if (creditDates.has(date)) {
      day.status = "credited";
      if (schedule && !isWeekend(date) && !holidays.has(date)) {
        result.workingDays += 1;
        result.evaluatedDays += 1;
        scheduledMinutes += schedule.span;
      }
      continue;
    }
    if (isWeekend(date)) {
      day.status = "weekend";
      continue;
    }
    if (holidays.has(date)) {
      day.status = "holiday";
      continue;
    }
    if (!schedule) continue;
    result.workingDays += 1;
    scheduledMinutes += schedule.span;
    if (date > now.date) {
      day.status = "future";
      continue;
    }
    if (date === now.date && now.minute < schedule.end) {
      day.status = "in_progress";
      continue;
    }
    result.evaluatedDays += 1;
    if (leaveDates.has(date)) {
      day.status = "leave";
      continue;
    }
    const record = attendance.get(date);
    if (!record) {
      day.status = "absent";
      result.absentDays += 1;
      day.missingMinutes = schedule.span;
    } else if (!record.checkOut) {
      day.status = "incomplete";
      result.incompleteDays += 1;
      if (result.incompleteDays % 3 === 0) {
        result.incompleteDeductionDays += 1;
        day.missingMinutes = schedule.span;
      }
    } else {
      day.status = "present";
      const start = clamp(record.checkIn.minute, schedule.start, schedule.end);
      // Date comparisons prevent midnight wrapping and correctly handle DST.
      const checkOutMinute =
        record.checkOut.date > date ? schedule.end : record.checkOut.minute;
      const end = clamp(checkOutMinute, schedule.start, schedule.end);
      const lateExcused = hrMaternityBreakOverlapMinutes(
        maternityIntervals, schedule.start, start
      );
      // Cairo wall clocks can reverse across DST despite ordered real instants.
      // Partition the union of missing windows so no break minute is granted
      // twice (and no missing duty minute is penalized twice).
      const earlyStart = Math.max(start, end);
      const earlyExcused = hrMaternityBreakOverlapMinutes(
        maternityIntervals, earlyStart, schedule.end
      );
      day.maternityExcusedMinutes = lateExcused + earlyExcused;
      day.lateMinutes = clamp(
        start - schedule.start - lateExcused - schedule.grace,
        0,
        schedule.span
      );
      day.earlyMinutes = Math.max(0, schedule.end - earlyStart - earlyExcused);
      result.lateMinutes += day.lateMinutes;
      result.earlyMinutes += day.earlyMinutes;
      day.missingMinutes = day.lateMinutes + day.earlyMinutes;
    }
    result.totalLostMinutes += day.missingMinutes;
    result.equivalentDays += day.missingMinutes / schedule.span;
  }
  result.lostHours = result.totalLostMinutes / 60;
  result.dailyRate = input.salary / HR_SALARY_DAYS;
  const averageScheduledMinutes = result.workingDays
    ? scheduledMinutes / result.workingDays
    : 0;
  result.minuteRate = averageScheduledMinutes
    ? result.dailyRate / averageScheduledMinutes
    : 0;
  result.hourlyRate = result.minuteRate * 60;
  const deduction = Math.min(
    input.salary,
    result.dailyRate * result.equivalentDays
  );
  result.totalDeduction = roundMoney(deduction);
  result.netSalary = roundMoney(input.salary - deduction);
  return result;
}
