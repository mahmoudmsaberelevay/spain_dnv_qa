import { describe, expect, it } from "vitest";
import {
  HR_SALARY_DAYS,
  calculateHrPayroll,
  countHrLeaveWorkingDays,
  hrDateKey,
  isHrWorkingDay,
  listHrDates,
  type HrPayrollAttendance,
  type HrPayrollInput,
  type HrPayrollSchedule,
} from "../shared/hrPayroll";

const schedule: HrPayrollSchedule = {
  effectiveFrom: "2026-01-01",
  startTime: "09:00",
  endTime: "17:00",
  graceMinutes: 15,
};

function punch(
  date: string,
  checkIn = "09:00",
  checkOut: string | null = "17:00",
  offset = "+02:00"
): HrPayrollAttendance {
  return {
    attendanceDate: date,
    checkInAt: `${date}T${checkIn}:00${offset}`,
    checkOutAt: checkOut === null ? null : `${date}T${checkOut}:00${offset}`,
  };
}

function input(overrides: Partial<HrPayrollInput> = {}): HrPayrollInput {
  return {
    from: "2026-01-04",
    to: "2026-01-08",
    now: new Date("2026-01-12T18:00:00Z"),
    salary: 1000,
    schedules: [schedule],
    attendance: [],
    holidays: [],
    approvedLeaveDates: [],
    ...overrides,
  };
}

function singleDay(overrides: Partial<HrPayrollInput> = {}) {
  return calculateHrPayroll(
    input({ from: "2026-01-04", to: "2026-01-04", ...overrides })
  );
}

function expectNoLoss(result: ReturnType<typeof calculateHrPayroll>) {
  expect(result).toMatchObject({
    lateMinutes: 0,
    earlyMinutes: 0,
    absentDays: 0,
    incompleteDeductionDays: 0,
    totalLostMinutes: 0,
    lostHours: 0,
    equivalentDays: 0,
    totalDeduction: 0,
    netSalary: 1000,
  });
}

describe("HR date helpers", () => {
  it.each([
    "2024-02-29",
    "2026-01-01",
    "0000-01-01",
    "0099-12-31",
    "9999-12-31",
  ])("validates %s without normalization", date => {
    expect(hrDateKey(date)).toBe(date);
  });

  it.each([
    "2026-02-29",
    "2024-02-30",
    "2026-04-31",
    "2026-00-01",
    "2026-13-01",
    "2026-01-00",
    "2026-01-32",
    "2026-1-01",
    "26-01-01",
    " 2026-01-01",
    "2026-01-01 ",
    "2026-01-01T00:00:00Z",
    "not-a-date",
    "",
  ])("rejects invalid or noncanonical date %s", date => {
    expect(() => hrDateKey(date)).toThrow();
  });

  it("rejects runtime non-string dates", () => {
    expect(() => hrDateKey(null as unknown as string)).toThrow();
    expect(() => hrDateKey(new Date() as unknown as string)).toThrow();
  });

  it("lists inclusive dates across leap days and years", () => {
    expect(listHrDates("2024-02-28", "2024-03-01")).toEqual([
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
    ]);
    expect(listHrDates("2025-12-31", "2026-01-02")).toEqual([
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
    ]);
    expect(listHrDates("2026-01-04", "2026-01-04")).toEqual(["2026-01-04"]);
    expect(listHrDates("0099-12-31", "0100-01-01")).toEqual([
      "0099-12-31",
      "0100-01-01",
    ]);
  });

  it("accepts exactly 366 days but rejects longer and reversed ranges", () => {
    expect(listHrDates("2024-01-01", "2024-12-31")).toHaveLength(366);
    expect(listHrDates("2025-01-01", "2026-01-01")).toHaveLength(366);
    expect(() => listHrDates("2024-01-01", "2025-01-01")).toThrow("366");
    expect(() => listHrDates("2026-01-08", "2026-01-04")).toThrow("start date");
    expect(() => listHrDates("2026-02-30", "2026-03-01")).toThrow();
  });

  it.each([
    ["2026-01-04", true],
    ["2026-01-05", true],
    ["2026-01-06", true],
    ["2026-01-07", true],
    ["2026-01-08", true],
    ["2026-01-09", false],
    ["2026-01-10", false],
  ])("uses the Sun–Thu workweek for %s", (date, expected) => {
    expect(isHrWorkingDay(date)).toBe(expected);
  });

  it("excludes and validates holidays", () => {
    expect(isHrWorkingDay("2026-01-04", ["2026-01-04", "2026-01-04"])).toBe(
      false
    );
    expect(() => isHrWorkingDay("2026-01-09", ["2026-02-30"])).toThrow();
    expect(() => isHrWorkingDay("2026-02-30", [])).toThrow();
  });

  it("counts leave per year without weekends, holidays, or duplicate holidays", () => {
    expect(
      countHrLeaveWorkingDays("2025-12-28", "2026-01-04", [
        "2025-12-30",
        "2026-01-01",
        "2026-01-01",
      ])
    ).toEqual([
      { year: 2025, days: 3 },
      { year: 2026, days: 1 },
    ]);
    expect(countHrLeaveWorkingDays("2026-01-09", "2026-01-10")).toEqual([]);
    expect(
      countHrLeaveWorkingDays("2026-01-04", "2026-01-04", ["2026-01-04"])
    ).toEqual([]);
  });

  it("applies range validation and the bound to leave counting", () => {
    expect(() => countHrLeaveWorkingDays("2024-01-01", "2025-01-01")).toThrow(
      "366"
    );
    expect(() => countHrLeaveWorkingDays("2026-01-08", "2026-01-04")).toThrow();
    expect(() =>
      countHrLeaveWorkingDays("2026-01-04", "2026-01-04", ["bad"])
    ).toThrow();
  });
});

describe("deterministic HR payroll", () => {
  it("credits supplied dates without rewriting punches, including future credit, then enforces November 4 normally", () => {
    const source = input({
      from: "2026-10-27",
      to: "2026-11-04",
      salary: 10000,
      now: new Date("2026-11-04T18:00:00Z"),
      attendanceCreditDates: Object.freeze(
        listHrDates("2026-10-27", "2026-11-03")
      ),
      attendance: [
        punch("2026-10-27", "12:00", "14:00", "+03:00"),
        punch("2026-10-28", "15:00", null, "+03:00"),
      ],
    });
    const before = JSON.stringify(source);
    const result = calculateHrPayroll(source);
    expect(
      result.days.slice(0, -1).every(day => day.status === "credited")
    ).toBe(true);
    expect(
      result.days.slice(0, -1).every(day => day.missingMinutes === 0)
    ).toBe(true);
    expect(result.days.at(-1)).toMatchObject({
      date: "2026-11-04",
      status: "absent",
      missingMinutes: 480,
    });
    expect(result).toMatchObject({
      workingDays: 7,
      evaluatedDays: 7,
      lateMinutes: 0,
      earlyMinutes: 0,
      incompleteDays: 0,
      incompleteDeductionDays: 0,
      absentDays: 1,
      equivalentDays: 1,
      totalLostMinutes: 480,
      totalDeduction: 333.33,
      netSalary: 9666.67,
    });
    const live = calculateHrPayroll({
      ...source,
      now: new Date("2026-11-02T10:00:00Z"),
    });
    expect(live.days.find(day => day.date === "2026-11-03")?.status).toBe(
      "credited"
    );
    expect(live.days.at(-1)?.status).toBe("future");
    expect(live.workingDays).toBe(7);
    expect(live.evaluatedDays).toBe(6);
    expect(live.totalDeduction).toBe(0);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("shows explicit credits without schedules, even for future dates, without adding evaluated or working days", () => {
    const result = calculateHrPayroll(
      input({
        from: "2026-10-27",
        to: "2026-11-04",
        salary: 10000,
        now: new Date("2026-11-02T10:00:00Z"),
        schedules: [],
        attendanceCreditDates: listHrDates("2026-10-27", "2026-11-03"),
        attendance: [punch("2026-10-27", "15:00", null, "+03:00")],
      })
    );
    expect(result.days.slice(0, -1).map(day => day.status)).toEqual(
      Array(8).fill("credited")
    );
    expect(result.days.at(-1)?.status).toBe("unconfigured");
    expect(result).toMatchObject({
      workingDays: 0,
      evaluatedDays: 0,
      lateMinutes: 0,
      earlyMinutes: 0,
      absentDays: 0,
      incompleteDays: 0,
      incompleteDeductionDays: 0,
      totalLostMinutes: 0,
      equivalentDays: 0,
      dailyRate: 10000 / 30,
      hourlyRate: 0,
      minuteRate: 0,
      totalDeduction: 0,
      netSalary: 10000,
    });
  });

  it.each([
    ["2026-01-01", "2026-01-31"],
    ["2026-02-01", "2026-02-28"],
    ["2024-02-01", "2024-02-29"],
    ["2026-03-01", "2026-03-31"],
    ["2026-01-04", "2026-01-04"],
    ["2026-01-04", "2026-01-08"],
    ["2026-01-29", "2026-02-02"],
  ])("uses salary / 30 for EGP 10000 over %s–%s", (from, to) => {
    const result = calculateHrPayroll(
      input({
        from,
        to,
        salary: 10000,
        now: new Date("2026-12-01T00:00:00Z"),
        schedules: [{ ...schedule, effectiveFrom: "2024-01-01" }],
      })
    );
    expect(HR_SALARY_DAYS).toBe(30);
    expect(result.dailyRate).toBe(10000 / 30);
    expect(result.dailyRate.toFixed(2)).toBe("333.33");
    expect(result.minuteRate).toBe(10000 / 30 / 480);
    expect(result.hourlyRate).toBeCloseTo(10000 / 30 / 8, 12);
  });

  it.each([
    { schedules: [] },
    { schedules: [{ ...schedule, effectiveFrom: "2026-02-01" }] },
    { from: "2026-01-09", to: "2026-01-10" },
    { holidays: listHrDates("2026-01-04", "2026-01-08") },
  ])(
    "keeps EGP 10000 / 30 with zero time rates when no days are scheduled %#",
    overrides => {
      const result = calculateHrPayroll(input({ ...overrides, salary: 10000 }));
      expect(result).toMatchObject({
        workingDays: 0,
        evaluatedDays: 0,
        dailyRate: 10000 / 30,
        hourlyRate: 0,
        minuteRate: 0,
        equivalentDays: 0,
        totalDeduction: 0,
        netSalary: 10000,
      });
    }
  );

  it("deducts EGP 333.33 for one absence on an EGP 10000 salary", () => {
    const result = singleDay({ salary: 10000 });
    expect(result).toMatchObject({
      absentDays: 1,
      totalLostMinutes: 480,
      equivalentDays: 1,
      dailyRate: 10000 / 30,
      totalDeduction: 333.33,
      netSalary: 9666.67,
    });
  });

  it("deducts EGP 41.67 for 60 missed minutes in an eight-hour day on EGP 10000", () => {
    const result = singleDay({
      salary: 10000,
      schedules: [{ ...schedule, graceMinutes: 0 }],
      attendance: [punch("2026-01-04", "10:00")],
    });
    expect(result).toMatchObject({
      absentDays: 0,
      lateMinutes: 60,
      earlyMinutes: 0,
      totalLostMinutes: 60,
      equivalentDays: 60 / 480,
      dailyRate: 10000 / 30,
      minuteRate: 10000 / 30 / 480,
      totalDeduction: 41.67,
      netSalary: 9958.33,
    });
  });

  it("does not prematurely round the EGP 10000 daily rate before three absences", () => {
    const result = calculateHrPayroll(
      input({ salary: 10000, to: "2026-01-06" })
    );
    expect(result.dailyRate).toBe(10000 / 30);
    expect(result.equivalentDays).toBe(3);
    expect(result.totalDeduction).toBe(1000);
    expect(result.netSalary).toBe(9000);
    expect(result.totalDeduction).not.toBe(
      Number(result.dailyRate.toFixed(2)) * 3
    );
  });

  it("caps total monetary penalties at the monthly salary for longer ranges", () => {
    const result = calculateHrPayroll(
      input({
        salary: 10000,
        from: "2026-01-01",
        to: "2026-02-28",
        now: new Date("2026-03-01T18:00:00Z"),
      })
    );
    expect(result.equivalentDays).toBeGreaterThan(30);
    expect(result.dailyRate).toBe(10000 / 30);
    expect(result.totalDeduction).toBe(10000);
    expect(result.netSalary).toBe(0);
  });

  it("returns the exact preview contract and unchanged salary for a fully attended cycle", () => {
    const records = listHrDates("2026-01-04", "2026-01-08").map(date =>
      punch(date)
    );
    const result = calculateHrPayroll(input({ attendance: records }));
    expect(result).toEqual({
      workingDays: 5,
      evaluatedDays: 5,
      lateMinutes: 0,
      earlyMinutes: 0,
      absentDays: 0,
      incompleteDays: 0,
      incompleteDeductionDays: 0,
      totalLostMinutes: 0,
      lostHours: 0,
      equivalentDays: 0,
      dailyRate: 1000 / 30,
      hourlyRate: (1000 / 30 / (8 * 60)) * 60,
      minuteRate: 1000 / 30 / (8 * 60),
      totalDeduction: 0,
      netSalary: 1000,
      days: records.map(record => ({
        date: record.attendanceDate,
        status: "present",
        lateMinutes: 0,
        earlyMinutes: 0,
        missingMinutes: 0,
        maternityExcusedMinutes: 0,
        maternityBreakMinutes: 0,
      })),
    });
  });

  it.each([0, 2, 3, 5, 6])(
    "applies floor(%i incomplete days / 3), not fractional penalties",
    incompleteDays => {
      const dates = listHrDates("2026-01-04", "2026-01-11").filter(date =>
        isHrWorkingDay(date)
      );
      const records = dates.map((date, index) =>
        punch(date, "15:00", index < incompleteDays ? null : "17:00")
      );
      // Complete days use punctual punches; incomplete late check-ins receive no lateness.
      for (let index = incompleteDays; index < records.length; index += 1)
        records[index] = punch(dates[index]);
      const result = calculateHrPayroll(
        input({ to: "2026-01-11", attendance: records })
      );
      const deductionDays = Math.floor(incompleteDays / 3);
      expect(result).toMatchObject({
        workingDays: 6,
        evaluatedDays: 6,
        incompleteDays,
        incompleteDeductionDays: deductionDays,
        absentDays: 0,
        lateMinutes: 0,
        earlyMinutes: 0,
        equivalentDays: deductionDays,
        totalLostMinutes: deductionDays * 8 * 60,
        lostHours: deductionDays * 8,
        totalDeduction: Number(((1000 / 30) * deductionDays).toFixed(2)),
        netSalary: Number((1000 - (1000 / 30) * deductionDays).toFixed(2)),
      });
      const incomplete = result.days.filter(day => day.status === "incomplete");
      expect(incomplete).toHaveLength(incompleteDays);
      expect(incomplete.map(day => day.missingMinutes)).toEqual(
        Array.from({ length: incompleteDays }, (_, index) =>
          (index + 1) % 3 === 0 ? 8 * 60 : 0
        )
      );
    }
  );

  it("does not count out-of-cycle incomplete punches toward this cycle's floor", () => {
    const result = singleDay({
      attendance: [
        punch("2026-01-01", "15:00", null),
        punch("2026-01-04", "15:00", null),
      ],
    });
    expect(result.incompleteDays).toBe(1);
    expectNoLoss(result);
  });

  it("combines absent full days, grouped incomplete days, and minute losses without double deductions", () => {
    const result = calculateHrPayroll(
      input({
        attendance: [
          punch("2026-01-04", "16:00", null),
          punch("2026-01-05", "16:00", null),
          punch("2026-01-06", "16:00", null),
          punch("2026-01-07", "09:45", "16:30"),
        ],
      })
    );
    const equivalentDays = 2 + 60 / 480;
    expect(result).toMatchObject({
      absentDays: 1,
      incompleteDays: 3,
      incompleteDeductionDays: 1,
      lateMinutes: 30,
      earlyMinutes: 30,
    });
    expect(result.totalLostMinutes).toBe(2 * 480 + 60);
    expect(result.equivalentDays).toBe(equivalentDays);
    expect(result.totalDeduction).toBe(
      Number(((1000 / 30) * equivalentDays).toFixed(2))
    );
    expect(result.netSalary).toBe(1000 - result.totalDeduction);
    expect(result.days.reduce((sum, day) => sum + day.missingMinutes, 0)).toBe(
      result.totalLostMinutes
    );
  });

  it("does not count holidays, weekends, or paid leave as absences or incomplete days", () => {
    const result = calculateHrPayroll(
      input({
        to: "2026-01-10",
        holidays: ["2026-01-06", "2026-01-06", "2026-01-09"],
        approvedLeaveDates: [
          "2026-01-04",
          "2026-01-04",
          "2026-01-07",
          "2026-01-09",
        ],
        attendance: [
          punch("2026-01-04", "15:00", null),
          punch("2026-01-05"),
          punch("2026-01-06", "15:00", null),
          punch("2026-01-08"),
          punch("2026-01-09", "15:00", null),
        ],
      })
    );
    expect(result.workingDays).toBe(4);
    expect(result.evaluatedDays).toBe(4);
    expect(result.dailyRate).toBe(1000 / 30);
    expect(result.incompleteDays).toBe(0);
    expect(result.days.map(day => day.status)).toEqual([
      "leave",
      "present",
      "holiday",
      "leave",
      "present",
      "weekend",
      "weekend",
    ]);
    expectNoLoss(result);
  });

  it("excludes approved paid leave from penalties without changing the fixed daily rate", () => {
    const result = calculateHrPayroll(
      input({ approvedLeaveDates: ["2026-01-04"] })
    );
    expect(result.workingDays).toBe(5);
    expect(result.evaluatedDays).toBe(5);
    expect(result.absentDays).toBe(4);
    expect(result.totalDeduction).toBe(Number(((1000 / 30) * 4).toFixed(2)));
  });

  it("keeps the fixed daily rate, zero time rates, and no penalties when there is no schedule", () => {
    const result = calculateHrPayroll(
      input({ schedules: [], attendance: [punch("2026-01-04", "15:00", null)] })
    );
    expect(result).toMatchObject({
      workingDays: 0,
      evaluatedDays: 0,
      dailyRate: 1000 / 30,
      hourlyRate: 0,
      minuteRate: 0,
      incompleteDays: 0,
    });
    expect(result.days.every(day => day.status === "unconfigured")).toBe(true);
    expectNoLoss(result);
  });

  it("never backdates absence before the first configured effective date", () => {
    const result = calculateHrPayroll(
      input({ schedules: [{ ...schedule, effectiveFrom: "2026-01-07" }] })
    );
    expect(result.days.map(day => day.status)).toEqual([
      "unconfigured",
      "unconfigured",
      "unconfigured",
      "absent",
      "absent",
    ]);
    expect(result).toMatchObject({
      workingDays: 2,
      evaluatedDays: 2,
      absentDays: 2,
      dailyRate: 1000 / 30,
      totalDeduction: Number(((1000 / 30) * 2).toFixed(2)),
      netSalary: Number((1000 - (1000 / 30) * 2).toFixed(2)),
    });
  });

  it("handles an all-off cycle without division by zero", () => {
    const result = calculateHrPayroll(
      input({ from: "2026-01-09", to: "2026-01-10" })
    );
    expect(result).toMatchObject({
      workingDays: 0,
      evaluatedDays: 0,
      dailyRate: 1000 / 30,
      hourlyRate: 0,
      minuteRate: 0,
    });
    expectNoLoss(result);
  });

  it("uses the fixed daily rate and counts penalties only on elapsed working days", () => {
    const result = calculateHrPayroll(
      input({ now: new Date("2026-01-05T08:00:00Z") })
    );
    expect(result.workingDays).toBe(5);
    expect(result.evaluatedDays).toBe(1);
    expect(result.absentDays).toBe(1);
    expect(result.dailyRate).toBe(1000 / 30);
    expect(result.totalDeduction).toBe(Number((1000 / 30).toFixed(2)));
    expect(result.days.map(day => day.status)).toEqual([
      "absent",
      "in_progress",
      "future",
      "future",
      "future",
    ]);
  });

  it.each([
    { attendance: [] },
    { attendance: [punch("2026-01-04", "10:00", null)] },
    { attendance: [punch("2026-01-04", "09:45", "10:00")] },
  ])(
    "never finalizes today's live shift, including a complete early checkout",
    ({ attendance }) => {
      const result = singleDay({
        now: new Date("2026-01-04T14:59:59Z"),
        attendance,
      });
      expect(result.workingDays).toBe(1);
      expect(result.evaluatedDays).toBe(0);
      expect(result.incompleteDays).toBe(0);
      expect(result.days[0].status).toBe("in_progress");
      expectNoLoss(result);
    }
  );

  it.each([
    { records: [], status: "absent", absentDays: 1, incompleteDays: 0 },
    {
      records: [punch("2026-01-04", "15:00", null)],
      status: "incomplete",
      absentDays: 0,
      incompleteDays: 1,
    },
    {
      records: [punch("2026-01-04")],
      status: "present",
      absentDays: 0,
      incompleteDays: 0,
    },
  ])(
    "finalizes ended today at exactly shift end as $status",
    ({ records, status, absentDays, incompleteDays }) => {
      const result = singleDay({
        now: new Date("2026-01-04T15:00:00Z"),
        attendance: records,
      });
      expect(result).toMatchObject({
        evaluatedDays: 1,
        absentDays,
        incompleteDays,
      });
      expect(result.days[0].status).toBe(status);
    }
  );

  it("does not finalize future dates even if punches or approved leave have been supplied", () => {
    const result = singleDay({
      now: new Date("2026-01-03T10:00:00Z"),
      attendance: [punch("2026-01-04", "10:00", null)],
      approvedLeaveDates: ["2026-01-04"],
    });
    expect(result.days[0].status).toBe("future");
    expect(result.evaluatedDays).toBe(0);
    expect(result.incompleteDays).toBe(0);
    expectNoLoss(result);
  });

  it("compares now to the Cairo business date rather than the UTC date", () => {
    const result = singleDay({ now: new Date("2026-01-03T22:30:00Z") });
    expect(result.days[0].status).toBe("in_progress");
    expectNoLoss(result);
  });

  it.each([
    {
      date: "2026-01-04",
      checkIn: "2026-01-04T07:45:00Z",
      checkOut: "2026-01-04T14:30:00Z",
    },
    {
      date: "2026-07-05",
      checkIn: "2026-07-05T06:45:00Z",
      checkOut: "2026-07-05T13:30:00Z",
    },
    {
      date: "2026-04-23",
      checkIn: "2026-04-23T07:45:00Z",
      checkOut: "2026-04-23T14:30:00Z",
    },
    {
      date: "2026-04-26",
      checkIn: "2026-04-26T06:45:00Z",
      checkOut: "2026-04-26T13:30:00Z",
    },
    {
      date: "2026-10-29",
      checkIn: "2026-10-29T06:45:00Z",
      checkOut: "2026-10-29T13:30:00Z",
    },
    {
      date: "2026-11-01",
      checkIn: "2026-11-01T07:45:00Z",
      checkOut: "2026-11-01T14:30:00Z",
    },
  ])(
    "uses Cairo DST-correct wall-clock minutes on $date",
    ({ date, checkIn, checkOut }) => {
      const result = singleDay({
        from: date,
        to: date,
        now: new Date("2026-12-01T00:00:00Z"),
        attendance: [
          {
            attendanceDate: date,
            checkInAt: new Date(checkIn),
            checkOutAt: checkOut,
          },
        ],
      });
      expect(result).toMatchObject({
        lateMinutes: 30,
        earlyMinutes: 30,
        totalLostMinutes: 60,
        equivalentDays: 60 / 480,
        totalDeduction: Number(((1000 / 30) * (60 / 480)).toFixed(2)),
      });
    }
  );

  it.each([
    {
      date: "2026-04-23",
      before: "2026-04-23T14:59:00Z",
      ended: "2026-04-23T15:00:00Z",
    },
    {
      date: "2026-04-26",
      before: "2026-04-26T13:59:00Z",
      ended: "2026-04-26T14:00:00Z",
    },
    {
      date: "2026-10-29",
      before: "2026-10-29T13:59:00Z",
      ended: "2026-10-29T14:00:00Z",
    },
    {
      date: "2026-11-01",
      before: "2026-11-01T14:59:00Z",
      ended: "2026-11-01T15:00:00Z",
    },
  ])(
    "uses the correct DST shift-end cutoff on $date",
    ({ date, before, ended }) => {
      expect(
        singleDay({ from: date, to: date, now: new Date(before) }).days[0]
          .status
      ).toBe("in_progress");
      expect(
        singleDay({ from: date, to: date, now: new Date(ended) }).days[0].status
      ).toBe("absent");
    }
  );

  it.each([
    { start: "08:00", end: "18:00", late: 0, early: 0 },
    { start: "09:00", end: "17:00", late: 0, early: 0 },
    { start: "09:15", end: "17:00", late: 0, early: 0 },
    { start: "09:16", end: "17:00", late: 1, early: 0 },
    { start: "09:45", end: "16:30", late: 30, early: 30 },
    { start: "06:00", end: "08:00", late: 0, early: 480 },
    { start: "18:00", end: "23:00", late: 480 - 15, early: 0 },
    { start: "12:00", end: "12:00", late: 180 - 15, early: 300 },
  ])(
    "clamps same-day punches $start–$end and applies start grace only",
    ({ start, end, late, early }) => {
      const result = singleDay({
        attendance: [punch("2026-01-04", start, end)],
      });
      expect(result.lateMinutes).toBe(late);
      expect(result.earlyMinutes).toBe(early);
      expect(result.totalLostMinutes).toBe(late + early);
      expect(result.totalLostMinutes).toBeLessThanOrEqual(480);
      expect(result.totalDeduction).toBeLessThanOrEqual(1000);
      expect(result.netSalary).toBeGreaterThanOrEqual(0);
    }
  );

  it("clamps next-day checkout to shift end instead of treating it as an early departure", () => {
    const record = punch("2026-01-04");
    record.checkOutAt = "2026-01-05T00:30:00+02:00";
    const result = singleDay({ attendance: [record] });
    expect(result.days[0].status).toBe("present");
    expectNoLoss(result);
  });

  it("uses Cairo date validation and clamp even across the autumn DST reversal", () => {
    const result = singleDay({
      from: "2026-10-29",
      to: "2026-10-29",
      now: new Date("2026-11-01T12:00:00Z"),
      attendance: [
        {
          attendanceDate: "2026-10-29",
          checkInAt: "2026-10-29T06:00:00Z",
          checkOutAt: "2026-10-29T22:30:00Z",
        },
      ],
    });
    expectNoLoss(result);
  });

  it("supports a zero-grace policy and a grace period longer than a shift", () => {
    expect(
      singleDay({
        schedules: [{ ...schedule, graceMinutes: 0 }],
        attendance: [punch("2026-01-04", "09:10")],
      }).lateMinutes
    ).toBe(10);
    const result = singleDay({
      schedules: [{ ...schedule, endTime: "10:00", graceMinutes: 120 }],
      attendance: [punch("2026-01-04", "09:15", "09:30")],
    });
    expect(result).toMatchObject({
      lateMinutes: 0,
      earlyMinutes: 30,
      totalLostMinutes: 30,
    });
  });

  it("selects unsorted schedule changes inclusively, weights each lost fraction using that day's span, and averages configured spans for time rates", () => {
    const result = calculateHrPayroll(
      input({
        schedules: [
          {
            effectiveFrom: "2026-01-06",
            startTime: "10:00",
            endTime: "14:00",
            graceMinutes: 0,
          },
          {
            effectiveFrom: "2026-02-01",
            startTime: "09:00",
            endTime: "10:00",
            graceMinutes: 0,
          },
          { ...schedule, graceMinutes: 0 },
        ],
        attendance: [
          punch("2026-01-04", "10:00"),
          punch("2026-01-05"),
          punch("2026-01-06", "11:00", "14:00"),
          punch("2026-01-07", "10:00", "14:00"),
          punch("2026-01-08", "10:00", "14:00"),
        ],
      })
    );
    const equivalentDays = 60 / 480 + 60 / 240;
    expect(result.workingDays).toBe(5);
    expect(result.dailyRate).toBe(1000 / 30);
    expect(result.minuteRate).toBe(1000 / 30 / ((2 * 480 + 3 * 240) / 5));
    expect(result.hourlyRate).toBe(result.minuteRate * 60);
    expect(result.totalLostMinutes).toBe(120);
    expect(result.equivalentDays).toBe(equivalentDays);
    expect(result.totalDeduction).toBe(
      Number(((1000 / 30) * equivalentDays).toFixed(2))
    );
    expect(result.totalDeduction).not.toBe(
      result.totalLostMinutes * result.minuteRate
    );
  });

  it("uses each absent date's own span, not the newest schedule's span", () => {
    const result = calculateHrPayroll(
      input({
        from: "2026-01-05",
        to: "2026-01-06",
        schedules: [
          schedule,
          {
            effectiveFrom: "2026-01-06",
            startTime: "10:00",
            endTime: "14:00",
            graceMinutes: 0,
          },
        ],
      })
    );
    expect(result.days.map(day => day.missingMinutes)).toEqual([480, 240]);
    expect(result).toMatchObject({
      absentDays: 2,
      equivalentDays: 2,
      totalLostMinutes: 480 + 240,
      totalDeduction: Number(((1000 / 30) * 2).toFixed(2)),
      netSalary: Number((1000 - (1000 / 30) * 2).toFixed(2)),
    });
  });

  it("turns three mixed-span incomplete days into exactly one daily deduction", () => {
    const result = calculateHrPayroll(
      input({
        from: "2026-01-04",
        to: "2026-01-06",
        schedules: [
          schedule,
          {
            effectiveFrom: "2026-01-06",
            startTime: "10:00",
            endTime: "14:00",
            graceMinutes: 0,
          },
        ],
        attendance: [
          punch("2026-01-04", "15:00", null),
          punch("2026-01-05", "15:00", null),
          punch("2026-01-06", "12:00", null),
        ],
      })
    );
    expect(result).toMatchObject({
      incompleteDays: 3,
      incompleteDeductionDays: 1,
      lateMinutes: 0,
      earlyMinutes: 0,
      totalLostMinutes: 240,
      equivalentDays: 1,
    });
    expect(result.days.map(day => day.missingMinutes)).toEqual([0, 0, 240]);
    expect(result.totalDeduction).toBe(Number((1000 / 30).toFixed(2)));
  });

  it("does not round rates, fractions, or individual daily losses before final money", () => {
    const dates = listHrDates("2026-01-04", "2026-01-06");
    const result = calculateHrPayroll(
      input({
        to: "2026-01-06",
        salary: 101,
        schedules: [
          {
            ...schedule,
            startTime: "09:00",
            endTime: "09:03",
            graceMinutes: 0,
          },
        ],
        attendance: dates.map(date => punch(date, "09:01", "09:03")),
      })
    );
    expect(result.dailyRate).toBe(101 / 30);
    expect(result.minuteRate).toBe(101 / 30 / 3);
    expect(result.equivalentDays).toBe(1);
    expect(result.lostHours).toBe(3 / 60);
    expect(result.totalDeduction).toBe(Number((101 / 30).toFixed(2)));
    expect(result.netSalary).toBe(Number((101 - 101 / 30).toFixed(2)));
    expect(result.totalDeduction).not.toBe(
      Number((101 / 30 / 3).toFixed(2)) * 3
    );
  });

  it("allows zero salary and returns finite zero rates and money", () => {
    const result = singleDay({ salary: 0 });
    expect(result).toMatchObject({
      absentDays: 1,
      dailyRate: 0,
      hourlyRate: 0,
      minuteRate: 0,
      totalDeduction: 0,
      netSalary: 0,
    });
  });

  it("does not mutate inputs and is independent of wall-clock reads or input ordering", () => {
    const source = input({
      schedules: [
        { ...schedule, effectiveFrom: "2026-01-06" },
        { ...schedule },
      ],
      attendance: [
        punch("2026-01-06"),
        punch("2026-01-04"),
        punch("2026-01-05"),
      ],
    });
    const before = JSON.stringify(source);
    const result = calculateHrPayroll(source);
    expect(calculateHrPayroll(source)).toEqual(result);
    expect(
      calculateHrPayroll({
        ...source,
        schedules: [...source.schedules].reverse(),
        attendance: [...source.attendance].reverse(),
      })
    ).toEqual(result);
    expect(JSON.stringify(source)).toBe(before);
  });
});

describe("HR payroll input validation", () => {
  it.each([-1, -0.01, NaN, Infinity, -Infinity, "1000", null])(
    "rejects invalid salary %s",
    salary => {
      expect(() => singleDay({ salary: salary as number })).toThrow("salary");
    }
  );

  it("validates now rather than defaulting to a live clock", () => {
    expect(() => singleDay({ now: new Date("invalid") })).toThrow("timestamp");
    expect(() =>
      singleDay({ now: "2026-01-12T18:00:00Z" as unknown as Date })
    ).toThrow("Date");
  });

  it("applies range validation and 366-day limit to payroll before filtering", () => {
    expect(() =>
      calculateHrPayroll(
        input({ from: "2024-01-01", to: "2025-01-01", schedules: [] })
      )
    ).toThrow("366");
    expect(() =>
      calculateHrPayroll(input({ from: "2026-01-08", to: "2026-01-04" }))
    ).toThrow("start date");
    expect(() => calculateHrPayroll(input({ from: "2026-02-30" }))).toThrow();
    expect(
      calculateHrPayroll(
        input({ from: "2024-01-01", to: "2024-12-31", schedules: [] })
      ).days
    ).toHaveLength(366);
  });

  it.each([
    { ...schedule, effectiveFrom: "2026-02-30" },
    { ...schedule, startTime: "9:00" },
    { ...schedule, startTime: "09:00:00" },
    { ...schedule, endTime: "24:00" },
    { ...schedule, endTime: "17:60" },
    { ...schedule, endTime: "09:00" },
    { ...schedule, startTime: "17:00", endTime: "09:00" },
    { ...schedule, graceMinutes: -1 },
    { ...schedule, graceMinutes: 121 },
    { ...schedule, graceMinutes: 600 },
    { ...schedule, graceMinutes: 1.5 },
    { ...schedule, graceMinutes: NaN },
    { ...schedule, graceMinutes: Infinity },
  ])("rejects invalid same-day schedule %#", invalidSchedule => {
    expect(() => singleDay({ schedules: [invalidSchedule] })).toThrow();
  });

  it("rejects duplicate schedule effective dates rather than depending on input ordering", () => {
    expect(() =>
      singleDay({ schedules: [schedule, { ...schedule, startTime: "10:00" }] })
    ).toThrow("Duplicate");
  });

  it.each(["holidays", "approvedLeaveDates", "attendanceCreditDates"] as const)(
    "validates every %s key",
    field => {
      expect(() => singleDay({ [field]: ["2026-02-30"] })).toThrow();
    }
  );

  it("rejects duplicate attendance dates", () => {
    expect(() =>
      singleDay({ attendance: [punch("2026-01-04"), punch("2026-01-04")] })
    ).toThrow("Duplicate");
  });

  it("rejects malformed attendance dates and timestamps including calendar rollover", () => {
    const record = punch("2026-01-04");
    expect(() =>
      singleDay({ attendance: [{ ...record, attendanceDate: "2026-02-30" }] })
    ).toThrow();
    expect(() =>
      singleDay({ attendance: [{ ...record, checkInAt: "not-a-date" }] })
    ).toThrow();
    expect(() =>
      singleDay({ attendance: [{ ...record, checkInAt: new Date("invalid") }] })
    ).toThrow();
    expect(() =>
      singleDay({
        attendance: [{ ...record, checkOutAt: "2026-02-30T12:00:00Z" }],
      })
    ).toThrow();
    expect(() =>
      singleDay({
        attendance: [{ ...record, checkOutAt: "2026-01-04T25:00:00Z" }],
      })
    ).toThrow();
    expect(() =>
      singleDay({
        attendance: [{ ...record, checkInAt: "2026-01-04T09:00:00" }],
      })
    ).toThrow("timezone");
    expect(() =>
      singleDay({ attendance: [{ ...record, checkOutAt: "2026-01-04" }] })
    ).toThrow("timezone");
  });

  it("requires check-in on its Cairo date, accepting a differing UTC date at local midnight", () => {
    expect(() =>
      singleDay({
        attendance: [
          { ...punch("2026-01-04"), checkInAt: "2026-01-05T09:00:00+02:00" },
        ],
      })
    ).toThrow("Cairo attendance date");
    const result = singleDay({
      attendance: [
        { ...punch("2026-01-04"), checkInAt: "2026-01-03T22:30:00Z" },
      ],
    });
    expectNoLoss(result);
  });

  it("rejects reversed complete punches even when both are outside the scheduled window", () => {
    expect(() =>
      singleDay({ attendance: [punch("2026-01-04", "18:00", "08:00")] })
    ).toThrow("precede");
    expect(() =>
      singleDay({
        attendance: [
          { ...punch("2026-01-04"), checkOutAt: "2026-01-03T23:00:00+02:00" },
        ],
      })
    ).toThrow("precede");
  });
});
