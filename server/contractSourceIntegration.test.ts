import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0078_contract_source_payment_milestones.sql", import.meta.url), "utf8");
const service = readFileSync(new URL("./contractLeadService.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../client/src/components/NewContractDialog.tsx", import.meta.url), "utf8");

describe("Contract client source and Marketing Lead conversion", () => {
  it("adds only nullable legacy-safe Contract source fields", () => {
    expect(schema).toContain('clientOrigin: mysqlEnum("clientOrigin", ["referral", "marketing"])');
    expect(schema).toContain('marketingLeadId: int("marketingLeadId")');
    expect(migration).toContain("ADD COLUMN `clientOrigin` ENUM('referral','marketing') NULL");
    expect(migration).toContain("ADD COLUMN `marketingLeadId` INT NULL");
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });

  it("requires an explicit Referral or Marketing answer and conditionally shows Lead ID", () => {
    expect(dialog).toContain("Is this client Referral or from Marketing?");
    expect(dialog).toContain('<SelectItem value="referral">Referral</SelectItem>');
    expect(dialog).toContain('<SelectItem value="marketing">Marketing</SelectItem>');
    expect(dialog).toContain('clientOrigin === "marketing"');
    expect(dialog).toContain("Lead Number ID");
  });

  it("previews the exact Lead and blocks a Lead already linked to an active Contract", () => {
    expect(router).toContain("getMarketingLead: protectedProcedure");
    expect(service).toContain("getMarketingLeadForContract");
    expect(service).toContain('ne(contracts.status, "cancelled")');
    expect(dialog).toContain("Already linked to active Contract");
    expect(router).toContain("This Lead is already linked to active Contract");
  });

  it("creates the Contract and Lead stage history in one database transaction", () => {
    expect(service).toContain("db.transaction(async tx =>");
    expect(service).toContain("await tx.insert(contracts).values");
    expect(service).toContain('stage: "client"');
    expect(service).toContain("await tx.insert(leadActivities).values");
    expect(service).toContain('activityType: "stage_changed"');
  });

  it("enqueues the existing mapped Meta CRM client-stage event after the database commit", () => {
    expect(service).toContain("enqueueMappedMetaCrmEvent");
    expect(service).toContain('mappingValue: "client"');
    expect(service).toContain('sourceType: "lead_stage"');
    expect(service).toContain("Meta CRM stage event enqueue failed");
  });
});
