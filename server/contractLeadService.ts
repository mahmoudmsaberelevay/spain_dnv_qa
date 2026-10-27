import { and, eq, ne } from "drizzle-orm";
import { contracts, leadActivities, leads, type InsertContract } from "../drizzle/schema";
import { getDb } from "./db";
import { enqueueMappedMetaCrmEvent } from "./metaLeadsService";

export type ContractClientOrigin = "referral" | "marketing";
export type ContractStatus = "pending" | "signed" | "cancelled";

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

/**
 * Creates a pending contract and stores the verified Marketing Lead link only.
 * The Lead remains in its current stage until the exact linked contract is marked Signed.
 */
export async function createContractWithClientOrigin(input: {
  contract: InsertContract;
  clientOrigin: ContractClientOrigin;
  marketingLeadId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  if (input.clientOrigin === "marketing" && !input.marketingLeadId) throw new Error("MARKETING_LEAD_REQUIRED");
  if (input.clientOrigin === "referral" && input.marketingLeadId) throw new Error("REFERRAL_LEAD_NOT_ALLOWED");

  return db.transaction(async tx => {
    let linkedLeadId: number | null = null;
    if (input.clientOrigin === "marketing") {
      const leadId = input.marketingLeadId!;
      const [lead] = await tx.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId)).limit(1);
      if (!lead) throw new Error("MARKETING_LEAD_NOT_FOUND");
      const [existingContract] = await tx.select({ contractCode: contracts.contractCode })
        .from(contracts)
        .where(and(eq(contracts.marketingLeadId, leadId), ne(contracts.status, "cancelled")))
        .limit(1);
      if (existingContract) throw new Error("MARKETING_LEAD_ALREADY_LINKED");
      linkedLeadId = lead.id;
    }

    await tx.insert(contracts).values({
      ...input.contract,
      clientOrigin: input.clientOrigin,
      marketingLeadId: linkedLeadId,
    });
    const [contract] = await tx.select().from(contracts).where(eq(contracts.contractCode, input.contract.contractCode)).limit(1);
    if (!contract) throw new Error("CONTRACT_CREATE_FAILED");
    return { contract, linkedLeadId };
  });
}

/**
 * Updates a contract status and converts its linked Marketing Lead only on the
 * first pending/cancelled -> signed transition. The contract status, Lead stage,
 * and Lead history are written in one transaction; the Meta CRM event is queued
 * only after that transaction commits.
 */
export async function transitionContractStatusWithLeadConversion(input: {
  contractId: number;
  status: ContractStatus;
  actorUserId: number;
  actorName: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const now = Date.now();

  const result = await db.transaction(async tx => {
    const [contract] = await tx.select().from(contracts).where(eq(contracts.id, input.contractId)).limit(1);
    if (!contract) throw new Error("CONTRACT_NOT_FOUND");

    const statusChanged = contract.status !== input.status;
    if (!statusChanged) {
      return { contract, statusChanged: false, linkedLeadId: null, leadStageChanged: false };
    }

    await tx.update(contracts).set({ status: input.status }).where(eq(contracts.id, contract.id));

    if (input.status !== "signed" || contract.clientOrigin !== "marketing" || !contract.marketingLeadId) {
      return { contract, statusChanged: true, linkedLeadId: null, leadStageChanged: false };
    }

    const [lead] = await tx.select({ id: leads.id, stage: leads.stage })
      .from(leads)
      .where(eq(leads.id, contract.marketingLeadId))
      .limit(1);
    if (!lead) throw new Error("MARKETING_LEAD_NOT_FOUND");

    if (lead.stage === "client") {
      return { contract, statusChanged: true, linkedLeadId: lead.id, leadStageChanged: false };
    }

    await tx.update(leads).set({ stage: "client", lastContactAt: now, updatedAt: now }).where(eq(leads.id, lead.id));
    await tx.insert(leadActivities).values({
      leadId: lead.id,
      userId: input.actorUserId,
      activityType: "stage_changed",
      description: `Stage changed from "${lead.stage}" to "client" when Contract ${contract.contractCode} was marked Signed by ${input.actorName}`,
      createdAt: now,
    });

    return { contract, statusChanged: true, linkedLeadId: lead.id, leadStageChanged: true };
  });

  if (result.leadStageChanged && result.linkedLeadId) {
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
