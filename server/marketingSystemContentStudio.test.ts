import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Marketing System Content Studio integration contract", () => {
  it("requires an approved creative work order, current Brand Book, and tracked approved claims before packet creation", () => {
    const router = read("server/marketingSystemRouter.ts");
    expect(router).toContain("requireApprovedCreativeWorkOrder(input.workOrderId, input.programKey)");
    expect(router).toContain("getApprovedContentClaims(input.claimIds, input.programKey)");
    expect(router).toContain("The source work order is not anchored to the current active Brand Book.");
    expect(router).toContain("Every packet claim must be included in the approved source work order.");
    expect(router).toContain("findDisallowedContentPacketData");
  });

  it("stores packet revision, QA, review and approval lineage additively without deleting previous content", () => {
    const migration = read("drizzle/0094_agentic_marketing_content_studio.sql");
    const router = read("server/marketingSystemRouter.ts");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_content_packets`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_content_review_events`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_content_approval_batches`");
    expect(migration).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE|ALTER|RENAME)\b/i);
    expect(router).toContain("revision_created");
    expect(router).toContain("status: \"superseded\"");
    expect(router).toContain("appendContentReviewEvent");
    expect(router).not.toContain("delete(marketingContentPackets)");
    expect(router).not.toContain("delete(marketingContentReviewEvents)");
  });

  it("requires all deterministic QA checks and a final-preview fingerprint before Approval Ready", () => {
    const router = read("server/marketingSystemRouter.ts");
    expect(router).toContain("Record exactly one QA result for every required check.");
    expect(router).toContain("validatePreviewFingerprint(packet.previewUrl, packet.previewHash)");
    expect(router).toContain("Every mandatory QA check must pass before an approval packet is created.");
    expect(router).toContain("approval_packet_ready");
  });

  it("keeps final approval owner-only, exceptional claims individual-only, and records batch confirmation", () => {
    const router = read("server/marketingSystemRouter.ts");
    expect(router).toContain("approveContentPacket");
    expect(router).toContain("await requireMarketingSystemAdministrator(ctx.user);");
    expect(router).toContain("approveContentBatch");
    expect(router).toContain("Packets marked with exceptional claims require an individual owner decision");
    expect(router).toContain("confirmedFullyReviewed: z.literal(true)");
    expect(router).toContain("owner_batch_approved");
  });

  it("wires the protected Content Studio route and preserves the no-execution boundary in the user interface", () => {
    const app = read("client/src/App.tsx");
    const dashboard = read("client/src/pages/marketing/MarketingDashboard.tsx");
    const mobile = read("client/src/components/MobileLayout.tsx");
    const page = read("client/src/pages/marketing/ContentStudio.tsx");
    expect(app).toContain('path="/marketing/content-studio"');
    expect(dashboard).toContain('href: "/marketing/content-studio"');
    expect(mobile).toContain('label: "Content Studio", path: "/marketing/content-studio"');
    expect(page).toContain("no model call, media render, publication, schedule, campaign activation, CAPI change, client message, or spend action");
    expect(page).toContain("Published</p><p className=\"mt-1 font-semibold text-emerald-200\">0");
  });
});
