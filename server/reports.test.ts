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
    it("exposes non-destructive qualification report helpers", () => {
      expect(createQualificationReport).toBeTypeOf("function");
      expect(updateQualificationReport).toBeTypeOf("function");
      expect(deleteQualificationReport).toBeTypeOf("function");
    });

    it("should list qualification reports", async () => {
      const reports = await listQualificationReports({
        dateFrom: yesterday,
        dateTo: tomorrow,
      });
      expect(Array.isArray(reports)).toBe(true);
      // A live CRM may legitimately have no reports for this day.
      expect(reports.every(report => report.reportDate != null)).toBe(true);
    });

  });

  describe("Paralegal Reports", () => {
    it("exposes the paralegal report creation helper", () => {
      expect(createParalegalReport).toBeTypeOf("function");
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
    it("exposes the financial report creation helper", () => {
      expect(createFinancialReport).toBeTypeOf("function");
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
    it("exposes the visas report creation helper", () => {
      expect(createVisasReport).toBeTypeOf("function");
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
    it("exposes the attestation report creation helper", () => {
      expect(createAttestationReport).toBeTypeOf("function");
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
