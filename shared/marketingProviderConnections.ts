export const MARKETING_AUTOPILOT_MODE = "full_autopilot" as const;
// Owner override: OpenAI keyframes -> Higgsfield clips -> Manus assembly only.
// This provider policy is not an authentication check or execution release.
export const ELEVAY_REEL_PRODUCTION_PROVIDER = "higgsfield-clips" as const;

export const MARKETING_PROVIDER_CONNECTIONS = [
  {
    alias: "routine-copy",
    provider: "Manus Built-in LLM",
    connectionKind: "internal_model",
    secretKeys: [] as const,
    webhookPath: null,
    purpose: "Structured extraction, classification, and Arabic-first copy variants.",
    executionBoundary: "Locked until an owner-approved work order and the future execution release.",
  },
  {
    alias: "strategy-synthesis",
    provider: "Manus Built-in LLM",
    connectionKind: "internal_model",
    secretKeys: [] as const,
    webhookPath: null,
    purpose: "Brand synthesis, strategic interpretation, and difficult attribution analysis.",
    executionBoundary: "Locked until an owner-approved work order and the future execution release.",
  },
  {
    alias: "manus-orchestrator",
    provider: "Manus API v2",
    connectionKind: "task_orchestration",
    secretKeys: ["MANUS_API_KEY"] as const,
    webhookPath: "/api/webhooks/marketing/manus",
    creativeCapabilities: ["research", "workflow_orchestration", "reel_assembly", "logo_outro", "audio_mix", "export"] as const,
    purpose: "Bounded planning and final assembly of OpenAI-keyframed, Higgsfield-generated clips; Manus must not generate reel footage.",
    executionBoundary: "No Manus-native footage generation. Reel assembly remains disabled until Higgsfield authentication, bounded clip pricing and complete review/QA gates are verified; this profile never grants publishing or ad-spend authority.",
  },
  {
    alias: "openai-editorial",
    provider: "OpenAI API",
    connectionKind: "editorial_model",
    secretKeys: ["OPENAI_API_KEY"] as const,
    webhookPath: "/api/webhooks/marketing/openai",
    purpose: "Strategy, editorial drafting, and approved visual keyframes for Higgsfield reel clips.",
    executionBoundary: "No content request, publication, campaign action, or spending occurs from this connection phase.",
  },
  {
    alias: "higgsfield-clips",
    provider: "Higgsfield API",
    connectionKind: "image_to_video",
    secretKeys: ["HF_API_KEY"] as const,
    webhookPath: null,
    purpose: "The only owner-approved reel-footage generator, animating OpenAI keyframes into 9:16 clips.",
    executionBoundary: "Read-only authentication and per-clip cost must be validated first. The Manus connector does not supply CRM server credentials. No Higgsfield voice, text, logo, Meta publishing or ad action is authorized.",
  },
  {
    alias: "editorial-challenge",
    provider: "Anthropic API",
    connectionKind: "editorial_model",
    secretKeys: ["ANTHROPIC_API_KEY"] as const,
    webhookPath: "/api/webhooks/marketing/anthropic",
    purpose: "Independent claim and editorial challenge.",
    executionBoundary: "No provider request is made until a later execution phase and approved work order gate.",
  },
  {
    alias: "template-render",
    provider: "Creatomate",
    connectionKind: "media_renderer",
    secretKeys: ["CREATOMATE_API_KEY"] as const,
    webhookPath: "/api/webhooks/marketing/creatomate",
    purpose: "Template-based branded image and reel rendering.",
    executionBoundary: "Requires approved templates, a finalized packet, visual QA, and a future rendering release before any render is requested.",
  },
  {
    alias: "specialty-motion",
    provider: "Runway",
    connectionKind: "media_renderer_optional",
    secretKeys: ["RUNWAY_API_KEY"] as const,
    webhookPath: null,
    purpose: "Optional selected specialty motion footage only.",
    executionBoundary: "Optional provider. Readiness does not create any task; it remains disabled unless a future per-clip approval, bounded task polling, and spend-cap release is completed.",
  },
  {
    alias: "elevay-arabic-voice",
    provider: "Existing ELEVAY Voice Adapter",
    connectionKind: "voice",
    secretKeys: ["ELEVENLABS_API_KEY"] as const,
    webhookPath: null,
    purpose: "Approved Arabic Eleven v3 voice-over from a final script.",
    executionBoundary: "Existing voice generation remains subject to finalized-script, cost, and content-approval gates.",
  },
  {
    alias: "meta-marketing",
    provider: "Meta Marketing API",
    connectionKind: "paid_media",
    secretKeys: ["META_SYSTEM_USER_ACCESS_TOKEN", "META_AD_ACCOUNT_ID", "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN"] as const,
    webhookPath: "/api/webhooks/marketing/meta",
    purpose: "Future campaign, asset, measurement, and event controls under one restricted system-user identity.",
    executionBoundary: "No campaign, ad set, creative, spend, publication, CAPI mutation, or audience mutation is authorized by connection readiness.",
  },
] as const;

export type MarketingProviderAlias = (typeof MARKETING_PROVIDER_CONNECTIONS)[number]["alias"];
export type MarketingProviderConnection = (typeof MARKETING_PROVIDER_CONNECTIONS)[number];

export function getMarketingProviderConnection(alias: string): MarketingProviderConnection | null {
  return MARKETING_PROVIDER_CONNECTIONS.find(connection => connection.alias === alias) ?? null;
}

export function providerSecretPresence(connection: MarketingProviderConnection, environment: NodeJS.ProcessEnv = process.env) {
  const required = connection.secretKeys.map(key => ({ key, present: Boolean(environment[key]?.trim()) }));
  return {
    required,
    allPresent: required.every(secret => secret.present),
  };
}

export const MARKETING_AUTOPILOT_REQUIRED_GATES = [
  "An active owner-approved Brand Book",
  "Tracked official sources and owner-approved claims for every programme claim",
  "An owner-approved work order and final Content Studio approval",
  "A completed and owner-approved Meta Ads Strategy Packet",
  "An internally approved Campaign Pilot Proposal with a documented cap, monitoring, measurement, and rollback plan",
  "Connected server-side credentials with no credentials stored in CRM records",
  "Verified signed inbound callbacks and durable idempotent event handling",
  "A future execution-release checkpoint with the master kill switch deliberately reviewed",
] as const;

export function summarizeMarketingAutopilotLock(input: {
  activeBrandBookCount: number;
  approvedStrategyPacketCount: number;
  internallyApprovedPilotProposalCount: number;
  allProviderSecretsPresent: boolean;
  masterKillSwitchEnabled: boolean;
}) {
  const blockers = [
    input.activeBrandBookCount > 0 ? null : "No active owner-approved Brand Book exists.",
    input.approvedStrategyPacketCount > 0 ? null : "No approved Meta Ads Strategy Packet exists.",
    input.internallyApprovedPilotProposalCount > 0 ? null : "No internally approved Campaign Pilot Proposal exists.",
    input.allProviderSecretsPresent ? null : "One or more provider secrets are not configured server-side.",
    input.masterKillSwitchEnabled ? "The master automation kill switch is engaged." : null,
    "The provider execution release has not been implemented; external actions remain intentionally blocked.",
  ].filter((value): value is string => Boolean(value));

  return {
    requestedMode: MARKETING_AUTOPILOT_MODE,
    executionAllowed: false,
    blockers,
    requiredGates: MARKETING_AUTOPILOT_REQUIRED_GATES,
  };
}
