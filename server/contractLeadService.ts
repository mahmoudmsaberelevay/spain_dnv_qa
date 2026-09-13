import { and, eq, ne } from "drizzle-orm";
import { contracts, leadActivities, leads, type InsertContract } from "../drizzle/schema";
import { getDb } from "./db";
import { enqueueMappedMetaCrmEvent } from "./metaLeadsService";

export type ContractClientOrigin = "referral" | "marketing";

export async function getMarketingLeadForContract(leadId: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [lead] = await db.select({
    id: leads.id,
    fullName: leads.fullName,
    stage: leads.stage,
    assignedTo: leads.assignedTo,
  }).from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) throw new Error("MARKETING_LEAD_NOT_FOUND");
  const [existingContract] = await db.select({ contractCode: contracts.contractCode, status: contracts.status })
    .from(contracts)
    .where(and(eq(contracts.marketingLeadId, leadId), ne(contracts.status, "cancelled")))
    .limit(1);
  return { ...lead, linkedContract: existingContract ?? null };
}

export async function createContractWithClientOrigin(input: {
  contract: InsertContract;
  clientOrigin: ContractClientOrigin;
  marketingLeadId?: number | null;
  actorUserId: number;
  actorName: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  if (input.clientOrigin === "marketing" && !input.marketingLeadId) throw new Error("MARKETING_LEAD_REQUIRED");
  if (input.clientOrigin === "referral" && input.marketingLeadId) throw new Error("REFERRAL_LEAD_NOT_ALLOWED");
  const now = Date.now();
  const result = await db.transaction(async tx => {
    let previousLeadStage: string | null = null;
    let linkedLeadId: number | null = null;
    if (input.clientOrigin === "marketing") {
      const leadId = input.marketingLeadId!;
      const [lead] = await tx.select({ id: leads.id, stage: leads.stage }).from(leads).where(eq(leads.id, leadId)).limit(1);
      if (!lead) throw new Error("MARKETING_LEAD_NOT_FOUND");
      const [existingContract] = await tx.select({ contractCode: contracts.contractCode })
        .from(contracts)
        .where(and(eq(contracts.marketingLeadId, leadId), ne(contracts.status, "cancelled")))
        .limit(1);
      if (existingContract) throw new Error("MARKETING_LEAD_ALREADY_LINKED");
      previousLeadStage = lead.stage;
      linkedLeadId = lead.id;
    }

    await tx.insert(contracts).values({
      ...input.contract,
      clientOrigin: input.clientOrigin,
      marketingLeadId: linkedLeadId,
    });
    const [contract] = await tx.select().from(contracts).where(eq(contracts.contractCode, input.contract.contractCode)).limit(1);
    if (!contract) throw new Error("CONTRACT_CREATE_FAILED");

    if (linkedLeadId && previousLeadStage !== "client") {
      await tx.update(leads).set({ stage: "client", lastContactAt: now, updatedAt: now }).where(eq(leads.id, linkedLeadId));
      await tx.insert(leadActivities).values({
        leadId: linkedLeadId,
        userId: input.actorUserId,
        activityType: "stage_changed",
        description: `Stage changed from "${previousLeadStage}" to "client" when Contract ${contract.contractCode} was created by ${input.actorName}`,
        createdAt: now,
      });
    }
    return { contract, linkedLeadId, leadStageChanged: Boolean(linkedLeadId && previousLeadStage !== "client") };
  });

  if (result.linkedLeadId && result.leadStageChanged) {
    try {
      await enqueueMappedMetaCrmEvent({
        leadId: result.linkedLeadId,
        mappingValue: "client",
        eventTime: now,
        sourceType: "lead_stage",
        sourceId: "client",
        sourceStage: "client",
      });
    } catch (error) {
      console.error("[ContractLead] Meta CRM stage event enqueue failed", { leadId: result.linkedLeadId, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
  return result;
}
