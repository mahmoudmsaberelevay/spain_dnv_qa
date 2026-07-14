import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  listQualificationReports, getQualificationReport, createQualificationReport, updateQualificationReport, deleteQualificationReport,
} from "../reportsDb";
import { listParalegalClientRecords, getParalegalClientRecord, createParalegalClientRecord, updateParalegalClientRecord, deleteParalegalClientRecord } from "../paralegalDb";
import { listAttestationClientRecords, getAttestationClientRecord, createAttestationClientRecord, updateAttestationClientRecord, deleteAttestationClientRecord } from "../attestationDb";
import { listVisaClientRecords, getVisaClientRecord, createVisaClientRecord, updateVisaClientRecord, deleteVisaClientRecord } from "../visaDb";
import { listFinancialSummaries, getFinancialSummary, createFinancialSummary, updateFinancialSummary, deleteFinancialSummary } from "../financialDb";
import { searchFinClientsForDropdown } from "../clientSearchHelper";

// ─── Qualification Reports ────────────────────────────────────────────────────
const qualificationReportsRouter = router({
  list: protectedProcedure
    .input(z.object({
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await listQualificationReports(input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getQualificationReport(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      reportDate: z.date(),
      totalLeads: z.number().int().min(0),
      totalQualified: z.number().int().min(0),
      notQualified: z.number().int().min(0),
      noAnswer: z.number().int().min(0),
    }))
    .mutation(async ({ input }) => {
      return await createQualificationReport(input);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      reportDate: z.date().optional(),
      totalLeads: z.number().int().min(0).optional(),
      totalQualified: z.number().int().min(0).optional(),
      notQualified: z.number().int().min(0).optional(),
      noAnswer: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await updateQualificationReport(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteQualificationReport(input.id);
    }),
});

// ─── Paralegal Client Records ─────────────────────────────────────────────────
const paralegalClientsRouter = router({
  list: protectedProcedure
    .input(z.object({
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await listParalegalClientRecords(input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getParalegalClientRecord(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      recordDate: z.date(),
      finClientId: z.number(),
      clientName: z.string(),
      stage: z.enum(["Submitted", "Approved"]),
      fileType: z.enum(["Family", "Single"]),
    }))
    .mutation(async ({ input }) => {
      return await createParalegalClientRecord(input);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      recordDate: z.date().optional(),
      finClientId: z.number().optional(),
      clientName: z.string().optional(),
      stage: z.enum(["Submitted", "Approved"]).optional(),
      fileType: z.enum(["Family", "Single"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await updateParalegalClientRecord(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteParalegalClientRecord(input.id);
    }),
});

// ─── Attestation Client Records ───────────────────────────────────────────────
const attestationClientsRouter = router({
  list: protectedProcedure
    .input(z.object({
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await listAttestationClientRecords(input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getAttestationClientRecord(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      recordDate: z.date(),
      finClientId: z.number(),
      clientName: z.string(),
      type: z.enum(["Submitted", "Finished"]),
      provider: z.string(),
    }))
    .mutation(async ({ input }) => {
      return await createAttestationClientRecord(input);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      recordDate: z.date().optional(),
      finClientId: z.number().optional(),
      clientName: z.string().optional(),
      type: z.enum(["Submitted", "Finished"]).optional(),
      provider: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await updateAttestationClientRecord(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteAttestationClientRecord(input.id);
    }),
});

// ─── Visa Client Records ──────────────────────────────────────────────────────
const visaClientsRouter = router({
  list: protectedProcedure
    .input(z.object({
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await listVisaClientRecords(input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getVisaClientRecord(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      recordDate: z.date(),
      finClientId: z.number(),
      clientName: z.string(),
      visaType: z.enum(["Schengen", "National"]),
      status: z.enum(["Submitted", "Finished"]),
      provider: z.string(),
    }))
    .mutation(async ({ input }) => {
      return await createVisaClientRecord(input);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      recordDate: z.date().optional(),
      finClientId: z.number().optional(),
      clientName: z.string().optional(),
      visaType: z.enum(["Schengen", "National"]).optional(),
      status: z.enum(["Submitted", "Finished"]).optional(),
      provider: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await updateVisaClientRecord(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteVisaClientRecord(input.id);
    }),
});

// ─── Financial Monthly Summaries ──────────────────────────────────────────────
const financialSummariesRouter = router({
  list: protectedProcedure
    .input(z.object({
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await listFinancialSummaries(input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getFinancialSummary(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      summaryDate: z.date(),
      totalSalesEgp: z.number().optional(),
      totalSalesUsd: z.number().optional(),
      totalSalesEur: z.number().optional(),
      totalIncomeEgp: z.number().optional(),
      totalIncomeUsd: z.number().optional(),
      totalIncomeEur: z.number().optional(),
      totalExpensesEgp: z.number().optional(),
      totalExpensesUsd: z.number().optional(),
      totalExpensesEur: z.number().optional(),
      salariesEgp: z.number().optional(),
      salariesUsd: z.number().optional(),
      salariesEur: z.number().optional(),
      commissionsEgp: z.number().optional(),
      commissionsUsd: z.number().optional(),
      commissionsEur: z.number().optional(),
      mofaEgp: z.number().optional(),
      mofaUsd: z.number().optional(),
      mofaEur: z.number().optional(),
      embassyEgp: z.number().optional(),
      embassyUsd: z.number().optional(),
      embassyEur: z.number().optional(),
      translationFeesEgp: z.number().optional(),
      translationFeesUsd: z.number().optional(),
      translationFeesEur: z.number().optional(),
      lawyerFeesEgp: z.number().optional(),
      lawyerFeesUsd: z.number().optional(),
      lawyerFeesEur: z.number().optional(),
      officeExpensesEgp: z.number().optional(),
      officeExpensesUsd: z.number().optional(),
      officeExpensesEur: z.number().optional(),
      officeRentEgp: z.number().optional(),
      officeRentUsd: z.number().optional(),
      officeRentEur: z.number().optional(),
      miscEgp: z.number().optional(),
      miscUsd: z.number().optional(),
      miscEur: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return await createFinancialSummary(input);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      summaryDate: z.date().optional(),
      totalSalesEgp: z.number().optional(),
      totalSalesUsd: z.number().optional(),
      totalSalesEur: z.number().optional(),
      totalIncomeEgp: z.number().optional(),
      totalIncomeUsd: z.number().optional(),
      totalIncomeEur: z.number().optional(),
      totalExpensesEgp: z.number().optional(),
      totalExpensesUsd: z.number().optional(),
      totalExpensesEur: z.number().optional(),
      salariesEgp: z.number().optional(),
      salariesUsd: z.number().optional(),
      salariesEur: z.number().optional(),
      commissionsEgp: z.number().optional(),
      commissionsUsd: z.number().optional(),
      commissionsEur: z.number().optional(),
      mofaEgp: z.number().optional(),
      mofaUsd: z.number().optional(),
      mofaEur: z.number().optional(),
      embassyEgp: z.number().optional(),
      embassyUsd: z.number().optional(),
      embassyEur: z.number().optional(),
      translationFeesEgp: z.number().optional(),
      translationFeesUsd: z.number().optional(),
      translationFeesEur: z.number().optional(),
      lawyerFeesEgp: z.number().optional(),
      lawyerFeesUsd: z.number().optional(),
      lawyerFeesEur: z.number().optional(),
      officeExpensesEgp: z.number().optional(),
      officeExpensesUsd: z.number().optional(),
      officeExpensesEur: z.number().optional(),
      officeRentEgp: z.number().optional(),
      officeRentUsd: z.number().optional(),
      officeRentEur: z.number().optional(),
      miscEgp: z.number().optional(),
      miscUsd: z.number().optional(),
      miscEur: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await updateFinancialSummary(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteFinancialSummary(input.id);
    }),
});

// ─── Client Search ────────────────────────────────────────────────────────────
const clientSearchRouter = router({
  search: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      return await searchFinClientsForDropdown(input.query);
    }),
});

// ─── Main Reports Router ──────────────────────────────────────────────────────
export const reportsRouter = router({
  qualifications: qualificationReportsRouter,
  paralegalClients: paralegalClientsRouter,
  attestationClients: attestationClientsRouter,
  visaClients: visaClientsRouter,
  financialSummaries: financialSummariesRouter,
  clientSearch: clientSearchRouter,
});
