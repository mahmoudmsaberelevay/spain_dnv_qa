export const EXECUTIVE_MEASUREMENT_WINDOW_DAYS = 90;
export const EXECUTIVE_MEASUREMENT_MONITORING_FRESHNESS_MS = 26 * 60 * 60 * 1000;
export const EXECUTIVE_MEASUREMENT_RECONCILIATION_FRESHNESS_MS = 48 * 60 * 60 * 1000;

export type PilotReadinessInput = {
  now: number;
  activeBrandBookCount: number;
  approvedStrategyPacketCount: number;
  internallyApprovedPilotProposalCount: number;
  monitoringCapturedAt: number | null;
  reconciliationStatus: string | null;
  reconciliationLastSuccessAt: number | null;
  latestAttributionCoverageBps: number | null;
  latestFailedInboxCount: number;
  latestRetryInboxCount: number;
  latestTestLeadLeakageCount: number;
  metaEventAttentionCount: number;
  pilotActualEvidenceAvailable: boolean;
  spendReconciliationAvailable: boolean;
};

export type PilotReadinessGate = {
  key: string;
  label: string;
  status: "ready" | "blocked" | "attention";
  detail: string;
};

function isFresh(value: number | null, now: number, maxAge: number) {
  return typeof value === "number" && value > 0 && value <= now && now - value <= maxAge;
}

export function buildPilotReadiness(input: PilotReadinessInput) {
  const monitoringFresh = isFresh(input.monitoringCapturedAt, input.now, EXECUTIVE_MEASUREMENT_MONITORING_FRESHNESS_MS);
  const reconciliationFresh = input.reconciliationStatus === "success"
    && isFresh(input.reconciliationLastSuccessAt, input.now, EXECUTIVE_MEASUREMENT_RECONCILIATION_FRESHNESS_MS);
  const attributionHealthy = (input.latestAttributionCoverageBps ?? 0) >= 9_500;
  const inboxHealthy = input.latestFailedInboxCount === 0 && input.latestRetryInboxCount === 0;
  const testLeadSafe = input.latestTestLeadLeakageCount === 0;
  const eventQueueHealthy = input.metaEventAttentionCount === 0;

  const gates: PilotReadinessGate[] = [
    {
      key: "brand_book",
      label: "Active Brand Book",
      status: input.activeBrandBookCount > 0 ? "ready" : "blocked",
      detail: input.activeBrandBookCount > 0 ? "An active approved Brand Book is available." : "Approve the Brand Book before any pilot can progress.",
    },
    {
      key: "strategy_packet",
      label: "Approved Strategy Packet",
      status: input.approvedStrategyPacketCount > 0 ? "ready" : "blocked",
      detail: input.approvedStrategyPacketCount > 0 ? "A current internal strategy packet is approved." : "Complete the 66-question intake, confirm programme variations, and approve a Strategy Packet.",
    },
    {
      key: "pilot_proposal",
      label: "Internally approved Pilot Proposal",
      status: input.internallyApprovedPilotProposalCount > 0 ? "ready" : "blocked",
      detail: input.internallyApprovedPilotProposalCount > 0 ? "An internal proposal records caps, measurement, monitoring, and rollback." : "Prepare and internally approve a Campaign Pilot Proposal after the Strategy Packet.",
    },
    {
      key: "monitoring",
      label: "Fresh CRM and Meta monitoring evidence",
      status: monitoringFresh && reconciliationFresh ? "ready" : "attention",
      detail: monitoringFresh && reconciliationFresh ? "Monitoring and reconciliation are fresh within the defined evidence windows." : "Refresh the monitoring snapshot and successful reconciliation evidence before relying on the baseline.",
    },
    {
      key: "attribution_quality",
      label: "Attribution and inbox quality",
      status: attributionHealthy && inboxHealthy && testLeadSafe && eventQueueHealthy ? "ready" : "attention",
      detail: attributionHealthy && inboxHealthy && testLeadSafe && eventQueueHealthy
        ? "Attribution coverage, inbox processing, test-lead isolation, and event queue indicators are clear."
        : "Resolve attribution, retry/failure, test-lead leakage, or event-queue exceptions before any later pilot decision.",
    },
    {
      key: "actual_pilot_evidence",
      label: "Proven pilot attribution and rollback evidence",
      status: input.pilotActualEvidenceAvailable ? "ready" : "blocked",
      detail: input.pilotActualEvidenceAvailable ? "Measured pilot evidence is available for review." : "No live measurement-pilot evidence has been recorded; optimisation remains blocked.",
    },
    {
      key: "spend_reconciliation",
      label: "Spend reconciliation",
      status: input.spendReconciliationAvailable ? "ready" : "blocked",
      detail: input.spendReconciliationAvailable ? "Reconciled pilot spend evidence is available." : "No external spend exists in this control plane, so there is nothing to reconcile yet.",
    },
  ];

  return {
    status: gates.every(gate => gate.status === "ready") ? "ready" as const : "blocked" as const,
    gates,
    monitoringFresh,
    reconciliationFresh,
  };
}

export const EXECUTIVE_MEASUREMENT_DEFINITIONS = {
  rawLeads: "Non-test Leads created in the selected rolling window.",
  qualifiedLeads: "Non-test Leads whose current CRM stage is Qualified. This is not a paid-client outcome.",
  clientStageLeads: "Non-test Leads whose current CRM stage is Client. This is not proof of a signed-and-paid contract.",
  attributedLeads: "Non-test Leads with a recorded Meta campaign or UTM campaign reference.",
  marketingContracts: "Contracts marked Marketing origin. Contract status is shown separately; mixed-currency value is intentionally not aggregated here.",
  executiveGate: "Optimisation stays blocked until a real pilot has proven attribution, reconciliation, monitoring, and rollback evidence.",
} as const;
