import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  listQualificationReports, getQualificationReport, createQualificationReport, updateQualificationReport, deleteQualificationReport,
  listParalegalReports, getParalegalReport, createParalegalReport, updateParalegalReport, deleteParalegalReport,
  listFinancialReports, getFinancialReport, createFinancialReport, updateFinancialReport, deleteFinancialReport,
  listVisasReports, getVisasReport, createVisasReport, updateVisasReport, deleteVisasReport,
  listAttestationReports, getAttestationReport, createAttestationReport, updateAttestationReport, deleteAttestationReport,
} from "../reportsDb";

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

// ─── Main Reports Router ──────────────────────────────────────────────────────
export const reportsRouter = router({
  qualifications: qualificationReportsRouter,
  paralegal: paralegalReportsRouter,
  financial: financialReportsRouter,
  visas: visasReportsRouter,
  attestation: attestationReportsRouter,
});
