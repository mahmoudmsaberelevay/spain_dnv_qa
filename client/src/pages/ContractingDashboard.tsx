import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, Receipt, TrendingUp, Users, Plus, ArrowRight, Clock,
  UserCheck, Filter, Calendar, Download,
} from "lucide-react";
import { useLocation } from "wouter";
import { useState, useMemo, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import NewContractDialog from "@/components/NewContractDialog";
import { formatCurrency, formatDate, getStatusBadgeClass } from "@/lib/utils";
import { toast } from "sonner";

const CONSULTANTS = ["Fouad Abdo", "Kirlos Nabil"];

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type DateRangePreset = "all" | "this_month" | "last_month" | "this_quarter" | "this_year";

const DATE_RANGE_LABELS: Record<DateRangePreset, string> = {
  all: "All Time",
  this_month: "This Month",
  last_month: "Last Month",
  this_quarter: "This Quarter",
  this_year: "This Year",
};

function computeDateRange(preset: DateRangePreset): { dateFrom?: Date; dateTo?: Date } {
  const now = new Date();
  if (preset === "all") return {};
  if (preset === "this_month") {
    return {
      dateFrom: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      dateTo: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }
  if (preset === "last_month") {
    return {
      dateFrom: new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0),
      dateTo: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
    };
  }
  if (preset === "this_quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return {
      dateFrom: new Date(now.getFullYear(), q * 3, 1, 0, 0, 0, 0),
      dateTo: new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999),
    };
  }
  if (preset === "this_year") {
    return {
      dateFrom: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
      dateTo: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  }
  return {};
}

function exportToCSV(rows: any[], filename: string) {
  const headers = [
    "Contract Code", "Client Name", "Family Members", "Contract Value (EUR)",
    "Discount (EUR)", "Consultant", "Status", "Date",
  ];
  const csvRows = [
    headers.join(","),
    ...rows.map((c) =>
      [
        c.contractCode,
        `"${c.clientName}"`,
        c.familyMembers,
        Number(c.contractValue).toFixed(2),
        Number(c.discountValue ?? 0).toFixed(2),
        `"${c.consultantName ?? ""}"`,
        c.status,
        c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "",
      ].join(",")
    ),
  ];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [showNewContract, setShowNewContract] = useState(false);
  const [selectedConsultant, setSelectedConsultant] = useState<string | undefined>(undefined);
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>("all");

  const currentYear = new Date().getFullYear();

  const { dateFrom, dateTo } = useMemo(() => computeDateRange(dateRangePreset), [dateRangePreset]);

  const statsInput = useMemo(
    () => ({ consultantName: selectedConsultant, dateFrom, dateTo }),
    [selectedConsultant, dateFrom, dateTo]
  );

  const recentInput = useMemo(
    () => ({ limit: 5, consultantName: selectedConsultant, dateFrom, dateTo }),
    [selectedConsultant, dateFrom, dateTo]
  );

  const exportInput = useMemo(
    () => ({ consultantName: selectedConsultant, dateFrom, dateTo }),
    [selectedConsultant, dateFrom, dateTo]
  );

  const chartYear = useMemo(() => {
    if (dateFrom) return dateFrom.getFullYear();
    return currentYear;
  }, [dateFrom, currentYear]);

  const monthlyInput = useMemo(
    () => ({ year: chartYear, consultantName: selectedConsultant }),
    [chartYear, selectedConsultant]
  );

  const { data: stats, isLoading: statsLoading } = trpc.contracting.analytics.stats.useQuery(statsInput);
  const { data: recentContracts, isLoading: contractsLoading } = trpc.contracting.analytics.recentContracts.useQuery(recentInput);
  const { data: exportData } = trpc.contracting.analytics.exportContracts.useQuery(exportInput);
  const { data: monthlyRevenue } = trpc.contracting.analytics.monthlyRevenue.useQuery(monthlyInput);
  const { data: rateInfo } = trpc.contracting.exchangeRate.current.useQuery();
  const { data: consultantStats } = trpc.contracting.analytics.consultantStats.useQuery();

  const chartData = useMemo(() => {
    if (!monthlyRevenue) return [];
    return monthlyRevenue.map((d) => ({
      month: MONTH_LABELS[d.month - 1],
      value: d.value,
    }));
  }, [monthlyRevenue]);

  const hasChartData = chartData.some((d) => d.value > 0);

  const handleExportCSV = useCallback(() => {
    if (!exportData?.length) {
      toast.error("No contracts to export.");
      return;
    }
    const preset = dateRangePreset !== "all" ? `_${DATE_RANGE_LABELS[dateRangePreset].replace(/\s+/g, "_")}` : "";
    const consultant = selectedConsultant ? `_${selectedConsultant.replace(/\s+/g, "_")}` : "";
    exportToCSV(exportData, `contracts${preset}${consultant}.csv`);
    toast.success(`Exported ${exportData.length} contracts to CSV.`);
  }, [exportData, dateRangePreset, selectedConsultant]);

  const statCards = [
    {
      title: "Total Contracts",
      value: stats?.total ?? 0,
      icon: FileText,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: "Signed Contracts",
      value: stats?.signed ?? 0,
      icon: Users,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      title: "Total Revenue",
      value: formatCurrency(stats?.totalValue ?? 0, "EUR"),
      icon: TrendingUp,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      title: "Total Collected",
      value: formatCurrency(stats?.totalValue ?? 0, "EUR"),
      icon: Receipt,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  const hasActiveFilters = selectedConsultant || dateRangePreset !== "all";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Elevay — Contracting
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Date Range Filter */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select
              value={dateRangePreset}
              onValueChange={(v) => setDateRangePreset(v as DateRangePreset)}
            >
              <SelectTrigger className="w-40 h-9 text-sm">
                <SelectValue placeholder="All Time" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DATE_RANGE_LABELS) as DateRangePreset[]).map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {DATE_RANGE_LABELS[preset]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Consultant Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
              value={selectedConsultant ?? "all"}
              onValueChange={(v) => setSelectedConsultant(v === "all" ? undefined : v)}
            >
              <SelectTrigger className="w-44 h-9 text-sm">
                <SelectValue placeholder="All Consultants" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Consultants</SelectItem>
                {CONSULTANTS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Export CSV */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-9"
            onClick={handleExportCSV}
            disabled={!exportData?.length}
          >
            <Download className="h-4 w-4" />
            Export CSV
            {exportData && exportData.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{exportData.length}</Badge>
            )}
          </Button>

          <Button
            onClick={() => setShowNewContract(true)}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
            size="lg"
          >
            <Plus className="h-4 w-4" />
            Issue New Contract
          </Button>
        </div>
      </div>

      {/* Active filter badges */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          {dateRangePreset !== "all" && (
            <Badge variant="secondary" className="gap-1 text-sm">
              <Calendar className="h-3.5 w-3.5" />
              {DATE_RANGE_LABELS[dateRangePreset]}
              <button
                onClick={() => setDateRangePreset("all")}
                className="ml-1 hover:text-destructive transition-colors"
                aria-label="Clear date filter"
              >
                ×
              </button>
            </Badge>
          )}
          {selectedConsultant && (
            <Badge variant="secondary" className="gap-1 text-sm">
              <UserCheck className="h-3.5 w-3.5" />
              {selectedConsultant}
              <button
                onClick={() => setSelectedConsultant(undefined)}
                className="ml-1 hover:text-destructive transition-colors"
                aria-label="Clear consultant filter"
              >
                ×
              </button>
            </Badge>
          )}
        </div>
      )}

      {/* Exchange Rate Banner */}
      {rateInfo && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-sm text-amber-800">
            <strong>Live Rate:</strong> 1 EUR = {rateInfo.rate.toFixed(4)} EGP
            <span className="text-amber-600 ml-2">· Source: {rateInfo.source}</span>
          </span>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.title} className="border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {card.title}
                  </p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {statsLoading ? "—" : card.value}
                  </p>
                </div>
                <div className={`h-10 w-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Status Overview */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="border shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-yellow-600">{stats.pending}</p>
              <p className="text-sm text-muted-foreground mt-1">Pending</p>
            </CardContent>
          </Card>
          <Card className="border shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-600">{stats.signed}</p>
              <p className="text-sm text-muted-foreground mt-1">Signed</p>
            </CardContent>
          </Card>
          <Card className="border shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-red-600">{stats.cancelled}</p>
              <p className="text-sm text-muted-foreground mt-1">Cancelled</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Monthly Revenue Bar Chart */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Monthly Revenue — {chartYear}
              {selectedConsultant && (
                <span className="text-xs font-normal text-muted-foreground">({selectedConsultant})</span>
              )}
            </div>
            <span className="text-xs font-normal text-muted-foreground">Signed contracts only</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasChartData ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No signed contracts in {chartYear}
              {selectedConsultant ? ` for ${selectedConsultant}` : ""}.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => v === 0 ? "0" : `€${(v / 1000).toFixed(0)}k`}
                  width={50}
                />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value, "EUR"), "Revenue"]}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                />
                <Bar
                  dataKey="value"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Recent Contracts */}
      <Card className="border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">
            Recent Contracts
            {(selectedConsultant || dateRangePreset !== "all") && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {[selectedConsultant, dateRangePreset !== "all" ? DATE_RANGE_LABELS[dateRangePreset] : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/contracting/contracts")}
            className="gap-1 text-muted-foreground hover:text-foreground"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {contractsLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading...</div>
          ) : !recentContracts?.length ? (
            <div className="p-6 text-center">
              <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">
                {hasActiveFilters
                  ? "No contracts found for the selected filters."
                  : "No contracts yet. Issue your first contract!"}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {recentContracts.map((contract) => (
                <div key={contract.id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{contract.clientName}</p>
                      <p className="text-xs text-muted-foreground">{contract.contractCode}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{formatCurrency(Number(contract.contractValue), "EUR")}</span>
                    <Badge className={`text-xs ${getStatusBadgeClass(contract.status)}`}>
                      {contract.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consultant Performance */}
      {consultantStats && consultantStats.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              Consultant Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {consultantStats
                .filter(c => !selectedConsultant || c.name === selectedConsultant)
                .map((c) => (
                  <div key={c.name} className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <UserCheck className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-foreground">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <p className="text-xs text-muted-foreground">Signed</p>
                        <p className="text-sm font-bold text-green-600">{c.count}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total Value</p>
                        <p className="text-sm font-bold text-foreground">{formatCurrency(c.value, "EUR")}</p>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <NewContractDialog open={showNewContract} onClose={() => setShowNewContract(false)} />
    </div>
  );
}
