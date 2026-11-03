import { hrDateKey } from "./hrPayroll";

/** Structural subsets of the already-authorized HR admin overview. */
export type HrVacationReportSourceEmployee = {
  readonly id: number;
  readonly name: string;
  readonly leaveBalance: {
    readonly year: number;
    readonly totalDays: number | string;
    readonly usedDays: number | string;
    readonly remainingDays: number | string;
  } | null;
};

export type HrVacationReportSourceRequest = {
  readonly id: number;
  readonly employeeId: number;
  readonly fromDate: string | Date;
  readonly toDate: string | Date;
  readonly status: string;
  readonly requestedDays: number | string;
  /** Stored creation/approval snapshot, exactly as in hrLeaveRequests. */
  readonly daysByYear: string;
  readonly reason: string;
  readonly decisionReason: string | null;
  readonly createdAt: Date | string | null;
  readonly reviewedAt: Date | string | null;
};

export type HrVacationReportInput = {
  readonly year: number;
  readonly employees: readonly HrVacationReportSourceEmployee[];
  /** Supply the FULL overview requests, not a payroll-period/status-filtered list. */
  readonly requests: readonly HrVacationReportSourceRequest[];
  readonly holidays: readonly {
    readonly holidayDate: string | Date;
    readonly name: string;
  }[];
  /** Display name only; email-like substrings and control characters are removed. */
  readonly generatedBy: string;
  /** Required for deterministic projection; the browser PDF API supplies a default. */
  readonly generatedAt: Date;
};

export type HrVacationReportHistory = {
  id: number;
  fromDate: string;
  toDate: string;
  status: string;
  requestedDays: number;
  /** Stored days allocated/requested in the selected year; may legitimately be zero. */
  yearDays: number;
  reason: string;
  decisionReason: string | null;
  createdAt: string | null;
  reviewedAt: string | null;
};

export type HrVacationReportEmployee = {
  id: number;
  name: string;
  /** Null means the overview supplied no balance; never infer a default allowance. */
  totalDays: number | null;
  usedDays: number | null;
  remainingDays: number | null;
  /** Informational only: pending days never reduce remainingDays. */
  pendingDays: number;
  requestCount: number;
  history: HrVacationReportHistory[];
};

export type HrVacationReportTotals = {
  employeeCount: number;
  /** Totals below sum supplied balances only; flag partial totals explicitly. */
  missingBalanceCount: number;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  pendingDays: number;
  requestCount: number;
};

export type HrVacationReport = {
  year: number;
  generatedBy: string;
  generatedAt: string;
  employees: HrVacationReportEmployee[];
  totals: HrVacationReportTotals;
};

/** No user/login identity is a report field, even when embedded in human text. */
export function vacationReportText(value: string, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return (
    value
      .replace(/[^\s<>]+@[^\s<>]+/g, "")
      .replace(
        /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g,
        " "
      )
      .replace(/[^\s<>]+@[^\s<>]+/g, "")
      .replace(/\s+/g, " ")
      .trim() || fallback
  );
}

function validYear(value: number) {
  if (!Number.isInteger(value) || value < 1000 || value > 9999) {
    throw new Error("Vacation report year must be a four-digit calendar year");
  }
}
function positiveId(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Vacation report ${label} must be a positive integer`);
  }
}
function amount(
  value: number | string,
  label: string,
  allowNegative = false
): number {
  const parsed =
    typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())
      ? Number(value)
      : value;
  if (
    typeof parsed !== "number" ||
    !Number.isFinite(parsed) ||
    (!allowNegative && parsed < 0)
  ) {
    throw new Error(
      `Vacation report ${label} must be a finite ${allowNegative ? "" : "non-negative "}number`
    );
  }
  return parsed;
}
function timestamp(value: Date | string, label: string): string {
  if (typeof value === "string") {
    if (
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
        value
      )
    ) {
      throw new Error(
        `Vacation report ${label} must be a timestamp with a timezone`
      );
    }
    hrDateKey(value.slice(0, 10));
  } else if (!(value instanceof Date)) {
    throw new Error(`Vacation report ${label} must be a valid timestamp`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Vacation report ${label} must be a valid timestamp`);
  }
  return date.toISOString();
}

function dateOnly(value: string | Date): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime()))
      throw new Error("Vacation request dates must be valid");
    return hrDateKey(value.toISOString().slice(0, 10));
  }
  if (typeof value === "string" && value.length > 10) {
    timestamp(value, "request date");
    return hrDateKey(value.slice(0, 10));
  }
  return hrDateKey(value);
}

/**
 * Mirrors hrManagementService.frozenAllocation's source policy and validation.
 * Never recalculate an approved request against today's holiday calendar. Pending
 * and rejected rows retain their stored request-time snapshot too, so history is
 * an audit of what was requested/decided, not a new live working-day quotation.
 * Corrupt snapshots fail closed instead of silently reporting fewer used days.
 */
function selectedYearDays(
  request: HrVacationReportSourceRequest,
  year: number,
  requestedDays: number
): number {
  try {
    const parsed: unknown = JSON.parse(request.daysByYear);
    if (!Array.isArray(parsed)) throw new Error("Not an allocation array");
    const seen = new Set<number>();
    let total = 0;
    let selected = 0;
    for (const item of parsed) {
      const row = item as { year: number; days: number } | null;
      if (
        !row ||
        !Number.isInteger(row.year) ||
        row.year < 1000 ||
        row.year > 9999 ||
        !Number.isInteger(row.days) ||
        row.days < 0 ||
        row.days > 366 ||
        seen.has(row.year)
      ) {
        throw new Error("Invalid frozen allocation");
      }
      seen.add(row.year);
      total += row.days;
      if (row.year === year) selected = row.days;
    }
    if (total !== requestedDays) throw new Error("Allocation total mismatch");
    return selected;
  } catch {
    throw new Error(
      `Leave request ${request.id} has an invalid stored allocation; refresh the overview`
    );
  }
}

/**
 * Pure explicit projection: no DB, clock, network, raw objects, salary, user IDs,
 * GPS or email. Calendar-year overlap is independent of the payroll date filter.
 * Balances are authoritative overview values, not a sum of visible history. A
 * selected-year overview is mandatory; stale balances are never relabeled.
 */
export function buildHrVacationReport(
  input: HrVacationReportInput
): HrVacationReport {
  validYear(input.year);
  if (!Array.isArray(input.employees) || input.employees.length === 0) {
    throw new Error("Choose at least one employee to export");
  }
  if (!Array.isArray(input.requests) || !Array.isArray(input.holidays)) {
    throw new Error("Vacation report requires overview requests and holidays");
  }
  if (
    !(input.generatedAt instanceof Date) ||
    !Number.isFinite(input.generatedAt.getTime())
  ) {
    throw new Error("Vacation report generatedAt must be a valid Date");
  }
  const from = `${input.year}-01-01`;
  const to = `${input.year}-12-31`;
  const ids = new Set<number>();
  for (const employee of input.employees) {
    positiveId(employee.id, "employee ID");
    if (ids.has(employee.id))
      throw new Error("Choose each vacation report employee only once");
    ids.add(employee.id);
  }
  const histories = new Map<number, HrVacationReportHistory[]>();
  const requestIds = new Set<number>();
  for (const request of input.requests) {
    // Requests outside the authorized selection must not be projected or inspected.
    if (!ids.has(request.employeeId)) continue;
    const requestFrom = dateOnly(request.fromDate);
    const requestTo = dateOnly(request.toDate);
    if (requestFrom > requestTo)
      throw new Error("Vacation request start must be on or before its end");
    if (requestFrom > to || requestTo < from) continue;
    positiveId(request.id, "request ID");
    if (requestIds.has(request.id))
      throw new Error("Duplicate vacation request in overview");
    requestIds.add(request.id);
    const requestedDays = amount(request.requestedDays, "requested days");
    if (!Number.isInteger(requestedDays)) {
      throw new Error("Vacation requested days must be a non-negative integer");
    }
    const row: HrVacationReportHistory = {
      id: request.id,
      fromDate: requestFrom,
      toDate: requestTo,
      status: vacationReportText(request.status, "Unknown"),
      requestedDays,
      yearDays: selectedYearDays(request, input.year, requestedDays),
      reason: vacationReportText(request.reason),
      decisionReason:
        request.decisionReason === null
          ? null
          : vacationReportText(request.decisionReason),
      createdAt:
        request.createdAt === null
          ? null
          : timestamp(request.createdAt, "request creation date"),
      reviewedAt:
        request.reviewedAt === null
          ? null
          : timestamp(request.reviewedAt, "decision date"),
    };
    const history = histories.get(request.employeeId) ?? [];
    history.push(row);
    histories.set(request.employeeId, history);
  }
  const employees: HrVacationReportEmployee[] = input.employees.map(
    employee => {
      const balance = employee.leaveBalance;
      if (balance !== null && (!balance || balance.year !== input.year)) {
        throw new Error(
          "Vacation balances must belong to the selected year; refresh the overview"
        );
      }
      const history = histories.get(employee.id) ?? [];
      return {
        id: employee.id,
        name: vacationReportText(employee.name, "Unnamed employee"),
        totalDays:
          balance === null ? null : amount(balance.totalDays, "allowance"),
        usedDays:
          balance === null ? null : amount(balance.usedDays, "approved usage"),
        // Preserve even a negative authoritative remaining balance; never clamp it.
        remainingDays:
          balance === null
            ? null
            : amount(balance.remainingDays, "remaining balance", true),
        pendingDays: history.reduce(
          (sum, row) => sum + (row.status === "pending" ? row.yearDays : 0),
          0
        ),
        requestCount: history.length,
        history,
      };
    }
  );
  const totals: HrVacationReportTotals = {
    employeeCount: employees.length,
    missingBalanceCount: employees.filter(
      employee => employee.totalDays === null
    ).length,
    totalDays: employees.reduce(
      (sum, employee) => sum + (employee.totalDays ?? 0),
      0
    ),
    usedDays: employees.reduce(
      (sum, employee) => sum + (employee.usedDays ?? 0),
      0
    ),
    remainingDays: employees.reduce(
      (sum, employee) => sum + (employee.remainingDays ?? 0),
      0
    ),
    pendingDays: employees.reduce(
      (sum, employee) => sum + employee.pendingDays,
      0
    ),
    requestCount: employees.reduce(
      (sum, employee) => sum + employee.requestCount,
      0
    ),
  };
  return {
    year: input.year,
    generatedBy: vacationReportText(input.generatedBy, "HR administrator"),
    generatedAt: input.generatedAt.toISOString(),
    employees,
    totals,
  };
}
