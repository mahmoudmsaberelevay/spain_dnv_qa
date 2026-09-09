import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { decodeProviderCoverUpload, providerCoverStorageKey } from "./clientPortalProviderMedia";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Client Portal provider cover photos", () => {
  it("accepts supported image content and creates non-enumerable provider keys", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const decoded = decodeProviderCoverUpload({ fileName: "provider-cover.jpg", mimeType: "image/jpeg", dataBase64: jpeg.toString("base64") });
    expect(decoded.buffer.equals(jpeg)).toBe(true);
    expect(decoded.extension).toBe("jpg");
    expect(providerCoverStorageKey("provider-id", decoded.extension)).toMatch(/^client-portal\/providers\/provider-id\/cover-[0-9a-f-]+\.jpg$/);
  });

  it("rejects mismatched image extensions and signatures", () => {
    const executable = Buffer.from("MZ-not-an-image");
    expect(() => decodeProviderCoverUpload({ fileName: "provider-cover.png", mimeType: "image/png", dataBase64: executable.toString("base64") })).toThrow("cover_photo_content_mismatch");
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    expect(() => decodeProviderCoverUpload({ fileName: "provider-cover.jpg", mimeType: "image/png", dataBase64: png.toString("base64") })).toThrow("cover_photo_extension_mismatch");
  });
});

describe("Client Portal provider and After Settlement Services integration", () => {
  it("keeps schema and migration additive for existing providers", () => {
    const schema = read("drizzle/schema.ts");
    const migration = read("drizzle/0071_client_portal_provider_services.sql");
    expect(schema).toContain('coverImageKey: varchar("coverImageKey"');
    expect(schema).toContain('coverImageUrl: varchar("coverImageUrl"');
    expect(schema).toContain('mysqlTable("public_after_settlement_services"');
    expect(migration).not.toMatch(/\bDROP\b/i);
    expect(migration).toContain("public_after_settlement_services_active_order_idx");
  });

  it("protects provider and service mutations with admin procedures and audit history", () => {
    const router = read("server/clientPortalAdminRouter.ts");
    expect(router).toContain("saveProvider: adminProcedure");
    expect(router).toContain("deleteProvider: adminProcedure");
    expect(router).toContain("saveAfterSettlementService: adminProcedure");
    expect(router).toContain("deleteAfterSettlementService: adminProcedure");
    expect(router).toContain("providerCoverStorageKey");
    expect(router).toContain('"delete", "public_service_provider"');
    expect(router).toContain('"delete", "public_after_settlement_service"');
  });

  it("shows explicit edit/delete controls, cover upload, and the new administration tab", () => {
    const page = read("client/src/pages/ClientPortalAdmin.tsx");
    expect(page).toContain('after_settlement: "After Settlement Services"');
    expect(page).toContain('type="file" accept="image/jpeg,image/png,image/webp"');
    expect(page).toContain("Edit</Button>");
    expect(page).toContain("Delete provider?");
    expect(page).toContain("AfterSettlementServiceEditor");
    expect(page).toContain("draft && (draft.publicId === provider?.publicId || (!provider?.publicId && !draft.publicId)) ? draft : provider");
    expect(page).toContain("draft && (draft.publicId === service?.publicId || (!service?.publicId && !draft.publicId)) ? draft : service");
    expect(page).not.toContain("data-after-settlement-editor-mounted");
  });

  it("publishes active service cards without exposing provider storage keys", () => {
    const content = read("server/publicContentService.ts");
    expect(content).toContain('app.get("/public-api/after-settlement-services"');
    expect(content).toContain("coverImageUrl: row.coverImageUrl");
    expect(content).toContain("eq(publicServiceProviders.isActive, true)");
    expect(content).not.toContain("coverImageKey: row.coverImageKey");
    expect(content).not.toContain("return res.json(row);");
  });

  it("keeps native Client Portal administration endpoints in parity", () => {
    const routes = read("server/clientPortalRoutes.ts");
    expect(routes).toContain('app.delete("/client-api/admin/providers/:publicId"');
    expect(routes).toContain('app.get("/client-api/admin/after-settlement-services"');
    expect(routes).toContain('app.post("/client-api/admin/after-settlement-services"');
    expect(routes).toContain('app.delete("/client-api/admin/after-settlement-services/:publicId"');
  });
});
