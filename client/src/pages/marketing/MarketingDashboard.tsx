import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { FileText, BarChart2, Send, ArrowRight, Sparkles, Mic2, FolderOpen, RefreshCw, CheckCircle2, AlertTriangle, MailWarning, Loader2, ClipboardCheck, FilePenLine, FileCheck2, Target, PlugZap, Settings2, CalendarClock } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";

const tools = [
  {
    icon: Sparkles,
    title: "AI Agentic Marketing System",
    description: "Open the three Agentic workspaces: Settings, Media Production, and META ADS Production.",
    href: "/marketing/agentic-system",
    color: "from-[#C9A84C] via-[#5BA3B8] to-[#1A3A5C]",
    badge: "Three workspaces",
  },
  {
    icon: FolderOpen,
    title: "Ready Summaries",
    description: "Browse and download approved ELEVAY country and program summaries. Administrators can add or remove PDFs from the shared library.",
    href: "/marketing/ready-summaries",
    color: "from-[#5BA3B8] to-[#1A3A5C]",
    badge: "PDF Library",
  },
  {
    icon: Mic2,
    title: "Arabic Voice-over",
    description: "Convert approved Arabic marketing scripts into polished MP3 voice-overs using ELEVAY’s approved Eleven v3 voice settings.",
    href: "/marketing/voice-over",
    color: "from-[#5BA3B8] to-[#1A3A5C]",
    badge: "Eleven v3",
  },
  {
    icon: FileText,
    title: "Summary Generator",
    description: "Create branded program summaries with full editorial control and export them as professional PDFs.",
    href: "/marketing/summary-generator",
    color: "from-teal-500 to-cyan-600",
    badge: "Available",
  },
  {
    icon: BarChart2,
    title: "Program Enhanced Comparison",
    description: "Compare citizenship and residency programs side-by-side with criteria, costs, timelines, and benefits.",
    href: "/marketing/program-comparison",
    color: "from-blue-500 to-indigo-600",
    badge: "Available",
  },
  {
    icon: Send,
    title: "Program Proposal",
    description: "Generate tailored program proposals for clients based on their profile, budget, and goals.",
    href: "/marketing/program-proposal",
    color: "from-purple-500 to-violet-600",
    badge: "Available",
  },
];

type NewsHealth = {
  configured: boolean;
  connected: boolean;
  authorizationIssue: string | null;
  email: string | null;
  sourceMailbox: string;
  subjectTrigger: string;
  lastAttemptAt: string | null;
  lastSuccessfulAt: string | null;
  lastError: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function MarketingDashboard() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [newsHealth, setNewsHealth] = useState<NewsHealth | null>(null);
  const [newsHealthLoading, setNewsHealthLoading] = useState(false);
  const [newsHealthError, setNewsHealthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    const loadNewsHealth = async () => {
      setNewsHealthLoading(true);
      try {
        const response = await fetch("/api/admin/news/gmail/status", { credentials: "include", cache: "no-store" });
        const data = await response.json() as NewsHealth & { error?: string };
        if (!response.ok) throw new Error(data.error || "Unable to load News importer status");
        if (active) {
          setNewsHealth(data);
          setNewsHealthError(null);
        }
      } catch (error) {
        if (active) setNewsHealthError(error instanceof Error ? error.message : "Unable to load News importer status");
      } finally {
        if (active) setNewsHealthLoading(false);
      }
    };
    void loadNewsHealth();
    const interval = window.setInterval(() => void loadNewsHealth(), 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [isAdmin]);

  return (
    <div className="agentic-readable min-h-full bg-[#0c1320] text-white"><div className="mx-auto max-w-5xl p-6">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-teal-400" />
          <span className="text-sm text-teal-400 font-medium uppercase tracking-widest">Marketing Module</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Marketing Tools</h1>
        <p className="text-slate-100 text-base">Create professional marketing materials for your citizenship and residency programs.</p>
        <p className="mt-3 text-sm text-[#81c7d8]">All AI Agentic Marketing controls are now grouped in one dedicated workspace.</p>
      </div>

      <section className="mb-8 overflow-hidden rounded-2xl border border-[#5BA3B8]/35 bg-[radial-gradient(circle_at_100%_0%,rgba(91,163,184,.24),transparent_42%),linear-gradient(120deg,#13263b,#101a2a)] p-5 md:p-6" aria-labelledby="agentic-workspace-heading">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[#a9d6e3]"><Sparkles className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-[.15em]">AI Agentic Marketing</span></div>
            <h2 id="agentic-workspace-heading" className="mt-2 text-2xl font-semibold text-white">Three Agentic Marketing workspaces</h2>
            <p className="mt-2 text-sm leading-6 text-white">Settings governs the brand and schedule. Media Production holds weekly static posts and reels. META ADS Production holds dated account reports and separately reviewed ad proposals.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:min-w-[360px] sm:grid-cols-3">
            <Button onClick={() => navigate("/marketing/agentic-settings")} className="h-auto bg-[#5BA3B8] px-4 py-3 text-[#0A1628] hover:bg-[#77b7c8]"><Settings2 className="mr-2 h-4 w-4" />Settings</Button>
            <Button onClick={() => navigate("/marketing/media-production")} variant="outline" className="h-auto border-[#EBD990]/45 bg-[#C9A84C]/10 px-4 py-3 text-[#f6dda3] hover:bg-[#C9A84C]/20 hover:text-white"><CalendarClock className="mr-2 h-4 w-4" />Media Production</Button>
            <Button onClick={() => navigate("/marketing/meta-ads-production")} variant="outline" className="h-auto border-[#5BA3B8]/45 bg-[#5BA3B8]/10 px-4 py-3 text-[#b3e7f2] hover:bg-[#5BA3B8]/20 hover:text-white"><Target className="mr-2 h-4 w-4" />META ADS</Button>
          </div>
        </div>
      </section>

      {isAdmin && (
        <section className="mb-8 rounded-xl border border-white/10 bg-[#121b2d] p-5" aria-labelledby="news-import-health-heading">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 rounded-lg p-2 ${newsHealth?.connected && !newsHealth.lastError ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                {newsHealthLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : newsHealth?.connected && !newsHealth.lastError ? <CheckCircle2 className="h-5 w-5" /> : <MailWarning className="h-5 w-5" />}
              </div>
              <div>
                <h2 id="news-import-health-heading" className="text-lg font-semibold text-white">News importer health</h2>
                <p className="text-sm text-slate-100">Daily Digest Gmail authorization and last import status.</p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 border-white/15 bg-white/5 text-white hover:bg-white/10"
              onClick={() => window.location.assign("/api/admin/news/status-page")}
            >
              Open status page <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          {newsHealthError ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{newsHealthError}</span>
            </div>
          ) : newsHealth ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div className="rounded-lg bg-white/5 p-3"><p className="text-slate-100">Gmail authorization</p><p className={newsHealth.connected ? "font-semibold text-emerald-300" : "font-semibold text-amber-300"}>{newsHealth.connected ? "Connected" : "Action required"}</p><p className="mt-1 break-all text-xs text-white">{newsHealth.email || newsHealth.sourceMailbox}</p></div>
              <div className="rounded-lg bg-white/5 p-3"><p className="text-slate-100">Last successful import</p><p className="font-semibold text-white">{formatDate(newsHealth.lastSuccessfulAt)}</p></div>
              <div className="rounded-lg bg-white/5 p-3"><p className="text-slate-100">Last attempt</p><p className="font-semibold text-white">{formatDate(newsHealth.lastAttemptAt)}</p></div>
              <div className="rounded-lg bg-white/5 p-3"><p className="text-slate-100">Importer error</p><p className={newsHealth.lastError ? "font-semibold text-red-300" : "font-semibold text-emerald-300"}>{newsHealth.lastError || "No current error"}</p></div>
            </div>
          ) : (
            <p className="mt-5 text-sm text-slate-100">Loading News importer status…</p>
          )}

          {(newsHealth?.authorizationIssue || newsHealth?.lastError) && (
            <div className="mt-3 rounded-lg border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">
              <strong>Attention:</strong> {newsHealth.authorizationIssue || newsHealth.lastError}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isComingSoon = tool.badge === "Coming Soon";
          return (
            <div
              key={tool.href}
              onClick={() => !isComingSoon && navigate(tool.href)}
              className={`relative bg-[#1a2235] border border-white/10 rounded-xl p-6 flex flex-col gap-4 transition-all duration-200 ${isComingSoon ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:border-teal-500/50 hover:bg-[#1e2a40]"}`}
            >
              <span className={`absolute top-4 right-4 text-xs font-semibold px-2 py-0.5 rounded-full ${isComingSoon ? "bg-gray-700 text-slate-100" : "bg-teal-900/60 text-teal-300"}`}>{tool.badge}</span>
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tool.color} flex items-center justify-center`}><Icon className="w-6 h-6 text-white" /></div>
              <div className="flex-1"><h2 className="text-lg font-semibold text-white mb-1">{tool.title}</h2><p className="text-sm text-slate-100 leading-relaxed">{tool.description}</p></div>
              {!isComingSoon && <div className="flex items-center gap-1 text-teal-400 text-sm font-medium mt-1">Open Tool <ArrowRight className="w-4 h-4" /></div>}
            </div>
          );
        })}
      </div>

    </div></div>
  );
}
