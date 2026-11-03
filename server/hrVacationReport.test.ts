import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFParse } from "pdf-parse";
import {
  buildHrVacationReport,
  vacationReportText,
  type HrVacationReportInput,
  type HrVacationReportSourceEmployee,
  type HrVacationReportSourceRequest,
} from "../shared/hrVacationReport";
import {
  createHrVacationPdf,
  exportHrVacationPdf,
  generateHrVacationPdfArrayBuffer,
} from "../client/src/lib/hrVacationPdf";

const generatedAt = new Date("2026-02-01T22:30:00Z");
function employee(
  id = 901,
  options: Partial<HrVacationReportSourceEmployee> = {}
): HrVacationReportSourceEmployee {
  return {
    id,
    name: `Synthetic Employee ${id}`,
    leaveBalance: { year: 2026, totalDays: 20, usedDays: 7, remainingDays: 13 },
    ...options,
  };
}
function request(
  options: Partial<HrVacationReportSourceRequest> = {}
): HrVacationReportSourceRequest {
  return {
    id: 1001,
    employeeId: 901,
    fromDate: "2026-11-08",
    toDate: "2026-11-09",
    status: "approved",
    requestedDays: 2,
    daysByYear: '[{"year":2026,"days":2}]',
    reason: "Synthetic family vacation",
    decisionReason: "Synthetic approval decision",
    createdAt: new Date("2026-10-01T09:00:00Z"),
    reviewedAt: new Date("2026-10-02T10:00:00Z"),
    ...options,
  };
}
function input(
  options: Partial<HrVacationReportInput> = {}
): HrVacationReportInput {
  return {
    year: 2026,
    employees: [employee()],
    requests: [request()],
    holidays: [],
    generatedBy: "Synthetic QA Administrator",
    generatedAt,
    ...options,
  };
}
async function parse(buffer: ArrayBuffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    return await parser.getText();
  } finally {
    await parser.destroy();
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("pure annual HR vacation report", () => {
  it("uses the full calendar-year history, all statuses and original cross-year request dates", () => {
    const requests = [
      request({
        id: 1,
        fromDate: "2025-12-30",
        toDate: "2026-01-04",
        requestedDays: 4,
        daysByYear: '[{"year":2025,"days":2},{"year":2026,"days":2}]',
      }),
      request({
        id: 2,
        status: "pending",
        fromDate: "2026-12-30",
        toDate: "2027-01-04",
        requestedDays: 4,
        daysByYear: '[{"year":2026,"days":2},{"year":2027,"days":2}]',
        reviewedAt: null,
        decisionReason: null,
      }),
      request({
        id: 3,
        status: "rejected",
        fromDate: "2026-01-04",
        toDate: "2026-01-05",
        decisionReason: "Team coverage",
      }),
      request({
        id: 4,
        status: "cancelled",
        reason: "Withdrawn historical request",
      }),
      request({
        id: 5,
        fromDate: "2025-12-01",
        toDate: "2025-12-02",
        daysByYear: "not inspected outside year",
      }),
      request({
        id: 6,
        fromDate: "2027-01-03",
        toDate: "2027-01-04",
        daysByYear: "not inspected outside year",
      }),
      request({
        id: 7,
        employeeId: 999,
        daysByYear: "not inspected outside selection",
      }),
    ];
    const report = buildHrVacationReport(input({ requests }));
    expect(report.employees[0].history.map(row => row.id)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(report.employees[0].history.map(row => row.status)).toEqual([
      "approved",
      "pending",
      "rejected",
      "cancelled",
    ]);
    expect(report.employees[0].history[0]).toMatchObject({
      fromDate: "2025-12-30",
      toDate: "2026-01-04",
      requestedDays: 4,
      yearDays: 2,
    });
    expect(report.employees[0].history[1]).toMatchObject({
      fromDate: "2026-12-30",
      toDate: "2027-01-04",
      requestedDays: 4,
      yearDays: 2,
    });
    expect(report.employees[0].requestCount).toBe(4);
  });

  it("preserves frozen year allocations despite later holidays, and does not infer approved usage from the dates", () => {
    const source = input({
      holidays: [
        { holidayDate: "2026-11-08", name: "Later holiday" },
        {
          holidayDate: new Date("2026-11-09T00:00:00Z"),
          name: "Later second holiday",
        },
      ],
    });
    expect(buildHrVacationReport(source).employees[0].history[0].yearDays).toBe(
      2
    );
    expect(buildHrVacationReport({ ...source, holidays: [] })).toEqual(
      buildHrVacationReport(source)
    );
    expect(buildHrVacationReport(source).employees[0]).toMatchObject({
      totalDays: 20,
      usedDays: 7,
      remainingDays: 13,
    });
  });

  it("keeps request-time pending/rejected snapshots without charging remaining balance", () => {
    const report = buildHrVacationReport(
      input({
        requests: [
          request({
            id: 1,
            status: "pending",
            reviewedAt: null,
            decisionReason: null,
          }),
          request({ id: 2, status: "rejected" }),
        ],
        holidays: [
          { holidayDate: "2026-11-08", name: "Changed after request" },
        ],
      })
    );
    expect(report.employees[0]).toMatchObject({
      usedDays: 7,
      remainingDays: 13,
      pendingDays: 2,
      requestCount: 2,
    });
    expect(report.totals).toMatchObject({
      usedDays: 7,
      remainingDays: 13,
      pendingDays: 2,
    });
    expect(report.employees[0].history[1].yearDays).toBe(2);
  });

  it("includes zero selected-year allocations and approved zero-day requests", () => {
    const report = buildHrVacationReport(
      input({
        requests: [
          request({
            id: 1,
            fromDate: "2026-12-31",
            toDate: "2027-01-03",
            requestedDays: 1,
            daysByYear: '[{"year":2027,"days":1}]',
          }),
          request({ id: 2, requestedDays: 0, daysByYear: "[]" }),
          request({
            id: 3,
            requestedDays: 0,
            daysByYear: '[{"year":2026,"days":0}]',
            status: "pending",
          }),
        ],
      })
    );
    expect(report.employees[0].history.map(row => row.yearDays)).toEqual([
      0, 0, 0,
    ]);
    expect(report.employees[0].requestCount).toBe(3);
    expect(report.employees[0].pendingDays).toBe(0);
  });

  it("accepts dashboard decimal/date structural types and normalizes timestamps without local timezone drift", () => {
    const report = buildHrVacationReport(
      input({
        employees: [
          employee(901, {
            leaveBalance: {
              year: 2026,
              totalDays: "22.50",
              usedDays: "4",
              remainingDays: "18.50",
            },
          }),
        ],
        requests: [
          request({
            fromDate: new Date("2026-11-08T00:00:00Z"),
            toDate: "2026-11-09T00:00:00+02:00",
            requestedDays: "2",
            createdAt: "2026-10-01T11:00:00+02:00",
            reviewedAt: null,
          }),
        ],
      })
    );
    expect(report.employees[0]).toMatchObject({
      totalDays: 22.5,
      usedDays: 4,
      remainingDays: 18.5,
    });
    expect(report.employees[0].history[0]).toMatchObject({
      fromDate: "2026-11-08",
      toDate: "2026-11-09",
      requestedDays: 2,
      createdAt: "2026-10-01T09:00:00.000Z",
      reviewedAt: null,
    });
    expect(
      buildHrVacationReport(input({ requests: [request({ createdAt: null })] }))
        .employees[0].history[0].createdAt
    ).toBeNull();
  });

  it("keeps inactive and no-request staff in supplied order without mutation or fabricated balances", () => {
    const inactive = { ...employee(903), isActive: false, crmUserId: null };
    const employees = Object.freeze([
      inactive,
      employee(902, { leaveBalance: null }),
      employee(),
    ]);
    const data = input({
      employees,
      requests: Object.freeze([Object.freeze(request())]),
    });
    const before = JSON.stringify(data);
    const report = buildHrVacationReport(data);
    expect(report.employees.map(row => row.id)).toEqual([903, 902, 901]);
    expect(report.employees[0].history).toEqual([]);
    expect(report.employees[1]).toMatchObject({
      totalDays: null,
      usedDays: null,
      remainingDays: null,
      pendingDays: 0,
    });
    expect(report.totals).toMatchObject({
      employeeCount: 3,
      missingBalanceCount: 1,
      totalDays: 40,
      usedDays: 14,
      remainingDays: 26,
      requestCount: 1,
    });
    expect(JSON.stringify(data)).toBe(before);
    expect(report.employees[2].history[0]).not.toBe(data.requests[0]);
  });

  it("preserves authoritative adjusted and negative remaining balances rather than recalculating or clamping", () => {
    const report = buildHrVacationReport(
      input({
        employees: [
          employee(901, {
            leaveBalance: {
              year: 2026,
              totalDays: 1.5,
              usedDays: 4,
              remainingDays: -2.5,
            },
          }),
        ],
      })
    );
    expect(report.employees[0]).toMatchObject({
      totalDays: 1.5,
      usedDays: 4,
      remainingDays: -2.5,
    });
  });

  it("sanitizes every human text and explicitly projects only safe fields", () => {
    const data = input({
      generatedBy: "Issuer issuer-private@example.invalid\u202e\n",
      employees: [
        {
          ...employee(),
          name: "اسم تجريبي name-private@example.invalid\u0001",
          email: "raw-private@example.invalid",
          crmUserId: 998877,
          location: { latitude: 88.123456, longitude: 77.123456 },
          salary: "987654321",
        },
      ],
      requests: [
        {
          ...request(),
          reason: "Family reason-private@example.invalid\u0000\n trip",
          decisionReason: "Approved decision-private@example.invalid\u2066",
          status: "approved status-private@example.invalid\u009f",
          reviewedByUserId: 998877,
          rawUser: { email: "raw-private@example.invalid" },
        },
      ],
      holidays: [
        { holidayDate: "2026-11-08", name: "holiday-private@example.invalid" },
      ],
    });
    const report = buildHrVacationReport(data);
    const text = JSON.stringify(report);
    for (const token of [
      "private",
      "998877",
      "88.123456",
      "77.123456",
      "987654321",
      "crmUserId",
      "location",
      "rawUser",
      "reviewedByUserId",
      "daysByYear",
      "employeeId",
      "holidays",
    ])
      expect(text).not.toContain(token);
    expect(report.generatedBy).toBe("Issuer");
    expect(report.employees[0].name).toBe("اسم تجريبي");
    expect(report.employees[0].history[0]).toMatchObject({
      status: "approved",
      reason: "Family trip",
      decisionReason: "Approved",
    });
    expect(Object.keys(report).sort()).toEqual([
      "employees",
      "generatedAt",
      "generatedBy",
      "totals",
      "year",
    ]);
    expect(Object.keys(report.employees[0]).sort()).toEqual([
      "history",
      "id",
      "name",
      "pendingDays",
      "remainingDays",
      "requestCount",
      "totalDays",
      "usedDays",
    ]);
    expect(vacationReportText("qa@example.invalid", "HR administrator")).toBe(
      "HR administrator"
    );
  });

  it.each([
    "bad json",
    "{}",
    '[{"year":2026,"days":1}]',
    '[{"year":2026,"days":-1}]',
    '[{"year":2026,"days":1.5}]',
    '[{"year":2026,"days":367}]',
    '[{"year":2026,"days":1},{"year":2026,"days":1}]',
    '[{"year":999,"days":2}]',
    "[null]",
  ])("fails closed on corrupted frozen allocation %s", daysByYear => {
    expect(() =>
      buildHrVacationReport(input({ requests: [request({ daysByYear })] }))
    ).toThrow("invalid stored allocation");
  });

  it("rejects empty selections, stale balance years, duplicate identities and invalid amounts/dates", () => {
    expect(() => buildHrVacationReport(input({ employees: [] }))).toThrow(
      "at least one employee"
    );
    expect(() => buildHrVacationReport(input({ year: 2026.5 }))).toThrow(
      "four-digit"
    );
    expect(() =>
      buildHrVacationReport(input({ generatedAt: new Date(NaN) }))
    ).toThrow("valid Date");
    expect(() =>
      buildHrVacationReport(input({ employees: [employee(), employee()] }))
    ).toThrow("only once");
    expect(() =>
      buildHrVacationReport(input({ requests: [request(), request()] }))
    ).toThrow("Duplicate");
    expect(() =>
      buildHrVacationReport(
        input({
          employees: [
            employee(901, {
              leaveBalance: {
                year: 2027,
                totalDays: 22,
                usedDays: 0,
                remainingDays: 22,
              },
            }),
          ],
        })
      )
    ).toThrow("selected year");
    expect(() =>
      buildHrVacationReport(
        input({
          employees: [
            employee(901, {
              leaveBalance: {
                year: 2026,
                totalDays: "",
                usedDays: 0,
                remainingDays: 22,
              },
            }),
          ],
        })
      )
    ).toThrow("finite non-negative");
    expect(() =>
      buildHrVacationReport(
        input({ requests: [request({ requestedDays: NaN })] })
      )
    ).toThrow();
    expect(() =>
      buildHrVacationReport(
        input({ requests: [request({ fromDate: "2026-02-30" })] })
      )
    ).toThrow();
    expect(() =>
      buildHrVacationReport(
        input({ requests: [request({ toDate: "2026-01-01" })] })
      )
    ).toThrow("start");
    expect(() =>
      buildHrVacationReport(
        input({ requests: [request({ createdAt: "2026-10-01T09:00:00" })] })
      )
    ).toThrow("timezone");
  });
});

describe("actual jsPDF annual vacation output (synthetic records only)", () => {
  it("generates landscape A4, Cairo issuer/time/reference/policy, balances, reasons and all history", async () => {
    const data = input({
      requests: [
        request(),
        request({
          id: 1002,
          status: "pending",
          decisionReason: null,
          reviewedAt: null,
        }),
        request({
          id: 1003,
          status: "rejected",
          reason: "Rejected request reason",
          decisionReason: "Rejected decision reason",
        }),
      ],
      generatedBy: "QA Issuer issuer-private@example.invalid",
    });
    const doc = await createHrVacationPdf(data);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(297, 0);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(210, 0);
    const buffer = await generateHrVacationPdfArrayBuffer(data);
    expect(Buffer.from(buffer).subarray(0, 5).toString()).toBe("%PDF-");
    const parsed = await parse(buffer);
    for (const phrase of [
      "ELEVAY",
      "QA Issuer",
      "02/02/2026, 00:30:00",
      "Africa/Cairo",
      "HR-VAC-2026-20260201223000000Z",
      "Team annual vacation balances",
      "Employee full vacation history",
      "Synthetic Employee 901",
      "20 days for 2026",
      "22 days per calendar year from 2027",
      "no unused-day carryover",
      "Pending",
      "Approved",
      "Rejected",
      "Synthetic family vacation",
      "Synthetic approval decision",
      "Rejected request reason",
      "Rejected decision reason",
      "2026-11-08",
      "2026-11-09",
      "Awaiting decision",
      "Requested /",
      "year days",
      "NOT deducted",
    ])
      expect(parsed.text).toContain(phrase);
    expect(parsed.text).not.toContain("issuer-private");
    for (const page of parsed.pages) {
      expect(page.text).toContain("ANNUAL VACATION REPORT");
      expect(page.text).toContain("HR-VAC-2026-");
      expect(page.text).toContain("Africa/Cairo");
    }
    parsed.pages.forEach((page, index) =>
      expect(page.text).toContain(`Page ${index + 1} of ${parsed.total}`)
    );
  });

  it("paginates many employees and every request with repeated table/context headers and untruncated long reasons", async () => {
    const employees = Array.from({ length: 32 }, (_, index) =>
      employee(2000 + index)
    );
    const requests = Array.from({ length: 75 }, (_, index) =>
      request({
        id: 3000 + index,
        employeeId: 2000,
        reason:
          `HistoryRowToken${index} ` +
          (index === 40
            ? "LongUnbrokenSyntheticReason".repeat(160) +
              " FinalLongReasonToken"
            : "Request reason"),
        decisionReason: `DecisionRowToken${index}`,
      })
    );
    const data = input({ employees, requests });
    const parsed = await parse(await generateHrVacationPdfArrayBuffer(data));
    expect(parsed.total).toBeGreaterThan(35);
    for (let index = 0; index < 75; index++) {
      expect(parsed.text).toContain(`HistoryRowToken${index}`);
      expect(parsed.text).toContain(`DecisionRowToken${index}`);
    }
    expect(parsed.text).toContain("FinalLongReasonToken");
    expect(parsed.text).toContain("Synthetic Employee 2031");
    const historyPages = parsed.pages.filter(
      page =>
        page.text.includes("HistoryRowToken") ||
        page.text.includes("DecisionRowToken") ||
        page.text.includes("FinalLongReasonToken")
    );
    expect(historyPages.length).toBeGreaterThan(5);
    historyPages.forEach(page => {
      expect(page.text).toContain("Request / status");
      expect(page.text).toContain("Request reason");
      expect(page.text).toContain("Decision reason");
      expect(page.text).toContain("Employee #2000");
    });
    expect(
      parsed.pages.filter(page =>
        page.text.includes("Team annual vacation balances")
      ).length
    ).toBeGreaterThan(1);
  }, 20000);

  it("marks missing balances as unavailable and prints employees with no requests", async () => {
    const parsed = await parse(
      await generateHrVacationPdfArrayBuffer(
        input({
          employees: [employee(901, { leaveBalance: null })],
          requests: [],
        })
      )
    );
    expect(parsed.text).toContain("Not supplied");
    expect(parsed.text).toContain("Team balance totals are partial");
    expect(parsed.text).toContain(
      "No vacation requests overlap this calendar year"
    );
  });

  it("defaults generation time locally, rejects non-browser download and never makes network calls", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(generatedAt);
    const fetch = vi.fn(() => {
      throw new Error("No network allowed");
    });
    vi.stubGlobal("fetch", fetch);
    const { generatedAt: _ignored, ...data } = input();
    const doc = await createHrVacationPdf(data);
    expect(doc.getCreationDate()).toContain("20260201");
    expect(fetch).not.toHaveBeenCalled();
    await expect(exportHrVacationPdf(data)).rejects.toThrow(
      "require a browser"
    );
  });

  it.each([
    input({ generatedBy: "مصدر التقرير" }),
    input({ employees: [employee(901, { name: "اسم تجريبي" })] }),
    input({ requests: [request({ reason: "إجازة عائلية" })] }),
    input({ requests: [request({ decisionReason: "تمت الموافقة" })] }),
  ])(
    "requires browser canvas for every Unicode human field rather than producing broken glyphs",
    async data => {
      await expect(createHrVacationPdf(data)).rejects.toThrow("browser canvas");
    }
  );
});
