import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const project = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Meta Ads production router boundaries", () => {
  it("requires the owner or scoped Agentic Marketing administrator and exposes no ad-operation procedure", () => {
    const router = project("server/metaAdsProductionRouter.ts");
    expect(router).toMatch(
      /ADMIN_ROLES\s*=\s*new Set<EffectiveMarketingSystemRole>\(\[\s*"owner",\s*"marketing_system_admin",?\s*\]\)/m
    );
    expect(router).toContain("requireMarketingAdministrator");
    expect(router).toContain("requireReportViewer");
    expect(router).toContain("externalOperationsEnabled: false");
    expect(router).toMatch(
      /publicationStatus:\s*"locked_no_publish_campaign_ad_spend_or_release"/m
    );
    expect(router).not.toMatch(
      /\b(createCampaign|updateCampaign|deleteCampaign|publishAd|updateAd|createAd|setBudget)\b/
    );
  });

  it("persists an immutable content-hashed snapshot while exposing only an explicit read-only capture", () => {
    const router = project("server/metaAdsProductionRouter.ts");
    const page = project("client/src/pages/marketing/MetaAdsProduction.tsx");
    expect(router).toContain("reportHash: report.reportHash");
    expect(router).toContain("snapshotJson: JSON.stringify(report)");
    expect(router).toContain(
      "An identical immutable Meta Ads report snapshot already exists."
    );
    expect(page).toContain("captureReadOnlyReportAfterParentReview.useMutation");
    expect(page).toContain("Capture dated report (read-only)");
    expect(page).not.toMatch(
      /\b(Publish|Create campaign|Edit campaign|Adjust spend)\b/
    );
  });
});
