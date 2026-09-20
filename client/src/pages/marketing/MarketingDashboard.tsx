import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { FileText, BarChart2, Send, ArrowRight, Sparkles, Mic2, FolderOpen, RefreshCw, CheckCircle2, AlertTriangle, MailWarning, Loader2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";

const tools = [
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
    description: "Convert Arabic marketing scripts into polished MP3 voice-overs using ELEVAY’s approved Eleven v3 voice settings.",
    href: "/marketing/voice-over",
    color: "from-[#5BA3B8] to-[#1A3A5C]",
    badge: "Eleven v3",
  },
  {
    icon: FileText,
    title: "Summary Generator",
    description: "Create branded program summaries with full editorial control. Customize content, colors, images, and export as professional PDFs.",
    href: "/marketing/summary-generator",
    color: "from-teal-500 to-cyan-600",
    badge: "AI-Powered",
  },
  {
    icon: BarChart2,
    title: "Program Enhanced Comparison",
    description: "Compare multiple citizenship and residency programs side-by-side with detailed criteria, costs, timelines, and benefits.",
    href: "/marketing/program-comparison",
    color: "from-blue-500 to-indigo-600",
    badge: "Available",
  },
  {
    icon: Send,
    title: "Program Proposal",
    description: "Generate tailored program proposals for clients based on their profile, budget, and goals. Export as branded PDF documents.",
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
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-teal-400" />
          <span className="text-sm text-teal-400 font-medium uppercase tracking-widest">Marketing Module</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Marketing Tools</h1>
        <p className="text-gray-400 text-base">Create professional marketing materials for your citizenship and residency programs.</p>
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
    </div>
  );
}
