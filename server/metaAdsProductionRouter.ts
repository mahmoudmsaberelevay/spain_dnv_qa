import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  marketingMetaAdsProductionReports,
  marketingSystemRoleAssignments,
} from "../drizzle/schema";
import { getDb } from "./db";
import { isOwner } from "./permissionsRouter";
import {
  isMarketingSystemRole,
  type EffectiveMarketingSystemRole,
} from "./marketingSystemAccess";
import { protectedProcedure, router } from "./_core/trpc";
import { captureMetaAdsProductionReport } from "./metaAdsProductionService";

const ADMIN_ROLES = new Set<EffectiveMarketingSystemRole>([
  "owner",
  "marketing_system_admin",
]);
const VIEWER_ROLES = ADMIN_ROLES;

async function requireDb() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  return db;
}

async function effectiveMarketingRole(user: {
  id: number;
  openId: string | null;
  email?: string | null;
}): Promise<EffectiveMarketingSystemRole> {
  if (isOwner(user)) return "owner";
  const db = await requireDb();
  const [assignment] = await db
    .select({
      role: marketingSystemRoleAssignments.role,
      isActive: marketingSystemRoleAssignments.isActive,
    })
    .from(marketingSystemRoleAssignments)
    .where(eq(marketingSystemRoleAssignments.userId, user.id))
    .limit(1);
  return assignment?.isActive && isMarketingSystemRole(assignment.role)
    ? assignment.role
    : null;
}

async function requireReportViewer(user: {
  id: number;
  openId: string | null;
  email?: string | null;
}) {
  const role = await effectiveMarketingRole(user);
  if (!VIEWER_ROLES.has(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Meta Ads production reports require the owner or scoped Agentic Marketing administrator role.",
    });
  }
  return role;
}

async function requireMarketingAdministrator(user: {
  id: number;
  openId: string | null;
  email?: string | null;
}) {
  const role = await effectiveMarketingRole(user);
  if (!ADMIN_ROLES.has(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Meta Ads report capture requires the owner or scoped Agentic Marketing administrator role.",
    });
  }
  return role;
}

function parseSnapshot(
  row: typeof marketingMetaAdsProductionReports.$inferSelect
) {
  try {
    return JSON.parse(row.snapshotJson) as unknown;
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stored Meta Ads report snapshot is invalid.",
    });
  }
}

/**
 * Read-only report foundation. The capture procedure is intentionally review-gated
 * and not wired to the UI in this change; no live report is created until parent
 * review registers an explicit entry point. It performs only Graph API GET calls.
 */
export const metaAdsProductionRouter = router({
  access: protectedProcedure.query(async ({ ctx }) => {
    const role = await effectiveMarketingRole(ctx.user);
    return {
      role,
      canView: VIEWER_ROLES.has(role),
      canCaptureAfterParentReview: ADMIN_ROLES.has(role),
      externalOperationsEnabled: false,
      publicationStatus:
        "locked_no_publish_campaign_ad_spend_or_release" as const,
    };
  }),

  listReports: protectedProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(100).default(30) })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      await requireReportViewer(ctx.user);
      const db = await requireDb();
      const rows = await db
        .select()
        .from(marketingMetaAdsProductionReports)
        .orderBy(desc(marketingMetaAdsProductionReports.reportRunAt))
        .limit(input?.limit ?? 30);
      return rows.map(row => ({
        id: row.id,
        reportKey: row.reportKey,
        reportHash: row.reportHash,
        adAccountId: row.adAccountId,
        currency: row.currency,
        windowStart: row.windowStart,
        windowEnd: row.windowEnd,
        reportRunAt: row.reportRunAt,
        capturedByUserId: row.capturedByUserId,
        createdAt: row.createdAt,
        snapshot: parseSnapshot(row),
      }));
    }),

  /** Not exposed from the UI; parent review must explicitly register an invocation. */
  captureReadOnlyReportAfterParentReview: protectedProcedure.mutation(
    async ({ ctx }) => {
      await requireMarketingAdministrator(ctx.user);
      const report = await captureMetaAdsProductionReport();
      const db = await requireDb();
      try {
        await db.insert(marketingMetaAdsProductionReports).values({
          reportKey: report.reportKey,
          adAccountId: report.source.adAccountId,
          currency: report.source.currency,
          windowStart: report.window.dateStart,
          windowEnd: report.window.dateStop,
          reportRunAt: report.reportRunAt,
          reportHash: report.reportHash,
          snapshotJson: JSON.stringify(report),
          capturedByUserId: ctx.user.id,
          createdAt: Date.now(),
        });
      } catch (error: any) {
        if (
          error?.code === "ER_DUP_ENTRY" ||
          error?.cause?.code === "ER_DUP_ENTRY"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "An identical immutable Meta Ads report snapshot already exists.",
          });
        }
        throw error;
      }
      return {
        reportKey: report.reportKey,
        reportHash: report.reportHash,
        sourceAccountId: report.source.adAccountId,
        publicationStatus: report.publicationStatus,
      };
    }
  ),
});
