import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { finAccounts, finTransactions } from "../drizzle/schema";
import {
  listAccounts, getAccountById, createAccount, updateAccount, updateAccountBalance,
  listCategories, createCategory, updateCategory, deleteCategory,
  listEmployees, createEmployee, updateEmployee, deleteEmployee,
  listFinClients, countFinClients, getFinClientTotals, getFinClientById, createFinClient, updateFinClient, getFinClientByContractId, applyClientPayment, recordClientManualPayment,
  bulkDeleteTransactions,
  listCommissions, createCommission,
  listTransactions, createTransaction, getAccountStatement,
  getFinancialSummary,
} from "./finDb";
import { notifyFinancialTransaction } from "./emailService";

// ─── Access Control ──────────────────────────────────────────────────────────
const ADMIN_EMAILS = [
  "mahmoud.saber@elevay.com",
  "mahmoud.saberelevay@gmail.com",
];
const READONLY_EMAILS = [
  "ziad.elshurafa@elevay.com",
  "walid.mammdouh@gmail.com",
];
const LIMITED_EMAILS = [
  "mohamed.abdelfatah@elevay.com",
];

type FinRole = "admin" | "readonly" | "limited" | "none";

function getFinRole(email?: string | null): FinRole {
  if (!email) return "none";
  const e = email.toLowerCase();
  if (ADMIN_EMAILS.some(a => a.toLowerCase() === e)) return "admin";
  if (READONLY_EMAILS.some(a => a.toLowerCase() === e)) return "readonly";
  if (LIMITED_EMAILS.some(a => a.toLowerCase() === e)) return "limited";
  return "none";
}

// Middleware: must have at least some financial access
const finProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = getFinRole(ctx.user?.email);
  if (role === "none") throw new TRPCError({ code: "FORBIDDEN", message: "No access to Financial Module" });
  return next({ ctx: { ...ctx, finRole: role } });
});

// Middleware: admin only
const finAdminProcedure = finProcedure.use(({ ctx, next }) => {
  if (ctx.finRole !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  return next({ ctx });
});

// Middleware: can read (admin + readonly)
const finReadProcedure = finProcedure.use(({ ctx, next }) => {
  if (ctx.finRole === "limited") throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to view this" });
  return next({ ctx });
});

// Middleware: can write transactions (admin + limited)
const finWriteProcedure = finProcedure.use(({ ctx, next }) => {
  if (ctx.finRole === "readonly") throw new TRPCError({ code: "FORBIDDEN", message: "Read-only access" });
  return next({ ctx });
});

// ─── Accounts Router ─────────────────────────────────────────────────────────
const accountsRouter = router({
  list: finReadProcedure.query(async () => listAccounts()),
  getById: finReadProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const acc = await getAccountById(input.id);
      if (!acc) throw new TRPCError({ code: "NOT_FOUND" });
      return acc;
    }),
  create: finAdminProcedure
    .input(z.object({ name: z.string().min(1), currency: z.string().min(1) }))
    .mutation(async ({ input }) => createAccount(input)),
  update: finAdminProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), currency: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateAccount(id, data);
      return getAccountById(id);
    }),
  setBalance: finAdminProcedure
    .input(z.object({ id: z.number(), openingBalance: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Set the opening balance
      await db.update(finAccounts).set({ openingBalance: String(input.openingBalance) }).where(eq(finAccounts.id, input.id));
      // Recalculate the running balance = openingBalance + net transactions
      const txRows = await db.select().from(finTransactions);
      const accTx = txRows.filter(t => t.accountId === input.id || t.fromAccountId === input.id || t.toAccountId === input.id);
      let net = 0;
      for (const t of accTx) {
        if (t.type === "income" && t.accountId === input.id) net += Number(t.amount);
        else if (t.type === "expense" && t.accountId === input.id) net -= Number(t.amount);
        else if (t.type === "transfer" && t.fromAccountId === input.id) net -= Number(t.amount);
        else if (t.type === "transfer" && t.toAccountId === input.id) net += Number(t.convertedAmount ?? t.amount);
      }
      const newBalance = input.openingBalance + net;
      await db.update(finAccounts).set({ balance: String(newBalance) }).where(eq(finAccounts.id, input.id));
      return getAccountById(input.id);
    }),
  statement: finReadProcedure
    .input(z.object({
      accountId: z.number(),
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ input }) => {
      const account = await getAccountById(input.accountId);
      if (!account) throw new TRPCError({ code: "NOT_FOUND" });
      const transactions = await getAccountStatement(input.accountId, input.from, input.to);
      return { account, transactions };
    }),
});

// ─── Categories Router ───────────────────────────────────────────────────────
const categoriesRouter = router({
  list: finReadProcedure
    .input(z.object({ type: z.enum(["income", "expense"]).optional() }).optional())
    .query(async ({ input }) => listCategories(input?.type)),
  create: finAdminProcedure
    .input(z.object({ name: z.string().min(1), type: z.enum(["income", "expense"]) }))
    .mutation(async ({ input }) => createCategory(input)),
  update: finAdminProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateCategory(id, data);
    }),
  delete: finAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => deleteCategory(input.id)),
});

// ─── Employees Router ────────────────────────────────────────────────────────
const employeesRouter = router({
  list: finReadProcedure.query(async () => listEmployees()),
  create: finAdminProcedure
    .input(z.object({ name: z.string().min(1), role: z.string().optional(), salary: z.number().optional() }))
    .mutation(async ({ input }) => {
      const { salary, ...rest } = input;
      return createEmployee({ ...rest, salary: salary?.toString() });
    }),
  update: finAdminProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), role: z.string().optional(), salary: z.number().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const { id, salary, ...data } = input;
      await updateEmployee(id, { ...data, salary: salary !== undefined ? salary.toString() : undefined });
    }),
  delete: finAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => deleteEmployee(input.id)),
});

// ─── Fin Clients Router ──────────────────────────────────────────────────────
const finClientsRouter = router({
  list: finReadProcedure
    .input(z.object({
      search: z.string().optional(),
      consultant: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
      sortField: z.enum(["clientCode", "name", "program", "consultant", "contractValueEur", "paidAmountEur", "remainingAmountEur", "signingDate"]).optional(),
      sortDir: z.enum(["asc", "desc"]).optional(),
    }).optional())
    .query(async ({ input }) => listFinClients(input ?? undefined)),
  count: finReadProcedure
    .input(z.object({
      search: z.string().optional(),
      consultant: z.string().optional(),
    }).optional())
    .query(async ({ input }) => countFinClients(input ?? undefined)),
  totals: finReadProcedure
    .input(z.object({
      search: z.string().optional(),
      consultant: z.string().optional(),
    }).optional())
    .query(async ({ input }) => getFinClientTotals(input ?? undefined)),
  get: finReadProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => getFinClientById(input.id)),
  create: finWriteProcedure
    .input(z.object({
      clientCode: z.string().optional(),
      name: z.string().min(1),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      program: z.string().optional(),
      signingDate: z.date().optional(),
      salesPerson: z.string().optional(),
      consultant: z.string().optional(),
      contractValueEur: z.number().optional(),
      paidAmountEur: z.number().optional(),
      remainingAmountEur: z.number().optional(),
      isLegacy: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { contractValueEur, paidAmountEur, remainingAmountEur, ...rest } = input;
      // For new clients: remaining = contractValue - paid (at 55.5 rate)
      const cvEur = contractValueEur ?? 0;
      const paidEur = paidAmountEur ?? 0;
      const remEur = remainingAmountEur ?? (cvEur - paidEur);
      return createFinClient({
        ...rest,
        contractValueEur: cvEur.toString(),
        paidAmountEur: paidEur.toString(),
        remainingAmountEur: remEur.toString(),
        stage: 'started',
        isLegacy: input.isLegacy ?? false,
      });
    }),
  update: finWriteProcedure
    .input(z.object({
      id: z.number(),
      clientCode: z.string().optional(),
      name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      program: z.string().optional(),
      signingDate: z.date().optional(),
      salesPerson: z.string().optional(),
      consultant: z.string().optional(),
      contractValueEur: z.number().optional(),
      remainingAmountEur: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, contractValueEur, remainingAmountEur, ...rest } = input;
      await updateFinClient(id, {
        ...rest,
        contractValueEur: contractValueEur !== undefined ? contractValueEur.toString() : undefined,
        remainingAmountEur: remainingAmountEur !== undefined ? remainingAmountEur.toString() : undefined,
      });
    }),
  recordPayment: finWriteProcedure
    .input(z.object({
      clientId: z.number(),
      amountEgp: z.number().positive(),
    }))
    .mutation(async ({ input }) => {
      const result = await recordClientManualPayment(input.clientId, input.amountEgp);
      if (!result) throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });
      return {
        newPaidEgp: result.newPaidEgp,
        newPaidEur: result.newPaidEur,
        newRemaining: result.newRemaining,
        eurConverted: input.amountEgp / 55.5,
      };
    }),
});

// ─── Commissions Router ──────────────────────────────────────────────────────
const commissionsRouter = router({
  list: finReadProcedure.query(async () => listCommissions()),
  create: finWriteProcedure
    .input(z.object({
      clientName: z.string(),
      consultant: z.string().optional(),
      contractValue: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return createCommission({
        finClientId: 0,
        clientName: input.clientName,
        consultant: input.consultant ?? null,
        contractValue: input.contractValue?.toString() ?? null,
      });
    }),
});

// ─── Transactions Router ─────────────────────────────────────────────────────
const transactionsRouter = router({
  bulkDelete: finAdminProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      await bulkDeleteTransactions(input.ids);
      return { deleted: input.ids.length };
    }),

  list: finReadProcedure
    .input(z.object({
      type: z.enum(["income", "expense", "transfer"]).optional(),
      accountId: z.number().optional(),
      from: z.date().optional(),
      to: z.date().optional(),
      limit: z.number().optional(),
      categoryId: z.number().optional(),
      employeeId: z.number().optional(),
      finClientId: z.number().optional(),
      sortField: z.enum(["transactionDate", "amount", "description", "type"]).optional(),
      sortDir: z.enum(["asc", "desc"]).optional(),
    }).optional())
    .query(async ({ input }) => listTransactions(input ?? undefined)),

  createIncome: finWriteProcedure
    .input(z.object({
      description: z.string().min(1),
      accountId: z.number(),
      categoryId: z.number(),
      note: z.string().optional(),
      finClientId: z.number().optional(),
      amount: z.number().positive(),
      transactionDate: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      const account = await getAccountById(input.accountId);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      const balanceBefore = Number(account.balance);
      const balanceAfter = balanceBefore + input.amount;
      await updateAccountBalance(input.accountId, input.amount);
      const result = await createTransaction({
        type: "income",
        description: input.description,
        accountId: input.accountId,
        categoryId: input.categoryId,
        note: input.note ?? null,
        finClientId: input.finClientId ?? null,
        amount: input.amount.toString(),
        transactionDate: input.transactionDate,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        createdBy: ctx.user?.email ?? null,
      });
      // Update client remaining balance if linked to a client
      if (input.finClientId) {
        applyClientPayment(input.finClientId, input.amount, account.currency).catch(() => {});
      }
      // Fire-and-forget email notification
      notifyFinancialTransaction("income", input.description, input.amount, account.currency, account.name).catch(() => {});
      return result;
    }),

  createExpense: finWriteProcedure
    .input(z.object({
      description: z.string().min(1),
      accountId: z.number(),
      categoryId: z.number(),
      note: z.string().optional(),
      employeeId: z.number().optional(),
      finClientId: z.number().optional(),
      amount: z.number().positive(),
      transactionDate: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      const account = await getAccountById(input.accountId);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      const balanceBefore = Number(account.balance);
      const balanceAfter = balanceBefore - input.amount;
      await updateAccountBalance(input.accountId, -input.amount);
      const result = await createTransaction({
        type: "expense",
        description: input.description,
        accountId: input.accountId,
        categoryId: input.categoryId,
        note: input.note ?? null,
        employeeId: input.employeeId ?? null,
        finClientId: input.finClientId ?? null,
        amount: input.amount.toString(),
        transactionDate: input.transactionDate,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        createdBy: ctx.user?.email ?? null,
      });
      // Fire-and-forget email notification
      notifyFinancialTransaction("expense", input.description, input.amount, account.currency, account.name).catch(() => {});
      return result;
    }),

  updateTransaction: finWriteProcedure
    .input(z.object({
      id: z.number(),
      description: z.string().min(1).optional(),
      note: z.string().optional(),
      transactionDate: z.date().optional(),
      categoryId: z.number().optional(),
      finClientId: z.number().nullable().optional(),
      employeeId: z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...fields } = input;
      const updateData: Record<string, unknown> = {};
      if (fields.description !== undefined) updateData.description = fields.description;
      if (fields.note !== undefined) updateData.note = fields.note;
      if (fields.transactionDate !== undefined) updateData.transactionDate = fields.transactionDate;
      if (fields.categoryId !== undefined) updateData.categoryId = fields.categoryId;
      if (fields.finClientId !== undefined) updateData.finClientId = fields.finClientId;
      if (fields.employeeId !== undefined) updateData.employeeId = fields.employeeId;
      if (Object.keys(updateData).length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No fields to update" });
      await db.update(finTransactions).set(updateData).where(eq(finTransactions.id, id));
      const [updated] = await db.select().from(finTransactions).where(eq(finTransactions.id, id));
      return updated;
    }),

  createTransfer: finWriteProcedure
    .input(z.object({
      fromAccountId: z.number(),
      toAccountId: z.number(),
      amount: z.number().positive(),
      exchangeRate: z.number().positive().default(1),
      transactionDate: z.date(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const fromAcc = await getAccountById(input.fromAccountId);
      const toAcc = await getAccountById(input.toAccountId);
      if (!fromAcc || !toAcc) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });

      const balanceBefore1 = Number(fromAcc.balance);
      const balanceAfter1 = balanceBefore1 - input.amount;
      // receivedAmount = deducted amount × rate (rate=1 for same currency)
      const receivedAmount = input.amount * input.exchangeRate;
      const balanceBefore2 = Number(toAcc.balance);
      const balanceAfter2 = balanceBefore2 + receivedAmount;

      await updateAccountBalance(input.fromAccountId, -input.amount);
      await updateAccountBalance(input.toAccountId, receivedAmount);

      const result = await createTransaction({
        type: "transfer",
        description: input.description || `Transfer: ${fromAcc.name} → ${toAcc.name}`,
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        amount: input.amount.toString(),
        convertedAmount: receivedAmount.toString(),
        exchangeRate: input.exchangeRate.toString(),
        transactionDate: input.transactionDate,
        balanceBefore: balanceBefore1.toString(),
        balanceAfter: balanceAfter1.toString(),
        balanceBefore2: balanceBefore2.toString(),
        balanceAfter2: balanceAfter2.toString(),
        createdBy: ctx.user?.email ?? null,
      });
      // Fire-and-forget email notification
      notifyFinancialTransaction("transfer", input.description || `Transfer: ${fromAcc.name} → ${toAcc.name}`, input.amount, fromAcc.currency, fromAcc.name, undefined, toAcc.name).catch(() => {});
      return result;
    }),
});

// ─── Dashboard Router ────────────────────────────────────────────────────────
const dashboardRouter = router({
  summary: finReadProcedure
    .input(z.object({ year: z.number().optional() }))
    .query(async ({ input }) => {
      const year = input.year ?? new Date().getFullYear();
      return getFinancialSummary(year);
    }),
  myRole: finProcedure.query(({ ctx }) => ({ role: ctx.finRole })),
});

// ─── Reports Router ─────────────────────────────────────────────────────────
const reportsRouter = router({
  accountStatement: finReadProcedure
    .input(z.object({
      accountId: z.number(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const account = await getAccountById(input.accountId);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      const statement = await getAccountStatement(
        input.accountId,
        input.dateFrom ? new Date(input.dateFrom) : undefined,
        input.dateTo ? new Date(input.dateTo) : undefined,
      );
      const totalIn = statement.filter(tx =>
        (tx.type === "income" && tx.accountId === input.accountId) ||
        (tx.type === "transfer" && tx.toAccountId === input.accountId)
      ).reduce((s, tx) => {
        if (tx.type === "transfer" && tx.toAccountId === input.accountId && tx.convertedAmount) {
          return s + Number(tx.convertedAmount);
        }
        return s + Number(tx.amount);
      }, 0);
      const totalOut = statement.filter(tx =>
        (tx.type === "expense" && tx.accountId === input.accountId) ||
        (tx.type === "transfer" && tx.fromAccountId === input.accountId)
      ).reduce((s, tx) => s + Number(tx.amount), 0);
      return {
        currentBalance: account.balance,
        totalIn,
        totalOut,
        transactions: statement,
      };
    }),
});

// ─── Bulk Upload Router ──────────────────────────────────────────────────────
const bulkRouter = router({
  upload: finWriteProcedure
    .input(z.object({
      transactions: z.array(z.object({
        type: z.enum(["income", "expense", "transfer"]),
        description: z.string(),
        accountId: z.number().optional(),
        fromAccountId: z.number().optional(),
        toAccountId: z.number().optional(),
        categoryId: z.number().optional(),
        employeeId: z.number().optional(),
        finClientId: z.number().optional(),
        amount: z.number().positive(),
        exchangeRate: z.number().optional(),
        note: z.string().optional(),
        transactionDate: z.date(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      let created = 0;
      let errors: string[] = [];
      for (let i = 0; i < input.transactions.length; i++) {
        const tx = input.transactions[i];
        try {
          if (tx.type === "income") {
            const account = await getAccountById(tx.accountId!);
            if (!account) { errors.push(`Row ${i + 1}: Account not found`); continue; }
            const bb = Number(account.balance);
            await updateAccountBalance(tx.accountId!, tx.amount);
            await createTransaction({
              type: "income", description: tx.description, accountId: tx.accountId!,
              categoryId: tx.categoryId ?? null, note: tx.note ?? null,
              finClientId: tx.finClientId ?? null, amount: tx.amount.toString(),
              transactionDate: tx.transactionDate,
              balanceBefore: bb.toString(), balanceAfter: (bb + tx.amount).toString(),
              createdBy: ctx.user?.email ?? null,
            });
          } else if (tx.type === "expense") {
            const account = await getAccountById(tx.accountId!);
            if (!account) { errors.push(`Row ${i + 1}: Account not found`); continue; }
            const bb = Number(account.balance);
            await updateAccountBalance(tx.accountId!, -tx.amount);
            await createTransaction({
              type: "expense", description: tx.description, accountId: tx.accountId!,
              categoryId: tx.categoryId ?? null, note: tx.note ?? null,
              employeeId: tx.employeeId ?? null, finClientId: tx.finClientId ?? null,
              amount: tx.amount.toString(), transactionDate: tx.transactionDate,
              balanceBefore: bb.toString(), balanceAfter: (bb - tx.amount).toString(),
              createdBy: ctx.user?.email ?? null,
            });
          } else if (tx.type === "transfer") {
            const fromAcc = await getAccountById(tx.fromAccountId!);
            const toAcc = await getAccountById(tx.toAccountId!);
            if (!fromAcc || !toAcc) { errors.push(`Row ${i + 1}: Account not found`); continue; }
            const bb1 = Number(fromAcc.balance);
            const received = tx.exchangeRate ? tx.amount * tx.exchangeRate : tx.amount;
            const bb2 = Number(toAcc.balance);
            await updateAccountBalance(tx.fromAccountId!, -tx.amount);
            await updateAccountBalance(tx.toAccountId!, received);
            await createTransaction({
              type: "transfer", description: tx.description,
              fromAccountId: tx.fromAccountId!, toAccountId: tx.toAccountId!,
              amount: tx.amount.toString(), convertedAmount: received.toString(),
              exchangeRate: tx.exchangeRate?.toString() ?? null,
              transactionDate: tx.transactionDate,
              balanceBefore: bb1.toString(), balanceAfter: (bb1 - tx.amount).toString(),
              balanceBefore2: bb2.toString(), balanceAfter2: (bb2 + received).toString(),
              createdBy: ctx.user?.email ?? null,
            });
          }
          created++;
        } catch (e: any) {
          errors.push(`Row ${i + 1}: ${e.message}`);
        }
      }
      return { created, errors };
    }),
});

// ─── Export Financial Router ─────────────────────────────────────────────────
export const financialRouter = router({
  accounts: accountsRouter,
  categories: categoriesRouter,
  employees: employeesRouter,
  clients: finClientsRouter,
  commissions: commissionsRouter,
  transactions: transactionsRouter,
  dashboard: dashboardRouter,
  reports: reportsRouter,
  bulk: bulkRouter,
});
