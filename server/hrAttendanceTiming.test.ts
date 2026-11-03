import { describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PDFParse } from "pdf-parse";
import { calculateHrPayroll, type HrPayrollInput } from "../shared/hrPayroll";
import {
  buildHrAttendanceTiming,
  projectHrAttendanceTiming,
  type HrAttendanceTimingInput,
} from "../shared/hrAttendanceTiming";
import {
  buildHrAttendanceReport,
  type HrAttendanceReportSourceEmployee,
} from "../shared/hrAttendanceReport";
import { createHrAttendancePdf } from "../client/src/lib/hrAttendancePdf";

const dependencies = vi.hoisted(() => ({
  getDb: vi.fn(),
  updateEmployee: vi.fn(),
}));
vi.mock("./db", () => ({ getDb: dependencies.getDb }));
vi.mock("./finDb", () => ({ updateEmployee: dependencies.updateEmployee }));
import { getHrAdminOverview } from "./hrManagementService";

const schedule = {
  effectiveFrom: "2026-01-01",
  startTime: "09:00",
  endTime: "15:00",
  graceMinutes: 0,
};
const from = "2026-01-04";
const to = "2026-01-08";
const generatedAt = new Date("2026-02-01T22:30:00Z");
const punch = (
  date: string,
  start: string,
  end: string | null,
  offset = "+02:00"
) => ({
  attendanceDate: date,
  checkInAt: `${date}T${start}:00${offset}`,
  checkOutAt: end === null ? null : `${date}T${end}:00${offset}`,
});
function fixture(overrides: Partial<HrPayrollInput> = {}) {
  const input: HrPayrollInput = {
    from,
    to,
    now: new Date("2026-02-02T18:00:00Z"),
    salary: 3000,
    schedules: [schedule],
    holidays: [],
    approvedLeaveDates: [],
    attendance: [],
    ...overrides,
  };
  const payroll = calculateHrPayroll(input);
  const timingInput: HrAttendanceTimingInput = {
    ...input,
    payrollDays: payroll.days,
  };
  const timing = buildHrAttendanceTiming(timingInput);
  const employee: HrAttendanceReportSourceEmployee = {
    id: 901,
    name: "Synthetic Timing Employee",
    timing,
    payroll: {
      ...payroll,
      coveredBaseSalary: 3000,
      cycleBreakdown: [
        {
          from: input.from,
          to: input.to,
          coveredFrom: input.from,
          coveredTo: input.to,
          salary: 3000,
          fullCycleWorkingDays: payroll.workingDays,
          workingDays: payroll.workingDays,
          coveredBaseSalary: 3000,
          totalDeduction: payroll.totalDeduction,
          equivalentDays: payroll.equivalentDays,
          incompleteDeductionDays: payroll.incompleteDeductionDays,
        },
      ],
    },
  };
  const reportInput = {
    from: input.from,
    to: input.to,
    generatedAt,
    generatedBy: "Synthetic Issuer",
    employees: [employee],
  };
  return { input, timingInput, payroll, timing, employee, reportInput };
}

async function pdfText(doc: Awaited<ReturnType<typeof createHrAttendancePdf>>) {
  const parser = new PDFParse({
    data: new Uint8Array(doc.output("arraybuffer")),
  });
  try {
    return await parser.getText();
  } finally {
    await parser.destroy();
  }
}

describe("deterministic attendance timing projection", () => {
  it("uses each effective schedule span for late and early equivalent days", () => {
    const { timing, payroll, timingInput } = fixture({
      schedules: [
        schedule,
        { ...schedule, effectiveFrom: "2026-01-06", endTime: "18:00" },
      ],
      attendance: [
        punch(from, "09:30", "14:50"),
        punch("2026-01-06", "09:30", "17:50"),
      ],
    });
    expect(timing.scheduledMinutes).toBe(2340);
    expect(timing.evaluatedScheduledMinutes).toBe(2340);
    expect(timing.lateHours).toBe(1);
    expect(timing.lateEquivalentDays).toBeCloseTo(30 / 360 + 30 / 540);
    expect(timing.earlyEquivalentDays).toBeCloseTo(10 / 360 + 10 / 540);
    expect(timing.lateEquivalentDays).not.toBe(payroll.lateMinutes / 480);
    expect(timing.recordedMinutes).toBe(820);
    expect(timing.scheduledPresenceMinutes).toBe(820);
    expect(timing.presentDays).toBe(2);
    expect(projectHrAttendanceTiming(timing, timingInput)).toEqual(timing);
  });

  it("separates actual elapsed time, schedule overlap, credits, paid leave and open check-ins", () => {
    const { timing, payroll } = fixture({
      attendance: [
        punch(from, "08:30", "16:00"),
        punch("2026-01-06", "09:10", null),
      ],
      attendanceCreditDates: ["2026-01-05"],
      approvedLeaveDates: ["2026-01-07"],
      now: new Date("2026-01-08T08:00:00Z"),
    });
    expect(timing).toMatchObject({
      scheduledMinutes: 1800,
      evaluatedScheduledMinutes: 1440,
      recordedMinutes: 450,
      scheduledPresenceMinutes: 360,
      presentDays: 1,
      creditedDays: 1,
      approvedLeaveDays: 1,
    });
    expect(timing.days[0]).toMatchObject({
      checkInAt: "2026-01-04T06:30:00.000Z",
      checkOutAt: "2026-01-04T14:00:00.000Z",
    });
    expect(timing.days[1]).toMatchObject({
      checkInAt: null,
      checkOutAt: null,
      recordedMinutes: 0,
      scheduledPresenceMinutes: 0,
    });
    expect(timing.days[2]).toMatchObject({
      checkInAt: "2026-01-06T07:10:00.000Z",
      checkOutAt: null,
      recordedMinutes: 0,
      scheduledPresenceMinutes: 0,
    });
    expect(payroll.days.at(-1)?.status).toBe("in_progress");
    expect(timing.lateHours).toBe(0);
  });

  it("never hides real closed punches behind rollout credits, nor fabricates unrecorded ones", () => {
    const { timing, reportInput } = fixture({
      attendanceCreditDates: [from, "2026-01-05"],
      attendance: [punch(from, "09:30", "14:00")],
    });
    expect(timing.creditedDays).toBe(2);
    expect(timing.presentDays).toBe(0);
    expect(timing.recordedMinutes).toBe(270);
    expect(timing.days[1].checkInAt).toBeNull();
    expect(timing.lateHours).toBe(0);
    expect(timing.lateEquivalentDays).toBe(0);
    expect(
      buildHrAttendanceReport(reportInput).employees[0].days[0].statusLabel
    ).toContain("recorded punch retained");
    expect(
      buildHrAttendanceReport(reportInput).employees[0].days[1].statusLabel
    ).toContain("no recorded punch");
  });

  it("counts configured working dates over the entire selected range but not holidays/weekends or pre-configuration dates", () => {
    const { timing } = fixture({
      from: "2026-01-02",
      to: "2026-01-12",
      schedules: [{ ...schedule, effectiveFrom: "2026-01-05" }],
      holidays: ["2026-01-06"],
      now: new Date("2026-01-07T08:00:00Z"),
    });
    expect(timing.scheduledMinutes).toBe(5 * 360);
    expect(timing.evaluatedScheduledMinutes).toBe(360);
    for (const day of timing.days.filter(row =>
      [
        "2026-01-02",
        "2026-01-03",
        "2026-01-04",
        "2026-01-06",
        "2026-01-09",
        "2026-01-10",
      ].includes(row.date)
    )) {
      expect(day).toMatchObject({
        scheduleStart: null,
        scheduleEnd: null,
        scheduledMinutes: 0,
        scheduledPresenceMinutes: 0,
      });
    }
  });

  it("filters full-cycle records to the selected Cairo attendance dates and is timezone/second precise", () => {
    const { timing } = fixture({
      from,
      to: from,
      attendance: [
        {
          attendanceDate: from,
          checkInAt: "2026-01-03T22:30:00.000Z",
          checkOutAt: "2026-01-04T07:00:30.000Z",
        },
        punch("2026-01-05", "09:00", "15:00"),
      ],
    });
    expect(timing.days).toHaveLength(1);
    expect(timing.recordedMinutes).toBe(510.5);
    expect(timing.scheduledPresenceMinutes).toBe(0.5);
    expect(timing.days[0].date).toBe(from);
  });

  it("measures UTC elapsed duration across Cairo DST fallback and does not wrap next-day checkout", () => {
    const { timing } = fixture({
      from: "2026-10-29",
      to: "2026-10-29",
      now: new Date("2026-11-02T18:00:00Z"),
      attendance: [
        {
          attendanceDate: "2026-10-29",
          checkInAt: "2026-10-29T22:30:00+03:00",
          checkOutAt: "2026-10-30T01:30:00+02:00",
        },
      ],
    });
    expect(timing.recordedMinutes).toBe(240);
    expect(timing.scheduledPresenceMinutes).toBe(0);
    const summer = fixture({
      from: "2026-07-05",
      to: "2026-07-05",
      now: new Date("2026-07-06T18:00:00Z"),
      attendance: [punch("2026-07-05", "08:30", "16:00", "+03:00")],
    });
    expect(summer.timing.recordedMinutes).toBe(450);
    expect(summer.timing.scheduledPresenceMinutes).toBe(360);
  });

  it("rejects duplicates, reversed/offsetless punches and mismatched Cairo dates", () => {
    const { timingInput } = fixture();
    expect(() =>
      buildHrAttendanceTiming({
        ...timingInput,
        attendance: [punch(from, "09:00", "15:00"), punch(from, "10:00", null)],
      })
    ).toThrow("Duplicate");
    expect(() =>
      buildHrAttendanceTiming({
        ...timingInput,
        attendance: [punch(from, "15:00", "09:00")],
      })
    ).toThrow("precede");
    expect(() =>
      buildHrAttendanceTiming({
        ...timingInput,
        attendance: [
          {
            attendanceDate: from,
            checkInAt: `${from}T09:00:00`,
            checkOutAt: null,
          },
        ],
      })
    ).toThrow("timezone");
    expect(() =>
      buildHrAttendanceTiming({
        ...timingInput,
        attendance: [
          {
            attendanceDate: from,
            checkInAt: "2026-01-03T10:00:00Z",
            checkOutAt: null,
          },
        ],
      })
    ).toThrow("Cairo attendance date");
    expect(() =>
      buildHrAttendanceTiming({
        ...timingInput,
        payrollDays: timingInput.payrollDays.slice(1),
      })
    ).toThrow("exactly the selected period");
  });
});

describe("timing report validation and privacy", () => {
  it("rejects stale timing dates, daily values, aggregates and payroll coverage", () => {
    for (const change of [
      (row: ReturnType<typeof fixture>) => {
        row.timing.days[0].date = "2026-01-03";
      },
      (row: ReturnType<typeof fixture>) => {
        row.timing.days[0].recordedMinutes = 360;
      },
      (row: ReturnType<typeof fixture>) => {
        row.timing.scheduledMinutes++;
      },
      (row: ReturnType<typeof fixture>) => {
        row.timing.lateHours = NaN;
      },
      (row: ReturnType<typeof fixture>) => {
        row.employee.payroll.workingDays++;
      },
    ]) {
      const row = fixture();
      change(row);
      expect(() => buildHrAttendanceReport(row.reportInput)).toThrow(/timing/i);
    }
  });

  it("projects only timing whitelist fields and preserves authoritative wage values", () => {
    const row = fixture({ attendance: [punch(from, "09:30", "14:50")] });
    Object.assign(row.timing, {
      email: "secret@example.invalid",
      gps: { latitude: 99.123 },
      userId: 778899,
    });
    Object.assign(row.timing.days[0], {
      location: "private-location",
      login: "private-login",
    });
    row.employee.payroll.totalDeduction = 555.37;
    row.employee.payroll.netSalary = 2444.63;
    const report = buildHrAttendanceReport({
      ...row.reportInput,
      generatedBy: "Safe Issuer private@example.invalid",
    });
    expect(report.employees[0].totalDeduction).toBe(555.37);
    expect(report.employees[0].netSalary).toBe(2444.63);
    expect(report.employees[0].timing).toEqual(
      projectHrAttendanceTiming(row.timing, row.timingInput)
    );
    expect(report.generatedBy).toBe("Safe Issuer");
    for (const token of [
      "secret@",
      "99.123",
      "778899",
      "private-location",
      "private-login",
      "userId",
      "gps",
    ]) {
      expect(JSON.stringify(report)).not.toContain(token);
    }
  });

  it("supports legacy sources with explicit unknown timing rather than inferred punches or schedule spans", () => {
    const row = fixture({ attendance: [punch(from, "09:30", "14:50")] });
    const { timing: _, ...legacy } = row.employee;
    const report = buildHrAttendanceReport({
      ...row.reportInput,
      employees: [legacy],
    });
    expect(report.employees[0].timingAvailable).toBe(false);
    expect(report.employees[0].timing).toMatchObject({
      recordedMinutes: 0,
      scheduledMinutes: 0,
      scheduledPresenceMinutes: 0,
      lateHours: 0.5,
      lateEquivalentDays: 0,
    });
    expect(
      report.employees[0].timing.days.every(
        day => day.checkInAt === null && day.checkOutAt === null
      )
    ).toBe(true);
  });

  it("keeps selected incomplete penalties from full-cycle payroll, not a fresh three-for-one sequence", () => {
    const row = fixture({
      attendance: [
        punch(from, "09:00", null),
        punch("2026-01-05", "09:00", null),
        punch("2026-01-06", "09:00", null),
      ],
    });
    const selected = buildHrAttendanceTiming({
      ...row.timingInput,
      from: "2026-01-06",
      to: "2026-01-06",
      payrollDays: [row.payroll.days[2]],
    });
    expect(row.payroll.days[2].missingMinutes).toBe(360);
    expect(selected.days[0]).toMatchObject({
      checkOutAt: null,
      recordedMinutes: 0,
      scheduledPresenceMinutes: 0,
    });
    expect(selected.lateEquivalentDays).toBe(0);
  });
});

describe("enhanced attendance PDF (synthetic in-memory data only)", () => {
  it("prints real Cairo clock times, separate timing/penalty units, issuer metadata and supplied payroll money", async () => {
    const row = fixture({
      attendance: [
        punch(from, "08:30", "16:00"),
        punch("2026-01-06", "09:30", "14:50"),
      ],
    });
    row.employee.payroll.totalDeduction = 555.37;
    row.employee.payroll.netSalary = 2444.63;
    const parsed = await pdfText(await createHrAttendancePdf(row.reportInput));
    for (const phrase of [
      "Issue date:",
      "Synthetic Issuer",
      "Report reference:",
      "HR-ATT-20260104-20260108-20260201223000000",
      "02/02/2026, 00:30",
      "Employee recorded timing sheet",
      "08:30:00",
      "16:00:00",
      "09:00 - 15:00",
      "Recorded duration",
      "Shift overlap",
      "Late minutes:",
      "Late hours:",
      "Late equivalent days:",
      "Early-exit equivalent days:",
      "Absent",
      "Total lost",
      "Preview deduction:",
      "555.37",
      "Preview net:",
      "2,444.63",
      "Salary / 30 basis",
      "3,000.00 / 30",
    ])
      expect(parsed.text).toContain(phrase);
    expect(parsed.total).toBeGreaterThanOrEqual(4);
    parsed.pages.forEach((page, index) => {
      expect(page.text).toContain(`Page ${index + 1} of ${parsed.total}`);
      expect(page.text).toContain("HR-ATT-20260104-20260108-");
    });
  });

  it("shows next-day Cairo dates and keeps actual timing sheet readable over long periods", async () => {
    const row = fixture({
      from: "2026-01-01",
      to: "2026-02-28",
      now: new Date("2026-03-02T18:00:00Z"),
      attendance: [
        {
          attendanceDate: from,
          checkInAt: "2026-01-04T08:30:00+02:00",
          checkOutAt: "2026-01-05T00:30:00+02:00",
        },
      ],
    });
    const parsed = await pdfText(await createHrAttendancePdf(row.reportInput));
    expect(parsed.text).toContain("2026-01-05 00:30:00");
    const pages = parsed.pages.filter(page =>
      page.text.includes("Employee recorded timing sheet")
    );
    expect(pages.length).toBeGreaterThan(2);
    for (const page of pages) {
      expect(page.text).toContain("Cairo date");
      expect(page.text).toContain("Actual clock");
    }
  });
});

describe("real overview includes timing using existing read-only data", () => {
  it("returns timing without writes or additional sensitive-column reads", async () => {
    const seeds: Record<string, Record<string, any>[]> = {
      finEmployees: [
        {
          id: 901,
          name: "Synthetic Timing Employee",
          crmUserId: 20,
          salary: "3000",
          isActive: true,
          hrSelfServiceRequired: true,
        },
      ],
      hrEmployeeSchedules: [{ ...schedule, id: 1, employeeId: 901 }],
      hrAttendance: [{ ...punch(from, "08:30", "16:00"), employeeId: 901 }],
      finEmployeeSalaryRates: [
        {
          employeeId: 901,
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          monthlySalary: "3000",
        },
      ],
      hrHolidays: [],
      hrLeaveRequests: [],
      hrLeaveEntitlements: [],
    };
    const reads: { table: string; fields: string[] | null }[] = [];
    const forbiddenWrite = vi.fn(() => {
      throw new Error("writes forbidden");
    });
    dependencies.updateEmployee.mockClear();
    dependencies.getDb.mockResolvedValue({
      insert: forbiddenWrite,
      update: forbiddenWrite,
      delete: forbiddenWrite,
      transaction: forbiddenWrite,
      select(projection?: Record<string, { name: string }>) {
        let table: string;
        const query: any = {
          from(value: any) {
            table = getTableName(value);
            return query;
          },
          where() {
            return query;
          },
          orderBy() {
            return query;
          },
          then(resolve: any, reject: any) {
            reads.push({
              table,
              fields: projection ? Object.keys(projection) : null,
            });
            const data = seeds[table].map(row =>
              projection
                ? Object.fromEntries(
                    Object.entries(projection).map(([key, column]) => [
                      key,
                      row[column.name],
                    ])
                  )
                : row
            );
            return Promise.resolve(structuredClone(data)).then(resolve, reject);
          },
        };
        return query;
      },
    });
    const overview = await getHrAdminOverview(
      { from, to: from, year: 2026 },
      new Date("2026-02-02T18:00:00Z")
    );
    expect(overview.employees[0].timing).toMatchObject({
      scheduledMinutes: 360,
      evaluatedScheduledMinutes: 360,
      recordedMinutes: 450,
      scheduledPresenceMinutes: 360,
      presentDays: 1,
    });
    expect(overview.employees[0].payroll.dailyRate).toBe(100);
    expect(reads.find(read => read.table === "hrAttendance")?.fields).toEqual([
      "employeeId",
      "attendanceDate",
      "checkInAt",
      "checkOutAt",
    ]);
    expect(forbiddenWrite).not.toHaveBeenCalled();
    expect(dependencies.updateEmployee).not.toHaveBeenCalled();
    const report = buildHrAttendanceReport({
      from,
      to: from,
      generatedAt,
      generatedBy: "Synthetic Issuer",
      employees: overview.employees,
    });
    expect(report.employees[0].timingAvailable).toBe(true);
  });
});
