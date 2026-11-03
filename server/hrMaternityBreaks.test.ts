import { describe, expect, it } from "vitest";
import {
  getHrMaternityBreakIntervals,
  hrMaternityBreakOverlapMinutes,
  validateHrMaternityBreaks,
  type HrMaternityBreakSchedule,
} from "../shared/hrMaternityBreaks";
import { calculateHrPayroll, type HrPayrollInput, type HrPayrollSchedule } from "../shared/hrPayroll";

const base: HrPayrollSchedule = {
  effectiveFrom: "2026-01-04", startTime: "09:00", endTime: "17:00", graceMinutes: 0,
  maternityBreakMode: "two_30", maternityBreakStart1: "09:00", maternityBreakStart2: "16:30",
};
const punch = (date = "2026-01-04", start = "09:30", end: string | null = "16:30", offset = "+02:00") => ({
  attendanceDate: date,
  checkInAt: `${date}T${start}:00${offset}`,
  checkOutAt: end === null ? null : `${date}T${end}:00${offset}`,
});
function calculate(overrides: Partial<HrPayrollInput> = {}) {
  return calculateHrPayroll({
    from: "2026-01-04", to: "2026-01-04", now: new Date("2026-12-01T18:00:00Z"),
    salary: 10000, schedules: [base], attendance: [punch()], holidays: [], approvedLeaveDates: [],
    ...overrides,
  });
}

describe("Cairo maternity/nursing schedule policy", () => {
  it("validates two disjoint thirty-minute windows and formats both for display", () => {
    const policy = validateHrMaternityBreaks(base);
    expect(policy.intervals).toEqual([{ startMinute: 540, endMinute: 570 }, { startMinute: 990, endMinute: 1020 }]);
    expect(policy.totalMinutes).toBe(60);
    expect(policy.displayText).toContain("2 × 30 min: 09:00–09:30 + 16:30–17:00 (Cairo)");
  });
  it("validates one full sixty-minute window", () => {
    const policy = validateHrMaternityBreaks({ ...base, maternityBreakMode: "one_60", maternityBreakStart2: null });
    expect(policy.intervals).toEqual([{ startMinute: 540, endMinute: 600 }]);
    expect(policy.totalMinutes).toBe(60);
    expect(policy.displayText).toContain("1 × 60 min: 09:00–10:00");
  });
  it("accepts contiguous slots without overlap and retains unsorted input slot labels", () => {
    const policy = validateHrMaternityBreaks({ ...base, maternityBreakStart1: "09:30", maternityBreakStart2: "09:00" });
    expect(policy.intervals).toEqual([{ startMinute: 540, endMinute: 570 }, { startMinute: 570, endMinute: 600 }]);
    expect(policy.maternityBreakStart1).toBe("09:30");
  });
  it("inherits schedule effective date and includes the final expiry day", () => {
    const policy = validateHrMaternityBreaks({ ...base, maternityBreakUntil: "2026-01-05" });
    expect(getHrMaternityBreakIntervals(policy, "2026-01-03")).toEqual([]);
    expect(getHrMaternityBreakIntervals(policy, "2026-01-04")).toHaveLength(2);
    expect(getHrMaternityBreakIntervals(policy, "2026-01-05")).toHaveLength(2);
    expect(getHrMaternityBreakIntervals(policy, "2026-01-06")).toEqual([]);
    expect(policy.displayText).toContain("through 2026-01-05 inclusive");
  });
  it.each([
    { maternityBreakMode: "two_60" }, { maternityBreakMode: null },
    { maternityBreakStart1: "9:00" }, { maternityBreakStart1: "24:00" },
    { maternityBreakStart1: "09:60" }, { maternityBreakStart1: null },
    { maternityBreakStart2: null }, { maternityBreakStart2: "16:31" },
    { maternityBreakStart1: "08:59" }, { maternityBreakStart2: "09:29" },
    { maternityBreakUntil: "2026-01-03" }, { maternityBreakUntil: "2026-02-30" },
    { maternityBreakUntil: "" },
    { maternityBreakMode: "one_60", maternityBreakStart1: "16:01", maternityBreakStart2: null },
    { maternityBreakMode: "one_60" },
    { endTime: "10:00", maternityBreakStart2: "09:30" },
    { endTime: "09:59", maternityBreakMode: "one_60", maternityBreakStart2: null },
    { endTime: "09:00" }, { effectiveFrom: "2026-02-30" },
  ])("rejects invalid policy independently of the router: %j", invalid => {
    expect(() => validateHrMaternityBreaks({ ...base, ...invalid } as HrMaternityBreakSchedule)).toThrow();
  });
  it("explicit none clears stale slots and expiry; old schedules without fields are compatible", () => {
    expect(validateHrMaternityBreaks({ ...base, maternityBreakMode: "none", maternityBreakUntil: "bad" })).toMatchObject({
      maternityBreakMode: "none", maternityBreakStart1: null, maternityBreakStart2: null,
      maternityBreakUntil: null, intervals: [], totalMinutes: 0,
    });
    expect(validateHrMaternityBreaks({ effectiveFrom: "2026-01-04", startTime: "09:00", endTime: "17:00" }).totalMinutes).toBe(0);
  });
  it("computes only window overlaps with exclusive boundaries", () => {
    const { intervals } = validateHrMaternityBreaks(base);
    expect(hrMaternityBreakOverlapMinutes(intervals, 540, 555)).toBe(15);
    expect(hrMaternityBreakOverlapMinutes(intervals, 570, 990)).toBe(0);
    expect(hrMaternityBreakOverlapMinutes(intervals, 1020, 1030)).toBe(0);
    expect(hrMaternityBreakOverlapMinutes(intervals, 570, 540)).toBe(0);
  });
});

describe("paid maternity windows in finalized HR payroll", () => {
  it("excludes both split slots without reducing full-shift wage rates or mutating punches", () => {
    const records = [punch()]; const before = structuredClone(records);
    const result = calculate({ attendance: records });
    expect(result.days[0]).toMatchObject({ status: "present", maternityBreakMinutes: 60, maternityExcusedMinutes: 60, missingMinutes: 0 });
    expect(result).toMatchObject({ lateMinutes: 0, earlyMinutes: 0, totalDeduction: 0, netSalary: 10000 });
    expect(result.minuteRate).toBe(10000 / 30 / 480);
    expect(records).toEqual(before);
  });
  it.each([
    ["09:15", "16:45", 30, 0, 0], ["09:45", "16:15", 60, 15, 15],
    ["09:00", "17:00", 0, 0, 0], ["08:00", "18:00", 0, 0, 0],
    ["18:00", "19:00", 60, 420, 0], ["07:00", "08:00", 60, 0, 420],
  ])("uses actual overlap for %s–%s, not a blanket 60-minute allowance", (start, end, excused, late, early) => {
    const result = calculate({ attendance: [punch("2026-01-04", start as string, end as string)] });
    expect(result.days[0].maternityExcusedMinutes).toBe(excused);
    expect(result.lateMinutes).toBe(late); expect(result.earlyMinutes).toBe(early);
  });
  it("excludes overlapping maternity before subtracting arrival grace", () => {
    const result = calculate({ schedules: [{ ...base, graceMinutes: 15 }], attendance: [punch("2026-01-04", "09:40", "17:00")] });
    expect(result.days[0]).toMatchObject({ maternityExcusedMinutes: 30, lateMinutes: 0 });
    expect(calculate({ schedules: [{ ...base, graceMinutes: 15 }], attendance: [punch("2026-01-04", "09:50", "17:00")] }).lateMinutes).toBe(5);
  });
  it("one-hour slot credits only its own timing, never time elsewhere", () => {
    const schedules = [{ ...base, maternityBreakMode: "one_60", maternityBreakStart1: "16:00", maternityBreakStart2: null }];
    expect(calculate({ schedules, attendance: [punch("2026-01-04", "10:00", "17:00")] }).days[0]).toMatchObject({ lateMinutes: 60, maternityExcusedMinutes: 0 });
    expect(calculate({ schedules, attendance: [punch("2026-01-04", "09:00", "16:00")] }).days[0]).toMatchObject({ earlyMinutes: 0, maternityExcusedMinutes: 60 });
  });
  it("never carries unused minutes into later days", () => {
    const result = calculate({ to: "2026-01-05", attendance: [punch("2026-01-04", "09:00", "17:00"), punch("2026-01-05", "10:30", "17:00")] });
    expect(result.days.map(day => day.maternityExcusedMinutes)).toEqual([0, 30]);
    expect(result.lateMinutes).toBe(60);
    expect(result.totalDeduction).toBe(41.67);
  });
  it("activates inclusively and expires without changing attendance classification", () => {
    const result = calculate({ from: "2026-01-01", to: "2026-01-08", schedules: [{ ...base, maternityBreakUntil: "2026-01-05" }], attendance: [punch("2026-01-04"), punch("2026-01-05"), punch("2026-01-06")] });
    expect(result.days.map(day => day.maternityBreakMinutes)).toEqual([0, 0, 0, 60, 60, 0, 0, 0]);
    expect(result.days.find(day => day.date === "2026-01-06")).toMatchObject({ status: "present", missingMinutes: 60, maternityExcusedMinutes: 0 });
  });
  it("new effective none policy disables the old grant inclusively", () => {
    const result = calculate({ to: "2026-01-05", schedules: [base, { ...base, effectiveFrom: "2026-01-05", maternityBreakMode: "none" }], attendance: [punch(), punch("2026-01-05")] });
    expect(result.days.map(day => day.maternityBreakMinutes)).toEqual([60, 0]);
    expect(result.days.map(day => day.missingMinutes)).toEqual([0, 60]);
  });
  it("does not waive full absences or any third incomplete-day penalty", () => {
    expect(calculate({ attendance: [] }).days[0]).toMatchObject({ status: "absent", missingMinutes: 480, maternityExcusedMinutes: 0, maternityBreakMinutes: 60 });
    const result = calculate({ to: "2026-01-06", attendance: [punch("2026-01-04", "09:30", null), punch("2026-01-05", "09:30", null), punch("2026-01-06", "09:30", null)] });
    expect(result).toMatchObject({ incompleteDays: 3, incompleteDeductionDays: 1, totalLostMinutes: 480, totalDeduction: 333.33 });
    expect(result.days.map(day => day.maternityExcusedMinutes)).toEqual([0, 0, 0]);
  });
  it.each([
    { now: new Date("2026-01-04T14:59:00Z") },
    { now: new Date("2026-01-03T18:00:00Z") },
    { approvedLeaveDates: ["2026-01-04"] },
    { attendanceCreditDates: ["2026-01-04"] },
    { holidays: ["2026-01-04"] },
    { schedules: [] },
  ])("never gives excused minutes to non-finalized-present status %#", overrides => {
    const day = calculate(overrides).days[0];
    expect(day.status).not.toBe("present"); expect(day.maternityExcusedMinutes).toBe(0);
    if (["holiday", "unconfigured"].includes(day.status)) expect(day.maternityBreakMinutes).toBe(0);
  });
  it("uses Cairo DST wall time for summer slots", () => {
    const result = calculate({ from: "2026-07-05", to: "2026-07-05", attendance: [punch("2026-07-05", "09:30", "16:30", "+03:00")] });
    expect(result.days[0]).toMatchObject({ missingMinutes: 0, maternityExcusedMinutes: 60 });
  });
  it("partitions overlapping loss windows during Cairo clock reversal, never granting twice", () => {
    const result = calculate({
      from: "2026-10-29", to: "2026-10-29",
      schedules: [{ ...base, startTime: "21:00", endTime: "23:59", maternityBreakMode: "one_60", maternityBreakStart1: "22:30", maternityBreakStart2: null }],
      attendance: [{ attendanceDate: "2026-10-29", checkInAt: "2026-10-29T20:40:00Z", checkOutAt: "2026-10-29T21:20:00Z" }],
    });
    expect(result.days[0]).toMatchObject({ status: "present", maternityExcusedMinutes: 60, missingMinutes: 119 });
    expect(result.totalLostMinutes).toBeLessThanOrEqual(179);
  });
  it("rejects reversed real instants, including outside-shift punches, rather than fabricating attendance", () => {
    expect(() => calculate({ attendance: [punch("2026-01-04", "18:00", "08:00")] })).toThrow("precede");
  });
  it("old schedules default both day policy fields to zero without changing deductions", () => {
    const result = calculate({ schedules: [{ effectiveFrom: "2026-01-01", startTime: "09:00", endTime: "17:00", graceMinutes: 0 }] });
    expect(result.days[0]).toMatchObject({ maternityBreakMinutes: 0, maternityExcusedMinutes: 0, missingMinutes: 60 });
    expect(result.totalDeduction).toBe(41.67);
  });
});
