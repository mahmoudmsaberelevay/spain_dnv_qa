import { FileText, FolderOpen } from "lucide-react";
import { useLocation } from "wouter";

const tabs = [
  {
    label: "Ready Summaries",
    description: "Download approved PDFs",
    path: "/marketing/ready-summaries",
    icon: FolderOpen,
  },
  {
    label: "Summary Generator",
    description: "Create and edit summaries",
    path: "/marketing/summary-generator",
    icon: FileText,
  },
];

export function MarketingSummaryTabs() {
  const [location, navigate] = useLocation();

  return (
    <nav aria-label="Marketing summaries" className="mb-6 grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-[#101829] p-2 sm:grid-cols-2">
      {tabs.map(tab => {
        const active = location === tab.path || (tab.path === "/marketing/summary-generator" && location.startsWith(`${tab.path}/`));
        return (
          <button
            key={tab.path}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => navigate(tab.path)}
            className={`flex min-h-16 items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5BA3B8] ${
              active
                ? "bg-[#5BA3B8] text-[#07111f]"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <tab.icon className="h-5 w-5 shrink-0" />
            <span>
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span className={`block text-xs ${active ? "text-[#07111f]/70" : "text-slate-500"}`}>{tab.description}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
