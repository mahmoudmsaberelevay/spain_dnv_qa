const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DEFAULT_BUSINESS_TIME_ZONE = "Africa/Cairo";

export type FinancialDateBoundary = Date | string | undefined;

export function calendarDateToDateOnly(value?: Date): string | undefined {
  if (!value) return undefined;
  if (Number.isNaN(value.getTime())) throw new Error("Date is invalid");
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function assertValidDateOnly(value: string): string {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) throw new Error("Date must use YYYY-MM-DD format");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error("Date is not a valid calendar day");
  }
  return value;
}

export function dateToBusinessDateOnly(
  value: Date,
  timeZone = DEFAULT_BUSINESS_TIME_ZONE,
): string {
  if (Number.isNaN(value.getTime())) throw new Error("Date is invalid");

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  if (!year || !month || !day) throw new Error("Unable to resolve business date");
  return `${year}-${month}-${day}`;
}

export function financialDateBoundaryToDateOnly(
  value: FinancialDateBoundary,
  timeZone = DEFAULT_BUSINESS_TIME_ZONE,
): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return assertValidDateOnly(value);
  return dateToBusinessDateOnly(value, timeZone);
}

function dateOnlyToUtcBoundary(value: string, endOfDay: boolean): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  ));
}

export function normalizeFinancialDateRange(
  from: FinancialDateBoundary,
  to: FinancialDateBoundary,
  timeZone = DEFAULT_BUSINESS_TIME_ZONE,
) {
  let fromDateOnly = financialDateBoundaryToDateOnly(from, timeZone);
  let toDateOnly = financialDateBoundaryToDateOnly(to, timeZone);

  if (fromDateOnly && toDateOnly && fromDateOnly > toDateOnly) {
    [fromDateOnly, toDateOnly] = [toDateOnly, fromDateOnly];
  }

  return {
    fromDateOnly,
    toDateOnly,
    from: fromDateOnly ? dateOnlyToUtcBoundary(fromDateOnly, false) : undefined,
    to: toDateOnly ? dateOnlyToUtcBoundary(toDateOnly, true) : undefined,
  };
}

export function isWithinFinancialDateRange(
  value: Date | string,
  from: FinancialDateBoundary,
  to: FinancialDateBoundary,
): boolean {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  const range = normalizeFinancialDateRange(from, to);
  if (range.from && timestamp < range.from.getTime()) return false;
  if (range.to && timestamp > range.to.getTime()) return false;
  return true;
}

export const FINANCIAL_REPORT_ALL_TIME_LABEL = "All Time";
