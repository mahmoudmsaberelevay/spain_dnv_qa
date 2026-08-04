/**
 * MobileHome — Mobile-optimized home screen with quick stats and module shortcuts.
 * Shows key metrics at a glance and provides fast access to all modules.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  FileText,
  Wallet,
  Target,
  FolderCheck,
  Search,
  Megaphone,
  TrendingUp,
  Users,
  ChevronRight,
  Calendar,
  DollarSign,
} from "lucide-react";
import { useLocation } from "wouter";

export default function MobileHome() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const firstName = user?.name?.split(" ")[0] ?? "User";

  // Fetch quick stats
  const { data: finSummary } = trpc.financial.dashboard.summary.useQuery({ year: new Date().getFullYear() }, {
    retry: false,
    staleTime: 60000,
  });
  const { data: leadStats } = trpc.leads.analytics.overview.useQuery(undefined, {
    retry: false,
    staleTime: 60000,
  });

  const quickModules = [
    { id: "finance", label: "Financial", icon: Wallet, path: "/finance", color: "bg-amber-500/15 text-amber-600" },
    { id: "leads", label: "Leads", icon: Target, path: "/leads/dashboard", color: "bg-rose-500/15 text-rose-600" },
    { id: "contracts", label: "Contracts", icon: FileText, path: "/contracting", color: "bg-blue-500/15 text-blue-600" },
    { id: "docs", label: "Client Docs", icon: FolderCheck, path: "/docs/dashboard", color: "bg-emerald-500/15 text-emerald-600" },
    { id: "analysis", label: "Analysis", icon: Search, path: "/analysis/dashboard", color: "bg-violet-500/15 text-violet-600" },
    { id: "marketing", label: "Marketing", icon: Megaphone, path: "/marketing", color: "bg-purple-500/15 text-purple-600" },
  ];

  return (
    <div className="px-4 py-5 space-y-6">
      {/* Greeting */}
      <div>
        <p className="text-muted-foreground text-sm">Welcome back</p>
        <h1 className="text-2xl font-bold text-foreground">Hello, {firstName}</h1>
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Yearly Income"
          value={finSummary?.yearlyIncome != null ? `${(finSummary.yearlyIncome / 1000).toFixed(0)}k` : "—"}
          icon={DollarSign}
          color="text-emerald-600 bg-emerald-500/10"
        />
        <StatCard
          label="Total Leads"
          value={leadStats?.total?.toString() ?? "—"}
          icon={Users}
          color="text-blue-600 bg-blue-500/10"
        />
        <StatCard
          label="This Month"
          value={finSummary?.monthlyIncome != null ? `${(finSummary.monthlyIncome / 1000).toFixed(0)}k` : "—"}
          icon={TrendingUp}
          color="text-amber-600 bg-amber-500/10"
        />
        <StatCard
          label="Net Profit"
          value={finSummary?.yearlyProfit != null ? `${(finSummary.yearlyProfit / 1000).toFixed(0)}k` : "—"}
          icon={Calendar}
          color="text-rose-600 bg-rose-500/10"
        />
      </div>

      {/* Quick Access Modules */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Modules</h2>
        <div className="grid grid-cols-3 gap-3">
          {quickModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.id}
                onClick={() => setLocation(mod.path)}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all active:scale-95"
              >
                <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center", mod.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-medium text-foreground text-center leading-tight">{mod.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Activity / Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Actions</h2>
        <div className="space-y-2">
          <QuickAction
            label="Create New Contract"
            description="Issue a new client contract"
            icon={FileText}
            onClick={() => setLocation("/contracting/contracts")}
          />
          <QuickAction
            label="Add New Lead"
            description="Register a new prospect"
            icon={Target}
            onClick={() => setLocation("/leads")}
          />
          <QuickAction
            label="Record Income"
            description="Log a new payment received"
            icon={DollarSign}
            onClick={() => setLocation("/finance/income")}
          />
          <QuickAction
            label="Upload Documents"
            description="Add client documentation"
            icon={FolderCheck}
            onClick={() => setLocation("/docs")}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card Component ──────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="p-4 rounded-2xl bg-card border border-border">
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center mb-2", color)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

// ─── Quick Action Component ───────────────────────────────────────────────────
function QuickAction({ label, description, icon: Icon, onClick }: { label: string; description: string; icon: any; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border hover:border-primary/30 transition-all active:scale-[0.98]"
    >
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 text-left">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}
