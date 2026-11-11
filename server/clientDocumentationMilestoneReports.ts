import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { clientCases } from "../drizzle/schema";
import {
  DOCUMENTATION_MILESTONES,
  type DocumentationMilestoneKey,
  type DocumentationMilestoneReport,
  type DocumentationMilestoneReportRow,
} from "../shared/clientDocumentationMilestones";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { getUserModuleAccess, isOwner } from "./permissionsRouter";

/** Intentionally explicit: never fetch a raw case or join private/contact data. */
export const CLIENT_DOCUMENTATION_MILESTONE_PROJECTION = {
  id: clientCases.id,
  clientName: clientCases.clientName,
  clientCode: clientCases.clientCode,
  program: clientCases.program,
  consultant: clientCases.consultant,
  paralegal: clientCases.paralegal,
  appointmentBookingSubmittedAt: clientCases.appointmentBookingSubmittedAt,
  embassyReplyConfirmedAt: clientCases.embassyReplyConfirmedAt,
  translationDate: clientCases.translationDate,
  swornTranslationSubmittedAt: clientCases.swornTranslationSubmittedAt,
  travelDate: clientCases.travelDate,
  arrivalConfirmedDate: clientCases.arrivalConfirmedDate,
  biometricsAppointmentDate: clientCases.biometricsAppointmentDate,
  biometricsDate: clientCases.biometricsDate,
  bankAccountCompletedDate: clientCases.bankAccountCompletedDate,
  residencyCardReadyDate: clientCases.residencyCardReadyDate,
  biometricsStatus: clientCases.biometricsStatus,
  residencyCardStatus: clientCases.residencyCardStatus,
} as const;

type MilestoneDate = Date | string | null | undefined;
type MilestoneDateField = (typeof DOCUMENTATION_MILESTONES)[number]["field"];

/** Minimal builder input; accepting raw cases does not expand the output allowlist. */
export type DocumentationMilestoneCase = {
  id: number;
  clientName: string;
  clientCode: string;
  program: string;
  consultant?: string | null;
  paralegal?: string | null;
  biometricsStatus?: string | null;
  residencyCardStatus?: string | null;
  swornTranslationSubmittedAt?: MilestoneDate;
} & Partial<Record<MilestoneDateField, MilestoneDate>>;

/** Normalize real calendar dates only, with UTC semantics for timestamps. */
export function normalizeDocumentationMilestoneDate(
  value: MilestoneDate
): string | null {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    const iso = value.toISOString();
    return /^\d{4}-\d{2}-\d{2}T/.test(iso) && !iso.startsWith("0000-")
      ? iso.slice(0, 10)
      : null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  // Accept date-only, ISO timestamps, and persisted SQL-style datetime strings.
  // Reject locale-dependent strings, numeric strings and invalid time components.
  if (
    !/^\d{4}-\d{2}-\d{2}(?:[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?)?$/.test(
      text
    )
  ) {
    return null;
  }
  const dateKey = text.slice(0, 10);
  const calendarDate = new Date(`${dateKey}T00:00:00Z`);
  if (
    dateKey.startsWith("0000-") ||
    !Number.isFinite(calendarDate.getTime()) ||
    calendarDate.toISOString().slice(0, 10) !== dateKey
  ) {
    return null;
  }
  if (text.length === 10) return dateKey;
  const timestamp = text.replace(" ", "T");
  const utcTimestamp = /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)
    ? timestamp
    : `${timestamp}Z`;
  return normalizeDocumentationMilestoneDate(new Date(utcTimestamp));
}

/**
 * Pure projection over current persisted evidence, with an explicit report clock.
 * Workflow rank, NOT the largest date or latest activity, determines the row.
 * Booking/travel dates are confirmed actions even when their dates are in the
 * future. Neither they nor status flags imply attendance/completion dates.
 */
export function buildClientDocumentationMilestoneReport(
  cases: readonly DocumentationMilestoneCase[],
  generatedAt: Date
): DocumentationMilestoneReport {
  const counts = Object.fromEntries(
    DOCUMENTATION_MILESTONES.map(({ key }) => [key, 0])
  ) as Record<DocumentationMilestoneKey, number>;
  const rows: DocumentationMilestoneReportRow[] = [];
  let totalSpainApplications = 0;
  let withoutMilestone = 0;
  let beyondMilestones = 0;
  const seenIds = new Set<number>();

  for (const clientCase of cases) {
    if (clientCase.program !== "spain" || seenIds.has(clientCase.id)) continue;
    seenIds.add(clientCase.id);
    totalSpainApplications += 1;
    if (clientCase.residencyCardStatus === "collected") {
      beyondMilestones += 1;
      continue;
    }

    let current: { key: DocumentationMilestoneKey; date: string } | null = null;
    for (const milestone of DOCUMENTATION_MILESTONES) {
      if (
        milestone.key === "biometrics_appointment" &&
        clientCase.biometricsStatus === "cancelled"
      )
        continue;
      let date = normalizeDocumentationMilestoneDate(
        clientCase[milestone.field]
      );
      // The alternative existing workflow persists the same translator action
      // under this alias. Prefer the primary field whenever it has valid evidence.
      if (milestone.key === "translator_submitted" && !date) {
        date = normalizeDocumentationMilestoneDate(
          clientCase.swornTranslationSubmittedAt
        );
      }
      if (date) current = { key: milestone.key, date };
    }

    if (!current) {
      withoutMilestone += 1;
      continue;
    }
    counts[current.key] += 1;
    rows.push({
      id: clientCase.id,
      clientName: clientCase.clientName,
      clientCode: clientCase.clientCode,
      program: "spain",
      consultant: clientCase.consultant ?? null,
      paralegal: clientCase.paralegal ?? null,
      currentMilestone: current.key,
      milestoneDate: current.date,
    });
  }

  return {
    rows,
    counts,
    totalSpainApplications,
    withoutMilestone,
    beyondMilestones,
    generatedAt: generatedAt.toISOString(),
  };
}

/** SELECT only: no lifecycle/audit events, default seeding, or provider calls. */
export async function getClientDocumentationMilestoneReport(): Promise<DocumentationMilestoneReport> {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  const cases = await db
    .select(CLIENT_DOCUMENTATION_MILESTONE_PROJECTION)
    .from(clientCases)
    .where(eq(clientCases.program, "spain"))
    .orderBy(clientCases.id);
  return buildClientDocumentationMilestoneReport(cases, new Date());
}

// Matches PageGuard(client_docs): viewer/full or owner, never generic admin.
const clientDocumentationReportProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    if (!isOwner(ctx.user)) {
      const access = await getUserModuleAccess(ctx.user.id);
      if (access.clientDocs !== "viewer" && access.clientDocs !== "full") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Client Documentation access is required",
        });
      }
    }
    return next({ ctx });
  }
);

/** Mount at appRouter.documentationMilestoneReports. */
export const clientDocumentationMilestoneReportsRouter = router({
  report: clientDocumentationReportProcedure.query(() =>
    getClientDocumentationMilestoneReport()
  ),
});
