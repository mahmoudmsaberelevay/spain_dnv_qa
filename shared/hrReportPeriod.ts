import { hrDateKey } from "./hrPayroll";

/** The payroll month names the month containing the closing 26th. */
export function hrPayrollCycleForMonth(month: string): {
  from: string;
  to: string;
} {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("Choose a valid payroll month");
  const [year, value] = month.split("-").map(Number);
  return {
    from: new Date(Date.UTC(year, value - 2, 27)).toISOString().slice(0, 10),
    to: `${month}-26`,
  };
}

export function hrPayrollCycleForDate(date: string, lastCompleted = false) {
  hrDateKey(date);
  const [year, month, day] = date.split("-").map(Number);
  const offset = lastCompleted ? (day <= 26 ? -1 : 0) : day >= 27 ? 1 : 0;
  const closing = new Date(Date.UTC(year, month - 1 + offset, 26));
  return hrPayrollCycleForMonth(closing.toISOString().slice(0, 7));
}
