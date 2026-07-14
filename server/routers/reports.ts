import z from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  listQualificationReports, getQualificationReport, createQualificationReport, updateQualificationReport, deleteQualificationReport,
  listParalegalReports, getParalegalReport, createParalegalReport, updateParalegalReport, deleteParalegalReport,
  listFinancialReports, getFinancialReport, createFinancialReport, updateFinancialReport, deleteFinancialReport,
  listVisasReports, getVisasReport, createVisasReport, updateVisasReport, deleteVisasReport,
  listAttestationReports, getAttestationReport, createAttestationReport, updateAttestationReport, deleteAttestationReport,
} from "../reportsDb";
import { listParalegalClientRecords, getParalegalClientRecord, createParalegalClientRecord, updateParalegalClientRecord, deleteParalegalClientRecord, listFinancialClients } from "../paralegalDb";
import { listAttestationClientRecords, getAttestationClientRecord, createAttestationClientRecord, updateAttestationClientRecord, deleteAttestationClientRecord, listFinancialClientsForAttestation } from "../attestationDb";
import { listVisaClientRecords, getVisaClientRecord, createVisaClientRecord, updateVisaClientRecord, deleteVisaClientRecord, listFinancialClientsForVisa } from "../visaDb";
import { listFinancialSummaries, getFinancialSummary, createFinancialSummary, updateFinancialSummary, deleteFinancialSummary, convertCurrency } from "../financialDb";
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

// ─── Paralegal Reports ────────────────────────────────────────────────────────
const paralegalReportsRouter = router({
  list: protectedProcedure
    .input(z.object({
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await listParalegalReports(input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getParalegalReport(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      reportDate: z.date(),
      documentsReceived: z.number().int().min(0),
      documentsReviewed: z.number().int().min(0),
      issuesFound: z.number().int().min(0),
      clientsContacted: z.number().int().min(0),
    }))
    .mutation(async ({ input }) => {
      return await createParalegalReport(input);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      reportDate: z.date().optional(),
      documentsReceived: z.number().int().min(0).optional(),
      documentsReviewed: z.number().int().min(0).optional(),
      issuesFound: z.number().int().min(0).optional(),
      clientsContacted: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await updateParalegalReport(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteParalegalReport(input.id);
    }),
});

// ─── Financial Reports ────────────────────────────────────────────────────────
const financialReportsRouter = router({
  list: protectedProcedure
    .input(z.object({
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await listFinancialReports(input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getFinancialReport(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      reportDate: z.date(),
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
      return await createFinancialReport(input);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      reportDate: z.date().optional(),
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
      return await updateFinancialReport(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteFinancialReport(input.id);
    }),
});

// ─── Visas Reports ────────────────────────────────────────────────────────────
const visasReportsRouter = router({
  list: protectedProcedure
    .input(z.object({
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await listVisasReports(input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getVisasReport(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      reportDate: z.date(),
      visaType: z.enum(["Schengen", "National"]),
      status: z.enum(["Submitted", "Finished"]),
      provider: z.string(),
    }))
    .mutation(async ({ input }) => {
      return await createVisasReport(input);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      reportDate: z.date().optional(),
      visaType: z.enum(["Schengen", "National"]).optional(),
      status: z.enum(["Submitted", "Finished"]).optional(),
      provider: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await updateVisasReport(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteVisasReport(input.id);
    }),
});

// ─── Attestation Reports ──────────────────────────────────────────────────────
const attestationReportsRouter = router({
  list: protectedProcedure
    .input(z.object({
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await listAttestationReports(input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getAttestationReport(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      reportDate: z.date(),
      type: z.enum(["Submitted", "Finished"]),
      provider: z.string(),
    }))
    .mutation(async ({ input }) => {
      return await createAttestationReport(input);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      reportDate: z.date().optional(),
      type: z.enum(["Submitted", "Finished"]).optional(),
      provider: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await updateAttestationReport(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteAttestationReport(input.id);
    }),
});

// ─── Paralegal Client Records ─────────────────────────────────────────────────
const paralegalClientRecordsRouter = router({
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
      reportDate: z.date(),
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
      reportDate: z.date().optional(),
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

  searchClients: protectedProcedure
    .input(z.object({ query: z.string().optional() }))
    .query(async ({ input }) => {
      return await listFinancialClients(input.query);
    }),
});

// ─── Attestation Client Records ───────────────────────────────────────────────
const attestationClientRecordsRouter = router({
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
      reportDate: z.date(),
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
      reportDate: z.date().optional(),
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

  searchClients: protectedProcedure
    .input(z.object({ query: z.string().optional() }))
    .query(async ({ input }) => {
      return await listFinancialClientsForAttestation(input.query);
    }),
});

// ─── Visa Client Records ──────────────────────────────────────────────────────
const visaClientRecordsRouter = router({
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
      reportDate: z.date(),
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
      reportDate: z.date().optional(),
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

  searchClients: protectedProcedure
    .input(z.object({ query: z.string().optional() }))
    .query(async ({ input }) => {
      return await listFinancialClientsForVisa(input.query);
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
      reportDate: z.date(),
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
      reportDate: z.date().optional(),
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

  convertCurrency: protectedProcedure
    .input(z.object({
      amount: z.number(),
      fromCurrency: z.enum(["EGP", "USD", "EUR"]),
      toCurrency: z.enum(["EGP", "USD", "EUR"]),
    }))
    .query(async ({ input }) => {
      return await convertCurrency(input.amount, input.fromCurrency, input.toCurrency);
    }),
});

// ─── Client Search Helper ─────────────────────────────────────────────────────
const clientSearchRouter = router({
  search: protectedProcedure
    .input(z.object({ query: z.string().optional() }))
    .query(async ({ input }) => {
      return await searchFinClientsForDropdown(input.query);
    }),
});

// ─── Main Reports Router ──────────────────────────────────────────────────────
export const reportsRouter = router({
  qualifications: qualificationReportsRouter,
  paralegal: paralegalReportsRouter,
  financial: financialReportsRouter,
  visas: visasReportsRouter,
  attestation: attestationReportsRouter,
  paralegalClients: paralegalClientRecordsRouter,
  attestationClients: attestationClientRecordsRouter,
  visaClients: visaClientRecordsRouter,
  financialSummaries: financialSummariesRouter,
  clientSearch: clientSearchRouter,
});
