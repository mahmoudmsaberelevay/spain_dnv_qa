import { dateToBusinessDateOnly } from "./financialDateRange";

export const LEAD_TASK_LIFECYCLE_VALUES = [
  "all",
  "completed",
  "pending",
  "coming",
  "overdue",
] as const;

export type LeadTaskLifecycle = (typeof LEAD_TASK_LIFECYCLE_VALUES)[number];

export type LeadTaskLifecycleCounts = {
  all: number;
  completed: number;
  pending: number;
  coming: number;
  overdue: number;
};

export function getLeadTaskDayBounds(
  now: number | Date = Date.now(),
  timeZone = "Africa/Cairo",
) {
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(current.getTime())) throw new Error("Current date is invalid");

  const dateOnly = dateToBusinessDateOnly(current, timeZone);
  const [year, month, day] = dateOnly.split("-").map(Number);
  return {
    dateOnly,
    start: Date.UTC(year, month - 1, day, 0, 0, 0, 0),
    end: Date.UTC(year, month - 1, day, 23, 59, 59, 999),
  };
}

export function classifyLeadTaskLifecycle(
  task: { completed: boolean; dueDate: number },
  now: number | Date = Date.now(),
  timeZone = "Africa/Cairo",
): Exclude<LeadTaskLifecycle, "all"> {
  if (task.completed) return "completed";

  const bounds = getLeadTaskDayBounds(now, timeZone);
  if (task.dueDate < bounds.start) return "overdue";
  if (task.dueDate > bounds.end) return "coming";
  return "pending";
}
