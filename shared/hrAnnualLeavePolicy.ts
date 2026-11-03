/** Owner-approved full calendar-year allowance, independent of payroll cycles.
 * Each year's approved allocations are charged only against that same year.
 * No carryover, accrual, scheduled reset or deletion of historical requests.
 * Explicit named-HR-admin adjustments remain authoritative for that year.
 */
export function getHrDefaultAnnualLeaveDays(year: number): number {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new RangeError("Year must be a four-digit calendar year");
  }
  if (year === 2026) return 20;
  return year >= 2027 ? 22 : 0;
}

export const HR_ANNUAL_LEAVE_POLICY_TEXT =
  "Annual leave allowance: 20 days for 2026; 22 days per calendar year from 2027. The allowance resets each 1 January with no unused-day carryover. Only approved leave allocated to that year reduces its balance. Named HR administrators can make audited year-specific adjustments.";
