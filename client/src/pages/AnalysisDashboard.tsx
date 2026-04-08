import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FolderOpen, CheckCircle2, AlertTriangle, Clock, Plus,
  TrendingUp, FileSearch, BarChart3, ArrowRight, Users,
} from "lucide-react";
import { useLocation } from "wouter";
import { formatDate } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:        { label: "Draft",        color: "bg-zinc-100 text-zinc-600 border-zinc-200",         icon: Clock },
  in_progress:  { label: "In Progress",  color: "bg-blue-100 text-blue-700 border-blue-200",          icon: FileSearch },
  complete:     { label: "Complete",     color: "bg-green-100 text-green-700 border-green-200",        icon: CheckCircle2 },
  issues_found: { label: "Issues Found", color: "bg-red-100 text-red-700 border-red-200",             icon: AlertTriangle },
};

export default function AnalysisDashboard() {
  const [, navigate] = useLocation();
  const { data: cases, isLoading } = trpc.cases.list.useQuery();

  // Compute stats
  const total = cases?.length ?? 0;
  const byStatus = {
    draft:        cases?.filter(c => c.status === "draft").length ?? 0,
    in_progress:  cases?.filter(c => c.status === "in_progress").length ?? 0,
    complete:     cases?.filter(c => c.status === "complete").length ?? 0,
    issues_found: cases?.filter(c => c.status === "issues_found").length ?? 0,
  };
  const recentCases = cases?.slice(0, 6) ?? [];

  const statCards = [
    { label: "Total Cases",    value: total,                icon: FolderOpen,   color: "text-blue-600",  bg: "bg-blue-50" },
    { label: "In Progress",    value: byStatus.in_progress, icon: FileSearch,   color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Complete",       value: byStatus.complete,    icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
    { label: "Issues Found",   value: byStatus.issues_found,icon: AlertTriangle,color: "text-red-600",   bg: "bg-red-50" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Elevay — Application Analysis</p>
        </div>
        <Button onClick={() => navigate("/analysis")} className="gap-2">
          <Plus className="h-4 w-4" />
          New Case
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} className="border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${s.bg}`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{s.label}</p>
                {isLoading ? (
                  <div className="h-7 w-10 bg-muted animate-pulse rounded mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-foreground leading-none mt-1">{s.value}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Status Breakdown + Recent Cases */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Status Breakdown */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const count = byStatus[key as keyof typeof byStatus];
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-foreground">{cfg.label}</span>
                    <span className="text-sm font-semibold text-foreground">{count}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {total === 0 && !isLoading && (
              <p className="text-sm text-muted-foreground text-center py-2">No cases yet</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Cases */}
        <Card className="border shadow-sm md:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Recent Cases
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/analysis")}
              className="gap-1 text-muted-foreground hover:text-foreground"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="divide-y">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-6 py-3">
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
                  </div>
                ))}
              </div>
            ) : recentCases.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                <FolderOpen className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No cases yet. Create your first case.</p>
                <Button size="sm" onClick={() => navigate("/analysis")} className="gap-1.5 mt-1">
                  <Plus className="h-3.5 w-3.5" /> New Case
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {recentCases.map((c) => {
                  const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.draft;
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/analysis/cases/${c.id}`)}
                      className="flex items-center justify-between w-full px-6 py-3 hover:bg-muted/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <FolderOpen className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{c.clientName}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</p>
                        </div>
                      </div>
                      <Badge className={`${cfg.color} border text-xs gap-1 shrink-0 ml-3`}>
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Button
            variant="outline"
            className="h-auto py-4 flex flex-col gap-2 items-center justify-center"
            onClick={() => navigate("/analysis")}
          >
            <Plus className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">New Case</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-4 flex flex-col gap-2 items-center justify-center"
            onClick={() => navigate("/analysis")}
          >
            <FolderOpen className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium">All Cases</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-4 flex flex-col gap-2 items-center justify-center"
            onClick={() => navigate("/analysis")}
          >
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span className="text-sm font-medium">Issues Found</span>
            {byStatus.issues_found > 0 && (
              <Badge className="bg-red-100 text-red-700 border-red-200 border text-xs">
                {byStatus.issues_found}
              </Badge>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
