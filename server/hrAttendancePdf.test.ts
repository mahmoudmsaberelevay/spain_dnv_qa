import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import {
  calculateHrPayroll,
  listHrDates,
  type HrPayrollInput,
} from "../shared/hrPayroll";
import {
  attendanceReportDisplayName,
  buildHrAttendanceReport,
  type HrAttendanceReportInput,
  type HrAttendanceReportSourceEmployee,
} from "../shared/hrAttendanceReport";
import {
  createHrAttendancePdf,
  exportHrAttendancePdf,
  generateHrAttendancePdfArrayBuffer,
} from "../client/src/lib/hrAttendancePdf";

const from = "2026-01-04";
const to = "2026-01-08";
const generatedAt = new Date("2026-02-01T22:30:00Z");
const schedule = {
  effectiveFrom: "2026-01-01",
  startTime: "09:00",
  endTime: "15:00",
  graceMinutes: 0,
};

function source(
  options: Partial<HrPayrollInput> = {},
  id = 901
): HrAttendanceReportSourceEmployee {
  const calculation = calculateHrPayroll({
    from,
    to,
    now: new Date("2026-02-02T18:00:00Z"),
    salary: 3000,
    schedules: [schedule],
    holidays: [],
    approvedLeaveDates: [],
    attendance: [],
    ...options,
  });
  return {
    id,
    name: `Synthetic Employee ${id}`,
    payroll: {
      ...calculation,
      coveredBaseSalary: 3000,
      cycleBreakdown: [
        {
          from: options.from ?? from,
          to: options.to ?? to,
          coveredFrom: options.from ?? from,
          coveredTo: options.to ?? to,
          salary: 3000,
          fullCycleWorkingDays: calculation.workingDays,
          workingDays: calculation.workingDays,
          coveredBaseSalary: 3000,
          totalDeduction: calculation.totalDeduction,
          equivalentDays: calculation.equivalentDays,
          incompleteDeductionDays: calculation.incompleteDeductionDays,
        },
      ],
    },
  };
}
function punch(
  date: string,
  checkIn = "09:00",
  checkOut: string | null = "15:00"
) {
  return {
    attendanceDate: date,
    checkInAt: `${date}T${checkIn}:00+02:00`,
    checkOutAt: checkOut === null ? null : `${date}T${checkOut}:00+02:00`,
  };
}
function input(
  employees: readonly HrAttendanceReportSourceEmployee[] = [source()]
): HrAttendanceReportInput {
  return {
    from,
    to,
    generatedAt,
    generatedBy: "Synthetic QA Administrator",
    employees,
  };
}
function incompleteAndPresent() {
  return source({
    attendance: [
      punch("2026-01-04", "09:20", "14:50"),
      punch("2026-01-06", "09:00", null),
      punch("2026-01-07", "09:00", null),
      punch("2026-01-08", "09:00", null),
    ],
  });
}

async function parse(buffer: ArrayBuffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    return await parser.getText();
  } finally {
    await parser.destroy();
  }
}

describe("pure HR attendance report projection", () => {
  it("splits missing-minute components without counting late/early twice", () => {
    const employee = incompleteAndPresent();
    const report = buildHrAttendanceReport(input([employee]));
    expect(report.employees[0]).toMatchObject({
      lateMinutes: 20,
      earlyMinutes: 10,
      absentDays: 1,
      absenceMinutes: 360,
      incompleteDays: 3,
      incompleteDeductionDays: 1,
      incompletePenaltyMinutes: 360,
      totalLostMinutes: 750,
      lostHours: 12.5,
      totalDeduction: employee.payroll.totalDeduction,
    });
    expect(report.employees[0].equivalentDays).toBeCloseTo(2 + 30 / 360);
    expect(report.employees[0].days[0]).toMatchObject({
      missingMinutes: 30,
      lateMinutes: 20,
      earlyMinutes: 10,
      absenceMinutes: 0,
    });
    expect(
      report.employees[0].days.map(day => day.incompletePenaltyMinutes)
    ).toEqual([0, 0, 0, 0, 360]);
    expect(report.totals.totalLostMinutes).toBe(20 + 10 + 360 + 360);
  });

  it("uses schedule-aware days and source monetary/rate summaries, not eight-hour or current-rate math", () => {
    const employee = source({
      schedules: [
        schedule,
        { ...schedule, effectiveFrom: "2026-01-06", endTime: "18:00" },
      ],
      attendance: [punch("2026-01-04", "09:30")],
      approvedLeaveDates: ["2026-01-05", "2026-01-07", "2026-01-08"],
    });
    // Authoritative cycle aggregates need not equal a recomputation at the last
    // informational minuteRate (salary history/full-cycle weights are upstream).
    employee.payroll.totalDeduction = 555.37;
    employee.payroll.netSalary = 2444.63;
    employee.payroll.equivalentDays = 1 + 30 / 360;
    employee.payroll.minuteRate = 9.876543;
    const row = buildHrAttendanceReport(input([employee])).employees[0];
    expect(row.absenceMinutes).toBe(540);
    expect(row.totalLostMinutes).toBe(570);
    expect(row.lostHours).toBe(9.5);
    expect(row.equivalentDays).toBe(employee.payroll.equivalentDays);
    expect(row.equivalentDays).not.toBe(row.totalLostMinutes / 480);
    expect(row.totalDeduction).toBe(555.37);
    expect(row.minuteRate).toBe(9.876543);
    expect(row.cycleBreakdown).toEqual(employee.payroll.cycleBreakdown);
  });

  it("preserves selected employees and ordering including repeated or unlinked selections, without mutation", () => {
    const first = {
      ...source({}, 904),
      crmUserId: null,
      isActive: false,
      salary: "0",
    };
    const second = source({}, 902);
    const employees = Object.freeze([first, second, first]);
    const before = JSON.stringify(employees);
    const report = buildHrAttendanceReport(input(employees));
    expect(report.employees.map(row => row.id)).toEqual([904, 902, 904]);
    expect(report.totals.totalLostMinutes).toBe(5400);
    expect(JSON.stringify(employees)).toBe(before);
    expect(report.employees[0].days).not.toBe(first.payroll.days);
    expect(report.employees[0].cycleBreakdown[0]).not.toBe(
      first.payroll.cycleBreakdown[0]
    );
  });

  it("never invents absence on approved leave, future, in-progress, unconfigured, holiday or weekend dates", () => {
    const fixtures = [
      source({ approvedLeaveDates: listHrDates(from, to) }),
      source({ now: new Date("2026-01-01T10:00:00Z") }),
      source({ from, to: from, now: new Date("2026-01-04T08:00:00Z") }),
      source({ schedules: [] }),
      source({ holidays: listHrDates(from, to) }),
      source({ from: "2026-01-09", to: "2026-01-10" }),
    ];
    for (const fixture of fixtures) {
      const days = fixture.payroll.days;
      const report = buildHrAttendanceReport({
        ...input([fixture]),
        from: days[0].date,
        to: days.at(-1)!.date,
      });
      expect(report.totals).toMatchObject({
        absentDays: 0,
        absenceMinutes: 0,
        totalLostMinutes: 0,
        totalDeduction: 0,
      });
      expect(
        report.employees[0].days.every(day => day.status !== "absent")
      ).toBe(true);
    }
    expect(
      buildHrAttendanceReport(input([fixtures[0]])).employees[0].days[0]
        .statusLabel
    ).toBe("Approved paid leave");
  });

  it("does not re-run the incomplete sequence on a selected slice of a full cycle", () => {
    const full = source({
      attendance: [
        punch(from, "09:00", null),
        punch("2026-01-05", "09:00", null),
        punch("2026-01-06", "09:00", null),
      ],
    });
    const employee: HrAttendanceReportSourceEmployee = {
      ...full,
      payroll: {
        ...full.payroll,
        days: [full.payroll.days[2]],
        workingDays: 1,
        evaluatedDays: 1,
        absentDays: 0,
        incompleteDays: 1,
        incompleteDeductionDays: 1,
        totalLostMinutes: 360,
        lostHours: 6,
        equivalentDays: 1,
        totalDeduction: 600,
        coveredBaseSalary: 600,
        netSalary: 0,
      },
    };
    const report = buildHrAttendanceReport({
      ...input([employee]),
      from: "2026-01-06",
      to: "2026-01-06",
    });
    expect(report.employees[0]).toMatchObject({
      incompleteDays: 1,
      incompleteDeductionDays: 1,
      incompletePenaltyMinutes: 360,
      totalDeduction: 600,
    });
  });

  it.each([
    ["", to],
    [from, ""],
    ["2026-02-30", to],
    ["2026-1-04", to],
    [to, from],
    ["2024-01-01", "2025-01-01"],
    ["2026-01-04T00:00:00Z", to],
  ])("rejects invalid period %s / %s", (start, end) => {
    expect(() =>
      buildHrAttendanceReport({ ...input(), from: start, to: end })
    ).toThrow();
  });

  it("accepts inclusive leap-year coverage of exactly 366 days", () => {
    const employee = source({
      from: "2024-01-01",
      to: "2024-12-31",
      schedules: [],
    });
    const report = buildHrAttendanceReport({
      ...input([employee]),
      from: "2024-01-01",
      to: "2024-12-31",
    });
    expect(report.calendarDays).toBe(366);
    expect(report.employees[0].days.at(-1)!.date).toBe("2024-12-31");
  });

  it("rejects empty selection, invalid generation timestamps and mismatched daily coverage", () => {
    expect(() => buildHrAttendanceReport(input([]))).toThrow(
      "at least one employee"
    );
    expect(() =>
      buildHrAttendanceReport({ ...input(), generatedAt: new Date(NaN) })
    ).toThrow("valid Date");
    expect(() =>
      buildHrAttendanceReport({ ...input(), from: "2026-01-03" })
    ).toThrow("exactly the selected period");
    const employee = source();
    employee.payroll.days = employee.payroll.days.map((day, index, days) =>
      index === 0 ? days[1] : day
    );
    expect(() => buildHrAttendanceReport(input([employee]))).toThrow(
      "no duplicates"
    );
  });

  it("fails closed on contradictory penalties, NaN values, unknown statuses and stale summaries", () => {
    const leave = source({ approvedLeaveDates: [from] });
    leave.payroll.days = leave.payroll.days.map(day =>
      day.date === from ? { ...day, missingMinutes: 360 } : day
    );
    expect(() => buildHrAttendanceReport(input([leave]))).toThrow(
      "Only finalized attendance"
    );
    const inconsistent = source();
    inconsistent.payroll.totalLostMinutes++;
    expect(() => buildHrAttendanceReport(input([inconsistent]))).toThrow(
      "summary disagree"
    );
    const invalid = source();
    invalid.payroll.totalDeduction = NaN;
    expect(() => buildHrAttendanceReport(input([invalid]))).toThrow(
      "finite non-negative"
    );
    const unknown = source();
    unknown.payroll.days = unknown.payroll.days.map(day => ({
      ...day,
      status: "not_a_status",
    }));
    expect(() => buildHrAttendanceReport(input([unknown]))).toThrow(
      "Unrecognized"
    );
  });

  it("explicitly projects safe fields rather than leaking private runtime properties", () => {
    const employee = {
      ...source(),
      email: "private-token@example.invalid",
      crmUserId: 998877,
      location: { latitude: 88.123456, longitude: 77.123456 },
      payroll: { ...source().payroll, rawUser: "private-user-token" },
    };
    const serialized = JSON.stringify(
      buildHrAttendanceReport({
        ...input([employee]),
        generatedBy: "QA private-token@example.invalid",
      })
    );
    for (const token of [
      "private-token",
      "998877",
      "88.123456",
      "77.123456",
      "private-user-token",
      "crmUserId",
      "location",
    ]) {
      expect(serialized).not.toContain(token);
    }
    expect(attendanceReportDisplayName("\nاسم تجريبي\u202e", "Employee")).toBe(
      "اسم تجريبي"
    );
    expect(
      attendanceReportDisplayName("qa@example.invalid", "HR administrator")
    ).toBe("HR administrator");
  });
});

describe("owner-approved rollout attendance credit", () => {
  it("labels credits without fabricated punches and rejects any attached penalty", async () => {
    const creditDates = listHrDates("2026-10-27", "2026-11-03");
    const employee = source({
      from: creditDates[0],
      to: creditDates.at(-1)!,
      attendanceCreditDates: creditDates,
      now: new Date("2026-11-02T10:00:00Z"),
    });
    const creditInput = {
      ...input([employee]),
      from: creditDates[0],
      to: creditDates.at(-1)!,
    };
    const report = buildHrAttendanceReport(creditInput);
    expect(report.totals).toMatchObject({
      absentDays: 0,
      absenceMinutes: 0,
      totalLostMinutes: 0,
      totalDeduction: 0,
    });
    expect(
      report.employees[0].days.every(day => day.status === "credited")
    ).toBe(true);
    expect(report.employees[0].days[0].statusLabel).toContain(
      "no recorded punch"
    );
    const pdf = await parse(
      await generateHrAttendancePdfArrayBuffer(creditInput)
    );
    expect(pdf.text).toContain("rollout credit");
    expect(pdf.text).toContain("Credits do not fabricate clock-in/out records");
    employee.payroll.days = employee.payroll.days.map((day, index) =>
      index ? day : { ...day, missingMinutes: 360 }
    );
    expect(() => buildHrAttendanceReport(creditInput)).toThrow(
      "Only finalized attendance"
    );
  });
});

describe("jsPDF attendance document (synthetic records only)", () => {
  it("produces a searchable multi-page PDF with Cairo generation metadata and employee daily sheets", async () => {
    const employee = {
      ...incompleteAndPresent(),
      email: "pdf-private-token@example.invalid",
      crmUserId: 998877,
      latitude: 88.123456,
      longitude: 77.123456,
    };
    const buffer = await generateHrAttendancePdfArrayBuffer(input([employee]));
    expect(Buffer.from(buffer).subarray(0, 5).toString()).toBe("%PDF-");
    const parsed = await parse(buffer);
    expect(parsed.total).toBeGreaterThanOrEqual(3);
    for (const phrase of [
      "ELEVAY",
      "Team summary",
      employee.name,
      "Employee attendance detail",
      "Employee daily attendance sheet",
      "2026-01-04",
      "2026-01-08",
      "750",
      "12.5",
      employee.payroll.totalDeduction.toLocaleString("en-GB", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      "02/02/2026, 00:30",
      "Africa/Cairo",
      "Absent",
      "Incomplete punch",
      "monthly salary / 30 calendar days",
    ]) {
      expect(parsed.text).toContain(phrase);
    }
    for (const token of [
      "pdf-private-token",
      "998877",
      "88.123456",
      "77.123456",
    ])
      expect(parsed.text).not.toContain(token);
    parsed.pages.forEach((page, index) => {
      expect(page.text).toContain(`Page ${index + 1} of ${parsed.total}`);
      expect(page.text).toContain("ELEVAY");
    });
  });

  it("paginates long names, many selected employees and a full-year daily sheet with repeated column headers", async () => {
    const longName = `Synthetic ${"LongUnbrokenSyntheticName".repeat(15)} FinalNameToken`;
    const employees = Array.from({ length: 22 }, (_, index) => ({
      ...source({}, 1000 + index),
      name: index ? `Synthetic Team ${index}` : longName,
    }));
    const doc = await createHrAttendancePdf(input(employees));
    expect(doc.getNumberOfPages()).toBeGreaterThan(45);
    const parsed = await parse(doc.output("arraybuffer"));
    expect(parsed.text).toContain("FinalNameToken");
    expect(parsed.text).toContain("Synthetic Team 21");
    expect(
      parsed.pages.filter(page => page.text.includes("Team summary")).length
    ).toBeGreaterThan(1);
    const yearly = source({
      from: "2024-01-01",
      to: "2024-12-31",
      schedules: [],
    });
    const yearlyPdf = await generateHrAttendancePdfArrayBuffer({
      ...input([yearly]),
      from: "2024-01-01",
      to: "2024-12-31",
    });
    const yearText = await parse(yearlyPdf);
    const dailyPages = yearText.pages.filter(page =>
      page.text.includes("Employee daily attendance sheet")
    );
    expect(dailyPages.length).toBeGreaterThan(10);
    dailyPages
      .filter(page => /2024-\d{2}-\d{2}/.test(page.text))
      .forEach(page => {
        expect(page.text).toContain("Cairo date");
        expect(page.text).toContain("Payroll status");
      });
    expect(yearText.text).toContain("2024-12-31");
  }, 20000);

  it("requires browser shaping for Unicode names instead of emitting broken Latin-font glyphs", async () => {
    await expect(
      createHrAttendancePdf(input([{ ...source(), name: "اسم تجريبي" }]))
    ).rejects.toThrow("browser canvas");
    await expect(exportHrAttendancePdf(input())).rejects.toThrow(
      "require a browser"
    );
  });
});
