export const ELEVAY_TIME_ZONE = "Africa/Cairo";

/**
 * Returns the Gregorian calendar day in ELEVAY's business time zone.
 * Values are intentionally date-only (YYYY-MM-DD) so they can safely be
 * persisted to MySQL DATE fields and compared without a browser time zone.
 */
export function getCairoBusinessDate(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ELEVAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const year = byType.get("year");
  const month = byType.get("month");
  const day = byType.get("day");
  if (!year || !month || !day) throw new Error("Unable to determine the Cairo business date");
  return `${year}-${month}-${day}`;
}

export type FinancialEmployeeSalaryRate = {
  effectiveFrom: string | Date;
  monthlySalary: string | number;
};

export function toCalendarDateKey(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/**
 * Chooses the salary that was in effect on a calculation date. ISO date keys
 * compare lexically in calendar order, which keeps this rule time-zone-free.
 */
export function selectEffectiveEmployeeSalaryRate<T extends FinancialEmployeeSalaryRate>(
  rates: readonly T[],
  calculationDate: string,
): T | null {
  return rates
    .filter((rate) => toCalendarDateKey(rate.effectiveFrom) <= calculationDate)
    .slice()
    .sort((left, right) => toCalendarDateKey(right.effectiveFrom).localeCompare(toCalendarDateKey(left.effectiveFrom)))[0] ?? null;
}
