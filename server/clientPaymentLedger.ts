import { and, eq, sql } from "drizzle-orm";
import { finClients, finTransactions, payments } from "../drizzle/schema";

type DbTransaction = any;

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
}

/**
 * Rebuilds one Client Database financial summary from immutable ledgers:
 * - commercial EUR paid = legacy base + paid receipt payment snapshots + recorded income EUR equivalents;
 * - EGP paid = actual EGP receipt payments + actual EGP income transactions;
 * - no live exchange rate or account currency is consulted.
 */
export async function rebuildClientPaymentLedger(tx: DbTransaction, clientId: number) {
  const [client] = await tx.select().from(finClients).where(eq(finClients.id, clientId)).limit(1);
  if (!client) return null;

  const receiptRows = client.contractId == null
    ? []
    : await tx.select({
      amountEur: payments.amountEur,
      amountEgp: payments.amountEgp,
      actualReceivedAmount: payments.actualReceivedAmount,
      actualReceivedCurrency: payments.actualReceivedCurrency,
      paymentEurEquivalent: payments.paymentEurEquivalent,
    }).from(payments).where(eq(payments.contractId, client.contractId));

  const incomeRows = await tx.select({
    amount: finTransactions.amount,
    transactionCurrency: finTransactions.transactionCurrency,
    eurEquivalent: finTransactions.eurEquivalent,
  }).from(finTransactions).where(and(
    eq(finTransactions.finClientId, clientId),
    eq(finTransactions.type, "income"),
  ));

  const receiptPaidEur = receiptRows.reduce((sum: number, row: any) => sum + money(row.paymentEurEquivalent ?? row.amountEur), 0);
  const receiptPaidEgp = receiptRows.reduce((sum: number, row: any) => {
    const isEgp = String(row.actualReceivedCurrency ?? "").toUpperCase() === "EGP";
    return sum + (isEgp ? money(row.actualReceivedAmount ?? row.amountEgp) : 0);
  }, 0);
  const incomePaidEur = incomeRows.reduce((sum: number, row: any) => sum + money(row.eurEquivalent), 0);
  const incomePaidEgp = incomeRows.reduce((sum: number, row: any) => (
    String(row.transactionCurrency ?? "").toUpperCase() === "EGP" ? sum + money(row.amount) : sum
  ), 0);

  const paidAmountEur = money(Math.max(0, money(client.basePaidAmountEur)) + receiptPaidEur + incomePaidEur);
  const paidAmountEgp = money(receiptPaidEgp + incomePaidEgp);
  const netContractValueEur = money(client.contractValueEur ?? client.contractValue);
  const remainingAmountEur = Math.max(0, money(netContractValueEur - paidAmountEur));

  await tx.update(finClients).set({
    paidAmountEur: paidAmountEur.toFixed(2),
    paidAmountEgp: paidAmountEgp.toFixed(2),
    remainingAmountEur: remainingAmountEur.toFixed(2),
  }).where(eq(finClients.id, clientId));

  return { paidAmountEur, paidAmountEgp, remainingAmountEur };
}

export function receiptSnapshotExpression() {
  return sql`COALESCE(${payments.paymentEurEquivalent}, ${payments.amountEur})`;
}
