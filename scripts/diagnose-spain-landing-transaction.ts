import { and, eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { leadActivities, leads } from "../drizzle/schema";

const ROLLBACK_SENTINEL = "DIAGNOSTIC_ROLLBACK";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");
  const now = Date.now();
  const normalizedPhone = `+999${String(now).slice(-11)}`;
  let completedStage = "start";
  try {
    await db.transaction(async tx => {
      completedStage = "transaction";
      await tx.insert(leads).values({
        fullName: "Reconciliation Diagnostic",
        phone: normalizedPhone,
        email: null,
        preferredLanguage: "English",
        interestedProgram: "Spain DNV",
        interestedCountry: "Spain",
        occupation: "employee_high_salary",
        leadSource: "Spain_landing page",
        utmSource: "Spain_landing page",
        utmMedium: "landing_page",
        utmCampaign: "spain_digital_nomad",
        normalizedPhone,
        normalizedEmail: null,
        firstReceivedAt: now,
        gdprConsent: true,
        consentTimestamp: now,
        dataSharingConsent: true,
        marketingOptIn: false,
        isMetaTestLead: false,
        metaSyncStatus: null,
        metaAssignmentStatus: "not_applicable",
        stage: "fresh",
        leadScore: 0,
        createdAt: now,
        updatedAt: now,
      });
      completedStage = "lead_insert";
      const [created] = await tx.select({ id: leads.id }).from(leads)
        .where(and(eq(leads.isMetaTestLead, false), eq(leads.normalizedPhone, normalizedPhone)))
        .limit(1);
      if (!created) throw new Error("DIAGNOSTIC_LOOKUP_FAILED");
      completedStage = "lead_lookup";
      await tx.insert(leadActivities).values({
        leadId: created.id,
        userId: null,
        activityType: "created",
        description: "Rollback-only reconciliation diagnostic",
        score: 0,
        createdAt: now,
      });
      completedStage = "activity_insert";
      throw new Error(ROLLBACK_SENTINEL);
    });
  } catch (error) {
    if (error instanceof Error && error.message === ROLLBACK_SENTINEL) {
      console.log(JSON.stringify({ success: true, completedStage, rolledBack: true }));
      return;
    }
    console.log(JSON.stringify({ success: false, completedStage, errorType: error instanceof Error ? error.name : "UnknownError" }));
    process.exitCode = 1;
  }
}

main();
