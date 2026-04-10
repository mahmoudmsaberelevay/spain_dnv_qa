import { eq, desc, and, gte, lte, sql, asc, inArray } from "drizzle-orm";
import { getDb } from "./db";
import {
  finAccounts, finCategories, finEmployees, finClients, finCommissions, finTransactions,
  InsertFinAccount, InsertFinCategory, InsertFinEmployee, InsertFinClient, InsertFinCommission, InsertFinTransaction,
  clientCases,
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
  return db.select().from(finEmployees).orderBy(asc(finEmployees.name));
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
    const like = `%${opts.search}%`;
    conditions.push(sql`(${finClients.name} LIKE ${like} OR ${finClients.clientCode} LIKE ${like})`);
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
export async function countFinClients(opts?: { search?: string; consultant?: string }) {
  const db = await getDb(); if (!db) return 0;
  const conditions = [];
  if (opts?.search) {
    const like = `%${opts.search}%`;
    conditions.push(sql`(${finClients.name} LIKE ${like} OR ${finClients.clientCode} LIKE ${like})`);
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
  const newPaid = Number(client.paidAmountEur ?? 0) + paymentEur;
  const newRemaining = Number(client.remainingAmountEur ?? 0) - paymentEur;
  await db.update(finClients).set({
    paidAmountEur: newPaid.toFixed(2),
    remainingAmountEur: newRemaining.toFixed(2),
  }).where(eq(finClients.id, clientId));
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
export async function listCommissions() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(finCommissions).orderBy(desc(finCommissions.createdAt));
}
export async function createCommission(data: InsertFinCommission) {
  const db = await getDb(); if (!db) return null;
  const [result] = await db.insert(finCommissions).values(data);
  return { id: result.insertId, ...data };
}

// ─── Transactions ────────────────────────────────────────────────────────────
export async function listTransactions(filters?: {
  type?: "income" | "expense" | "transfer";
  accountId?: number;
  from?: Date; to?: Date;
  limit?: number;
  categoryId?: number;
  employeeId?: number;
  finClientId?: number;
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

  if (filters?.limit) return query.limit(filters.limit);
  return query;
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

  // Total EGP balance (all EGP accounts EXCEPT Imprest and Rent Credit)
  const egpExcludedAccounts = ['Imprest Account', 'Rent Credit'];
  const [egpBalance] = await db.select({
    total: sql<string>`COALESCE(SUM(${finAccounts.balance}), 0)`,
  }).from(finAccounts).where(and(
    eq(finAccounts.currency, "EGP"),
    sql`${finAccounts.name} NOT IN (${sql.join(egpExcludedAccounts.map(n => sql`${n}`), sql`, `)})`
  ));

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

  return {
    yearlyIncome: Number(yearlyIncome.total),
    monthlyIncome: Number(monthlyIncome.total),
    yearlyExpense: Number(yearlyExpense.total),
    monthlyExpense: Number(monthlyExpense.total),
    yearlyProfit: Number(yearlyIncome.total) - Number(yearlyExpense.total),
    monthlyProfit: Number(monthlyIncome.total) - Number(monthlyExpense.total),
    totalEgpBalance: Number(egpBalance.total),
    expenseByCategory,
    incomeByCategory,
    employeeExpenses,
    monthlyProfitBreakdown: monthlyProfit,
    consultantSigning,
  };
}
