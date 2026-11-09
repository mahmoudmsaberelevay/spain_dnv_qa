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
    ])
      expect(text).toContain(visible);
    for (const hidden of [
      "private@example.com",
      "private-key",
      "private-value",
      "createdByUserId",
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
