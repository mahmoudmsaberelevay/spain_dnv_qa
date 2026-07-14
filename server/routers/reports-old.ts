import { z } from "zod";
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
    .input(z.object({ reportDate: z.date() }))
    .query(async ({ input }) => {
      return await getQualificationReport(input.reportDate);
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
      reportDate: z.date(),
      totalLeads: z.number().int().min(0).optional(),
      totalQualified: z.number().int().min(0).optional(),
      notQualified: z.number().int().min(0).optional(),
      noAnswer: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const { reportDate, ...data } = input;
      return await updateQualificationReport(reportDate, data);
    }),

  delete: protectedProcedure
    .input(z.object({ reportDate: z.date() }))
    .mutation(async ({ input }) => {
      return await deleteQualificationReport(input.reportDate);
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
    .input(z.object({ reportDate: z.date() }))
    .query(async ({ input }) => {
      return await getParalegalReport(input.reportDate);
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
      reportDate: z.date(),
      documentsReceived: z.number().int().min(0).optional(),
      documentsReviewed: z.number().int().min(0).optional(),
      issuesFound: z.number().int().min(0).optional(),
      clientsContacted: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const { reportDate, ...data } = input;
      return await updateParalegalReport(reportDate, data);
    }),

  delete: protectedProcedure
    .input(z.object({ reportDate: z.date() }))
    .mutation(async ({ input }) => {
      return await deleteParalegalReport(input.reportDate);
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
    .input(z.object({ reportDate: z.date() }))
    .query(async ({ input }) => {
      return await getFinancialReport(input.reportDate);
    }),

  create: protectedProcedure
    .input(z.object({
      reportDate: z.date(),
      invoicesCreated: z.number().int().min(0),
      invoiceAmount: z.string().min(0),
      paymentsReceived: z.number().int().min(0),
      paymentAmount: z.string().min(0),
      expensesRecorded: z.number().int().min(0),
      expenseAmount: z.string().min(0),
    }))
    .mutation(async ({ input }) => {
      return await createFinancialReport(input);
    }),

  update: protectedProcedure
    .input(z.object({
      reportDate: z.date(),
      invoicesCreated: z.number().int().min(0).optional(),
      invoiceAmount: z.string().min(0).optional(),
      paymentsReceived: z.number().int().min(0).optional(),
      paymentAmount: z.string().min(0).optional(),
      expensesRecorded: z.number().int().min(0).optional(),
      expenseAmount: z.string().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const { reportDate, ...data } = input;
      return await updateFinancialReport(reportDate, data);
    }),

  delete: protectedProcedure
    .input(z.object({ reportDate: z.date() }))
    .mutation(async ({ input }) => {
      return await deleteFinancialReport(input.reportDate);
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
    .input(z.object({ reportDate: z.date() }))
    .query(async ({ input }) => {
      return await getVisasReport(input.reportDate);
    }),

  create: protectedProcedure
    .input(z.object({
      reportDate: z.date(),
      applicationsSubmitted: z.number().int().min(0),
      applicationsApproved: z.number().int().min(0),
      applicationsRejected: z.number().int().min(0),
      visasIssued: z.number().int().min(0),
    }))
    .mutation(async ({ input }) => {
      return await createVisasReport(input);
    }),

  update: protectedProcedure
    .input(z.object({
      reportDate: z.date(),
      applicationsSubmitted: z.number().int().min(0).optional(),
      applicationsApproved: z.number().int().min(0).optional(),
      applicationsRejected: z.number().int().min(0).optional(),
      visasIssued: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const { reportDate, ...data } = input;
      return await updateVisasReport(reportDate, data);
    }),

  delete: protectedProcedure
    .input(z.object({ reportDate: z.date() }))
    .mutation(async ({ input }) => {
      return await deleteVisasReport(input.reportDate);
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
    .input(z.object({ reportDate: z.date() }))
    .query(async ({ input }) => {
      return await getAttestationReport(input.reportDate);
    }),

  create: protectedProcedure
    .input(z.object({
      reportDate: z.date(),
      documentsSubmitted: z.number().int().min(0),
      documentsAttested: z.number().int().min(0),
      attestationsPending: z.number().int().min(0),
      attestationsCompleted: z.number().int().min(0),
    }))
    .mutation(async ({ input }) => {
      return await createAttestationReport(input);
    }),

  update: protectedProcedure
    .input(z.object({
      reportDate: z.date(),
      documentsSubmitted: z.number().int().min(0).optional(),
      documentsAttested: z.number().int().min(0).optional(),
      attestationsPending: z.number().int().min(0).optional(),
      attestationsCompleted: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const { reportDate, ...data } = input;
      return await updateAttestationReport(reportDate, data);
    }),

  delete: protectedProcedure
    .input(z.object({ reportDate: z.date() }))
    .mutation(async ({ input }) => {
      return await deleteAttestationReport(input.reportDate);
    }),
});

// ─── Paralegal Client Records Lookup ────────────────────────────────────────────
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
      recordDate: z.date(),
      finClientId: z.number().int(),
      clientName: z.string().min(1),
      clientCode: z.string().optional(),
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

const financialClientsRouter = router({
  search: protectedProcedure
    .input(z.object({ searchTerm: z.string().optional() }))
    .query(async ({ input }) => {
      return await listFinancialClients(input.searchTerm);
    }),
});

// ─── Attestation Client Records Lookup ──────────────────────────────────────
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
      recordDate: z.date(),
      finClientId: z.number().int(),
      clientName: z.string().min(1),
      clientCode: z.string().optional(),
      type: z.enum(["Submitted", "Finished"]),
      provider: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      return await createAttestationClientRecord(input);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      recordDate: z.date().optional(),
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

const attestationFinancialClientsRouter = router({
  search: protectedProcedure
    .input(z.object({ searchTerm: z.string().optional() }))
    .query(async ({ input }) => {
      return await listFinancialClientsForAttestation(input.searchTerm);
    }),
});

// ─── Visa Client Records Lookup ────────────────────────────────────────────────
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
      recordDate: z.date(),
      finClientId: z.number().int(),
      clientName: z.string().min(1),
      clientCode: z.string().optional(),
      visaType: z.enum(["Schengen", "National"]),
      status: z.enum(["Submitted", "Finished"]),
      provider: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      return await createVisaClientRecord(input);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      recordDate: z.date().optional(),
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

const visaFinancialClientsRouter = router({
  search: protectedProcedure
    .input(z.object({ searchTerm: z.string().optional() }))
    .query(async ({ input }) => {
      return await listFinancialClientsForVisa(input.searchTerm);
    }),
});

// ─── Financial Monthly Summary ──────────────────────────────────────────────────
const financialMonthlySummaryRouter = router({
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

  convert: protectedProcedure
    .input(z.object({
      amount: z.number(),
      from: z.enum(["EGP", "USD", "EUR"]),
      to: z.enum(["EGP", "USD", "EUR"]),
    }))
    .query(async ({ input }) => {
      return convertCurrency(input.amount, input.from, input.to);
    }),
});

// ─── Main Reports Router ──────────────────────────────────────────────────────
export const reportsRouter = router({
  qualifications: qualificationReportsRouter,
  paralegal: paralegalReportsRouter,
  paralegalClients: paralegalClientRecordsRouter,
  financialClients: financialClientsRouter,
  attestationClients: attestationClientRecordsRouter,
  attestationFinancialClients: attestationFinancialClientsRouter,
  visaClients: visaClientRecordsRouter,
  visaFinancialClients: visaFinancialClientsRouter,
  financialMonthlySummary: financialMonthlySummaryRouter,
  financial: financialReportsRouter,
  visas: visasReportsRouter,
  attestation: attestationReportsRouter,
});
