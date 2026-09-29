import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { FileText, BarChart2, Send, ArrowRight, Sparkles, Mic2, FolderOpen, RefreshCw, CheckCircle2, AlertTriangle, MailWarning, Loader2, ClipboardCheck, FilePenLine, FileCheck2, Target, PlugZap, Settings2, CalendarClock } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";

const tools = [
  {
    icon: Settings2,
    title: "1. Setup",
    description: "Control Saturday preparation and the 10:00 Cairo delivery target, programme and source instructions, creative direction, content mix, allocation, feedback learning, and the secure Agentic Marketing foundations.",
    href: "/marketing/weekly-results?view=setup",
    color: "from-[#5BA3B8] via-[#1A3A5C] to-[#C9A84C]",
    badge: "Configuration",
  },
  {
    icon: CalendarClock,
    title: "2. Weekly Results",
    description: "Review every proposed post, carousel, reel, image, and graphic. Edit or select items and make a separate recorded approval decision for each one—never batch approval.",
    href: "/marketing/weekly-results",
    color: "from-[#C9A84C] via-[#1A3A5C] to-[#5BA3B8]",
    badge: "Individual review",
  },
];
const foundationLinks = [
  { title: "AI Agentic Marketing System", href: "/marketing/agentic-system" },
  { title: "Brand Discovery — 35 Questions", href: "/marketing/brand-studio" },
  { title: "Provider Connection Center", href: "/marketing/provider-connections" },
  { title: "Official Knowledge Library", href: "/marketing/knowledge-library" },
  { title: "Controlled Work Orders", href: "/marketing/work-orders" },
  { title: "Content Studio & Approval Inbox", href: "/marketing/content-studio" },
  { title: "Meta Ads Strategy Intake", href: "/marketing/meta-ads-strategy" },
  { title: "Strategy Approval Packet", href: "/marketing/meta-ads-strategy-packet" },
  { title: "Campaign Pilot Proposal", href: "/marketing/campaign-pilot-proposal" },
  { title: "Pilot Readiness & Executive Measurement", href: "/marketing/pilot-readiness" },
  { title: "Weekly Executive Brief & Decision Log", href: "/marketing/weekly-executive-briefs" },
  { title: "Ready Summaries", href: "/marketing/ready-summaries" },
  { title: "Arabic Voice-over", href: "/marketing/voice-over" },
  { title: "Summary Generator", href: "/marketing/summary-generator" },
  { title: "Program Enhanced Comparison", href: "/marketing/program-comparison" },
  { title: "Program Proposal", href: "/marketing/program-proposal" },
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
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-teal-400" />
          <span className="text-sm text-teal-400 font-medium uppercase tracking-widest">Marketing Module</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Marketing Tools</h1>
        <p className="text-gray-400 text-base">Create professional marketing materials for your citizenship and residency programs.</p>
        <p className="mt-3 text-sm text-[#81c7d8]">The two main sections below control the weekly workflow. Existing governed foundations remain available as supporting workspaces.</p>
      </div>

      {isAdmin && (
        <section className="mb-8 rounded-xl border border-white/10 bg-[#121b2d] p-5" aria-labelledby="news-import-health-heading">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 rounded-lg p-2 ${newsHealth?.connected && !newsHealth.lastError ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                {newsHealthLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : newsHealth?.connected && !newsHealth.lastError ? <CheckCircle2 className="h-5 w-5" /> : <MailWarning className="h-5 w-5" />}
              </div>
              <div>
                <h2 id="news-import-health-heading" className="text-lg font-semibold text-white">News importer health</h2>
                <p className="text-sm text-gray-400">Daily Digest Gmail authorization and last import status.</p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 border-white/15 bg-white/5 text-gray-200 hover:bg-white/10"
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
              <div className="rounded-lg bg-white/5 p-3"><p className="text-gray-400">Gmail authorization</p><p className={newsHealth.connected ? "font-semibold text-emerald-300" : "font-semibold text-amber-300"}>{newsHealth.connected ? "Connected" : "Action required"}</p><p className="mt-1 break-all text-xs text-gray-500">{newsHealth.email || newsHealth.sourceMailbox}</p></div>
              <div className="rounded-lg bg-white/5 p-3"><p className="text-gray-400">Last successful import</p><p className="font-semibold text-white">{formatDate(newsHealth.lastSuccessfulAt)}</p></div>
              <div className="rounded-lg bg-white/5 p-3"><p className="text-gray-400">Last attempt</p><p className="font-semibold text-white">{formatDate(newsHealth.lastAttemptAt)}</p></div>
              <div className="rounded-lg bg-white/5 p-3"><p className="text-gray-400">Importer error</p><p className={newsHealth.lastError ? "font-semibold text-red-300" : "font-semibold text-emerald-300"}>{newsHealth.lastError || "No current error"}</p></div>
            </div>
          ) : (
            <p className="mt-5 text-sm text-gray-400">Loading News importer status…</p>
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
              <span className={`absolute top-4 right-4 text-xs font-semibold px-2 py-0.5 rounded-full ${isComingSoon ? "bg-gray-700 text-gray-400" : "bg-teal-900/60 text-teal-300"}`}>{tool.badge}</span>
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tool.color} flex items-center justify-center`}><Icon className="w-6 h-6 text-white" /></div>
              <div className="flex-1"><h2 className="text-lg font-semibold text-white mb-1">{tool.title}</h2><p className="text-sm text-gray-400 leading-relaxed">{tool.description}</p></div>
              {!isComingSoon && <div className="flex items-center gap-1 text-teal-400 text-sm font-medium mt-1">Open Tool <ArrowRight className="w-4 h-4" /></div>}
            </div>
          );
        })}
      </div>

      <section className="mt-8 rounded-2xl border border-white/10 bg-[#141d30] p-5" aria-labelledby="marketing-foundations-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="marketing-foundations-heading" className="font-semibold text-white">Foundations and supporting workspaces</h2><p className="mt-1 text-sm text-gray-400">These existing controlled tools remain available alongside Setup and Weekly Results.</p></div>
          <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-200">External operations locked</span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {foundationLinks.map(link => <button key={link.href} onClick={() => navigate(link.href)} className="group flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/10 px-3 py-2.5 text-left text-sm text-slate-300 transition hover:border-[#5BA3B8]/45 hover:bg-[#1c2940] hover:text-white"><span>{link.title}</span><ArrowRight className="h-4 w-4 shrink-0 text-[#81c7d8] transition group-hover:translate-x-0.5" /></button>)}
        </div>
      </section>
    </div>
  );
}
