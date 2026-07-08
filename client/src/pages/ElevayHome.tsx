/**
 * ElevayHome — the dual-state landing page for the Elevay platform.
 *
 * HOME STATE  : No sidebar. Centered card grid with module cards.
 *               Header shows "Hello, [User Name]" + "Losing Information" alert widget.
 *
 * APP STATE   : Clicking a card navigates to that module (DashboardLayout takes over).
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  FileText,
  FolderCheck,
  Search,
  Wallet,
  ChevronRight,
  MessageSquare,
  Target,
  X,
  Megaphone,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Module card definitions ──────────────────────────────────────────────────
const BASE_MODULE_CARDS = [
  {
    id: "contracting",
    label: "Contracting",
    description: "Manage contracts, receipts, and analytics",
    path: "/contracting",
    icon: FileText,
    gradient: "from-blue-600 to-blue-800",
    iconBg: "bg-blue-500/30",
    glow: "shadow-blue-500/20",
    pageKey: null, // always visible
  },
  {
    id: "docs",
    label: "Client Documentation",
    description: "Track documents, attestations, and submissions",
    path: "/docs/dashboard",
    icon: FolderCheck,
    gradient: "from-emerald-600 to-emerald-800",
    iconBg: "bg-emerald-500/30",
    glow: "shadow-emerald-500/20",
    pageKey: null,
  },
  {
    id: "analysis",
    label: "Application Analysis",
    description: "AI-powered visa application QA and reports",
    path: "/analysis/dashboard",
    icon: Search,
    gradient: "from-violet-600 to-violet-800",
    iconBg: "bg-violet-500/30",
    glow: "shadow-violet-500/20",
    pageKey: null,
  },
  {
    id: "financial",
    label: "Financial",
    description: "Income, expenses, accounts, and commissions",
    path: "/finance",
    icon: Wallet,
    gradient: "from-amber-600 to-amber-800",
    iconBg: "bg-amber-500/30",
    glow: "shadow-amber-500/20",
    pageKey: null,
  },
  {
    id: "leads",
    label: "ELEVAY LEADS",
    description: "Manage leads, pipeline stages, and follow-ups",
    path: "/leads/dashboard",
    icon: Target,
    gradient: "from-rose-600 to-rose-800",
    iconBg: "bg-rose-500/30",
    glow: "shadow-rose-500/20",
    pageKey: null,
  },
  {
    id: "wa-qc",
    label: "WhatsApp Quality Control",
    description: "Monitor WhatsApp groups and AI conversation analysis",
    path: "/wa-qc",
    icon: MessageSquare,
    gradient: "from-green-600 to-green-800",
    iconBg: "bg-green-500/30",
    glow: "shadow-green-500/20",
    pageKey: "wa_qc", // only show if user has this permission
  },
  {
    id: "marketing",
    label: "Marketing",
    description: "Program summaries, comparisons, and proposals",
    path: "/marketing",
    icon: Megaphone,
    gradient: "from-purple-600 to-purple-800",
    iconBg: "bg-purple-500/30",
    glow: "shadow-purple-500/20",
    pageKey: null, // always visible
  },
];

// ─── Alert Widget ─────────────────────────────────────────────────────────────
function AlertsWidget() {
  const [open, setOpen] = useState(false);

  // Query for urgent alerts: overdue clients (schengen/submission within 14 days)
  const { data: docsData } = trpc.clientDocs.dashboard.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const alerts: { label: string; level: "red" | "amber" }[] = [];

  if (docsData?.clients) {
    const now = Date.now();
    const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

    for (const c of docsData.clients) {
      if (c.daysToSchengen !== null && c.daysToSchengen !== undefined) {
        if (c.daysToSchengen <= 7) {
          alerts.push({ label: `${c.clientName}: Schengen expires in ${c.daysToSchengen}d`, level: "red" });
        } else if (c.daysToSchengen <= 14) {
          alerts.push({ label: `${c.clientName}: Schengen expires in ${c.daysToSchengen}d`, level: "amber" });
        }
      }
      if (c.daysToSubmission !== null && c.daysToSubmission !== undefined) {
        if (c.daysToSubmission <= 7) {
          alerts.push({ label: `${c.clientName}: Submission due in ${c.daysToSubmission}d`, level: "red" });
        } else if (c.daysToSubmission <= 14) {
          alerts.push({ label: `${c.clientName}: Submission due in ${c.daysToSubmission}d`, level: "amber" });
        }
      }
    }
  }

  const redCount = alerts.filter(a => a.level === "red").length;
  const amberCount = alerts.filter(a => a.level === "amber").length;
  const totalCount = alerts.length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl border transition-all",
          totalCount > 0
            ? "bg-red-500/10 border-red-500/30 hover:bg-red-500/20 text-red-300"
            : "bg-white/5 border-white/10 hover:bg-white/10 text-white/60"
        )}
      >
        <Bell className="h-4 w-4" />
        <span className="text-sm font-medium">
          {totalCount > 0 ? `${totalCount} Alert${totalCount !== 1 ? "s" : ""}` : "No Alerts"}
        </span>
        {totalCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
            {totalCount > 9 ? "9+" : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 rounded-2xl border border-white/10 bg-gray-900/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span className="font-semibold text-white text-sm">Losing Information</span>
            </div>
            <div className="flex items-center gap-2">
              {redCount > 0 && <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-xs">{redCount} Critical</Badge>}
              {amberCount > 0 && <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs">{amberCount} Warning</Badge>}
              <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-white/40">
                <Bell className="h-8 w-8" />
                <p className="text-sm">No urgent alerts at this time</p>
              </div>
            ) : (
              alerts.map((alert, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0",
                    alert.level === "red" ? "bg-red-500/5" : "bg-amber-500/5"
                  )}
                >
                  <div className={cn(
                    "h-2 w-2 rounded-full shrink-0",
                    alert.level === "red" ? "bg-red-500" : "bg-amber-400"
                  )} />
                  <span className={cn(
                    "text-sm",
                    alert.level === "red" ? "text-red-200" : "text-amber-200"
                  )}>
                    {alert.label}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sign In Button ─────────────────────────────────────────────────────────
function SignInButton() {
  const [, setLocation] = useLocation();

  const handleSignIn = () => {
    setLocation("/login");
  };

  return (
    <Button
      onClick={handleSignIn}
      size="lg"
      className="w-full bg-white text-gray-900 hover:bg-white/90 font-semibold"
    >
      Sign in
    </Button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ElevayHome() {
  const { loading, user } = useAuth();
  const [, setLocation] = useLocation();
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  // Show error toast if redirected back from a failed OAuth attempt
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error === "session_expired") {
      toast.error("Login session expired — please try signing in again.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error === "auth_failed") {
      toast.error("Authentication failed — please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Fetch permissions to conditionally show restricted modules (e.g. waQc)
  const { data: permsData } = trpc.permissions.getMyPermissions.useQuery(undefined, {
    enabled: !!user,
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    setLocation("/login");
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    );
  }

  const firstName = user.name?.split(" ")[0] ?? "there";

  // Filter module cards based on permissions
  const visibleCards = BASE_MODULE_CARDS.filter(card => {
    if (!card.pageKey) return true; // always visible
    return permsData?.permissions?.[card.pageKey] === true;
  });

  const moduleCount = visibleCards.length;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <div className="flex items-center gap-4">
          <img
            src="/manus-storage/elevay-logo_2c219cd3.png"
            alt="Elevay"
            className="h-12 w-auto object-contain"
          />
          <div className="h-6 w-px bg-white/10" />
          <div>
            <p className="text-white/50 text-xs uppercase tracking-widest font-medium">Welcome back</p>
            <h1 className="text-lg font-bold text-white leading-tight">Hello, {firstName}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AlertsWidget />
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold">
              {user.name?.charAt(0).toUpperCase() ?? "U"}
            </div>
            <span className="text-sm font-medium text-white/80">{user.name}</span>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-12">
        <div className="w-full max-w-4xl">
          {/* Subtitle */}
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-white mb-2">Where would you like to go?</h2>
            <p className="text-white/40 text-base">Select a module to get started</p>
          </div>

          {/* Module Card Grid — 2 columns, wraps naturally */}
          <div className="grid grid-cols-2 gap-5">
            {visibleCards.map((card) => {
              const Icon = card.icon;
              const isHovered = hoveredCard === card.id;
              return (
                <button
                  key={card.id}
                  onClick={() => setLocation(card.path)}
                  onMouseEnter={() => setHoveredCard(card.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                  className={cn(
                    "group relative flex flex-col items-start p-7 rounded-2xl border transition-all duration-300 text-left overflow-hidden",
                    "bg-gray-900/80 border-white/10",
                    isHovered
                      ? `shadow-2xl ${card.glow} border-white/20 scale-[1.02]`
                      : "hover:border-white/15"
                  )}
                >
                  {/* Background gradient on hover */}
                  <div className={cn(
                    "absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300",
                    card.gradient,
                    isHovered ? "opacity-10" : ""
                  )} />

                  {/* Icon */}
                  <div className={cn(
                    "relative h-14 w-14 rounded-2xl flex items-center justify-center mb-5 transition-all duration-300",
                    card.iconBg,
                    isHovered ? "scale-110" : ""
                  )}>
                    <Icon className="h-7 w-7 text-white" />
                  </div>

                  {/* Text */}
                  <div className="relative flex-1">
                    <h3 className="text-xl font-bold text-white mb-1.5">{card.label}</h3>
                    <p className="text-sm text-white/50 leading-relaxed">{card.description}</p>
                  </div>

                  {/* Arrow */}
                  <div className={cn(
                    "relative mt-5 flex items-center gap-1 text-xs font-semibold transition-all duration-300",
                    "text-white/30",
                    isHovered ? "text-white/70 translate-x-1" : ""
                  )}>
                    <span>Open module</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick stats row */}
          <div className="mt-8 flex items-center justify-center gap-8 text-center">
            <div>
              <p className="text-2xl font-bold text-white">{moduleCount}</p>
              <p className="text-xs text-white/40 uppercase tracking-wide">Modules</p>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div>
              <p className="text-2xl font-bold text-white">1</p>
              <p className="text-xs text-white/40 uppercase tracking-wide">Platform</p>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div>
              <p className="text-2xl font-bold text-white">∞</p>
              <p className="text-xs text-white/40 uppercase tracking-wide">Possibilities</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
