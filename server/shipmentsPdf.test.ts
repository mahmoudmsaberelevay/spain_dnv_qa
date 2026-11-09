import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PDFParse } from "pdf-parse";
import { createShipmentsPdf } from "../client/src/lib/shipmentsPdf";
import {
  EMPTY_SHIPMENT_FILTERS,
  shipmentEntrySchema,
  shipmentFiltersSchema,
  safeShipmentIssuer,
  type ShipmentReport,
} from "../shared/shipments";
const row = {
  id: 1,
  shipmentDate: "2026-11-09",
  companyName: "Courier Example",
  shipmentNumber: "TRACK-2026-001",
  direction: "from" as const,
  partyName: "Sample sender",
  driveUrl: "https://drive.google.com/file/d/synthetic-document/view",
  recordedByName: "Manual record-maker",
  notificationEmail: "shipment@example.test",
  notificationStatus: "sent" as const,
  notificationSentAt: new Date("2026-11-09T08:01:00Z"),
  createdAt: new Date("2026-11-09T08:00:00Z"),
};
const report = (): ShipmentReport => ({
  rows: [row],
  filters: EMPTY_SHIPMENT_FILTERS,
  generatedAt: new Date("2026-11-09T10:00:00Z"),
  generatedBy: "Sample issuer",
});
describe("Shipment entry, report and PDF safety", () => {
  it("validates real calendar dates and HTTPS Google Drive links only", () => {
    expect(shipmentEntrySchema.safeParse(row).success).toBe(true);
    for (const date of ["2026-02-29", "2026-11-31", "2026-13-01", "09/11/2026"])
      expect(
        shipmentEntrySchema.safeParse({ ...row, shipmentDate: date }).success
      ).toBe(false);
    expect(
      shipmentEntrySchema.safeParse({ ...row, shipmentDate: "2028-02-29" })
        .success
    ).toBe(true);
    for (const link of [
      "javascript:alert(1)",
      "http://drive.google.com/file/a",
      "https://drive.google.com.evil.test/a",
      "https://person:password@drive.google.com/a",
      "https://evil.test/a",
    ])
      expect(
        shipmentEntrySchema.safeParse({ ...row, driveUrl: link }).success
      ).toBe(false);
    expect(
      shipmentFiltersSchema.safeParse({
        ...EMPTY_SHIPMENT_FILTERS,
        from: "2026-11-10",
        to: "2026-11-09",
      }).success
    ).toBe(false);
  });
  it("exports all shipment fields, links and issuer without raw private fields", async () => {
    const pdf = await createShipmentsPdf({
      ...report(),
      shipmentId: 1,
      generatedBy: "Sample issuer private@example.com",
      rows: [
        {
          ...row,
          createdByUserId: 42,
          requestKey: "private-key",
          privateNote: "private-value",
          notificationError: "private-provider-error",
          notificationRecipients: "private-recipient@example.test",
        } as any,
      ],
    });
    const parser = new PDFParse({
      data: new Uint8Array(pdf.output("arraybuffer")),
    });
    const text = (await parser.getText()).text;
    await parser.destroy();
    expect(pdf.output()).toContain(row.driveUrl);
    for (const visible of [
      "Courier Example",
      "TRACK-2026-001",
      "Shipment from",
      "Sample sender",
      "09/11/2026",
      "Sample issuer",
      "Manual record-maker",
      "shipment@example.test",
      "Notification status",
      "Sent",
      "Notification sent at",
      "Africa/Cairo",
      "Issued by (report issuer)",
      "Recorded by (record-maker)",
    ])
      expect(text).toContain(visible);
    for (const hidden of [
      "private@example.com",
      "private-key",
      "private-value",
      "createdByUserId",
      "private-provider-error",
      "private-recipient@example.test",
    ])
      expect(text).not.toContain(hidden);
    expect(safeShipmentIssuer("private@example.com")).toBe(
      "ELEVAY team member"
    );
  });
  it("paginates full filtered selection and repeats column headings", async () => {
    const rows = Array.from({ length: 90 }, (_, i) => ({
      ...row,
      id: i + 1,
      shipmentNumber: `TRACK-${i + 1}`,
    }));
    const pdf = await createShipmentsPdf({
      ...report(),
      rows,
      filters: {
        ...EMPTY_SHIPMENT_FILTERS,
        from: "2026-11-09",
        to: "2026-11-09",
      },
    });
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    const parser = new PDFParse({
      data: new Uint8Array(pdf.output("arraybuffer")),
    });
    const text = (await parser.getText()).text;
    await parser.destroy();
    expect(text).toContain("TRACK-90");
    expect(text.match(/Company name/g)?.length).toBeGreaterThan(1);
    expect(text).toContain("inclusive");
    expect(text).toContain("Recorded by:");
    expect(text).toContain("Manual record-maker");
    expect(text).toContain("Notification email:");
    expect(text).toContain("shipment@example.test");
    expect(text).toContain("Notification status: Sent");
    expect(text).toContain("Notification sent at:");
    expect(pdf.output()).toContain(row.driveUrl);
  });
  it.each([undefined, null])(
    "exports legacy rows with %s recorder/email as Not recorded",
    async missing => {
      const legacyRow = {
        ...row,
        recordedByName: missing,
        notificationEmail: missing,
        notificationStatus: undefined,
        notificationSentAt: missing,
      };
      for (const shipmentId of [1, undefined]) {
        const pdf = await createShipmentsPdf({
          ...report(),
          shipmentId,
          rows: [legacyRow],
        });
        const parser = new PDFParse({
          data: new Uint8Array(pdf.output("arraybuffer")),
        });
        const text = (await parser.getText()).text;
        await parser.destroy();
        expect(text.match(/Not recorded/g)?.length).toBe(4);
        expect(text).toContain("Sample issuer");
        expect(text).not.toContain("undefined");
        expect(text).not.toContain("null");
        expect(pdf.output()).toContain(row.driveUrl);
      }
    }
  );
  it.each([
    ["failed", "Failed"],
    ["unknown", "Unknown"],
    ["sending", "Sending"],
    ["not_requested", "Not requested"],
  ] as const)(
    "shows %s notification status without claiming sent",
    async (status, label) => {
      const pdf = await createShipmentsPdf({
        ...report(),
        shipmentId: 1,
        rows: [
          { ...row, notificationStatus: status, notificationSentAt: null },
        ],
      });
      const parser = new PDFParse({
        data: new Uint8Array(pdf.output("arraybuffer")),
      });
      const text = (await parser.getText()).text;
      await parser.destroy();
      expect(text).toContain(label);
      expect(text).toContain("Not recorded");
      expect(text).not.toMatch(/\bSent\b/);
    }
  );
  it("does not silently misrender Arabic manual record-makers outside a browser", async () => {
    await expect(
      createShipmentsPdf({
        ...report(),
        rows: [{ ...row, recordedByName: "صانع السجل" }],
      })
    ).rejects.toThrow("Arabic shipment text requires browser rendering");
  });
  it("rejects unsafe or invalid new report fields but does not require them for legacy rows", async () => {
    for (const fields of [
      { recordedByName: "a".repeat(201) },
      { notificationEmail: "Maker <maker@example.test>" },
      { notificationEmail: "a@example.test,b@example.test" },
      { notificationSentAt: "not-a-date" },
    ]) {
      await expect(
        createShipmentsPdf({ ...report(), rows: [{ ...row, ...fields }] })
      ).rejects.toThrow();
    }
  });
  it("rejects empty, mismatched or silently over-limit exports", async () => {
    await expect(createShipmentsPdf({ ...report(), rows: [] })).rejects.toThrow(
      "No shipments"
    );
    await expect(
      createShipmentsPdf({ ...report(), shipmentId: 2 })
    ).rejects.toThrow("selection mismatch");
    await expect(
      createShipmentsPdf({
        ...report(),
        filters: { ...EMPTY_SHIPMENT_FILTERS, from: "2026-11-10" },
      })
    ).rejects.toThrow("date coverage mismatch");
    await expect(
      createShipmentsPdf({ ...report(), generatedAt: "invalid" })
    ).rejects.toThrow("issuance time");
    await expect(
      createShipmentsPdf({
        ...report(),
        rows: Array.from({ length: 5001 }, () => row),
      })
    ).rejects.toThrow("5,000");
  });
  it("never fetches or uploads private document scans and supports Arabic canvas", () => {
    const source = readFileSync("client/src/lib/shipmentsPdf.ts", "utf8");
    expect(source).not.toMatch(/fetch\(|storagePut\(|https:\/\/api/);
    expect(source).toContain('getContext("2d")');
    expect(source).toContain("pdf.link");
  });
});
describe("Shipment single-page module navigation", () => {
  it("registers one authenticated-shell route without a new permission guard", () => {
    const app = readFileSync("client/src/App.tsx", "utf8");
    expect(app).toMatch(
      /<Route path="\/shipments">\s*<MobileRoute><Shipments \/><\/MobileRoute>\s*<\/Route>/
    );
  });
  it("appears in desktop/mobile sidebar and both Home grids", () => {
    for (const path of [
      "client/src/components/DashboardLayout.tsx",
      "client/src/components/MobileLayout.tsx",
      "client/src/pages/ElevayHome.tsx",
      "client/src/pages/MobileHome.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain('path: "/shipments"');
      expect(source).toContain('label: "Shipment"');
    }
  });
});
