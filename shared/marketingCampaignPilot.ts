export const CAMPAIGN_PILOT_PROPOSAL_STATUSES = [
  "proposed",
  "internally_approved",
  "changes_requested",
  "rejected",
  "stopped",
] as const;

export type CampaignPilotProposalStatus = (typeof CAMPAIGN_PILOT_PROPOSAL_STATUSES)[number];

/**
 * Blueprint maximum: this is a proposal validation ceiling only. It does not reserve,
 * transfer, charge, or otherwise expose money to a provider.
 */
export const CAMPAIGN_PILOT_MAX_MONTHLY_MEDIA_CAP_EGP = 200_000;

export const CAMPAIGN_PILOT_PROGRAMS = [
  { key: "spain_dnv", label: "Spain Digital Nomad Residency" },
  { key: "malta_mprp", label: "Malta Permanent Residence Programme" },
] as const;

/**
 * Internal review vocabulary only. Before any external integration, the final selected
 * scopes and their current Meta documentation must be independently reviewed again.
 */
export const CAMPAIGN_PILOT_ALLOWED_PERMISSION_IDS = [
  "ads_read",
  "ads_management",
  "business_management",
  "leads_retrieval",
  "pages_read_engagement",
] as const;

export const CAMPAIGN_PILOT_MONITORING_CADENCES = ["daily", "business_days"] as const;

const TRANSITIONS: Record<CampaignPilotProposalStatus, readonly CampaignPilotProposalStatus[]> = {
  proposed: ["internally_approved", "changes_requested", "rejected", "stopped"],
  internally_approved: ["stopped"],
  changes_requested: ["stopped"],
  rejected: [],
  stopped: [],
};

export function campaignPilotCanTransition(
  from: CampaignPilotProposalStatus,
  to: CampaignPilotProposalStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export type CampaignPilotBudgetPlan = {
  monthlyMediaCapEgp: number;
  dailyMediaCapEgp: number;
  campaignCapEgp: number;
};

export function validateCampaignPilotBudgetPlan(plan: CampaignPilotBudgetPlan): string | null {
  const values = [plan.monthlyMediaCapEgp, plan.dailyMediaCapEgp, plan.campaignCapEgp];
  if (values.some(value => !Number.isFinite(value) || value <= 0)) {
    return "Every proposed media cap must be a positive finite EGP value.";
  }
  if (plan.monthlyMediaCapEgp > CAMPAIGN_PILOT_MAX_MONTHLY_MEDIA_CAP_EGP) {
    return `The monthly proposal cap cannot exceed EGP ${CAMPAIGN_PILOT_MAX_MONTHLY_MEDIA_CAP_EGP.toLocaleString("en-US")}.`;
  }
  if (plan.dailyMediaCapEgp > plan.monthlyMediaCapEgp) {
    return "The daily media cap cannot exceed the monthly media cap.";
  }
  if (plan.campaignCapEgp > plan.monthlyMediaCapEgp) {
    return "The campaign media cap cannot exceed the monthly media cap.";
  }
  return null;
}

export function hasOnlyAllowedCampaignPilotPermissions(permissionIds: string[]): boolean {
  const allowed = new Set<string>(CAMPAIGN_PILOT_ALLOWED_PERMISSION_IDS);
  return permissionIds.length > 0 && permissionIds.every(permissionId => allowed.has(permissionId));
}

/** Reject client, lead and identity details from an internal planning brief. */
export function findDisallowedCampaignPilotData(value: string): string | null {
  const checks: Array<[RegExp, string]> = [
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, "email address"],
    [/\b(?:\+?20|0)?1[0-9]{9}\b/, "phone number"],
    [/\b(?:passport|national\s*id|identity\s*card|client\s*code|lead\s*id)\b/i, "client or identity reference"],
  ];
  for (const [pattern, label] of checks) {
    if (pattern.test(value)) return label;
  }
  return null;
}

export function normalizeCampaignPilotText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}
