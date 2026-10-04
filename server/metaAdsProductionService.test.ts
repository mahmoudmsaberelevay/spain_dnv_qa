import { describe, expect, it, vi } from "vitest";
import {
  META_ADS_PRODUCTION_ACCOUNT_ID,
  captureMetaAdsProductionReport,
  completedSevenDayWindow,
  immutableReportHash,
  normalizeConfiguredMetaAdsAccountId,
  redactPossiblyPersonalText,
} from "./metaAdsProductionService";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function readParam(input: string | URL, name: string) {
  return new URL(
    typeof input === "string" ? input : input.toString()
  ).searchParams.get(name);
}

describe("Meta Ads production read-only reporting", () => {
  it("pins configuration to the one approved EGP account and never accepts the other account", () => {
    expect(normalizeConfiguredMetaAdsAccountId("548667060148825")).toBe(
      META_ADS_PRODUCTION_ACCOUNT_ID
    );
    expect(
      normalizeConfiguredMetaAdsAccountId(META_ADS_PRODUCTION_ACCOUNT_ID)
    ).toBe(META_ADS_PRODUCTION_ACCOUNT_ID);
    expect(() =>
      normalizeConfiguredMetaAdsAccountId("793250733371159")
    ).toThrow("approved EGP Meta Ads account");
  });

  it("uses seven completed UTC calendar days, excluding the partial current day", () => {
    expect(
      completedSevenDayWindow(new Date("2026-10-04T12:00:00.000Z"))
    ).toEqual({
      dateStart: "2026-09-27",
      dateStop: "2026-10-03",
    });
  });

  it("captures only GET data for the approved account and builds deterministic evidence-led review records", async () => {
    const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      expect(init?.method).toBe("GET");
      expect(url.hostname).toBe("graph.facebook.com");
      expect(url.pathname).toContain(META_ADS_PRODUCTION_ACCOUNT_ID);
      expect(url.pathname).not.toContain("act_793250733371159");
      if (url.pathname.endsWith(`/${META_ADS_PRODUCTION_ACCOUNT_ID}`)) {
        return jsonResponse({
          id: META_ADS_PRODUCTION_ACCOUNT_ID,
          name: "ELEVAY EGP",
          account_status: 1,
          currency: "EGP",
        });
      }
      if (url.pathname.endsWith("/campaigns")) {
        return jsonResponse({
          data: [
            {
              id: "campaign-1",
              name: "Spain lead campaign",
              status: "PAUSED",
              effective_status: "PAUSED",
            },
          ],
        });
      }
      if (
        url.pathname.endsWith("/insights") &&
        readParam(input, "level") === "campaign"
      ) {
        return jsonResponse({
          data: [
            {
              campaign_id: "campaign-1",
              campaign_name: "Spain lead campaign",
              spend: "125.50",
              impressions: "1200",
              clicks: "45",
              actions: [
                { action_type: "lead", value: "2" },
                { action_type: "link_click", value: "20" },
              ],
            },
          ],
        });
      }
      if (
        url.pathname.endsWith("/insights") &&
        readParam(input, "level") === "ad"
      ) {
        return jsonResponse({
          data: [
            {
              campaign_id: "campaign-1",
              campaign_name: "Spain lead campaign",
              ad_id: "ad-1",
              ad_name: "Interest creative",
              spend: "125.50",
              impressions: "1200",
              clicks: "45",
              actions: [{ action_type: "lead", value: "2" }],
            },
          ],
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const report = await captureMetaAdsProductionReport({
      fetcher,
      now: new Date("2026-10-04T12:00:00.000Z"),
      configuredAdAccountId: "548667060148825",
      systemUserAccessToken: "test-token-not-persisted",
    });

    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(report.source).toMatchObject({
      adAccountId: META_ADS_PRODUCTION_ACCOUNT_ID,
      currency: "EGP",
      graphVersion: "v26.0",
    });
    expect(report.window).toEqual({
      dateStart: "2026-09-27",
      dateStop: "2026-10-03",
    });
    expect(report.summary).toMatchObject({
      amountSpent: 125.5,
      impressions: 1200,
      clicksAll: 45,
      metaLeadActions: 2,
    });
    expect(report.campaigns[0]).toMatchObject({
      configuredStatus: "PAUSED",
      effectiveStatus: "PAUSED",
    });
    expect(report.ads[0]).toMatchObject({
      adId: "ad-1",
      campaignEffectiveStatus: "PAUSED",
    });
    expect(report.attributionNotice).toContain("not CRM leads");
    expect(report.publicationStatus).toBe(
      "locked_no_publish_campaign_ad_spend_or_release"
    );
    expect(report.draftProposals).toEqual([]);
    expect(JSON.stringify(report)).not.toContain("test-token-not-persisted");
    expect(JSON.stringify(report)).not.toContain("act_793250733371159");
  });

  it("rejects a non-EGP account response before retrieving campaign or ad data", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ id: META_ADS_PRODUCTION_ACCOUNT_ID, currency: "INR" })
    );
    await expect(
      captureMetaAdsProductionReport({
        fetcher,
        configuredAdAccountId: "548667060148825",
        systemUserAccessToken: "test-token",
      })
    ).rejects.toThrow("currency other than EGP");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("redacts accidental email and telephone-like text and keeps report hashing stable", () => {
    expect(
      redactPossiblyPersonalText(
        "Campaign manager@example.com +20 100 123 4567",
        "fallback"
      )
    ).toBe("Campaign [redacted email] [redacted number]");
    const snapshot = {
      schemaVersion: 1 as const,
      source: {
        adAccountId: META_ADS_PRODUCTION_ACCOUNT_ID,
        currency: "EGP" as const,
        accountName: "ELEVAY",
        accountStatus: "1",
        graphVersion: "v26.0" as const,
      },
      window: { dateStart: "2026-09-27", dateStop: "2026-10-03" },
      reportRunAt: 1,
      retrieval: {
        method: "GET" as const,
        boundedPagesPerEndpoint: 5 as const,
        liveCapture: true as const,
      },
      summary: {
        amountSpent: 0,
        impressions: 0,
        clicksAll: 0,
        metaLeadActions: 0,
        metaLeadActionBreakdown: [],
      },
      campaigns: [],
      ads: [],
      findings: [],
      draftProposals: [],
      attributionNotice: "notice",
      publicationStatus:
        "locked_no_publish_campaign_ad_spend_or_release" as const,
    };
    expect(immutableReportHash(snapshot)).toBe(
      immutableReportHash({ ...snapshot, source: { ...snapshot.source } })
    );
  });
});
