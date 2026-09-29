export const WEEKLY_EXECUTIVE_BRIEF_STATUSES = [
  "captured",
  "acknowledged",
  "evidence_requested",
  "held",
  "stopped",
] as const;

export type WeeklyExecutiveBriefStatus = (typeof WEEKLY_EXECUTIVE_BRIEF_STATUSES)[number];

export const WEEKLY_EXECUTIVE_BRIEF_DECISIONS = [
  "acknowledge_blocked",
  "request_evidence",
  "hold_planning",
  "stop",
] as const;

export type WeeklyExecutiveBriefDecision = (typeof WEEKLY_EXECUTIVE_BRIEF_DECISIONS)[number];

const NEXT_STATUS: Record<WeeklyExecutiveBriefStatus, readonly WeeklyExecutiveBriefStatus[]> = {
  captured: ["acknowledged", "evidence_requested", "held", "stopped"],
  acknowledged: ["evidence_requested", "held", "stopped"],
  evidence_requested: ["acknowledged", "held", "stopped"],
  held: ["acknowledged", "evidence_requested", "stopped"],
  stopped: [],
};

export function statusForWeeklyExecutiveBriefDecision(decision: WeeklyExecutiveBriefDecision): WeeklyExecutiveBriefStatus {
  if (decision === "acknowledge_blocked") return "acknowledged";
  if (decision === "request_evidence") return "evidence_requested";
  if (decision === "hold_planning") return "held";
  return "stopped";
}

export function weeklyExecutiveBriefCanTransition(from: WeeklyExecutiveBriefStatus, to: WeeklyExecutiveBriefStatus): boolean {
  return NEXT_STATUS[from].includes(to);
}

export function normalizeWeeklyExecutiveBriefText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[\t ]+/g, " ").trim();
}

/** Keeps identity and contact data out of aggregate governance notes and snapshots. */
export function findDisallowedWeeklyExecutiveBriefData(value: string): string | null {
  const text = normalizeWeeklyExecutiveBriefText(value);
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) return "email address";
  if (/\+?\d[\d\s().-]{7,}\d/.test(text)) return "phone or contact number";
  if (/\b(passport|جواز سفر|national id|رقم قومي|client code|رقم العميل|lead name|اسم العميل)\b/i.test(text)) return "client or Lead identity reference";
  return null;
}

export function weeklyExecutiveBriefKey(periodStart: string, version: number): string {
  return `meb-${periodStart.replace(/-/g, "")}-v${version}`;
}

export function isMondayPeriodStart(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && parsed.getUTCDay() === 1;
}

export const WEEKLY_EXECUTIVE_BRIEF_BOUNDARY = "A weekly executive brief is an internal aggregate snapshot and owner decision record. It cannot connect Meta, create or change campaigns, schedule content, publish, spend, make payments, send CAPI events, call providers, send messages, or change CRM data.";
