import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { finAccounts, finTransactions, appSettings, upcomingPayments, finClients, salaryReceipts, commissionReceipts, commissionReceiptItems } from "../drizzle/schema";
import {
  listAccounts, getAccountById, createAccount, updateAccount, updateAccountBalance, recalcAccountBalance, recalcAllAccountBalances,
  listCategories, createCategory, updateCategory, deleteCategory,
  listEmployees, createEmployee, updateEmployee, deleteEmployee,
  listFinClients, countFinClients, getFinClientTotals, getFinClientById, createFinClient, updateFinClient, deleteFinClient, getFinClientByContractId, applyClientPayment, recordClientManualPayment, setClientPaidAmount, recalcClientPaidAmount,
  bulkDeleteTransactions,
  listCommissions, countCommissions, createCommission, updateCommission, deleteCommission,
  listTransactions, countTransactions, createTransaction, getAccountStatement,
  getFinancialSummary,
} from "./finDb";
import { notifyFinClientAdded } from "./emailService";

// ─── Access Control ──────────────────────────────────────────────────────────
const ADMIN_EMAILS = [
  "mahmoud.saber@elevay.com",
  "mahmoud.saberelevay@gmail.com",
  "walid.mammdouh@gmail.com",
  "hager.hany@elevay.com",
];
const READONLY_EMAILS = [
  "ziad.elshurafa@elevay.com",
  "fouad.abdo@elevay.com",
  "kirlos.nabil@elevay.com",
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
  list: finProcedure.query(async () => listAccounts()),
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
  recalcAll: finAdminProcedure
    .mutation(async () => {
      await recalcAllAccountBalances();
      return { success: true };
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
  list: finProcedure
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
  list: finProcedure.query(async () => listEmployees()),
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
  list: finProcedure
    .input(z.object({
      search: z.string().optional(),
      consultant: z.string().optional(),
      signingDateRange: z.enum(["this_month", "previous_month", "this_year"]).optional(),
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
      signingDateRange: z.enum(["this_month", "previous_month", "this_year"]).optional(),
    }).optional())
    .query(async ({ input }) => countFinClients(input ?? undefined)),
  totals: finReadProcedure
    .input(z.object({
      search: z.string().optional(),
      consultant: z.string().optional(),
      signingDateRange: z.enum(["this_month", "previous_month", "this_year"]).optional(),
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
      const newClient = await createFinClient({
        ...rest,
        contractValueEur: cvEur.toString(),
        paidAmountEur: paidEur.toString(),
        remainingAmountEur: remEur.toString(),
        stage: 'started',
        isLegacy: input.isLegacy ?? false,
      });
      // Notify team that a Finance client was manually added
      notifyFinClientAdded(
        input.name,
        input.clientCode,
        input.consultant,
        cvEur,
        "manual"
      ).catch(() => {});
      return newClient;
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
    .input(z.object({ clientId: z.number(), amountEgp: z.number().positive() }))
    .mutation(async ({ input }) => {
      const result = await recordClientManualPayment(input.clientId, input.amountEgp);
      if (!result) throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });
      return { eurConverted: result.newPaidEur, newRemaining: result.newRemaining };
    }),
  setPaidAmount: finWriteProcedure
    .input(z.object({ clientId: z.number(), paidAmountEgp: z.number().min(0) }))
    .mutation(async ({ input }) => {
      const result = await setClientPaidAmount(input.clientId, input.paidAmountEgp);
      if (!result) throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });
      return { newPaidEgp: result.newPaidEgp, newPaidEur: result.newPaidEur, newRemaining: result.newRemaining };
    }),
  delete: finAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const client = await getFinClientById(input.id);
      if (!client) throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });
      await deleteFinClient(input.id);
      return { success: true };
    }),
  exportCsv: finReadProcedure
    .input(z.object({
      search: z.string().optional(),
      consultant: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      // Fetch all clients (no pagination) for export
      const clients = await listFinClients({
        search: input?.search,
        consultant: input?.consultant,
        limit: 10000,
        offset: 0,
        sortField: "clientCode",
        sortDir: "asc",
      });
      // Build CSV string
      const headers = [
        "Client Code", "Name", "Phone", "Email", "Program",
        "Signing Date", "Consultant", "Sales Person",
        "Contract Value (EUR)", "Paid Amount (EUR)", "Remaining Amount (EUR)",
        "Family Members", "Stage", "Is Legacy",
      ];
      const escape = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };
      const rows = clients.map((c) => [
        escape(c.clientCode),
        escape(c.name),
        escape(c.phone),
        escape(c.email),
        escape(c.program),
        escape(c.signingDate ? new Date(c.signingDate).toISOString().slice(0, 10) : ""),
        escape(c.consultant),
        escape(c.salesPerson),
        escape(c.contractValueEur),
        escape(c.paidAmountEur),
        escape(c.remainingAmountEur),
        escape(c.familyMembers),
        escape(c.stage),
        escape(c.isLegacy ? "Yes" : "No"),
      ].join(","));
      const csv = [headers.join(","), ...rows].join("\n");
      return { csv };
    }),
});
// Commission field schema (shared between create and update)
const commissionFieldsSchema = z.object({
  finClientId: z.number().optional(),
  clientName: z.string(),
  seqNumber: z.number().optional(),
  status: z.enum(["Pending", "Started", "Cancelled"]).optional(),
  signingDate: z.date().optional(),
  contractValue: z.number().optional(),
  leadSource: z.enum(["Sales Mining", "Referal", "Marketing"]).optional(),
  qualifierName: z.string().optional(),
  qualifierCommissionAmount: z.number().optional(),
  qualifierCommissionDate: z.date().optional(),
  qualifierLeader: z.string().optional(),
  qualifierLeaderCommissionAmount: z.number().optional(),
  qualifierLeaderCommissionDate: z.date().optional(),
  paralegalTlCommissionAmount: z.number().optional(),
  paralegalTlCommissionDate: z.date().optional(),
  operationManagerCommissionAmount: z.number().optional(),
  operationManagerCommissionDate: z.date().optional(),
  paralegal: z.string().optional(),
  paralegalFirstPaymentAmount: z.number().optional(),
  paralegalFirstPaymentDate: z.date().optional(),
  paralegalSecondPaymentAmount: z.number().optional(),
  paralegalSecondPaymentDate: z.date().optional(),
  paralegalThirdPaymentAmount: z.number().optional(),
  paralegalThirdPaymentDate: z.date().optional(),
  consultant: z.string().optional(),
  consultantTotalPayment: z.number().optional(),
  consultantFirstPayment: z.number().optional(),
  consultantFirstPaymentDate: z.date().optional(),
  consultantSecondPayment: z.number().optional(),
  consultantSecondPaymentDate: z.date().optional(),
  consultantThirdPayment: z.number().optional(),
  consultantThirdPaymentDate: z.date().optional(),
  leaderName: z.string().optional(),
  leaderCommissionAmount: z.number().optional(),
  leaderCommissionDate: z.date().optional(),
});
function toCommissionDbData(input: z.infer<typeof commissionFieldsSchema>) {
  return {
    finClientId: input.finClientId ?? null,
    clientName: input.clientName,
    seqNumber: input.seqNumber ?? null,
    status: input.status ?? "Pending",
    signingDate: input.signingDate ?? null,
    contractValue: input.contractValue?.toString() ?? null,
    leadSource: input.leadSource ?? null,
    qualifierName: input.qualifierName ?? null,
    qualifierCommissionAmount: input.qualifierCommissionAmount?.toString() ?? null,
    qualifierCommissionDate: input.qualifierCommissionDate ?? null,
    qualifierLeader: input.qualifierLeader ?? null,
    qualifierLeaderCommissionAmount: input.qualifierLeaderCommissionAmount?.toString() ?? null,
    qualifierLeaderCommissionDate: input.qualifierLeaderCommissionDate ?? null,
    paralegalTlCommissionAmount: input.paralegalTlCommissionAmount?.toString() ?? null,
    paralegalTlCommissionDate: input.paralegalTlCommissionDate ?? null,
    operationManagerCommissionAmount: input.operationManagerCommissionAmount?.toString() ?? null,
    operationManagerCommissionDate: input.operationManagerCommissionDate ?? null,
    paralegal: input.paralegal ?? null,
    paralegalFirstPaymentAmount: input.paralegalFirstPaymentAmount?.toString() ?? null,
    paralegalFirstPaymentDate: input.paralegalFirstPaymentDate ?? null,
    paralegalSecondPaymentAmount: input.paralegalSecondPaymentAmount?.toString() ?? null,
    paralegalSecondPaymentDate: input.paralegalSecondPaymentDate ?? null,
    paralegalThirdPaymentAmount: input.paralegalThirdPaymentAmount?.toString() ?? null,
    paralegalThirdPaymentDate: input.paralegalThirdPaymentDate ?? null,
    consultant: input.consultant ?? null,
    consultantTotalPayment: input.consultantTotalPayment?.toString() ?? null,
    consultantFirstPayment: input.consultantFirstPayment?.toString() ?? null,
    consultantFirstPaymentDate: input.consultantFirstPaymentDate ?? null,
    consultantSecondPayment: input.consultantSecondPayment?.toString() ?? null,
    consultantSecondPaymentDate: input.consultantSecondPaymentDate ?? null,
    consultantThirdPayment: input.consultantThirdPayment?.toString() ?? null,
    consultantThirdPaymentDate: input.consultantThirdPaymentDate ?? null,
    leaderName: input.leaderName ?? "Mahmoud Saber",
    leaderCommissionAmount: input.leaderCommissionAmount?.toString() ?? null,
    leaderCommissionDate: input.leaderCommissionDate ?? null,
  };
}
// ─── Commissions Router ────────────────────────────────────────────────────────
const commissionsRouter = router({
  list: finReadProcedure
    .input(z.object({
      status: z.string().optional(),
      leadSource: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }).optional())
    .query(async ({ input }) => listCommissions(input ?? undefined)),
  count: finReadProcedure
    .input(z.object({
      status: z.string().optional(),
      leadSource: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => countCommissions(input ?? undefined)),
  create: finWriteProcedure
    .input(commissionFieldsSchema)
    .mutation(async ({ input }) => createCommission(toCommissionDbData(input))),
  update: finWriteProcedure
    .input(commissionFieldsSchema.extend({ id: z.number() }))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      return updateCommission(id, toCommissionDbData(rest));
    }),
  delete: finAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteCommission(input.id);
      return { success: true };
    }),
});

// ─── Transactions Router ─────────────────────────────────────────────────────
const transactionsRouter = router({
  bulkDelete: finAdminProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Collect affected account IDs before deletion
      const { inArray } = await import("drizzle-orm");
      const txs = await db.select().from(finTransactions).where(inArray(finTransactions.id, input.ids));
      const affectedIds = new Set<number>();
      for (const t of txs) {
        if (t.accountId) affectedIds.add(t.accountId);
        if (t.fromAccountId) affectedIds.add(t.fromAccountId);
        if (t.toAccountId) affectedIds.add(t.toAccountId);
      }
      // Collect affected client IDs before deletion
      const affectedClientIds = new Set<number>();
      for (const t of txs) { if (t.finClientId) affectedClientIds.add(t.finClientId); }
      await bulkDeleteTransactions(input.ids);
      // Recalc all affected accounts from scratch
      for (const id of Array.from(affectedIds)) recalcAccountBalance(id).catch(() => {});
      // Recalc all affected clients from scratch
      for (const cid of Array.from(affectedClientIds)) recalcClientPaidAmount(cid).catch(() => {});
      return { deleted: input.ids.length };
    }),
  deleteOne: finAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { eq: eqOp } = await import("drizzle-orm");
      const [tx] = await db.select().from(finTransactions).where(eqOp(finTransactions.id, input.id));
      const affectedIds = new Set<number>();
      if (tx?.accountId) affectedIds.add(tx.accountId);
      if (tx?.fromAccountId) affectedIds.add(tx.fromAccountId);
      if (tx?.toAccountId) affectedIds.add(tx.toAccountId);
      const affectedClientId = tx?.finClientId ?? null;
      await bulkDeleteTransactions([input.id]);
      for (const id of Array.from(affectedIds)) recalcAccountBalance(id).catch(() => {});
      // Recalc client paid/remaining after deletion
      if (affectedClientId) recalcClientPaidAmount(affectedClientId).catch(() => {});
      return { success: true };
    }),

  list: finReadProcedure
    .input(z.object({
      type: z.enum(["income", "expense", "transfer"]).optional(),
      accountId: z.number().optional(),
      from: z.date().optional(),
      to: z.date().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
      categoryId: z.number().optional(),
      employeeId: z.number().optional(),
      finClientId: z.number().optional(),
      descriptionSearch: z.string().optional(),
      sortField: z.enum(["transactionDate", "amount", "description", "type"]).optional(),
      sortDir: z.enum(["asc", "desc"]).optional(),
    }).optional())
    .query(async ({ input }) => listTransactions(input ?? undefined)),
  count: finReadProcedure
    .input(z.object({
      type: z.enum(["income", "expense", "transfer"]).optional(),
      accountId: z.number().optional(),
      from: z.date().optional(),
      to: z.date().optional(),
      categoryId: z.number().optional(),
      employeeId: z.number().optional(),
      finClientId: z.number().optional(),
      descriptionSearch: z.string().optional(),
    }).optional())
    .query(async ({ input }) => countTransactions(input ?? undefined)),

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
      // Recalc client paid/remaining from scratch
      if (input.finClientId) {
        recalcClientPaidAmount(input.finClientId).catch(() => {});
      }
      // Recalc account balance from scratch
      recalcAccountBalance(input.accountId).catch(() => {});
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
      // Recalc account balance from scratch
      recalcAccountBalance(input.accountId).catch(() => {});
      // Recalc client paid/remaining if linked
      if (input.finClientId) recalcClientPaidAmount(input.finClientId).catch(() => {});
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
      amount: z.number().positive().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, amount: newAmount, ...fields } = input;
      // Fetch current transaction for balance adjustment
      const [current] = await db.select().from(finTransactions).where(eq(finTransactions.id, id));
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
      const updateData: Record<string, unknown> = {};
      if (fields.description !== undefined) updateData.description = fields.description;
      if (fields.note !== undefined) updateData.note = fields.note;
      if (fields.transactionDate !== undefined) updateData.transactionDate = fields.transactionDate;
      if (fields.categoryId !== undefined) updateData.categoryId = fields.categoryId;
      if (fields.finClientId !== undefined) updateData.finClientId = fields.finClientId;
      if (fields.employeeId !== undefined) updateData.employeeId = fields.employeeId;
      // Handle amount change: reverse old effect, apply new effect on account balance
      if (newAmount !== undefined && newAmount !== Number(current.amount)) {
        const oldAmount = Number(current.amount);
        const diff = newAmount - oldAmount;
        updateData.amount = String(newAmount);
        if (current.type === 'income' && current.accountId) {
          await updateAccountBalance(current.accountId, diff);
        } else if (current.type === 'expense' && current.accountId) {
          await updateAccountBalance(current.accountId, -diff);
        }
        // Update balanceAfter for audit trail
        if (current.balanceBefore !== null) {
          const newBalanceAfter = current.type === 'income'
            ? Number(current.balanceBefore) + newAmount
            : Number(current.balanceBefore) - newAmount;
          updateData.balanceAfter = String(newBalanceAfter);
        }
      }
      if (Object.keys(updateData).length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No fields to update" });
      await db.update(finTransactions).set(updateData).where(eq(finTransactions.id, id));
      // Recalc affected account from scratch
      if (current.accountId) recalcAccountBalance(current.accountId).catch(() => {});
      // Recalc client paid/remaining — use new finClientId if changed, else old one
      const clientIdToRecalc = (fields.finClientId !== undefined ? fields.finClientId : current.finClientId);
      if (clientIdToRecalc) recalcClientPaidAmount(clientIdToRecalc).catch(() => {});
      // If finClientId was changed, also recalc the old client
      if (fields.finClientId !== undefined && fields.finClientId !== current.finClientId && current.finClientId) {
        recalcClientPaidAmount(current.finClientId).catch(() => {});
      }
      const [updated] = await db.select().from(finTransactions).where(eq(finTransactions.id, id));
      return updated;
    }),

  updateTransfer: finWriteProcedure
    .input(z.object({
      id: z.number(),
      fromAccountId: z.number(),
      toAccountId: z.number(),
      amount: z.number().positive(),
      exchangeRate: z.number().positive().default(1),
      transactionDate: z.date(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // 1. Fetch the original transfer record
      const [original] = await db.select().from(finTransactions).where(eq(finTransactions.id, input.id));
      if (!original) throw new TRPCError({ code: "NOT_FOUND", message: "Transfer not found" });
      if (original.type !== "transfer") throw new TRPCError({ code: "BAD_REQUEST", message: "Not a transfer" });

      // 2. Reverse the original transfer's effect on both accounts
      const oldAmount = Number(original.amount);
      const oldReceived = Number(original.convertedAmount ?? original.amount);
      if (original.fromAccountId) await updateAccountBalance(original.fromAccountId, oldAmount);   // restore deducted
      if (original.toAccountId)   await updateAccountBalance(original.toAccountId,   -oldReceived); // restore credited

      // 3. Fetch new account details
      const fromAcc = await getAccountById(input.fromAccountId);
      const toAcc   = await getAccountById(input.toAccountId);
      if (!fromAcc || !toAcc) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });

      // 4. Apply new transfer effect
      const receivedAmount = input.amount * input.exchangeRate;
      const balanceBefore1 = Number(fromAcc.balance);
      const balanceAfter1  = balanceBefore1 - input.amount;
      const balanceBefore2 = Number(toAcc.balance);
      const balanceAfter2  = balanceBefore2 + receivedAmount;

      await updateAccountBalance(input.fromAccountId, -input.amount);
      await updateAccountBalance(input.toAccountId,    receivedAmount);

      // 5. Update the transaction record
      const newDescription = input.description || `Transfer: ${fromAcc.name} → ${toAcc.name}`;
      await db.update(finTransactions).set({
        fromAccountId:   input.fromAccountId,
        toAccountId:     input.toAccountId,
        amount:          input.amount.toString(),
        convertedAmount: receivedAmount.toString(),
        exchangeRate:    input.exchangeRate.toString(),
        transactionDate: input.transactionDate,
        description:     newDescription,
        balanceBefore:   balanceBefore1.toString(),
        balanceAfter:    balanceAfter1.toString(),
        balanceBefore2:  balanceBefore2.toString(),
        balanceAfter2:   balanceAfter2.toString(),
      }).where(eq(finTransactions.id, input.id));

      const [updated] = await db.select().from(finTransactions).where(eq(finTransactions.id, input.id));
      // transfer transaction email notification disabled
      // Recalc both accounts from scratch
      recalcAccountBalance(input.fromAccountId).catch(() => {});
      recalcAccountBalance(input.toAccountId).catch(() => {});
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
      // transfer transaction email notification disabled
      // Recalc both accounts from scratch
      recalcAccountBalance(input.fromAccountId).catch(() => {});
      recalcAccountBalance(input.toAccountId).catch(() => {});
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
      // Compute opening balance = currentBalance - (totalIn - totalOut) for the period
      // This gives us the balance BEFORE the first transaction in the period
      const openingBalance = Number(account.balance) - totalIn + totalOut;
      return {
        currentBalance: account.balance,
        openingBalance,
        totalIn,
        totalOut,
        transactions: statement,
      };
    }),
});
// ─── Bulk Upload Routerr ──────────────────────────────────────────────────────
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
      const affectedAccountIds = new Set<number>();
      for (let i = 0; i < input.transactions.length; i++) {
        const tx = input.transactions[i];
        try {
          if (tx.type === "income") {
            const account = await getAccountById(tx.accountId!);
            if (!account) { errors.push(`Row ${i + 1}: Account not found`); continue; }
            const bb = Number(account.balance);
            await createTransaction({
              type: "income", description: tx.description, accountId: tx.accountId!,
              categoryId: tx.categoryId ?? null, note: tx.note ?? null,
              finClientId: tx.finClientId ?? null, amount: tx.amount.toString(),
              transactionDate: tx.transactionDate,
              balanceBefore: bb.toString(), balanceAfter: (bb + tx.amount).toString(),
              createdBy: ctx.user?.email ?? null,
            });
            affectedAccountIds.add(tx.accountId!);
          } else if (tx.type === "expense") {
            const account = await getAccountById(tx.accountId!);
            if (!account) { errors.push(`Row ${i + 1}: Account not found`); continue; }
            const bb = Number(account.balance);
            await createTransaction({
              type: "expense", description: tx.description, accountId: tx.accountId!,
              categoryId: tx.categoryId ?? null, note: tx.note ?? null,
              employeeId: tx.employeeId ?? null, finClientId: tx.finClientId ?? null,
              amount: tx.amount.toString(), transactionDate: tx.transactionDate,
              balanceBefore: bb.toString(), balanceAfter: (bb - tx.amount).toString(),
              createdBy: ctx.user?.email ?? null,
            });
            affectedAccountIds.add(tx.accountId!);
          } else if (tx.type === "transfer") {
            const fromAcc = await getAccountById(tx.fromAccountId!);
            const toAcc = await getAccountById(tx.toAccountId!);
            if (!fromAcc || !toAcc) { errors.push(`Row ${i + 1}: Account not found`); continue; }
            const bb1 = Number(fromAcc.balance);
            const received = tx.exchangeRate ? tx.amount * tx.exchangeRate : tx.amount;
            const bb2 = Number(toAcc.balance);
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
            affectedAccountIds.add(tx.fromAccountId!);
            affectedAccountIds.add(tx.toAccountId!);
          }
          created++;
        } catch (e: any) {
          errors.push(`Row ${i + 1}: ${e.message}`);
        }
      }
      // Recalculate all affected account balances from scratch after the bulk insert
      await Promise.all(Array.from(affectedAccountIds).map(id => recalcAccountBalance(id)));
      return { created, errors };
    }),
});

// ─── Settings Router ──────────────────────────────────────────────────────────
const settingsRouter = router({
  getEurEgpRate: finReadProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, 'eurEgpRate'));
    return { rate: rows.length > 0 ? parseFloat(rows[0].value) : 55.5, updatedAt: rows[0]?.updatedAt ?? null, updatedBy: rows[0]?.updatedBy ?? null };
  }),

  setEurEgpRate: finAdminProcedure
    .input(z.object({ rate: z.number().positive().min(1).max(1000) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      await db
        .insert(appSettings)
        .values({ key: 'eurEgpRate', value: input.rate.toString(), updatedBy: ctx.user?.email ?? null })
        .onDuplicateKeyUpdate({ set: { value: input.rate.toString(), updatedBy: ctx.user?.email ?? null } });
      return { success: true, rate: input.rate };
    }),

  getUsdEgpRate: finReadProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, 'usdEgpRate'));
    return { rate: rows.length > 0 ? parseFloat(rows[0].value) : 50.0, updatedAt: rows[0]?.updatedAt ?? null, updatedBy: rows[0]?.updatedBy ?? null };
  }),

  setUsdEgpRate: finAdminProcedure
    .input(z.object({ rate: z.number().positive().min(1).max(1000) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      await db
        .insert(appSettings)
        .values({ key: 'usdEgpRate', value: input.rate.toString(), updatedBy: ctx.user?.email ?? null })
        .onDuplicateKeyUpdate({ set: { value: input.rate.toString(), updatedBy: ctx.user?.email ?? null } });
      return { success: true, rate: input.rate };
    }),
});

// ─── Upcoming Payments Router ──────────────────────────────────────────────
const upcomingPaymentsRouter = router({
  list: protectedProcedure
    .input(z.object({
      showDone: z.boolean().optional().default(false),
      consultant: z.enum(["Mahmoud", "Fouad", "Kirolos", "Ziad"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { and, or, eq: eqOp, ne } = await import("drizzle-orm");
      const conditions: any[] = [];
      if (!input.showDone) conditions.push(ne(upcomingPayments.status, "Done"));
      if (input.consultant) conditions.push(eqOp(upcomingPayments.consultant, input.consultant));
      const rows = conditions.length > 0
        ? await db.select().from(upcomingPayments).where(and(...conditions)).orderBy(upcomingPayments.dueDate)
        : await db.select().from(upcomingPayments).orderBy(upcomingPayments.dueDate);
      return rows;
    }),

  create: protectedProcedure
    .input(z.object({
      clientName: z.string().min(1),
      finClientId: z.number().optional(),
      consultant: z.enum(["Mahmoud", "Fouad", "Kirolos", "Ziad"]),
      paymentFor: z.enum(["First", "Second", "Third"]),
      dueDate: z.string(), // YYYY-MM-DD
      dueAmount: z.number().positive(),
      paidAmount: z.number().min(0).default(0),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(upcomingPayments).values({
        clientName: input.clientName,
        finClientId: input.finClientId ?? null,
        consultant: input.consultant,
        paymentFor: input.paymentFor,
        dueDate: new Date(input.dueDate),
        dueAmount: String(input.dueAmount),
        paidAmount: String(input.paidAmount),
        status: "Pending",
        notes: input.notes ?? null,
      });
      return { id: (result as any).insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      clientName: z.string().min(1).optional(),
      finClientId: z.number().optional().nullable(),
      consultant: z.enum(["Mahmoud", "Fouad", "Kirolos", "Ziad"]).optional(),
      paymentFor: z.enum(["First", "Second", "Third"]).optional(),
      dueDate: z.string().optional(),
      dueAmount: z.number().positive().optional(),
      paidAmount: z.number().min(0).optional(),
      status: z.enum(["Pending", "Done"]).optional(),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { eq: eqOp } = await import("drizzle-orm");
      const updateData: any = {};
      if (input.clientName !== undefined) updateData.clientName = input.clientName;
      if (input.finClientId !== undefined) updateData.finClientId = input.finClientId;
      if (input.consultant !== undefined) updateData.consultant = input.consultant;
      if (input.paymentFor !== undefined) updateData.paymentFor = input.paymentFor;
      if (input.dueDate !== undefined) updateData.dueDate = new Date(input.dueDate);
      if (input.dueAmount !== undefined) updateData.dueAmount = String(input.dueAmount);
      if (input.paidAmount !== undefined) updateData.paidAmount = String(input.paidAmount);
      if (input.status !== undefined) updateData.status = input.status;
      if (input.notes !== undefined) updateData.notes = input.notes;
      await db.update(upcomingPayments).set(updateData).where(eqOp(upcomingPayments.id, input.id));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { eq: eqOp } = await import("drizzle-orm");
      await db.delete(upcomingPayments).where(eqOp(upcomingPayments.id, input.id));
      return { success: true };
    }),

  searchClients: protectedProcedure
    .input(z.object({ q: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { like, or } = await import("drizzle-orm");
      if (!input.q.trim()) {
        return await db.select({ id: finClients.id, name: finClients.name, clientCode: finClients.clientCode })
          .from(finClients).limit(20);
      }
      return await db.select({ id: finClients.id, name: finClients.name, clientCode: finClients.clientCode })
        .from(finClients)
        .where(or(
          like(finClients.name, `%${input.q}%`),
          like(finClients.clientCode, `%${input.q}%`)
        ))
        .limit(20);
    }),
});

// ─── Salary Receipts Router ───────────────────────────────────────────────────
const salaryReceiptsRouter = router({
  list: finProcedure
    .input(z.object({ month: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb(); if (!db) return [];
      const rows = await db.select().from(salaryReceipts).orderBy(salaryReceipts.receiptDate);
      if (input?.month) return rows.filter(r => r.forMonth === input.month);
      return rows;
    }),

  create: finProcedure
    .input(z.object({
      employeeId: z.number(),
      employeeName: z.string(),
      salaryAmount: z.number(),
      deductionAmount: z.number().default(0),
      forMonth: z.string(),
      receiptDate: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const net = input.salaryAmount - input.deductionAmount;
      const [res] = await db.insert(salaryReceipts).values({
        employeeId: input.employeeId,
        employeeName: input.employeeName,
        salaryAmount: input.salaryAmount.toString(),
        deductionAmount: input.deductionAmount.toString(),
        netPaidSalary: net.toString(),
        forMonth: input.forMonth,
        receiptDate: new Date(input.receiptDate),
        status: "draft",
        createdBy: ctx.user?.email ?? "",
      });
      return { id: res.insertId };
    }),

  update: finProcedure
    .input(z.object({
      id: z.number(),
      employeeId: z.number().optional(),
      employeeName: z.string().optional(),
      salaryAmount: z.number().optional(),
      deductionAmount: z.number().optional(),
      forMonth: z.string().optional(),
      receiptDate: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, salaryAmount, deductionAmount, receiptDate, ...rest } = input;
      const [cur] = await db.select().from(salaryReceipts).where(eq(salaryReceipts.id, id));
      if (!cur) throw new TRPCError({ code: "NOT_FOUND" });
      if (cur.status === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot edit a paid receipt" });
      const newSalary = salaryAmount ?? Number(cur.salaryAmount);
      const newDeduction = deductionAmount ?? Number(cur.deductionAmount);
      const net = newSalary - newDeduction;
      await db.update(salaryReceipts).set({
        ...rest,
        salaryAmount: newSalary.toString(),
        deductionAmount: newDeduction.toString(),
        netPaidSalary: net.toString(),
        ...(receiptDate ? { receiptDate: new Date(receiptDate) } : {}),
      }).where(eq(salaryReceipts.id, id));
      return { ok: true };
    }),

  delete: finProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [cur] = await db.select().from(salaryReceipts).where(eq(salaryReceipts.id, input.id));
      if (!cur) throw new TRPCError({ code: "NOT_FOUND" });
      await db.delete(salaryReceipts).where(eq(salaryReceipts.id, input.id));
      return { ok: true };
    }),

  markAsPaid: finProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [cur] = await db.select().from(salaryReceipts).where(eq(salaryReceipts.id, input.id));
      if (!cur) throw new TRPCError({ code: "NOT_FOUND" });
      if (cur.status === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "Already paid" });

      const cashEgpAccountId = 1;
      const salaryCategoryId = 2;
      const description = `Salary for ${cur.forMonth}`;

      const txResult = await createTransaction({
        type: "expense",
        accountId: cashEgpAccountId,
        categoryId: salaryCategoryId,
        employeeId: cur.employeeId,
        amount: cur.netPaidSalary,
        convertedAmount: cur.netPaidSalary,
        description,
        note: description,
        transactionDate: new Date(),
        createdBy: ctx.user?.email ?? "",
      });
      if (!txResult) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create expense entry" });

      await recalcAccountBalance(cashEgpAccountId);

      await db.update(salaryReceipts).set({
        status: "paid",
        linkedTransactionId: txResult.id,
      }).where(eq(salaryReceipts.id, input.id));

      return { ok: true, transactionId: txResult.id };
    }),
});

// ─── Commission Receipts Router ────────────────────────────────────────────
const COMMISSION_FOR_OPTIONS = [
  "Paralegal First", "Paralegal Second", "Paralegal Third",
  "Consultant First", "Consultant Second", "Consultant Third",
  "Qualifier", "Qualifier TL", "Operation Manager", "Operation TL", "Country Manager",
] as const;

const commissionItemSchema = z.object({
  clientId: z.number(),
  clientName: z.string().min(1),
  commissionFor: z.string().min(1),
  amountEur: z.number().min(0),
});

const commissionReceiptsRouter = router({
  list: finProcedure.query(async () => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const receipts = await db.select().from(commissionReceipts).orderBy(commissionReceipts.createdAt);
    // Fetch items for each receipt
    const allItems = await db.select().from(commissionReceiptItems);
    // Build a clientCode lookup map from finClients
    const allClients = await db.select({ id: finClients.id, clientCode: finClients.clientCode }).from(finClients);
    const clientCodeMap = new Map(allClients.map(c => [c.id, c.clientCode ?? ""]));
    return receipts.map(r => ({
      ...r,
      items: allItems
        .filter(i => i.receiptId === r.id)
        .map(i => ({ ...i, clientCode: clientCodeMap.get(i.clientId) ?? "" })),
    })).reverse();
  }),

  create: finProcedure
    .input(z.object({
      employeeId: z.number(),
      forMonth: z.string().min(1),
      eurToEgpRate: z.number().min(0.01),
      items: z.array(commissionItemSchema).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [emp] = await db.select().from(finAccounts).limit(0); // just to use db
      // Get employee name
      const { listEmployees } = await import("./finDb");
      const employees = await listEmployees();
      const emp2 = employees.find(e => e.id === input.employeeId);
      if (!emp2) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });

      const rate = input.eurToEgpRate;
      const itemsWithEgp = input.items.map(item => ({
        ...item,
        amountEgp: Math.round(item.amountEur * rate * 100) / 100,
      }));
      const totalEur = itemsWithEgp.reduce((s, i) => s + i.amountEur, 0);
      const totalEgp = itemsWithEgp.reduce((s, i) => s + i.amountEgp, 0);

      const [result] = await db.insert(commissionReceipts).values({
        employeeId: input.employeeId,
        employeeName: emp2.name,
        forMonth: input.forMonth,
        eurToEgpRate: rate.toString(),
        totalAmountEur: totalEur.toString(),
        totalAmountEgp: totalEgp.toString(),
        receiptDate: new Date(),
        status: "draft",
        createdBy: ctx.user?.email ?? "",
      });
      const receiptId = (result as any).insertId as number;

      for (const item of itemsWithEgp) {
        await db.insert(commissionReceiptItems).values({
          receiptId,
          clientId: item.clientId,
          clientName: item.clientName,
          commissionFor: item.commissionFor,
          amountEur: item.amountEur.toString(),
          amountEgp: item.amountEgp.toString(),
        });
      }
      return { id: receiptId };
    }),

  update: finProcedure
    .input(z.object({
      id: z.number(),
      employeeId: z.number().optional(),
      forMonth: z.string().optional(),
      eurToEgpRate: z.number().optional(),
      items: z.array(commissionItemSchema).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [cur] = await db.select().from(commissionReceipts).where(eq(commissionReceipts.id, input.id));
      if (!cur) throw new TRPCError({ code: "NOT_FOUND" });
      if (cur.status === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot edit a paid receipt" });

      const rate = input.eurToEgpRate ?? Number(cur.eurToEgpRate);
      let updateData: Record<string, unknown> = {};
      if (input.forMonth) updateData.forMonth = input.forMonth;
      if (input.eurToEgpRate) updateData.eurToEgpRate = rate.toString();

      if (input.employeeId) {
        const { listEmployees } = await import("./finDb");
        const employees = await listEmployees();
        const emp = employees.find(e => e.id === input.employeeId);
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
        updateData.employeeId = input.employeeId;
        updateData.employeeName = emp.name;
      }

      if (input.items) {
        const itemsWithEgp = input.items.map(item => ({
          ...item,
          amountEgp: Math.round(item.amountEur * rate * 100) / 100,
        }));
        updateData.totalAmountEur = itemsWithEgp.reduce((s, i) => s + i.amountEur, 0).toString();
        updateData.totalAmountEgp = itemsWithEgp.reduce((s, i) => s + i.amountEgp, 0).toString();
        // Replace items
        await db.delete(commissionReceiptItems).where(eq(commissionReceiptItems.receiptId, input.id));
        for (const item of itemsWithEgp) {
          await db.insert(commissionReceiptItems).values({
            receiptId: input.id,
            clientId: item.clientId,
            clientName: item.clientName,
            commissionFor: item.commissionFor,
            amountEur: item.amountEur.toString(),
            amountEgp: item.amountEgp.toString(),
          });
        }
      }

      if (Object.keys(updateData).length > 0) {
        await db.update(commissionReceipts).set(updateData).where(eq(commissionReceipts.id, input.id));
      }
      return { ok: true };
    }),

  delete: finProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [cur] = await db.select().from(commissionReceipts).where(eq(commissionReceipts.id, input.id));
      if (!cur) throw new TRPCError({ code: "NOT_FOUND" });
      await db.delete(commissionReceiptItems).where(eq(commissionReceiptItems.receiptId, input.id));
      await db.delete(commissionReceipts).where(eq(commissionReceipts.id, input.id));
      return { ok: true };
    }),

  markAsPaid: finProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [cur] = await db.select().from(commissionReceipts).where(eq(commissionReceipts.id, input.id));
      if (!cur) throw new TRPCError({ code: "NOT_FOUND" });
      if (cur.status === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "Already paid" });

      const items = await db.select().from(commissionReceiptItems).where(eq(commissionReceiptItems.receiptId, input.id));
      const cashEgpAccountId = 1;
      const commissionCategoryId = 1; // Commissions category
      const description = `Commission for ${cur.forMonth}`;

      const txIds: number[] = [];
      for (const item of items) {
        const txResult = await createTransaction({
          type: "expense",
          accountId: cashEgpAccountId,
          categoryId: commissionCategoryId,
          employeeId: cur.employeeId,
          finClientId: item.clientId,
          amount: item.amountEgp,
          convertedAmount: item.amountEgp,
          description,
          note: description,
          transactionDate: new Date(),
          createdBy: ctx.user?.email ?? "",
        });
        if (!txResult) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to create expense for ${item.clientName}` });
        // Store the first transaction id on the item
        await db.update(commissionReceiptItems)
          .set({ linkedTransactionId: txResult.id })
          .where(eq(commissionReceiptItems.id, item.id));
        txIds.push(txResult.id);
      }

      await recalcAccountBalance(cashEgpAccountId);

      await db.update(commissionReceipts)
        .set({ status: "paid" })
        .where(eq(commissionReceipts.id, input.id));

      return { ok: true, transactionIds: txIds };
    }),

  getCommissionForOptions: finProcedure.query(() => COMMISSION_FOR_OPTIONS),
});

// ─── Export Financial Router ─────────────────────────────────────────────
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
  settings: settingsRouter,
  upcomingPayments: upcomingPaymentsRouter,
  salaryReceipts: salaryReceiptsRouter,
  commissionReceipts: commissionReceiptsRouter,
});
