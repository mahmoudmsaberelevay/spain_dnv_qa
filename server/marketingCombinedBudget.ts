import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "./db";
import { marketingMediaProductionJobs, marketingWeeklyAutomationBudgetLedger } from "../drizzle/schema";
import { automationMonthKey, WEEKLY_AUTOMATION_MONTHLY_CAP_USD } from "../shared/marketingWeeklyAutomation";

/** Internal reservation safety ceiling, not a vendor invoice or actual-spend report. */
export async function combinedMarketingBudgetRemaining(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, at = Date.now()) {
  const month = automationMonthKey(at);
  const [year, number] = month.split("-").map(Number);
  // Query the indexed timestamp in a narrow month window; decide the true
  // accounting month in Africa/Cairo, including DST boundaries, in JavaScript.
  const lower = Date.UTC(year, number - 1, 1) - 2 * 86_400_000;
  const upper = Date.UTC(year, number, 1) + 2 * 86_400_000;
  const [[planning], media] = await Promise.all([
    db.select({ total: sql<string>`COALESCE(SUM(${marketingWeeklyAutomationBudgetLedger.amountUsd}), 0)` })
      .from(marketingWeeklyAutomationBudgetLedger).where(eq(marketingWeeklyAutomationBudgetLedger.periodKey, month)),
    db.select({ amount: marketingMediaProductionJobs.reservedCostUsd, createdAt: marketingMediaProductionJobs.createdAt })
      .from(marketingMediaProductionJobs).where(and(gte(marketingMediaProductionJobs.createdAt, lower), lt(marketingMediaProductionJobs.createdAt, upper))),
  ]);
  const planningUsd = Number(planning?.total ?? 0);
  const mediaUsd = media.filter(row => automationMonthKey(row.createdAt) === month)
    .reduce((total, row) => total + Number(row.amount), 0);
  return { month, capUsd: WEEKLY_AUTOMATION_MONTHLY_CAP_USD, planningUsd, mediaUsd,
    remainingUsd: WEEKLY_AUTOMATION_MONTHLY_CAP_USD - planningUsd - mediaUsd };
}
