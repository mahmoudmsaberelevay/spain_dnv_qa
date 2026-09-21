import type { ClientProcessTimelineItem, ClientProcessTimelineStatus } from "./clientProcessTimeline";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textOrFallback(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function positionOrFallback(value: unknown, fallback: number) {
  const position = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(position) && position > 0 ? position : fallback;
}

function mobileStatus(value: unknown): ClientProcessTimelineStatus {
  if (value === "completed") return "completed";
  if (value === "active") return "current";
  return "upcoming";
}

export function safeMobileTimelineDate(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed.length === 10 ? `${trimmed}T12:00:00Z` : trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Converts the rich CRM Caribbean workflow into the stable array consumed by
 * existing installed mobile clients. Unknown fields are intentionally ignored.
 */
export function normalizeMobileProcessTimeline(workflow: unknown): ClientProcessTimelineItem[] {
  const rawStages = Array.isArray(workflow)
    ? workflow
    : isRecord(workflow) && Array.isArray(workflow.stages)
      ? workflow.stages
      : [];

  return rawStages.map((rawStage, index) => {
    const stage = isRecord(rawStage) ? rawStage : {};
    const position = positionOrFallback(stage.order ?? stage.position, index + 1);
    const key = textOrFallback(stage.key, `stage_${position}`);
    const titleEn = textOrFallback(stage.titleEn, key);
    return {
      key,
      position,
      titleEn,
      titleAr: textOrFallback(stage.titleAr, titleEn),
      status: mobileStatus(stage.status),
      occurredAt: safeMobileTimelineDate(stage.date ?? stage.occurredAt),
    };
  });
}
