import { and, eq, isNull } from "drizzle-orm";
import { contracts, finClients } from "../drizzle/schema";
import { linkedClientContractFinancialState } from "../server/contractFinancialSync";
import { getDb } from "../server/db";

const apply = process.argv.includes("--apply");
const cents = (value: unknown) => Math.round(Number(value ?? 0) * 100);

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const linkedClients = await db.select({
    clientId: finClients.id,
    clientCode: finClients.clientCode,
    contractId: finClients.contractId,
    storedContractValue: finClients.contractValue,
    storedNet: finClients.contractValueEur,
    paidEur: finClients.paidAmountEur,
    storedRemaining: finClients.remainingAmountEur,
    contractNet: contracts.contractValue,
    discountEur: contracts.discountValue,
  }).from(finClients)
    .innerJoin(contracts, eq(finClients.contractId, contracts.id));

  const plan = linkedClients.map((row) => ({
    clientId: row.clientId,
    clientCode: row.clientCode,
    contractId: row.contractId,
    fromContractValue: row.storedContractValue,
    fromNetEur: row.storedNet,
    fromRemainingEur: row.storedRemaining,
    toNetEur: String(row.contractNet ?? "0.00"),
    discountEur: String(row.discountEur ?? "0.00"),
    ...linkedClientContractFinancialState(Number(row.contractNet ?? 0), Number(row.paidEur ?? 0)),
  })).filter((row) =>
    cents(row.fromContractValue) !== cents(row.contractValueEur)
    || cents(row.fromNetEur) !== cents(row.contractValueEur)
    || cents(row.fromNetEur) !== cents(row.toNetEur)
    || cents(row.fromRemainingEur) !== cents(row.remainingAmountEur)
  );

  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", affected: plan.length, plan }, null, 2));
    return;
  }

  await db.transaction(async (tx) => {
    for (const row of plan) {
      // Keep the write narrowly guarded: only the discovered stale value for the
      // same one-to-one contract link may be replaced. Payments and all history
      // remain untouched.
      const currentContractValue = row.fromContractValue == null
        ? isNull(finClients.contractValue)
        : eq(finClients.contractValue, row.fromContractValue);
      const currentNetValue = row.fromNetEur == null
        ? isNull(finClients.contractValueEur)
        : eq(finClients.contractValueEur, row.fromNetEur);
      const currentRemainingValue = row.fromRemainingEur == null
        ? isNull(finClients.remainingAmountEur)
        : eq(finClients.remainingAmountEur, row.fromRemainingEur);
      const result = await tx.update(finClients).set({
        contractValue: row.contractValueEur,
        contractValueEur: row.contractValueEur,
        remainingAmountEur: row.remainingAmountEur,
      }).where(and(
        eq(finClients.id, row.clientId),
        eq(finClients.contractId, row.contractId),
        currentContractValue,
        currentNetValue,
        currentRemainingValue,
      ));
      const metadata = Array.isArray(result) ? result[0] : result;
      if (Number((metadata as { affectedRows?: number } | undefined)?.affectedRows ?? 0) !== 1) {
        throw new Error(`Reconciliation guard failed for client code ${row.clientCode ?? row.clientId}`);
      }
    }
  });

  console.log(JSON.stringify({ mode: "applied", affected: plan.length, clientCodes: plan.map((row) => row.clientCode) }, null, 2));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
