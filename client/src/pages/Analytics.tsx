import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, FileText, Receipt, Users, BarChart3 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const STATUS_COLORS = {
  pending: "#f59e0b",
  signed: "#10b981",
  cancelled: "#ef4444",
};

const FAMILY_COLORS = ["#1e3a5f", "#c8a96e", "#10b981", "#6366f1", "#f59e0b", "#ef4444"];

export default function Analytics() {
  const { data: stats, isLoading: statsLoading } = trpc.contracting.analytics.stats.useQuery();
  const { data: familyDist, isLoading: familyLoading } = trpc.contracting.analytics.familyDistribution.useQuery();
  const { data: recentContracts } = trpc.contracting.analytics.recentContracts.useQuery({ limit: 20 });

  // Contract status pie data
  const statusData = stats
    ? [
        { name: "Pending", value: stats.pending, color: STATUS_COLORS.pending },
        { name: "Signed", value: stats.signed, color: STATUS_COLORS.signed },
        { name: "Cancelled", value: stats.cancelled, color: STATUS_COLORS.cancelled },
      ].filter((d) => d.value > 0)
    : [];

  // Family distribution bar data
  const familyData = familyDist?.map((d) => ({
    members: `${d.members} Member${d.members > 1 ? "s" : ""}`,
    count: d.count,
    value: d.members === 1 ? 12000 : d.members === 2 ? 13000 : d.members <= 4 ? 14000 : 15000,
  })) ?? [];

  // Revenue by month (from recent contracts)
  const monthlyData: Record<string, { month: string; contracts: number; revenue: number }> = {};
  recentContracts?.forEach((c) => {
    const date = new Date(c.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    if (!monthlyData[key]) {
      monthlyData[key] = { month: label, contracts: 0, revenue: 0 };
    }
    monthlyData[key].contracts++;
    if (c.status === "signed") {
      monthlyData[key].revenue += Number(c.contractValue);
    }
  });
  const monthlyChartData = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));

  const kpiCards = [
    {
      title: "Total Contracts",
      value: stats?.total ?? 0,
      icon: FileText,
      color: "text-blue-600",
      bg: "bg-blue-50",
      suffix: "",
    },
    {
      title: "Signed Rate",
      value: stats?.total ? Math.round((stats.signed / stats.total) * 100) : 0,
      icon: TrendingUp,
      color: "text-green-600",
      bg: "bg-green-50",
      suffix: "%",
    },
    {
      title: "Total Revenue",
      value: formatCurrency(stats?.totalValue ?? 0, "EUR"),
      icon: Receipt,
      color: "text-amber-600",
      bg: "bg-amber-50",
      suffix: "",
    },
    {
      title: "Collected",
      value: formatCurrency(stats?.totalValue ?? 0, "EUR"),
      icon: Users,
      color: "text-purple-600",
      bg: "bg-purple-50",
      suffix: "",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics & Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Visual overview of contracts, revenue, and performance metrics
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <Card key={card.title} className="border shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{card.title}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {statsLoading ? "—" : `${card.value}${card.suffix}`}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contract Status Distribution */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Contract Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading || statusData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                {statsLoading ? "Loading..." : "No data yet"}
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="60%" height={200}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => [`${val} contracts`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3 flex-1">
                  {statusData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="text-sm text-muted-foreground">{d.name}</span>
                      </div>
                      <span className="text-sm font-semibold">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Family Member Distribution */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Family Member Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {familyLoading || familyData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                {familyLoading ? "Loading..." : "No data yet"}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={familyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="members" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(val) => [`${val} contracts`, "Count"]}
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e5e5e5" }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {familyData.map((_, index) => (
                      <Cell key={index} fill={FAMILY_COLORS[index % FAMILY_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Contracts & Revenue */}
      {monthlyChartData.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Monthly Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid #e5e5e5" }}
                  formatter={(val, name) => [
                    name === "revenue" ? formatCurrency(Number(val), "EUR") : val,
                    name === "revenue" ? "Revenue" : "Contracts",
                  ]}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="contracts" name="Contracts" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="revenue" name="Revenue (EUR)" fill="#c8a96e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Revenue Summary */}
      {stats && stats.totalValue > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Payment Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-muted-foreground">Total Contract Value (Signed)</span>
                <span className="font-semibold">{formatCurrency(stats.totalValue, "EUR")}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-muted-foreground">Total Collected</span>
                <span className="font-semibold text-green-600">{formatCurrency(stats.totalValue, "EUR")}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium">Outstanding Balance</span>
                <span className="font-bold text-amber-600">
                  {formatCurrency(stats.totalValue - stats.totalValue, "EUR")}
                </span>
              </div>
              <div className="mt-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Collection Progress</span>
                  <span>{stats.totalValue > 0 ? Math.round((stats.totalValue / stats.totalValue) * 100) : 0}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${stats.totalValue > 0 ? Math.min(100, (stats.totalValue / stats.totalValue) * 100) : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
