import { ELEVAY_TIME_ZONE } from "./financialEmployeeSalaryRates";
import {
  hrDateKey,
  isHrWorkingDay,
  listHrDates,
  type HrPayrollAttendance,
  type HrPayrollDay,
  type HrPayrollSchedule,
} from "./hrPayroll";

export type HrAttendanceTimingDay = {
  date: string;
  /** Configured Cairo wall-clock times; null on non-working/unconfigured dates. */
  scheduleStart: string | null;
  scheduleEnd: string | null;
  scheduledMinutes: number;
  /** Real recorded instants only, including open check-ins; never rollout credits. */
  checkInAt: string | null;
  checkOutAt: string | null;
  recordedMinutes: number;
  scheduledPresenceMinutes: number;
};

export type HrAttendanceTiming = {
  /** All configured working dates in the inclusive range, including future dates. */
  scheduledMinutes: number;
  /** Configured dates finalized by payroll, including scheduled credited dates. */
  evaluatedScheduledMinutes: number;
  /** Exact elapsed minutes for closed valid records, including outside-shift time. */
  recordedMinutes: number;
  /** Closed-record elapsed overlap with the applicable Cairo shift. */
  scheduledPresenceMinutes: number;
  lateHours: number;
  /** Sum of finalized lateMinutes / each date's own configured schedule span. */
  lateEquivalentDays: number;
  earlyEquivalentDays: number;
  /** Payroll status counts; credits and approved paid leave are separate. */
  presentDays: number;
  creditedDays: number;
  approvedLeaveDays: number;
  days: HrAttendanceTimingDay[];
};

export type HrAttendanceTimingInput = {
  from: string;
  to: string;
  payrollDays: readonly HrPayrollDay[];
  schedules: readonly HrPayrollSchedule[];
  /** May include full-cycle context; only selected attendance dates are included. */
  attendance: readonly HrPayrollAttendance[];
  holidays: readonly string[];
};

const evaluated = new Set([
  "present",
  "credited",
  "absent",
  "leave",
  "incomplete",
]);
const statuses = new Set([
  ...Array.from(evaluated),
  "weekend",
  "holiday",
  "unconfigured",
  "future",
  "in_progress",
]);
const cairo = new Intl.DateTimeFormat("en-GB", {
  timeZone: ELEVAY_TIME_ZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function clock(value: Date) {
  const parts = new Map(
    cairo.formatToParts(value).map(part => [part.type, part.value])
  );
  return {
    date: `${parts.get("year")!.padStart(4, "0")}-${parts.get("month")}-${parts.get("day")}`,
    time: `${parts.get("hour")}:${parts.get("minute")}`,
    wallMs: Date.UTC(
      Number(parts.get("year")),
      Number(parts.get("month")) - 1,
      Number(parts.get("day")),
      Number(parts.get("hour")),
      Number(parts.get("minute")),
      Number(parts.get("second"))
    ),
  };
}

function instant(value: Date | string, label: string): Date {
  if (typeof value === "string") {
    if (
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
        value
      )
    ) {
      throw new Error(
        `Attendance timing ${label} must be an ISO timestamp with a timezone`
      );
    }
    hrDateKey(value.slice(0, 10));
  } else if (!(value instanceof Date)) {
    throw new Error(`Attendance timing ${label} must be a valid timestamp`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()))
    throw new Error(`Attendance timing ${label} must be a valid timestamp`);
  return parsed;
}

function minutes(time: string): number {
  if (typeof time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("Attendance timing schedule must use HH:mm");
  }
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** Resolve a Cairo wall time without host-local arithmetic or a fixed UTC offset.
 * Offsets sampled on both sides handle DST; repeated wall times use the earliest
 * occurrence deterministically. Nonexistent shift endpoints fail closed.
 */
function shiftInstant(date: string, time: string): number {
  const wall = Date.parse(`${date}T${time}:00.000Z`);
  const offsets = new Set(
    [-36, 0, 36].map(hours => {
      const sample = wall + hours * 3_600_000;
      return clock(new Date(sample)).wallMs - sample;
    })
  );
  const candidates = Array.from(offsets, offset => wall - offset).filter(
    candidate => {
      const local = clock(new Date(candidate));
      return local.date === date && local.time === time;
    }
  );
  if (!candidates.length)
    throw new Error("Attendance timing shift endpoint does not exist in Cairo");
  return Math.min(...candidates);
}

function coverage(
  from: string,
  to: string,
  payrollDays: readonly HrPayrollDay[]
) {
  const dates = listHrDates(from, to);
  const byDate = new Map(payrollDays.map(day => [day.date, day]));
  if (
    payrollDays.length !== dates.length ||
    byDate.size !== dates.length ||
    dates.some(date => !byDate.has(date))
  ) {
    throw new Error(
      "Attendance timing payroll dates must match exactly the selected period with no duplicates"
    );
  }
  for (const day of payrollDays) {
    if (!statuses.has(day.status))
      throw new Error("Attendance timing payroll status is invalid");
    finite(day.lateMinutes);
    finite(day.earlyMinutes);
    if (day.status !== "present" && (day.lateMinutes || day.earlyMinutes)) {
      throw new Error(
        "Attendance timing penalties require finalized present status"
      );
    }
  }
  return { dates, byDate };
}

function finite(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(
      "Attendance timing values must be finite non-negative numbers"
    );
  }
  return value;
}
function same(left: number, right: number) {
  return (
    Math.abs(left - right) <=
    1e-7 * Math.max(1, Math.abs(left), Math.abs(right))
  );
}

function measuredDay(
  date: string,
  scheduleStart: string | null,
  scheduleEnd: string | null,
  checkIn: Date | string | null,
  checkOut: Date | string | null
): HrAttendanceTimingDay {
  if ((scheduleStart === null) !== (scheduleEnd === null)) {
    throw new Error(
      "Attendance timing schedule endpoints must both be set or null"
    );
  }
  const span =
    scheduleStart === null ? 0 : minutes(scheduleEnd!) - minutes(scheduleStart);
  if (scheduleStart !== null && span <= 0)
    throw new Error(
      "Attendance timing schedule end must be after start on the same day"
    );
  const start = checkIn === null ? null : instant(checkIn, "check-in");
  const end = checkOut === null ? null : instant(checkOut, "check-out");
  if (start && clock(start).date !== date)
    throw new Error(
      "Attendance timing check-in must belong to its Cairo attendance date"
    );
  if (end && (!start || end.getTime() < start.getTime()))
    throw new Error("Attendance timing check-out must not precede check-in");
  const recordedMinutes =
    start && end ? (end.getTime() - start.getTime()) / 60_000 : 0;
  const scheduledPresenceMinutes =
    start && end && span > 0
      ? Math.max(
          0,
          Math.min(end.getTime(), shiftInstant(date, scheduleEnd!)) -
            Math.max(start.getTime(), shiftInstant(date, scheduleStart!))
        ) / 60_000
      : 0;
  return {
    date,
    scheduleStart,
    scheduleEnd,
    scheduledMinutes: span,
    checkInAt: start?.toISOString() ?? null,
    checkOutAt: end?.toISOString() ?? null,
    recordedMinutes,
    scheduledPresenceMinutes,
  };
}

function summarize(
  days: HrAttendanceTimingDay[],
  payroll: Map<string, HrPayrollDay>
): HrAttendanceTiming {
  const result: HrAttendanceTiming = {
    scheduledMinutes: 0,
    evaluatedScheduledMinutes: 0,
    recordedMinutes: 0,
    scheduledPresenceMinutes: 0,
    lateHours: 0,
    lateEquivalentDays: 0,
    earlyEquivalentDays: 0,
    presentDays: 0,
    creditedDays: 0,
    approvedLeaveDays: 0,
    days,
  };
  for (const day of days) {
    const source = payroll.get(day.date)!;
    if (!day.scheduledMinutes && (source.lateMinutes || source.earlyMinutes)) {
      throw new Error(
        "Attendance timing penalties require a configured working-day span"
      );
    }
    if (
      !day.scheduledMinutes &&
      [
        "present",
        "absent",
        "leave",
        "incomplete",
        "future",
        "in_progress",
      ].includes(source.status)
    ) {
      throw new Error(
        "Attendance timing configured payroll status requires a scheduled working-day span"
      );
    }
    if (
      ["weekend", "holiday", "unconfigured"].includes(source.status) &&
      day.scheduledMinutes
    ) {
      throw new Error(
        "Attendance timing non-working dates must have zero scheduled minutes"
      );
    }
    if (source.status === "present" && (!day.checkInAt || !day.checkOutAt)) {
      throw new Error(
        "Attendance timing present dates require a closed recorded punch"
      );
    }
    if (source.status === "incomplete" && (!day.checkInAt || day.checkOutAt)) {
      throw new Error(
        "Attendance timing incomplete dates require an open recorded punch"
      );
    }
    if (source.status === "absent" && day.checkInAt) {
      throw new Error(
        "Attendance timing absent dates cannot contain a recorded punch"
      );
    }
    result.scheduledMinutes += day.scheduledMinutes;
    if (evaluated.has(source.status))
      result.evaluatedScheduledMinutes += day.scheduledMinutes;
    result.recordedMinutes += day.recordedMinutes;
    result.scheduledPresenceMinutes += day.scheduledPresenceMinutes;
    result.lateHours += source.lateMinutes / 60;
    if (day.scheduledMinutes) {
      result.lateEquivalentDays += source.lateMinutes / day.scheduledMinutes;
      result.earlyEquivalentDays += source.earlyMinutes / day.scheduledMinutes;
    }
    if (source.status === "present") result.presentDays++;
    if (source.status === "credited") result.creditedDays++;
    if (source.status === "leave") result.approvedLeaveDays++;
  }
  return result;
}

/** Pure timing read model. Does not evaluate payroll, read a clock, or calculate money. */
export function buildHrAttendanceTiming(
  input: HrAttendanceTimingInput
): HrAttendanceTiming {
  const { dates, byDate } = coverage(input.from, input.to, input.payrollDays);
  const seen = new Set<string>();
  const schedules = input.schedules
    .map(schedule => {
      hrDateKey(schedule.effectiveFrom);
      if (seen.has(schedule.effectiveFrom))
        throw new Error("Duplicate attendance timing schedule effective date");
      seen.add(schedule.effectiveFrom);
      if (minutes(schedule.endTime) <= minutes(schedule.startTime))
        throw new Error(
          "Attendance timing schedule end must be after start on the same day"
        );
      return schedule;
    })
    .slice()
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const records = new Map<string, HrPayrollAttendance>();
  for (const record of input.attendance) {
    if (record.attendanceDate < input.from || record.attendanceDate > input.to)
      continue;
    hrDateKey(record.attendanceDate);
    if (records.has(record.attendanceDate))
      throw new Error("Duplicate attendance timing attendance date");
    records.set(record.attendanceDate, record);
  }
  const days = dates.map(date => {
    const schedule = isHrWorkingDay(date, input.holidays)
      ? schedules.filter(row => row.effectiveFrom <= date).at(-1)
      : undefined;
    const record = records.get(date);
    return measuredDay(
      date,
      schedule?.startTime ?? null,
      schedule?.endTime ?? null,
      record?.checkInAt ?? null,
      record?.checkOutAt ?? null
    );
  });
  return summarize(days, byDate);
}

/** Validate coverage, recorded intervals and every aggregate, then explicitly
 * project safe fields. Never spread a runtime timing object into an export.
 */
export function projectHrAttendanceTiming(
  source: HrAttendanceTiming,
  input: Pick<HrAttendanceTimingInput, "from" | "to" | "payrollDays">
): HrAttendanceTiming {
  const { dates, byDate } = coverage(input.from, input.to, input.payrollDays);
  if (!Array.isArray(source?.days) || source.days.length !== dates.length) {
    throw new Error(
      "Attendance timing rows must cover exactly the selected period"
    );
  }
  const rows = new Map(source.days.map(day => [day.date, day]));
  if (rows.size !== dates.length || dates.some(date => !rows.has(date))) {
    throw new Error(
      "Attendance timing dates must match the selected period with no duplicates"
    );
  }
  const days = dates.map(date => {
    const row = rows.get(date)!;
    const measured = measuredDay(
      date,
      row.scheduleStart,
      row.scheduleEnd,
      row.checkInAt,
      row.checkOutAt
    );
    if (!isHrWorkingDay(date) && measured.scheduledMinutes)
      throw new Error(
        "Attendance timing weekends must have zero scheduled minutes"
      );
    for (const key of [
      "scheduledMinutes",
      "recordedMinutes",
      "scheduledPresenceMinutes",
    ] as const) {
      if (!same(finite(row[key]), measured[key]))
        throw new Error(
          "Attendance timing daily values disagree with schedule or recorded punches"
        );
    }
    return measured;
  });
  const result = summarize(days, byDate);
  for (const key of Object.keys(result) as (keyof HrAttendanceTiming)[]) {
    if (key !== "days" && !same(finite(source[key]), result[key])) {
      throw new Error(
        "Attendance timing totals disagree with daily rows; refresh the overview"
      );
    }
  }
  return result;
}

/** Compatibility only: absent timing is unknown, not inferred from payroll loss.
 * No schedule, work duration, overlap or day-equivalent denominator is invented.
 */
export function emptyHrAttendanceTiming(
  payrollDays: readonly HrPayrollDay[]
): HrAttendanceTiming {
  return {
    scheduledMinutes: 0,
    evaluatedScheduledMinutes: 0,
    recordedMinutes: 0,
    scheduledPresenceMinutes: 0,
    lateHours: payrollDays.reduce((sum, day) => sum + day.lateMinutes, 0) / 60,
    lateEquivalentDays: 0,
    earlyEquivalentDays: 0,
    presentDays: payrollDays.filter(day => day.status === "present").length,
    creditedDays: payrollDays.filter(day => day.status === "credited").length,
    approvedLeaveDays: payrollDays.filter(day => day.status === "leave").length,
    days: payrollDays.map(day => ({
      date: day.date,
      scheduleStart: null,
      scheduleEnd: null,
      scheduledMinutes: 0,
      checkInAt: null,
      checkOutAt: null,
      recordedMinutes: 0,
      scheduledPresenceMinutes: 0,
    })),
  };
}
