import { assertHrAttendanceDate } from "./hrAttendance";

export const HR_MATERNITY_BREAK_MODES = ["none", "two_30", "one_60"] as const;
export type HrMaternityBreakMode = (typeof HR_MATERNITY_BREAK_MODES)[number];

/** Optional fields keep pre-policy schedules and legacy callers compatible. */
export type HrMaternityBreakPolicy = {
  maternityBreakMode?: string;
  maternityBreakStart1?: string | null;
  maternityBreakStart2?: string | null;
  maternityBreakUntil?: string | null;
};

export type HrMaternityBreakSchedule = HrMaternityBreakPolicy & {
  effectiveFrom: string;
  startTime: string;
  endTime: string;
};

/** Same-day Cairo wall-clock minute interval, with an exclusive end. */
export type HrMaternityBreakInterval = {
  startMinute: number;
  endMinute: number;
};

export type ValidatedHrMaternityBreaks = {
  effectiveFrom: string;
  maternityBreakMode: HrMaternityBreakMode;
  maternityBreakStart1: string | null;
  maternityBreakStart2: string | null;
  maternityBreakUntil: string | null;
  intervals: HrMaternityBreakInterval[];
  totalMinutes: number;
  displayText: string;
};

export function hrScheduleTimeMinutes(time: string): number {
  if (typeof time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("HR schedule times must use HH:mm");
  }
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function clockText(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/**
 * Validate independently of HTTP/schema validation. Breaks never shorten the
 * gross shift or its wage denominator. Explicit `none` disables and clears all
 * stale policy details; an omitted mode is the legacy no-break policy.
 */
export function validateHrMaternityBreaks(
  schedule: HrMaternityBreakSchedule
): ValidatedHrMaternityBreaks {
  const effectiveFrom = assertHrAttendanceDate(schedule.effectiveFrom);
  const start = hrScheduleTimeMinutes(schedule.startTime);
  const end = hrScheduleTimeMinutes(schedule.endTime);
  if (end <= start) {
    throw new Error("HR schedule end must be after start on the same day");
  }
  const mode = schedule.maternityBreakMode === undefined
    ? "none"
    : schedule.maternityBreakMode;
  if (!HR_MATERNITY_BREAK_MODES.includes(mode as HrMaternityBreakMode)) {
    throw new Error("Maternity break mode must be none, two_30, or one_60");
  }
  if (mode === "none") {
    return {
      effectiveFrom,
      maternityBreakMode: "none",
      maternityBreakStart1: null,
      maternityBreakStart2: null,
      maternityBreakUntil: null,
      intervals: [],
      totalMinutes: 0,
      displayText: "No paid maternity/nursing breaks",
    };
  }

  const until = schedule.maternityBreakUntil ?? null;
  if (until !== null) {
    assertHrAttendanceDate(until);
    if (until < effectiveFrom) {
      throw new Error("Maternity break until date must be on or after schedule effective date");
    }
  }
  const first = hrScheduleTimeMinutes(schedule.maternityBreakStart1 as string);
  const duration = mode === "two_30" ? 30 : 60;
  const intervals = [{ startMinute: first, endMinute: first + duration }];
  if (mode === "two_30") {
    const second = hrScheduleTimeMinutes(schedule.maternityBreakStart2 as string);
    intervals.push({ startMinute: second, endMinute: second + 30 });
  } else if (schedule.maternityBreakStart2 != null) {
    throw new Error("One 60-minute maternity break must not have a second slot");
  }
  intervals.sort((a, b) => a.startMinute - b.startMinute);
  if (intervals.some(slot => slot.startMinute < start || slot.endMinute > end)) {
    throw new Error("Each full maternity break must be wholly within the Cairo shift");
  }
  if (intervals.some((slot, index) => index > 0 && slot.startMinute < intervals[index - 1].endMinute)) {
    throw new Error("Maternity break slots must not overlap");
  }
  const totalMinutes = intervals.reduce((sum, slot) => sum + slot.endMinute - slot.startMinute, 0);
  if (totalMinutes > 60 || end - start <= totalMinutes) {
    throw new Error("Maternity breaks must total at most 60 minutes and leave positive non-break duty time");
  }
  const slots = intervals.map(slot => `${clockText(slot.startMinute)}–${clockText(slot.endMinute)}`).join(" + ");
  return {
    effectiveFrom,
    maternityBreakMode: mode as HrMaternityBreakMode,
    maternityBreakStart1: schedule.maternityBreakStart1!,
    maternityBreakStart2: mode === "two_30" ? schedule.maternityBreakStart2! : null,
    maternityBreakUntil: until,
    intervals,
    totalMinutes,
    displayText: `${mode === "two_30" ? "2 × 30 min" : "1 × 60 min"}: ${slots} (Cairo), from ${effectiveFrom}${until ? ` through ${until} inclusive` : ""}`,
  };
}

/** The schedule selector owns workday filtering; expiry is inclusive. */
export function getHrMaternityBreakIntervals(
  policy: ValidatedHrMaternityBreaks,
  date: string
): readonly HrMaternityBreakInterval[] {
  assertHrAttendanceDate(date);
  return date >= policy.effectiveFrom &&
    (policy.maternityBreakUntil === null || date <= policy.maternityBreakUntil)
    ? policy.intervals
    : [];
}

/** Actual interval overlap only, never a fungible daily time allowance. */
export function hrMaternityBreakOverlapMinutes(
  intervals: readonly HrMaternityBreakInterval[],
  fromMinute: number,
  toMinute: number
): number {
  if (toMinute <= fromMinute) return 0;
  return intervals.reduce((sum, slot) =>
    sum + Math.max(0, Math.min(toMinute, slot.endMinute) - Math.max(fromMinute, slot.startMinute)), 0);
}
