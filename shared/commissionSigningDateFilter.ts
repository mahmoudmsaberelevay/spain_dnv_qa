import { calendarDateToDateOnly } from "./financialDateRange";

export type CommissionSigningDatePreset =
  | "all"
  | "this_day"
  | "this_week"
  | "this_month"
  | "this_year"
  | "custom";

export interface CommissionSigningDateRange {
  signingDateFrom?: string;
  signingDateTo?: string;
}

function atLocalNoon(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 12, 0, 0, 0);
}

export function resolveCommissionSigningDateRange(
  preset: CommissionSigningDatePreset,
  customFrom = "",
  customTo = "",
  now = new Date(),
): CommissionSigningDateRange {
  if (preset === "custom") {
    return {
      signingDateFrom: customFrom || undefined,
      signingDateTo: customTo || undefined,
    };
  }
  if (preset === "all") return {};

  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  let from = atLocalNoon(year, month, day);
  let to = from;

  if (preset === "this_week") {
    const mondayOffset = (now.getDay() + 6) % 7;
    from = atLocalNoon(year, month, day - mondayOffset);
    to = atLocalNoon(from.getFullYear(), from.getMonth(), from.getDate() + 6);
  } else if (preset === "this_month") {
    from = atLocalNoon(year, month, 1);
    to = atLocalNoon(year, month + 1, 0);
  } else if (preset === "this_year") {
    from = atLocalNoon(year, 0, 1);
    to = atLocalNoon(year, 11, 31);
  }

  return {
    signingDateFrom: calendarDateToDateOnly(from),
    signingDateTo: calendarDateToDateOnly(to),
  };
}
