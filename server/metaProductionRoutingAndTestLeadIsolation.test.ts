import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(projectRoot, relativePath), "utf8");

describe("Meta production routing and Test Lead isolation", () => {
  it("registers the exact production path before JSON parsing and the SPA fallback", () => {
    const indexSource = read("server/_core/index.ts");
    const adapterSource = read("server/metaAdsWebhook.ts");
    expect(adapterSource).toContain('"/api/webhooks/meta-leads-v2"');
    expect(indexSource.indexOf("registerMetaAdsWebhookRoutes(app)")).toBeGreaterThan(-1);
    expect(indexSource.indexOf("registerMetaAdsWebhookRoutes(app)")).toBeLessThan(indexSource.indexOf('app.use(express.json'));
    expect(indexSource.indexOf("registerMetaAdsWebhookRoutes(app)")).toBeLessThan(indexSource.indexOf("serveStatic(app)"));
  });

  it("persists explicit test markers and blocks test records from operational reporting", () => {
    const schemaSource = read("drizzle/schema.ts");
    const serviceSource = read("server/metaLeadsService.ts");
    const metaReportSource = read("server/routers/leadsSettings.ts");
    const leadReportSource = read("server/leadsDb.ts");

    expect(schemaSource).toContain('isMetaTestLead: boolean("isMetaTestLead")');
    expect(schemaSource.match(/isTestLead: boolean\("isTestLead"\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(serviceSource).toContain("classifyMetaTestLead");
    expect(serviceSource).toContain("Meta Test Lead event requires an explicit Meta Test Events code");
    expect(serviceSource).toContain("!repeatInquiry && !isTestLead");
    expect(metaReportSource).toContain("eq(metaCrmEventLog.isTestLead, false)");
    expect(metaReportSource).toContain("eq(metaWebhookInbox.isTestLead, false)");
    expect(metaReportSource).toContain("eq(leads.isMetaTestLead, false)");
    expect(leadReportSource).toContain("const operationalLeadCondition = eq(leads.isMetaTestLead, false)");
  });
});
