import { eq, desc, and, gte, lte, sql, asc, inArray } from "drizzle-orm";
import { getDb } from "./db";
import {
  finAccounts, finCategories, finEmployees, finClients, finCommissions, finTransactions,
  InsertFinAccount, InsertFinCategory, InsertFinEmployee, InsertFinClient, InsertFinCommission, InsertFinTransaction,
  clientCases, appSettings,
} from "../drizzle/schema";

// ─── Accounts ────────────────────────────────────────────────────────────────
export async function listAccounts() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(finAccounts).orderBy(asc(finAccounts.name));
}
export async function getAccountById(id: number) {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(finAccounts).where(eq(finAccounts.id, id));
  return rows[0] ?? null;
}
export async function createAccount(data: { name: string; currency: string }) {
  const db = await getDb(); if (!db) return null;
  const [result] = await db.insert(finAccounts).values(data);
  return { id: result.insertId, ...data };
}
export async function updateAccount(id: number, data: { name?: string; currency?: string; isActive?: boolean }) {
  const db = await getDb(); if (!db) return;
  await db.update(finAccounts).set(data).where(eq(finAccounts.id, id));
}
export async function updateAccountBalance(id: number, amount: number) {
  const db = await getDb(); if (!db) return;
  await db.update(finAccounts).set({ balance: sql`${finAccounts.balance} + ${amount}` }).where(eq(finAccounts.id, id));
}

/**
 * Fully recalculate a single account's balance using DB-level aggregation:
 *   balance = openingBalance
 *           + SUM(income where accountId=id)
 *           - SUM(expense where accountId=id)
 *           - SUM(transfer.amount where fromAccountId=id)
 *           + SUM(transfer.convertedAmount where toAccountId=id)
 * Call this after any income/expense/transfer create, update, or delete.
 */
export async function recalcAccountBalance(id: number) {
  const db = await getDb(); if (!db) return;
  const [account] = await db.select().from(finAccounts).where(eq(finAccounts.id, id));
  if (!account) return;

  const [incomeRow] = await db.select({
    total: sql<string>`COALESCE(SUM(CAST(${finTransactions.amount} AS DECIMAL(20,4))), 0)`,
  }).from(finTransactions).where(and(eq(finTransactions.type, 'income'), eq(finTransactions.accountId, id)));

  const [expenseRow] = await db.select({
    total: sql<string>`COALESCE(SUM(CAST(${finTransactions.amount} AS DECIMAL(20,4))), 0)`,
  }).from(finTransactions).where(and(eq(finTransactions.type, 'expense'), eq(finTransactions.accountId, id)));

  const [transferOutRow] = await db.select({
    total: sql<string>`COALESCE(SUM(CAST(${finTransactions.amount} AS DECIMAL(20,4))), 0)`,
  }).from(finTransactions).where(and(eq(finTransactions.type, 'transfer'), eq(finTransactions.fromAccountId, id)));

  const [transferInRow] = await db.select({
    total: sql<string>`COALESCE(SUM(CAST(COALESCE(${finTransactions.convertedAmount}, ${finTransactions.amount}) AS DECIMAL(20,4))), 0)`,
  }).from(finTransactions).where(and(eq(finTransactions.type, 'transfer'), eq(finTransactions.toAccountId, id)));

  const net = Number(incomeRow.total) - Number(expenseRow.total)
            - Number(transferOutRow.total) + Number(transferInRow.total);
  const newBalance = Number(account.openingBalance) + net;
  await db.update(finAccounts).set({ balance: String(newBalance) }).where(eq(finAccounts.id, id));
}

/**
 * Recalculate ALL account balances from scratch.
 * Use this as a one-time repair or after bulk imports.
 */
export async function recalcAllAccountBalances() {
  const db = await getDb(); if (!db) return;
  const accounts = await db.select().from(finAccounts);
  await Promise.all(accounts.map(a => recalcAccountBalance(a.id)));
}

// ─── Categories ──────────────────────────────────────────────────────────────
export async function listCategories(type?: "income" | "expense") {
  const db = await getDb(); if (!db) return [];
  if (type) return db.select().from(finCategories).where(eq(finCategories.type, type)).orderBy(asc(finCategories.name));
  return db.select().from(finCategories).orderBy(asc(finCategories.type), asc(finCategories.name));
}
export async function createCategory(data: { name: string; type: "income" | "expense" }) {
  const db = await getDb(); if (!db) return null;
  const [result] = await db.insert(finCategories).values(data);
  return { id: result.insertId, ...data };
}
export async function updateCategory(id: number, data: { name?: string; isActive?: boolean }) {
  const db = await getDb(); if (!db) return;
  await db.update(finCategories).set(data).where(eq(finCategories.id, id));
}
export async function deleteCategory(id: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(finCategories).where(eq(finCategories.id, id));
}

// ─── Employees ───────────────────────────────────────────────────────────────
export async function listEmployees() {
  const db = await getDb(); if (!db) return [];
  const employees = await db.select().from(finEmployees).orderBy(asc(finEmployees.name));
  // Attach total income and expense per employee from transactions
  const totals = await db.select({
    employeeId: finTransactions.employeeId,
    type: finTransactions.type,
    total: sql<string>`COALESCE(SUM(CAST(${finTransactions.amount} AS DECIMAL(15,2))), 0)`,
  }).from(finTransactions)
    .where(sql`${finTransactions.employeeId} IS NOT NULL`)
    .groupBy(finTransactions.employeeId, finTransactions.type);
  const totalsMap: Record<number, { totalIncome: number; totalExpense: number }> = {};
  for (const t of totals) {
    if (!t.employeeId) continue;
    if (!totalsMap[t.employeeId]) totalsMap[t.employeeId] = { totalIncome: 0, totalExpense: 0 };
    if (t.type === 'income') totalsMap[t.employeeId].totalIncome = Number(t.total);
    if (t.type === 'expense') totalsMap[t.employeeId].totalExpense = Number(t.total);
  }
  return employees.map(e => ({
    ...e,
    totalIncome: totalsMap[e.id]?.totalIncome ?? 0,
    totalExpense: totalsMap[e.id]?.totalExpense ?? 0,
  }));
}
export async function createEmployee(data: { name: string; role?: string; salary?: string }) {
  const db = await getDb(); if (!db) return null;
  const [result] = await db.insert(finEmployees).values(data);
  return { id: result.insertId, ...data };
}
export async function updateEmployee(id: number, data: { name?: string; role?: string; salary?: string; isActive?: boolean }) {
  const db = await getDb(); if (!db) return;
  await db.update(finEmployees).set(data).where(eq(finEmployees.id, id));
}
export async function deleteEmployee(id: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(finEmployees).where(eq(finEmployees.id, id));
}

// ─── Fin Clients ─────────────────────────────────────────────────────────────
type FinClientSortField = "clientCode" | "name" | "program" | "consultant" | "contractValueEur" | "paidAmountEur" | "remainingAmountEur" | "signingDate";
export async function listFinClients(opts?: { search?: string; consultant?: string; limit?: number; offset?: number; sortField?: FinClientSortField; sortDir?: "asc" | "desc" }) {
  const db = await getDb(); if (!db) return [];
  const conditions = [];
  if (opts?.search) {
    const nameLike = `%${opts.search}%`;
    const codeLike = /^\d/.test(opts.search) ? `${opts.search}%` : `%${opts.search}%`;
    conditions.push(sql`(${finClients.name} LIKE ${nameLike} OR ${finClients.clientCode} LIKE ${codeLike})`);
  }
  if (opts?.consultant) conditions.push(eq(finClients.consultant, opts.consultant));
  const query = db.select({
    id: finClients.id,
    contractId: finClients.contractId,
    name: finClients.name,
    phone: finClients.phone,
    contractValue: finClients.contractValue,
    familyMembers: finClients.familyMembers,
    consultant: finClients.consultant,
    stage: finClients.stage,
    createdAt: finClients.createdAt,
    updatedAt: finClients.updatedAt,
    clientCode: finClients.clientCode,
    email: finClients.email,
    address: finClients.address,
    program: finClients.program,
    signingDate: finClients.signingDate,
    salesPerson: finClients.salesPerson,
    contractValueEur: finClients.contractValueEur,
    paidAmountEur: finClients.paidAmountEur,
    paidAmountEgp: finClients.paidAmountEgp,
    remainingAmountEur: finClients.remainingAmountEur,
    isLegacy: finClients.isLegacy,
    totalDirectCostEgp: sql<number>`COALESCE((SELECT SUM(ft.amount) FROM finTransactions ft WHERE ft.finClientId = ${finClients.id} AND ft.type = 'expense'), 0)`,
    totalDirectIncomeEgp: sql<number>`COALESCE((SELECT SUM(ft.amount) FROM finTransactions ft WHERE ft.finClientId = ${finClients.id} AND ft.type = 'income'), 0)`,
  }).from(finClients);
  if (conditions.length > 0) query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  // DB-level sort
  const sf = opts?.sortField ?? "clientCode";
  const sd = opts?.sortDir ?? "asc";
  const col = finClients[sf as keyof typeof finClients] as any;
  query.orderBy(sd === "asc" ? asc(col) : desc(col));
  if (opts?.limit) query.limit(opts.limit);
  if (opts?.offset) query.offset(opts.offset);
  return query;
}
export async function getFinClientTotals(opts?: { search?: string; consultant?: string }) {
  const db = await getDb(); if (!db) return null;
  const conditions = [];
  if (opts?.search) {
    const nameLike = `%${opts.search}%`;
    const codeLike = /^\d/.test(opts.search) ? `${opts.search}%` : `%${opts.search}%`;
    conditions.push(sql`(${finClients.name} LIKE ${nameLike} OR ${finClients.clientCode} LIKE ${codeLike})`);
  }
  if (opts?.consultant) conditions.push(eq(finClients.consultant, opts.consultant));
  const [row] = await db.select({
    totalContractValueEur: sql<number>`COALESCE(SUM(CAST(${finClients.contractValueEur} AS DECIMAL(15,2))), 0)`,
    totalPaidEur: sql<number>`COALESCE(SUM(CAST(${finClients.paidAmountEur} AS DECIMAL(15,2))), 0)`,
    totalPaidEgp: sql<number>`COALESCE(SUM(CAST(${finClients.paidAmountEgp} AS DECIMAL(15,2))), 0)`,
    totalRemainingEur: sql<number>`COALESCE(SUM(CAST(${finClients.remainingAmountEur} AS DECIMAL(15,2))), 0)`,
    totalDirectCostEgp: sql<number>`COALESCE((SELECT SUM(ft.amount) FROM finTransactions ft WHERE ft.finClientId IN (SELECT id FROM finClients) AND ft.type = 'expense'), 0)`,
    totalDirectIncomeEgp: sql<number>`COALESCE((SELECT SUM(ft.amount) FROM finTransactions ft WHERE ft.finClientId IN (SELECT id FROM finClients) AND ft.type = 'income'), 0)`,
  }).from(finClients)
    .where(conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions));
  return row ?? null;
}
export async function countFinClients(opts?: { search?: string; consultant?: string }) {
  const db = await getDb(); if (!db) return 0;
  const conditions = [];
  if (opts?.search) {
    const nameLike = `%${opts.search}%`;
    const codeLike = /^\d/.test(opts.search) ? `${opts.search}%` : `%${opts.search}%`;
    conditions.push(sql`(${finClients.name} LIKE ${nameLike} OR ${finClients.clientCode} LIKE ${codeLike})`);
  }
  if (opts?.consultant) conditions.push(eq(finClients.consultant, opts.consultant));
  const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(finClients)
    .where(conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions));
  return Number(row?.count ?? 0);
}
export async function getFinClientById(id: number) {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(finClients).where(eq(finClients.id, id));
  return rows[0] ?? null;
}
// Update client remaining balance when an income payment is received
// For legacy clients: deduct payment (in EUR = amountEgp / 55.5) from remainingAmountEur
// For new clients: remainingAmountEur = contractValueEur - (totalPaidEgp / 55.5)
export async function applyClientPayment(clientId: number, amountEgp: number, accountCurrency: string) {
  const db = await getDb(); if (!db) return;
  const client = await getFinClientById(clientId);
  if (!client) return;
  // Convert payment to EUR using fixed rate 55.5
  const paymentEur = accountCurrency === 'EUR' ? amountEgp : amountEgp / 55.5;
  const egpAmount = accountCurrency === 'EUR' ? amountEgp * 55.5 : amountEgp;
  const newPaid = Number(client.paidAmountEur ?? 0) + paymentEur;
  const newPaidEgp = Number(client.paidAmountEgp ?? 0) + egpAmount;
  const newRemaining = Number(client.remainingAmountEur ?? 0) - paymentEur;
  await db.update(finClients).set({
    paidAmountEur: newPaid.toFixed(2),
    paidAmountEgp: newPaidEgp.toFixed(2),
    remainingAmountEur: newRemaining.toFixed(2),
  }).where(eq(finClients.id, clientId));
}
/**
 * Full recalculation of a client's paid/remaining amounts from scratch.
 * Sums all income transactions linked to this finClientId.
 * Call this after any income create, update, or delete.
 */
export async function recalcClientPaidAmount(clientId: number) {
  const db = await getDb(); if (!db) return;
  const client = await getFinClientById(clientId);
  if (!client) return;

  // Formula: paidAmountEur = basePaidAmountEur (manually-set pre-April 14) + income transactions from April 14 onwards
  const baseEur = Number(client.basePaidAmountEur ?? 0);
  const cutoffDate = new Date('2026-04-14T00:00:00.000Z');

  // Sum income transactions from April 14 onwards linked to this client
  const rows = await db
    .select({ amount: finTransactions.amount, accountId: finTransactions.accountId, transactionDate: finTransactions.transactionDate })
    .from(finTransactions)
    .where(and(
      eq(finTransactions.finClientId, clientId),
      eq(finTransactions.type, 'income'),
      gte(finTransactions.transactionDate, cutoffDate)
    ));

  // Fetch account currencies
  const accountIds = Array.from(new Set(rows.map(r => r.accountId).filter((id): id is number => id !== null && id !== undefined)));
  let currencyMap: Record<number, string> = {};
  if (accountIds.length > 0) {
    const accs = await db.select({ id: finAccounts.id, currency: finAccounts.currency }).from(finAccounts).where(inArray(finAccounts.id, accountIds));
    for (const a of accs) currencyMap[a.id] = a.currency;
  }

  let newTxEgp = 0, newTxEur = 0;
  for (const r of rows) {
    const currency = r.accountId ? (currencyMap[r.accountId] ?? 'EGP') : 'EGP';
    const amt = Number(r.amount);
    if (currency === 'EUR') { newTxEur += amt; newTxEgp += amt * 55.5; }
    else { newTxEgp += amt; newTxEur += amt / 55.5; }
  }

  const totalEur = baseEur + newTxEur;
  const totalEgp = newTxEgp; // EGP is only from new transactions (base is EUR-denominated)

  const contractVal = Number(client.contractValueEur ?? 0);
  const newRemaining = contractVal > 0 ? contractVal - totalEur : Number(client.remainingAmountEur ?? 0);

  await db.update(finClients).set({
    paidAmountEur: totalEur.toFixed(2),
    paidAmountEgp: totalEgp.toFixed(2),
    remainingAmountEur: newRemaining.toFixed(2),
  }).where(eq(finClients.id, clientId));
}

export async function setClientPaidAmount(clientId: number, paidAmountEgp: number) {
  const db = await getDb(); if (!db) return null;
  const client = await getFinClientById(clientId);
  if (!client) return null;
  const newPaidEur = paidAmountEgp / 55.5;
  const contractVal = Number(client.contractValueEur ?? 0);
  const newRemaining = contractVal - newPaidEur;
  await db.update(finClients).set({
    paidAmountEgp: paidAmountEgp.toFixed(2),
    paidAmountEur: newPaidEur.toFixed(2),
    remainingAmountEur: newRemaining.toFixed(2),
  }).where(eq(finClients.id, clientId));
  return { newPaidEgp: paidAmountEgp, newPaidEur, newRemaining };
}
export async function recordClientManualPayment(clientId: number, amountEgp: number) {
  const db = await getDb(); if (!db) return null;
  const client = await getFinClientById(clientId);
  if (!client) return null;
  const paymentEur = amountEgp / 55.5;
  const newPaidEgp = Number(client.paidAmountEgp ?? 0) + amountEgp;
  const newPaidEur = Number(client.paidAmountEur ?? 0) + paymentEur;
  const newRemaining = Number(client.remainingAmountEur ?? 0) - paymentEur;
  await db.update(finClients).set({
    paidAmountEgp: newPaidEgp.toFixed(2),
    paidAmountEur: newPaidEur.toFixed(2),
    remainingAmountEur: newRemaining.toFixed(2),
  }).where(eq(finClients.id, clientId));
  return { newPaidEgp, newPaidEur, newRemaining };
}
export async function createFinClient(data: InsertFinClient) {
  const db = await getDb(); if (!db) return null;
  const [result] = await db.insert(finClients).values(data);
  return { id: result.insertId, ...data };
}
export async function updateFinClient(id: number, data: Partial<InsertFinClient>) {
  const db = await getDb(); if (!db) return;
  await db.update(finClients).set(data).where(eq(finClients.id, id));
}
export async function getFinClientByContractId(contractId: number) {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(finClients).where(eq(finClients.contractId, contractId));
  return rows[0] ?? null;
}

// ─── Commissions ─────────────────────────────────────────────────────────────
export async function listCommissions(filters?: {
  status?: string;
  leadSource?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb(); if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters?.status) conditions.push(eq(finCommissions.status, filters.status as "Pending" | "Started" | "Cancelled"));
  if (filters?.leadSource) conditions.push(eq(finCommissions.leadSource, filters.leadSource as "Sales Mining" | "Referal" | "Marketing"));
  if (filters?.search) conditions.push(sql`${finCommissions.clientName} LIKE ${`%${filters.search}%`}`);
  const q = db.select().from(finCommissions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(finCommissions.seqNumber), asc(finCommissions.id));
  if (filters?.limit) q.limit(filters.limit);
  if (filters?.offset) q.offset(filters.offset);
  return q;
}
export async function countCommissions(filters?: { status?: string; leadSource?: string; search?: string }) {
  const db = await getDb(); if (!db) return 0;
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters?.status) conditions.push(eq(finCommissions.status, filters.status as "Pending" | "Started" | "Cancelled"));
  if (filters?.leadSource) conditions.push(eq(finCommissions.leadSource, filters.leadSource as "Sales Mining" | "Referal" | "Marketing"));
  if (filters?.search) conditions.push(sql`${finCommissions.clientName} LIKE ${`%${filters.search}%`}`);
  const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(finCommissions)
    .where(conditions.length ? and(...conditions) : undefined);
  return Number(row?.count ?? 0);
}
export async function createCommission(data: InsertFinCommission) {
  const db = await getDb(); if (!db) return null;
  const [result] = await db.insert(finCommissions).values(data);
  return { id: result.insertId, ...data };
}
export async function updateCommission(id: number, data: Partial<InsertFinCommission>) {
  const db = await getDb(); if (!db) return null;
  await db.update(finCommissions).set(data).where(eq(finCommissions.id, id));
  const rows = await db.select().from(finCommissions).where(eq(finCommissions.id, id));
  return rows[0] ?? null;
}
export async function deleteCommission(id: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(finCommissions).where(eq(finCommissions.id, id));
}

// ─── Transactions ────────────────────────────────────────────────────────────
export async function listTransactions(filters?: {
  type?: "income" | "expense" | "transfer";
  accountId?: number;
  from?: Date; to?: Date;
  limit?: number;
  offset?: number;
  categoryId?: number;
  employeeId?: number;
  finClientId?: number;
  descriptionSearch?: string;
  sortField?: "transactionDate" | "amount" | "description" | "type";
  sortDir?: "asc" | "desc";
}) {
  const db = await getDb(); if (!db) return [];
  const conditions = [];
  if (filters?.type) conditions.push(eq(finTransactions.type, filters.type));
  if (filters?.accountId) {
    conditions.push(
      sql`(${finTransactions.accountId} = ${filters.accountId} OR ${finTransactions.fromAccountId} = ${filters.accountId} OR ${finTransactions.toAccountId} = ${filters.accountId})`
    );
  }
  if (filters?.from) conditions.push(gte(finTransactions.transactionDate, filters.from));
  if (filters?.to) conditions.push(lte(finTransactions.transactionDate, filters.to));
  if (filters?.categoryId) conditions.push(eq(finTransactions.categoryId, filters.categoryId));
  if (filters?.employeeId) conditions.push(eq(finTransactions.employeeId, filters.employeeId));
  if (filters?.finClientId) conditions.push(eq(finTransactions.finClientId, filters.finClientId));
  if (filters?.descriptionSearch) {
    const like = `%${filters.descriptionSearch}%`;
    conditions.push(sql`(${finTransactions.description} LIKE ${like} OR ${finTransactions.note} LIKE ${like})`);
  }

  // Sorting
  const sf = filters?.sortField ?? "transactionDate";
  const sd = filters?.sortDir ?? "desc";
  const col = sf === "amount" ? finTransactions.amount
    : sf === "description" ? finTransactions.description
    : sf === "type" ? finTransactions.type
    : finTransactions.transactionDate;
  const orderExpr = sd === "asc" ? asc(col) : desc(col);
  const tieBreak = sd === "asc" ? asc(finTransactions.id) : desc(finTransactions.id);

  const query = db.select().from(finTransactions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(orderExpr, tieBreak);

  if (filters?.limit) {
    query.limit(filters.limit);
    if (filters?.offset) query.offset(filters.offset);
    return query;
  }
  return query;
}
export async function countTransactions(filters?: {
  type?: "income" | "expense" | "transfer";
  accountId?: number;
  from?: Date; to?: Date;
  categoryId?: number;
  employeeId?: number;
  finClientId?: number;
  descriptionSearch?: string;
}) {
  const db = await getDb(); if (!db) return 0;
  const conditions = [];
  if (filters?.type) conditions.push(eq(finTransactions.type, filters.type));
  if (filters?.accountId) {
    conditions.push(
      sql`(${finTransactions.accountId} = ${filters.accountId} OR ${finTransactions.fromAccountId} = ${filters.accountId} OR ${finTransactions.toAccountId} = ${filters.accountId})`
    );
  }
  if (filters?.from) conditions.push(gte(finTransactions.transactionDate, filters.from));
  if (filters?.to) conditions.push(lte(finTransactions.transactionDate, filters.to));
  if (filters?.categoryId) conditions.push(eq(finTransactions.categoryId, filters.categoryId));
  if (filters?.employeeId) conditions.push(eq(finTransactions.employeeId, filters.employeeId));
  if (filters?.finClientId) conditions.push(eq(finTransactions.finClientId, filters.finClientId));
  if (filters?.descriptionSearch) {
    const like = `%${filters.descriptionSearch}%`;
    conditions.push(sql`(${finTransactions.description} LIKE ${like} OR ${finTransactions.note} LIKE ${like})`);
  }
  const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(finTransactions)
    .where(conditions.length ? and(...conditions) : undefined);
  return Number(row?.count ?? 0);
}

export async function createTransaction(data: InsertFinTransaction) {
  const db = await getDb(); if (!db) return null;
  const [result] = await db.insert(finTransactions).values(data);
  return { id: result.insertId, ...data };
}

// ─── Account Statement ───────────────────────────────────────────────────────
export async function getAccountStatement(accountId: number, from?: Date, to?: Date) {
  const db = await getDb(); if (!db) return [];
  const conditions = [
    sql`(${finTransactions.accountId} = ${accountId} OR ${finTransactions.fromAccountId} = ${accountId} OR ${finTransactions.toAccountId} = ${accountId})`
  ];
  if (from) conditions.push(gte(finTransactions.transactionDate, from));
  if (to) conditions.push(lte(finTransactions.transactionDate, to));

  return db.select().from(finTransactions)
    .where(and(...conditions))
    .orderBy(asc(finTransactions.transactionDate), asc(finTransactions.id));
}

export async function bulkDeleteTransactions(ids: number[]) {
  if (!ids.length) return;
  const db = await getDb(); if (!db) return;

  // Fetch all transactions to be deleted so we can reverse their balance effects
  const txs = await db.select().from(finTransactions).where(inArray(finTransactions.id, ids));

  // Reverse each transaction's effect on account balances
  const balanceDeltas = new Map<number, number>();
  for (const tx of txs) {
    const amount = Number(tx.amount);
    if (tx.type === "income" && tx.accountId) {
      // Income added to account → subtract it back
      balanceDeltas.set(tx.accountId, (balanceDeltas.get(tx.accountId) ?? 0) - amount);
    } else if (tx.type === "expense" && tx.accountId) {
      // Expense subtracted from account → add it back
      balanceDeltas.set(tx.accountId, (balanceDeltas.get(tx.accountId) ?? 0) + amount);
    } else if (tx.type === "transfer") {
      // Transfer deducted from source, added to destination → reverse both
      if (tx.fromAccountId) {
        balanceDeltas.set(tx.fromAccountId, (balanceDeltas.get(tx.fromAccountId) ?? 0) + amount);
      }
      if (tx.toAccountId) {
        const converted = Number(tx.convertedAmount ?? amount);
        balanceDeltas.set(tx.toAccountId, (balanceDeltas.get(tx.toAccountId) ?? 0) - converted);
      }
    }
  }

  // Apply balance reversals
  for (const [accountId, delta] of Array.from(balanceDeltas.entries())) {
    if (delta !== 0) {
      await db.update(finAccounts)
        .set({ balance: sql`${finAccounts.balance} + ${delta}` })
        .where(eq(finAccounts.id, accountId));
    }
  }

  // Delete the transactions
  await db.delete(finTransactions).where(inArray(finTransactions.id, ids));
}

// ─── Dashboard Analytics ─────────────────────────────────────────────────────
export async function getFinancialSummary(year: number) {
  const db = await getDb(); if (!db) return null;
  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year + 1, 0, 1);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Yearly income (exclude transfers)
  const [yearlyIncome] = await db.select({
    total: sql<string>`COALESCE(SUM(${finTransactions.amount}), 0)`,
  }).from(finTransactions).where(and(
    eq(finTransactions.type, "income"),
    gte(finTransactions.transactionDate, startOfYear),
    lte(finTransactions.transactionDate, endOfYear),
  ));

  // Monthly income
  const [monthlyIncome] = await db.select({
    total: sql<string>`COALESCE(SUM(${finTransactions.amount}), 0)`,
  }).from(finTransactions).where(and(
    eq(finTransactions.type, "income"),
    gte(finTransactions.transactionDate, startOfMonth),
    lte(finTransactions.transactionDate, endOfMonth),
  ));

  // Yearly expense
  const [yearlyExpense] = await db.select({
    total: sql<string>`COALESCE(SUM(${finTransactions.amount}), 0)`,
  }).from(finTransactions).where(and(
    eq(finTransactions.type, "expense"),
    gte(finTransactions.transactionDate, startOfYear),
    lte(finTransactions.transactionDate, endOfYear),
  ));

  // Monthly expense
  const [monthlyExpense] = await db.select({
    total: sql<string>`COALESCE(SUM(${finTransactions.amount}), 0)`,
  }).from(finTransactions).where(and(
    eq(finTransactions.type, "expense"),
    gte(finTransactions.transactionDate, startOfMonth),
    lte(finTransactions.transactionDate, endOfMonth),
  ));

  // Total balances — only AIB + AAIB + CIB + Cash per currency
  const CORE_ACCOUNT_KEYWORDS = ['AIB', 'AAIB', 'Arab African', 'CIB', 'Cash'];
  const coreFilter = (currency: string) => and(
    eq(finAccounts.currency, currency),
    sql`(${finAccounts.name} LIKE '%AIB%' OR ${finAccounts.name} LIKE '%AAIB%' OR ${finAccounts.name} LIKE '%Arab African%' OR ${finAccounts.name} LIKE '%CIB%' OR ${finAccounts.name} LIKE '%Cash%')`
  );
  const [egpBalance] = await db.select({
    total: sql<string>`COALESCE(SUM(${finAccounts.balance}), 0)`,
  }).from(finAccounts).where(coreFilter("EGP"));
  const [usdBalance] = await db.select({
    total: sql<string>`COALESCE(SUM(${finAccounts.balance}), 0)`,
  }).from(finAccounts).where(coreFilter("USD"));
  const [eurBalance] = await db.select({
    total: sql<string>`COALESCE(SUM(${finAccounts.balance}), 0)`,
  }).from(finAccounts).where(coreFilter("EUR"));

  // Expense by category (yearly)
  const expenseByCategory = await db.select({
    categoryId: finTransactions.categoryId,
    total: sql<string>`SUM(${finTransactions.amount})`,
  }).from(finTransactions).where(and(
    eq(finTransactions.type, "expense"),
    gte(finTransactions.transactionDate, startOfYear),
    lte(finTransactions.transactionDate, endOfYear),
  )).groupBy(finTransactions.categoryId);

  // Income by category (yearly)
  const incomeByCategory = await db.select({
    categoryId: finTransactions.categoryId,
    total: sql<string>`SUM(${finTransactions.amount})`,
  }).from(finTransactions).where(and(
    eq(finTransactions.type, "income"),
    gte(finTransactions.transactionDate, startOfYear),
    lte(finTransactions.transactionDate, endOfYear),
  )).groupBy(finTransactions.categoryId);

  // Employee expenses (yearly)
  const employeeExpenses = await db.select({
    employeeId: finTransactions.employeeId,
    total: sql<string>`SUM(${finTransactions.amount})`,
  }).from(finTransactions).where(and(
    eq(finTransactions.type, "expense"),
    gte(finTransactions.transactionDate, startOfYear),
    lte(finTransactions.transactionDate, endOfYear),
    sql`${finTransactions.employeeId} IS NOT NULL`,
  )).groupBy(finTransactions.employeeId);

  // Monthly profit breakdown (yearly)
  // Use raw SQL to avoid TiDB only_full_group_by issues with MONTH() function
  const [monthlyProfitRows] = await db.execute(
    sql`SELECT MONTH(${finTransactions.transactionDate}) AS month, ${finTransactions.type} AS type, SUM(${finTransactions.amount}) AS total FROM ${finTransactions} WHERE ${finTransactions.type} IN ('income', 'expense') AND ${finTransactions.transactionDate} >= ${startOfYear} AND ${finTransactions.transactionDate} <= ${endOfYear} GROUP BY 1, 2`
  );
  const monthlyProfit = (monthlyProfitRows as unknown as any[]).map(r => ({ month: String(r.month), type: r.type as string, total: String(r.total) }));

  // Consultant Yearly Signing — clients with stage submission or approved, grouped by consultant
  const [consultantSigningRows] = await db.execute(
    sql`SELECT ${clientCases.consultant} AS consultant, COUNT(*) AS count FROM ${clientCases} WHERE ${clientCases.stage} IN ('submission', 'approved') AND ${clientCases.createdAt} >= ${startOfYear} AND ${clientCases.createdAt} <= ${endOfYear} GROUP BY 1`
  );
  const consultantSigning = (consultantSigningRows as unknown as any[]).map(r => ({
    consultant: r.consultant as string,
    count: Number(r.count),
  }));

  // Exchange rates for Net Worth calculation
  const eurRateRows = await db.select().from(appSettings).where(eq(appSettings.key, 'eurEgpRate'));
  const usdRateRows = await db.select().from(appSettings).where(eq(appSettings.key, 'usdEgpRate'));
  const eurEgpRate = eurRateRows.length > 0 ? parseFloat(eurRateRows[0].value) : 55.5;
  const usdEgpRate = usdRateRows.length > 0 ? parseFloat(usdRateRows[0].value) : 50.0;

  const egpTotal = Number(egpBalance.total);
  const usdTotal = Number(usdBalance.total);
  const eurTotal = Number(eurBalance.total);
  const netWorthEgp = egpTotal + (usdTotal * usdEgpRate) + (eurTotal * eurEgpRate);

  return {
    yearlyIncome: Number(yearlyIncome.total),
    monthlyIncome: Number(monthlyIncome.total),
    yearlyExpense: Number(yearlyExpense.total),
    monthlyExpense: Number(monthlyExpense.total),
    yearlyProfit: Number(yearlyIncome.total) - Number(yearlyExpense.total),
    monthlyProfit: Number(monthlyIncome.total) - Number(monthlyExpense.total),
    totalEgpBalance: egpTotal,
    totalUsdBalance: usdTotal,
    totalEurBalance: eurTotal,
    eurEgpRate,
    usdEgpRate,
    netWorthEgp,
    expenseByCategory,
    incomeByCategory,
    employeeExpenses,
    monthlyProfitBreakdown: monthlyProfit,
    consultantSigning,
  };
}
