export type FinancialDatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "this_year"
  | "custom";

export interface FinancialDateRange {
  from?: Date;
  to?: Date;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function sameCalendarDay(left?: Date, right?: Date) {
  return !!left && !!right
    && left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

/**
 * Returns a local calendar range for Financial Module quick filters. The
 * Financial API converts these calendar selections to the Cairo business-day
 * boundaries before querying the database.
 */
export function getFinancialDatePresetRange(
  preset: Exclude<FinancialDatePreset, "custom">,
  now = new Date(),
): FinancialDateRange {
  const today = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);

  switch (preset) {
    case "today":
      return { from: today, to: todayEnd };
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: yesterday, to: endOfLocalDay(yesterday) };
    }
    case "this_week": {
      // Saturday is the first calendar day used by the ELEVAY Cairo business week.
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - ((today.getDay() + 1) % 7));
      return { from: weekStart, to: todayEnd };
    }
    case "this_month":
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: todayEnd };
    case "this_year":
      return { from: new Date(today.getFullYear(), 0, 1), to: todayEnd };
    case "all":
      return {};
  }
}

export function matchFinancialDatePreset(
  range: FinancialDateRange,
  now = new Date(),
): FinancialDatePreset {
  if (!range.from && !range.to) return "all";

  for (const preset of ["today", "yesterday", "this_week", "this_month", "this_year"] as const) {
    const expected = getFinancialDatePresetRange(preset, now);
    if (sameCalendarDay(range.from, expected.from) && sameCalendarDay(range.to, expected.to)) {
      return preset;
    }
  }

  return "custom";
}
