export const MARKETING_SYSTEM_ROLES = [
  "marketing_system_admin",
  "marketing_manager",
  "researcher",
  "creative_producer",
  "analyst",
] as const;

export type MarketingSystemRole = (typeof MARKETING_SYSTEM_ROLES)[number];
export type EffectiveMarketingSystemRole = "owner" | MarketingSystemRole | null;

export type MarketingSystemCapability =
  | "view_brand_book"
  | "manage_brand_discovery"
  | "manage_roles"
  | "view_provider_readiness"
  | "manage_provider_aliases"
  | "view_knowledge"
  | "manage_knowledge_sources"
  | "create_knowledge_claims"
  | "review_knowledge_claims"
  | "create_research"
  | "create_creative"
  | "review_creative"
  | "view_analytics"
  | "export_analytics"
  | "view_work_orders"
  | "submit_work_orders"
  | "review_work_orders"
  | "run_work_order_dry_runs"
  | "cancel_work_orders"
  | "view_content_studio"
  | "create_content_packets"
  | "review_content_packets"
  | "run_content_qa"
  | "approve_content_packets"
  | "stop_content_packets"
  | "view_meta_strategy_intake"
  | "manage_meta_strategy_intake"
  | "view_campaign_pilot_proposals"
  | "manage_campaign_pilot_proposals"
  | "view_weekly_results"
  | "manage_weekly_results_setup"
  | "prepare_weekly_results"
  | "edit_weekly_results_items"
  | "review_weekly_results_items"
  | "approve_weekly_results_items"
  | "record_weekly_results_performance"
  | "approve_publishing"
  | "manage_campaigns";

const FULL_AGENTIC_MARKETING_CAPABILITIES: readonly MarketingSystemCapability[] = [
    "view_brand_book", "manage_brand_discovery", "manage_roles", "view_provider_readiness", "manage_provider_aliases",
    "view_knowledge", "manage_knowledge_sources", "create_knowledge_claims", "review_knowledge_claims",
    "create_research", "create_creative", "review_creative", "view_analytics", "export_analytics",
    "view_work_orders", "submit_work_orders", "review_work_orders", "run_work_order_dry_runs", "cancel_work_orders",
    "view_content_studio", "create_content_packets", "review_content_packets", "run_content_qa", "approve_content_packets", "stop_content_packets",
    "view_meta_strategy_intake", "manage_meta_strategy_intake",
    "view_campaign_pilot_proposals", "manage_campaign_pilot_proposals",
    "view_weekly_results", "manage_weekly_results_setup", "prepare_weekly_results", "edit_weekly_results_items", "review_weekly_results_items", "approve_weekly_results_items", "record_weekly_results_performance",
    "approve_publishing", "manage_campaigns",
];

const CAPABILITIES: Record<Exclude<EffectiveMarketingSystemRole, null>, readonly MarketingSystemCapability[]> = {
  // Mahmoud remains the CRM owner. The administrator role below is deliberately
  // scoped to the Agentic Marketing System and has no effect on other CRM modules.
  owner: FULL_AGENTIC_MARKETING_CAPABILITIES,
  marketing_system_admin: FULL_AGENTIC_MARKETING_CAPABILITIES,
  marketing_manager: [
    "view_brand_book", "view_provider_readiness", "view_knowledge", "manage_knowledge_sources", "create_knowledge_claims", "create_research", "create_creative",
    "review_creative", "view_analytics", "export_analytics", "view_work_orders", "submit_work_orders", "cancel_work_orders",
    "view_content_studio", "create_content_packets", "review_content_packets", "run_content_qa", "stop_content_packets",
    "view_weekly_results", "edit_weekly_results_items", "review_weekly_results_items", "record_weekly_results_performance",
  ],
  researcher: ["view_brand_book", "view_knowledge", "manage_knowledge_sources", "create_knowledge_claims", "create_research", "view_analytics", "view_work_orders", "submit_work_orders", "cancel_work_orders"],
  creative_producer: ["view_brand_book", "view_knowledge", "create_creative", "view_work_orders", "submit_work_orders", "cancel_work_orders", "view_content_studio", "create_content_packets", "stop_content_packets"],
  analyst: ["view_brand_book", "view_knowledge", "view_analytics", "export_analytics", "view_work_orders", "view_content_studio", "view_weekly_results"],
};

export function isMarketingSystemRole(value: string | null | undefined): value is MarketingSystemRole {
  return typeof value === "string" && (MARKETING_SYSTEM_ROLES as readonly string[]).includes(value);
}

export function getMarketingSystemCapabilities(role: EffectiveMarketingSystemRole): readonly MarketingSystemCapability[] {
  return role ? CAPABILITIES[role] : [];
}

export function hasMarketingSystemCapability(role: EffectiveMarketingSystemRole, capability: MarketingSystemCapability): boolean {
  return getMarketingSystemCapabilities(role).includes(capability);
}

export const MARKETING_SYSTEM_ROLE_LABELS: Record<MarketingSystemRole, string> = {
  marketing_system_admin: "Agentic Marketing Administrator (scoped)",
  marketing_manager: "Marketing Manager",
  researcher: "Researcher",
  creative_producer: "Creative Producer",
  analyst: "Analyst",
};
