import { describe, it, expect } from "vitest";
import { listFinancialSummaries, getFinancialSummary } from "./financialDb";
import { listAttestationClientRecords, getAttestationClientRecord } from "./attestationDb";
import { listVisaClientRecords, getVisaClientRecord } from "./visaDb";

describe("Reports DB Helpers - Return Value Fix", () => {
  describe("financialDb", () => {
    it("listFinancialSummaries returns an array (not a tuple)", async () => {
      const result = await listFinancialSummaries();
      expect(Array.isArray(result)).toBe(true);
      // Should not be a tuple [rows, fields]
      if (result.length > 0) {
        // Each item should have an 'id' field (not be an array itself)
        expect(typeof result[0]).toBe("object");
        expect(result[0]).toHaveProperty("id");
        expect(typeof result[0].id).toBe("number");
        expect(result[0]).toHaveProperty("summaryDate");
      }
    });

    it("getFinancialSummary returns a single record or null", async () => {
      const list = await listFinancialSummaries();
      if (list.length > 0) {
        const record = await getFinancialSummary(list[0].id);
        expect(record).not.toBeNull();
        expect(record).toHaveProperty("id");
        expect(record.id).toBe(list[0].id);
        expect(record).toHaveProperty("summaryDate");
      }
    });

    it("getFinancialSummary returns null for non-existent id", async () => {
      const record = await getFinancialSummary(999999);
      expect(record).toBeNull();
    });
  });

  describe("attestationDb", () => {
    it("listAttestationClientRecords returns an array (not a tuple)", async () => {
      const result = await listAttestationClientRecords();
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(typeof result[0]).toBe("object");
        expect(result[0]).toHaveProperty("id");
        expect(typeof result[0].id).toBe("number");
        expect(result[0]).toHaveProperty("recordDate");
      }
    });

    it("getAttestationClientRecord returns a single record or null", async () => {
      const list = await listAttestationClientRecords();
      if (list.length > 0) {
        const record = await getAttestationClientRecord(list[0].id);
        expect(record).not.toBeNull();
        expect(record).toHaveProperty("id");
        expect(record.id).toBe(list[0].id);
      }
    });

    it("getAttestationClientRecord returns null for non-existent id", async () => {
      const record = await getAttestationClientRecord(999999);
      expect(record).toBeNull();
    });
  });

  describe("visaDb", () => {
    it("listVisaClientRecords returns an array (not a tuple)", async () => {
      const result = await listVisaClientRecords();
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(typeof result[0]).toBe("object");
        expect(result[0]).toHaveProperty("id");
        expect(typeof result[0].id).toBe("number");
        expect(result[0]).toHaveProperty("recordDate");
      }
    });

    it("getVisaClientRecord returns a single record or null", async () => {
      const list = await listVisaClientRecords();
      if (list.length > 0) {
        const record = await getVisaClientRecord(list[0].id);
        expect(record).not.toBeNull();
        expect(record).toHaveProperty("id");
        expect(record.id).toBe(list[0].id);
      }
    });

    it("getVisaClientRecord returns null for non-existent id", async () => {
      const record = await getVisaClientRecord(999999);
      expect(record).toBeNull();
    });
  });

  describe("Date format validation", () => {
    it("financial summaryDate is a parseable date string", async () => {
      const result = await listFinancialSummaries();
      if (result.length > 0) {
        const dateStr = result[0].summaryDate;
        const date = new Date(dateStr);
        expect(isNaN(date.getTime())).toBe(false);
      }
    });

    it("attestation recordDate is a parseable date string", async () => {
      const result = await listAttestationClientRecords();
      if (result.length > 0) {
        const dateStr = result[0].recordDate;
        const date = new Date(dateStr);
        expect(isNaN(date.getTime())).toBe(false);
      }
    });

    it("visa recordDate is a parseable date string", async () => {
      const result = await listVisaClientRecords();
      if (result.length > 0) {
        const dateStr = result[0].recordDate;
        const date = new Date(dateStr);
        expect(isNaN(date.getTime())).toBe(false);
      }
    });
  });
});
