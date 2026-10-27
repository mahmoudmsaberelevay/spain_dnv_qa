import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0078_contract_source_payment_milestones.sql", import.meta.url), "utf8");
const service = readFileSync(new URL("./contractLeadService.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../client/src/components/NewContractDialog.tsx", import.meta.url), "utf8");
const contractsPage = readFileSync(new URL("../client/src/pages/Contracts.tsx", import.meta.url), "utf8");

describe("Contract source and signed Marketing Lead conversion", () => {
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

  it("links a Lead when a pending Contract is created but converts it only in the signed transition", () => {
    expect(service).toContain("Creates a pending contract and stores the verified Marketing Lead link only");
    expect(service).toContain("transitionContractStatusWithLeadConversion");
    expect(service).toContain('if (input.status !== "signed" || contract.clientOrigin !== "marketing" || !contract.marketingLeadId)');
    expect(service).toContain('stage: "client"');
    expect(service).toContain("marked Signed by");
    expect(router).toContain("transitionContractStatusWithLeadConversion");
    expect(router).toContain("const signedAt = new Date()");
    expect(router).toContain("signingDate: signedAt");
    expect(dialog).toContain("The Lead becomes a Client when this Contract is marked Signed.");
    expect(contractsPage).toContain("that Lead will become a Client now and its Financial Client record will be created");
  });

  it("enqueues the existing mapped Meta CRM client-stage event only after signed Lead conversion commits", () => {
    expect(service).toContain("if (result.leadStageChanged && result.linkedLeadId)");
    expect(service).toContain("enqueueMappedMetaCrmEvent");
    expect(service).toContain('mappingValue: "client"');
    expect(service).toContain('sourceType: "lead_stage"');
    expect(service).toContain("Meta CRM stage event enqueue failed");
  });

  it("does not let a receipt payment create a Financial Client before the linked Contract is signed", () => {
    expect(db).toContain('contract.status !== "signed"');
    expect(db).toContain('throw new Error("INVOICE_CONTRACT_NOT_SIGNED")');
    expect(router).toContain('message === "INVOICE_CONTRACT_NOT_SIGNED"');
    expect(router).toContain("Mark the linked Contract as Signed before recording a receipt payment.");
  });
});
