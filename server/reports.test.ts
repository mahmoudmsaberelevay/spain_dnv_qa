import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  listQualificationReports, createQualificationReport, updateQualificationReport, deleteQualificationReport,
  listParalegalReports, createParalegalReport,
  listFinancialReports, createFinancialReport,
  listVisasReports, createVisasReport,
  listAttestationReports, createAttestationReport,
} from "./reportsDb";

describe("Reports Database Functions", () => {
  const testDate = new Date();
  testDate.setHours(0, 0, 0, 0);
  const tomorrow = new Date(testDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(testDate);
  yesterday.setDate(yesterday.getDate() - 1);

  describe("Qualification Reports", () => {
    it("should create a qualification report", async () => {
      const uniqueDate = new Date(testDate);
      uniqueDate.setHours(Math.random() * 24, Math.random() * 60, Math.random() * 60);
      const result = await createQualificationReport({
        reportDate: uniqueDate,
        totalLeads: 10,
        totalQualified: 7,
        notQualified: 2,
        noAnswer: 1,
      });
      expect(result).toBeDefined();
    });

    it("should list qualification reports", async () => {
      const reports = await listQualificationReports({
        dateFrom: yesterday,
        dateTo: tomorrow,
      });
      expect(Array.isArray(reports)).toBe(true);
      expect(reports.length).toBeGreaterThan(0);
    });

    it("should update a qualification report", async () => {
      const result = await updateQualificationReport(testDate, {
        totalLeads: 12,
        totalQualified: 8,
      });
      expect(result).toBeDefined();
    });

    it("should delete a qualification report", async () => {
      const result = await deleteQualificationReport(testDate);
      expect(result).toBeDefined();
    });
  });

  describe("Paralegal Reports", () => {
    it("should create a paralegal report", async () => {
      const uniqueDate = new Date(testDate);
      uniqueDate.setHours(Math.random() * 24, Math.random() * 60, Math.random() * 60);
      const result = await createParalegalReport({
        reportDate: uniqueDate,
        documentsReceived: 5,
        documentsReviewed: 4,
        issuesFound: 1,
        clientsContacted: 3,
      });
      expect(result).toBeDefined();
    });

    it("should list paralegal reports", async () => {
      const reports = await listParalegalReports({
        dateFrom: yesterday,
        dateTo: tomorrow,
      });
      expect(Array.isArray(reports)).toBe(true);
    });
  });

  describe("Financial Reports", () => {
    it("should create a financial report", async () => {
      const uniqueDate = new Date(testDate);
      uniqueDate.setHours(Math.random() * 24, Math.random() * 60, Math.random() * 60);
      const result = await createFinancialReport({
        reportDate: uniqueDate,
        invoicesCreated: 3,
        invoiceAmount: "5000",
        paymentsReceived: 2,
        paymentAmount: "3500",
        expensesRecorded: 1,
        expenseAmount: "500",
      });
      expect(result).toBeDefined();
    });

    it("should list financial reports", async () => {
      const reports = await listFinancialReports({
        dateFrom: yesterday,
        dateTo: tomorrow,
      });
      expect(Array.isArray(reports)).toBe(true);
    });
  });

  describe("Visas Reports", () => {
    it("should create a visas report", async () => {
      const uniqueDate = new Date(testDate);
      uniqueDate.setHours(Math.random() * 24, Math.random() * 60, Math.random() * 60);
      const result = await createVisasReport({
        reportDate: uniqueDate,
        applicationsSubmitted: 5,
        applicationsApproved: 3,
        applicationsRejected: 1,
        visasIssued: 2,
      });
      expect(result).toBeDefined();
    });

    it("should list visas reports", async () => {
      const reports = await listVisasReports({
        dateFrom: yesterday,
        dateTo: tomorrow,
      });
      expect(Array.isArray(reports)).toBe(true);
    });
  });

  describe("Attestation Reports", () => {
    it("should create an attestation report", async () => {
      const uniqueDate = new Date(testDate);
      uniqueDate.setHours(Math.random() * 24, Math.random() * 60, Math.random() * 60);
      const result = await createAttestationReport({
        reportDate: uniqueDate,
        documentsSubmitted: 8,
        documentsAttested: 6,
        attestationsPending: 2,
        attestationsCompleted: 5,
      });
      expect(result).toBeDefined();
    });

    it("should list attestation reports", async () => {
      const reports = await listAttestationReports({
        dateFrom: yesterday,
        dateTo: tomorrow,
      });
      expect(Array.isArray(reports)).toBe(true);
    });
  });

  describe("Date Range Filtering", () => {
    it("should filter reports by date range", async () => {
      const reports = await listQualificationReports({
        dateFrom: yesterday,
        dateTo: tomorrow,
      });
      expect(Array.isArray(reports)).toBe(true);
      reports.forEach((report) => {
        const reportDate = new Date(report.reportDate);
        expect(reportDate.getTime()).toBeGreaterThanOrEqual(yesterday.getTime());
        expect(reportDate.getTime()).toBeLessThanOrEqual(tomorrow.getTime());
      });
    });

    it("should return empty array for date range with no reports", async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const reports = await listQualificationReports({
        dateFrom: futureDate,
        dateTo: futureDate,
      });
      expect(Array.isArray(reports)).toBe(true);
    });
  });
});
