import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { calculateHrPayroll } from "../shared/hrPayroll";
import { buildHrAttendanceReport } from "../shared/hrAttendanceReport";
import { generateHrAttendancePdfArrayBuffer } from "../client/src/lib/hrAttendancePdf";

function fixture() {
  const from = "2026-11-05";
  const payroll = calculateHrPayroll({
    from,
    to: from,
    now: new Date("2026-11-06T18:00:00Z"),
    salary: 10000,
    schedules: [
      {
        effectiveFrom: "2026-11-04",
        startTime: "09:00",
        endTime: "17:00",
        graceMinutes: 0,
        maternityBreakMode: "two_30",
        maternityBreakStart1: "09:00",
        maternityBreakStart2: "16:30",
        maternityBreakUntil: "2026-12-31",
      },
    ],
    attendance: [
      {
        attendanceDate: from,
        checkInAt: `${from}T09:30:00+02:00`,
        checkOutAt: `${from}T16:30:00+02:00`,
      },
    ],
    holidays: [],
    approvedLeaveDates: [],
  });
  return {
    from,
    to: from,
    generatedAt: new Date("2026-11-06T18:00:00Z"),
    generatedBy: "Synthetic HR Administrator",
    employees: [
      {
        id: 991,
        name: "Synthetic Employee",
        payroll: { ...payroll, coveredBaseSalary: 10000, cycleBreakdown: [] },
      },
    ],
  };
}

describe("paid maternity-break attendance reports", () => {
  it("projects the configured allowance separately from actual excused time without invented work", () => {
    const report = buildHrAttendanceReport(fixture());
    expect(report.employees[0].days[0]).toMatchObject({
      maternityBreakMinutes: 60,
      maternityExcusedMinutes: 60,
      lateMinutes: 0,
      earlyMinutes: 0,
      missingMinutes: 0,
    });
    expect(report.employees[0].totalDeduction).toBe(0);
    expect(report.employees[0].timingAvailable).toBe(false);
  });

  it("fails closed on excess allowance, unconfigured credit or credit on absent dates", () => {
    for (const bad of [
      { maternityBreakMinutes: 90, maternityExcusedMinutes: 60 },
      { maternityBreakMinutes: 0, maternityExcusedMinutes: 30 },
      { maternityBreakMinutes: 60, maternityExcusedMinutes: 61 },
      { maternityBreakMinutes: 60, maternityExcusedMinutes: Number.NaN },
      {
        status: "absent" as const,
        maternityBreakMinutes: 60,
        maternityExcusedMinutes: 60,
      },
    ]) {
      const input = fixture();
      Object.assign(input.employees[0].payroll.days[0], bad);
      expect(() => buildHrAttendanceReport(input)).toThrow();
    }
  });

  it("exports searchable paid allowance and excused minutes without private runtime properties", async () => {
    const input = fixture();
    Object.assign(input.employees[0].payroll.days[0], {
      privatePolicyReason: "private-policy-token",
      location: { latitude: 88.12345 },
    });
    const parser = new PDFParse({
      data: new Uint8Array(await generateHrAttendancePdfArrayBuffer(input)),
    });
    try {
      const result = await parser.getText();
      expect(result.text).toContain("Paid maternity/nursing breaks");
      expect(result.text).toContain(
        "actually excused from late/early penalties: 60 min"
      );
      expect(result.text).toMatch(/Paid maternity\s+allowance min/);
      expect(result.text).not.toContain("private-policy-token");
      expect(result.text).not.toContain("88.12345");
      expect(result.text).toContain("monthly salary / 30 calendar days");
    } finally {
      await parser.destroy();
    }
  });
});
