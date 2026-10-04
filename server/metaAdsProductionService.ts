import crypto from "node:crypto";

/**
 * Read-only Meta Ads reporting is deliberately pinned to the approved ELEVAY EGP
 * account. This service does not accept an account ID as caller input.
 */
export const META_ADS_PRODUCTION_ACCOUNT_ID = "act_548667060148825";
export const META_ADS_PRODUCTION_CURRENCY = "EGP";
export const META_ADS_GRAPH_VERSION = "v26.0";
export const META_ADS_MAX_PAGES_PER_ENDPOINT = 5;
export const META_ADS_PAGE_LIMIT = 100;

export type CompletedSevenDayWindow = {
  dateStart: string;
  dateStop: string;
};

type MetaAction = { action_type?: unknown; value?: unknown };
type MetaInsight = {
  campaign_id?: unknown;
  campaign_name?: unknown;
  ad_id?: unknown;
  ad_name?: unknown;
  spend?: unknown;
  impressions?: unknown;
  clicks?: unknown;
  actions?: unknown;
};
type MetaCampaign = {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  effective_status?: unknown;
};
type MetaPage<T> = {
  data?: T[];
  paging?: { cursors?: { after?: unknown } };
  error?: { message?: unknown; code?: unknown };
};

type MetaAccount = {
  id?: unknown;
  name?: unknown;
  account_status?: unknown;
  currency?: unknown;
  error?: { message?: unknown; code?: unknown };
};

export type ReadOnlyMetaFetch = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

export type MetaAdsReportMetric = {
  amountSpent: number;
  impressions: number;
  clicksAll: number;
  metaLeadActions: number;
  metaLeadActionBreakdown: Array<{ actionType: string; value: number }>;
};

export type MetaAdsCampaignReport = MetaAdsReportMetric & {
  campaignId: string;
  campaignName: string;
  configuredStatus: string | null;
  effectiveStatus: string | null;
};

export type MetaAdsAdReport = MetaAdsReportMetric & {
  campaignId: string;
  campaignName: string;
  adId: string;
  adName: string;
  campaignConfiguredStatus: string | null;
  campaignEffectiveStatus: string | null;
};

export type MetaAdsFinding = {
  severity: "info" | "attention";
  title: string;
  evidence: string;
  observation: string;
  suggestedReview: string;
};

export type MetaAdsDraftProposal = {
  proposalKey: string;
  title: string;
  status: "draft_for_human_review";
  evidence: string;
  hypothesis: string;
  settingsDisplay: {
    campaignId: string;
    campaignName: string;
    configuredStatus: string | null;
    effectiveStatus: string | null;
  };
  mediaReview: {
    status: "not_requested";
    note: string;
  };
  publicationStatus: "locked_no_publish_or_ad_edit";
};

export type MetaAdsProductionReport = {
  schemaVersion: 1;
  reportKey: string;
  reportHash: string;
  source: {
    adAccountId: typeof META_ADS_PRODUCTION_ACCOUNT_ID;
    currency: typeof META_ADS_PRODUCTION_CURRENCY;
    accountName: string;
    accountStatus: string | null;
    graphVersion: typeof META_ADS_GRAPH_VERSION;
  };
  window: CompletedSevenDayWindow;
  reportRunAt: number;
  retrieval: {
    method: "GET";
    boundedPagesPerEndpoint: typeof META_ADS_MAX_PAGES_PER_ENDPOINT;
    liveCapture: true;
  };
  summary: MetaAdsReportMetric;
  campaigns: MetaAdsCampaignReport[];
  ads: MetaAdsAdReport[];
  findings: MetaAdsFinding[];
  draftProposals: MetaAdsDraftProposal[];
  attributionNotice: string;
  publicationStatus: "locked_no_publish_campaign_ad_spend_or_release";
};

function asText(value: unknown, fallback = "Data not available"): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toNonNegativeNumber(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toNonNegativeInteger(value: unknown): number {
  return Math.floor(toNonNegativeNumber(value));
}

/** Redacts the two common accidental PII patterns from externally controlled labels. */
export function redactPossiblyPersonalText(
  value: unknown,
  fallback: string
): string {
  return asText(value, fallback)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
    .replace(/(?:\+?\d[\d().\s-]{6,}\d)/g, "[redacted number]")
    .slice(0, 300);
}

export function normalizeConfiguredMetaAdsAccountId(
  value: string | undefined
): typeof META_ADS_PRODUCTION_ACCOUNT_ID {
  const normalized = (value ?? "").trim().replace(/^act_/i, "");
  const expected = META_ADS_PRODUCTION_ACCOUNT_ID.slice(4);
  if (normalized !== expected) {
    throw new Error(
      "META_AD_ACCOUNT_ID must match the approved EGP Meta Ads account."
    );
  }
  return META_ADS_PRODUCTION_ACCOUNT_ID;
}

/** Uses seven completed UTC calendar days so the report never includes a partial current day. */
export function completedSevenDayWindow(
  now = new Date()
): CompletedSevenDayWindow {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
  );
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 6);
  const format = (value: Date) => value.toISOString().slice(0, 10);
  return { dateStart: format(start), dateStop: format(end) };
}

function leadActionBreakdown(
  actions: unknown
): Array<{ actionType: string; value: number }> {
  if (!Array.isArray(actions)) return [];
  const totals = new Map<string, number>();
  for (const action of actions as MetaAction[]) {
    const actionType =
      typeof action.action_type === "string" ? action.action_type : "";
    if (!/(^|[._])lead(?:$|[._])|^lead$/i.test(actionType)) continue;
    const value = toNonNegativeInteger(action.value);
    if (value <= 0) continue;
    totals.set(actionType, (totals.get(actionType) ?? 0) + value);
  }
  return Array.from(totals.entries())
    .map(([actionType, value]) => ({ actionType, value }))
    .sort((left, right) => left.actionType.localeCompare(right.actionType));
}

export function metricFromInsight(insight: MetaInsight): MetaAdsReportMetric {
  const metaLeadActionBreakdown = leadActionBreakdown(insight.actions);
  return {
    amountSpent: toNonNegativeNumber(insight.spend),
    impressions: toNonNegativeInteger(insight.impressions),
    clicksAll: toNonNegativeInteger(insight.clicks),
    metaLeadActions: metaLeadActionBreakdown.reduce(
      (total, action) => total + action.value,
      0
    ),
    metaLeadActionBreakdown,
  };
}

function aggregateMetrics(rows: MetaAdsReportMetric[]): MetaAdsReportMetric {
  const actionTotals = new Map<string, number>();
  for (const row of rows) {
    for (const action of row.metaLeadActionBreakdown) {
      actionTotals.set(
        action.actionType,
        (actionTotals.get(action.actionType) ?? 0) + action.value
      );
    }
  }
  const metaLeadActionBreakdown = Array.from(actionTotals.entries())
    .map(([actionType, value]) => ({ actionType, value }))
    .sort((left, right) => left.actionType.localeCompare(right.actionType));
  return {
    amountSpent: rows.reduce((total, row) => total + row.amountSpent, 0),
    impressions: rows.reduce((total, row) => total + row.impressions, 0),
    clicksAll: rows.reduce((total, row) => total + row.clicksAll, 0),
    metaLeadActions: metaLeadActionBreakdown.reduce(
      (total, action) => total + action.value,
      0
    ),
    metaLeadActionBreakdown,
  };
}

function statusForCampaign(
  campaignId: string,
  statusById: Map<string, MetaCampaign>
) {
  const campaign = statusById.get(campaignId);
  return {
    configuredStatus: campaign
      ? asText(campaign.status, "Data not available")
      : null,
    effectiveStatus: campaign
      ? asText(campaign.effective_status, "Data not available")
      : null,
  };
}

function buildFindings(
  summary: MetaAdsReportMetric,
  campaigns: MetaAdsCampaignReport[]
): MetaAdsFinding[] {
  const evidence = `Amount spent: EGP ${summary.amountSpent.toFixed(2)}; Impressions: ${summary.impressions.toLocaleString("en-US")}; Clicks (all): ${summary.clicksAll.toLocaleString("en-US")}; Meta lead actions: ${summary.metaLeadActions.toLocaleString("en-US")}.`;
  const findings: MetaAdsFinding[] = [
    {
      severity: "info",
      title: "Completed reporting window captured",
      evidence,
      observation:
        "The snapshot covers seven completed UTC calendar days and is an immutable reporting record.",
      suggestedReview:
        "Use this source-account snapshot alongside separately reconciled CRM reporting before making any business decision.",
    },
  ];

  if (
    summary.amountSpent === 0 &&
    summary.impressions === 0 &&
    summary.clicksAll === 0 &&
    summary.metaLeadActions === 0
  ) {
    findings.push({
      severity: "info",
      title: "No delivery metrics returned",
      evidence,
      observation:
        "No Amount spent, Impressions, Clicks (all), or Meta lead actions were returned for this completed window.",
      suggestedReview:
        "Confirm date range, account delivery history, and reporting availability in Ads Manager. No operating change is proposed.",
    });
  }

  if (summary.amountSpent > 0 && summary.metaLeadActions === 0) {
    findings.push({
      severity: "attention",
      title: "Spend without a Meta lead action in the captured window",
      evidence,
      observation:
        "The source returned Amount spent but no Meta lead actions for the same completed window.",
      suggestedReview:
        "Review measurement, destination or form configuration and attribution settings before considering any human-approved test. This is a hypothesis, not a recommendation to change, pause, or adjust spend.",
    });
  }

  for (const campaign of campaigns
    .filter(row => row.effectiveStatus && row.effectiveStatus !== "ACTIVE")
    .slice(0, 10)) {
    findings.push({
      severity: "info",
      title: `Campaign status requires context: ${campaign.campaignName}`,
      evidence: `Configured status: ${campaign.configuredStatus ?? "Data not available"}; effective status: ${campaign.effectiveStatus ?? "Data not available"}.`,
      observation:
        "The status is reported as returned by Meta; the snapshot does not infer cause or performance impact.",
      suggestedReview:
        "Confirm the current delivery context in Ads Manager before drafting any future human-reviewed plan. No campaign state is changed by this report.",
    });
  }

  return findings;
}

function buildDraftProposals(
  campaigns: MetaAdsCampaignReport[]
): MetaAdsDraftProposal[] {
  return campaigns
    .filter(
      campaign => campaign.amountSpent > 0 && campaign.metaLeadActions === 0
    )
    .slice(0, 5)
    .map(campaign => ({
      proposalKey: `review-${campaign.campaignId}`,
      title: `Review-only measurement and creative brief: ${campaign.campaignName}`,
      status: "draft_for_human_review",
      evidence: `Amount spent: EGP ${campaign.amountSpent.toFixed(2)}; Impressions: ${campaign.impressions.toLocaleString("en-US")}; Clicks (all): ${campaign.clicksAll.toLocaleString("en-US")}; Meta lead actions: ${campaign.metaLeadActions.toLocaleString("en-US")}.`,
      hypothesis:
        "A human reviewer may verify destination, form, tracking, creative and delivery context before deciding whether any separately governed test is warranted. The snapshot makes no efficacy claim.",
      settingsDisplay: {
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        configuredStatus: campaign.configuredStatus,
        effectiveStatus: campaign.effectiveStatus,
      },
      mediaReview: {
        status: "not_requested",
        note: "No media asset was fetched, stored, generated, reviewed, or approved by this reporting foundation.",
      },
      publicationStatus: "locked_no_publish_or_ad_edit",
    }));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)])
    );
  }
  return value;
}

export function immutableReportHash(
  report: Omit<MetaAdsProductionReport, "reportKey" | "reportHash">
): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(report)))
    .digest("hex");
}

function reportKey(reportRunAt: number, reportHash: string): string {
  return `meta-ads-ro-${reportRunAt.toString(36)}-${reportHash.slice(0, 16)}`;
}

function makeUrl(path: string, params: Record<string, string>): URL {
  const url = new URL(
    `https://graph.facebook.com/${META_ADS_GRAPH_VERSION}/${path}`
  );
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  return url;
}

async function graphGet<T>(
  fetcher: ReadOnlyMetaFetch,
  path: string,
  token: string,
  params: Record<string, string>
): Promise<T> {
  const response = await fetcher(makeUrl(path, params), {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const payload = (await response.json()) as T & {
    error?: { message?: unknown; code?: unknown };
  };
  if (!response.ok || payload.error) {
    const message =
      typeof payload.error?.message === "string"
        ? payload.error.message
        : "request failed";
    throw new Error(
      `Meta Graph read-only request failed (${response.status}): ${message}`
    );
  }
  return payload;
}

async function boundedPages<T>(input: {
  fetcher: ReadOnlyMetaFetch;
  path: string;
  token: string;
  params: Record<string, string>;
}): Promise<T[]> {
  const rows: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < META_ADS_MAX_PAGES_PER_ENDPOINT; page += 1) {
    const payload = await graphGet<MetaPage<T>>(
      input.fetcher,
      input.path,
      input.token,
      {
        ...input.params,
        limit: String(META_ADS_PAGE_LIMIT),
        ...(after ? { after } : {}),
      }
    );
    rows.push(...(Array.isArray(payload.data) ? payload.data : []));
    const nextAfter = payload.paging?.cursors?.after;
    after = typeof nextAfter === "string" && nextAfter ? nextAfter : undefined;
    if (!after) break;
  }
  return rows;
}

export async function captureMetaAdsProductionReport(
  input: {
    fetcher?: ReadOnlyMetaFetch;
    now?: Date;
    systemUserAccessToken?: string;
    configuredAdAccountId?: string;
  } = {}
): Promise<MetaAdsProductionReport> {
  const configuredAccount = normalizeConfiguredMetaAdsAccountId(
    input.configuredAdAccountId ?? process.env.META_AD_ACCOUNT_ID
  );
  const token =
    input.systemUserAccessToken ?? process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  if (!token)
    throw new Error("META_SYSTEM_USER_ACCESS_TOKEN is not configured.");
  const fetcher = input.fetcher ?? fetch;
  const window = completedSevenDayWindow(input.now);
  const timeRange = JSON.stringify({
    since: window.dateStart,
    until: window.dateStop,
  });

  const account = await graphGet<MetaAccount>(
    fetcher,
    configuredAccount,
    token,
    {
      fields: "id,name,account_status,currency",
    }
  );
  if (asText(account.id, "") !== META_ADS_PRODUCTION_ACCOUNT_ID) {
    throw new Error(
      "Meta returned an account other than the approved EGP account."
    );
  }
  if (asText(account.currency, "") !== META_ADS_PRODUCTION_CURRENCY) {
    throw new Error(
      "Meta returned a currency other than EGP for the approved account."
    );
  }

  const [campaignStatuses, campaignInsights, adInsights] = await Promise.all([
    boundedPages<MetaCampaign>({
      fetcher,
      path: `${META_ADS_PRODUCTION_ACCOUNT_ID}/campaigns`,
      token,
      params: { fields: "id,name,status,effective_status" },
    }),
    boundedPages<MetaInsight>({
      fetcher,
      path: `${META_ADS_PRODUCTION_ACCOUNT_ID}/insights`,
      token,
      params: {
        level: "campaign",
        time_range: timeRange,
        fields: "campaign_id,campaign_name,spend,impressions,clicks,actions",
      },
    }),
    boundedPages<MetaInsight>({
      fetcher,
      path: `${META_ADS_PRODUCTION_ACCOUNT_ID}/insights`,
      token,
      params: {
        level: "ad",
        time_range: timeRange,
        fields:
          "campaign_id,campaign_name,ad_id,ad_name,spend,impressions,clicks,actions",
      },
    }),
  ]);

  const statusByCampaignId = new Map(
    campaignStatuses
      .filter(campaign => typeof campaign.id === "string" && campaign.id)
      .map(campaign => [campaign.id as string, campaign])
  );
  const campaigns = campaignInsights
    .filter(
      insight => typeof insight.campaign_id === "string" && insight.campaign_id
    )
    .map(insight => {
      const campaignId = insight.campaign_id as string;
      return {
        campaignId,
        campaignName: redactPossiblyPersonalText(
          insight.campaign_name,
          `Campaign ${campaignId}`
        ),
        ...statusForCampaign(campaignId, statusByCampaignId),
        ...metricFromInsight(insight),
      };
    })
    .sort(
      (left, right) =>
        right.amountSpent - left.amountSpent ||
        left.campaignId.localeCompare(right.campaignId)
    );
  const ads = adInsights
    .filter(
      insight =>
        typeof insight.campaign_id === "string" &&
        insight.campaign_id &&
        typeof insight.ad_id === "string" &&
        insight.ad_id
    )
    .map(insight => {
      const campaignId = insight.campaign_id as string;
      const adId = insight.ad_id as string;
      const campaignStatus = statusForCampaign(campaignId, statusByCampaignId);
      return {
        campaignId,
        campaignName: redactPossiblyPersonalText(
          insight.campaign_name,
          `Campaign ${campaignId}`
        ),
        adId,
        adName: redactPossiblyPersonalText(insight.ad_name, `Ad ${adId}`),
        campaignConfiguredStatus: campaignStatus.configuredStatus,
        campaignEffectiveStatus: campaignStatus.effectiveStatus,
        ...metricFromInsight(insight),
      };
    })
    .sort(
      (left, right) =>
        right.amountSpent - left.amountSpent ||
        left.adId.localeCompare(right.adId)
    );
  const reportRunAt = (input.now ?? new Date()).getTime();
  const summary = aggregateMetrics(campaigns);
  const reportWithoutKey: Omit<
    MetaAdsProductionReport,
    "reportKey" | "reportHash"
  > = {
    schemaVersion: 1 as const,
    source: {
      adAccountId: META_ADS_PRODUCTION_ACCOUNT_ID,
      currency: META_ADS_PRODUCTION_CURRENCY,
      accountName: redactPossiblyPersonalText(
        account.name,
        "Approved EGP Meta Ads account"
      ),
      accountStatus: asText(account.account_status, "Data not available"),
      graphVersion: META_ADS_GRAPH_VERSION,
    },
    window,
    reportRunAt,
    retrieval: {
      method: "GET" as const,
      boundedPagesPerEndpoint: META_ADS_MAX_PAGES_PER_ENDPOINT,
      liveCapture: true as const,
    },
    summary,
    campaigns,
    ads,
    findings: buildFindings(summary, campaigns),
    draftProposals: buildDraftProposals(campaigns),
    attributionNotice:
      "Meta lead actions are attributed actions returned by Meta for this reporting window. They are not CRM leads, qualified leads, signed clients, or a CRM attribution reconciliation.",
    publicationStatus:
      "locked_no_publish_campaign_ad_spend_or_release" as const,
  };
  const reportHash = immutableReportHash(reportWithoutKey);
  return {
    ...reportWithoutKey,
    reportKey: reportKey(reportRunAt, reportHash),
    reportHash,
  } as MetaAdsProductionReport;
}
