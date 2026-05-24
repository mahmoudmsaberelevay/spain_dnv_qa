import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Users, UserCheck, TrendingUp, UserX, Star, Clock } from "lucide-react";
import { useLocation } from "wouter";

const STAGE_COLORS: Record<string, string> = {
  fresh: "#3b82f6",
  contacted: "#f59e0b",
  qualified: "#8b5cf6",
  prospect: "#06b6d4",
  client: "#10b981",
  dormant: "#6b7280",
  not_qualified_budget: "#ef4444",
  not_qualified_work: "#f97316",
  not_qualified_study: "#ec4899",
  not_qualified_criminal: "#dc2626",
  not_qualified_other: "#9ca3af",
};

const STAGE_LABELS: Record<string, string> = {
  fresh: "Fresh",
  contacted: "Contacted",
  qualified: "Qualified",
  prospect: "Prospect",
  client: "Client",
  dormant: "Dormant",
  not_qualified_budget: "NQ - Budget",
  not_qualified_work: "NQ - Work",
  not_qualified_study: "NQ - Study",
  not_qualified_criminal: "NQ - Criminal",
  not_qualified_other: "NQ - Other",
};

const SOURCE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316", "#ec4899"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function LeadsDashboard() {
  const [year] = useState(() => new Date().getFullYear());
  const [, navigate] = useLocation();

  const goToLeadsByCampaign = useCallback((campaign: string) => {
    navigate(`/leads?campaign=${encodeURIComponent(campaign)}`);
  }, [navigate]);

  const goToLeadsByForm = useCallback((formName: string) => {
    navigate(`/leads?form=${encodeURIComponent(formName)}`);
  }, [navigate]);

  const { data: overview, isLoading: overviewLoading } = trpc.leads.analytics.overview.useQuery();
  const { data: monthly, isLoading: monthlyLoading } = trpc.leads.analytics.monthlyConversions.useQuery({ year });
  const { data: campaignData } = trpc.leads.analytics.byCampaign.useQuery();
  const { data: formData } = trpc.leads.analytics.byForm.useQuery();

  const stageCounts = useMemo(() => {
    if (!overview?.stageCounts) return [];
    return overview.stageCounts.map(s => ({
      name: STAGE_LABELS[s.stage] ?? s.stage,
      value: Number(s.count),
      color: STAGE_COLORS[s.stage] ?? "#6b7280",
    }));
  }, [overview]);

  const sourceCounts = useMemo(() => {
    if (!overview?.sourceCounts) return [];
    return overview.sourceCounts
      .filter(s => s.source)
      .map((s, i) => ({
        name: s.source ?? "Unknown",
        value: Number(s.count),
        color: SOURCE_COLORS[i % SOURCE_COLORS.length],
      }));
  }, [overview]);

  const programCounts = useMemo(() => {
    if (!overview?.programCounts) return [];
    return overview.programCounts
      .filter(p => p.program)
      .map(p => ({ name: p.program ?? "Unknown", value: Number(p.count) }))
      .sort((a, b) => b.value - a.value);
  }, [overview]);

  const campaignCounts = useMemo(() => {
    if (!campaignData) return [];
    return campaignData.map(c => ({
      name: c.campaign ?? "Unknown",
      value: Number(c.count),
    }));
  }, [campaignData]);

  const formCounts = useMemo(() => {
    if (!formData) return [];
    return formData.map(f => ({
      name: f.form ?? "Unknown",
      value: Number(f.count),
    }));
  }, [formData]);

  const monthlyData = useMemo(() => {
    if (!monthly) return [];
    return MONTH_NAMES.map((name, i) => {
      const m = monthly.find(r => Number(r.month) === i + 1);
      return { name, total: Number(m?.total ?? 0), converted: Number(m?.converted ?? 0) };
    });
  }, [monthly]);

  const total = overview?.total ?? 0;
  const fresh = stageCounts.find(s => s.name === "Fresh")?.value ?? 0;
  const clients = stageCounts.find(s => s.name === "Client")?.value ?? 0;
  const qualified = stageCounts.find(s => s.name === "Qualified")?.value ?? 0;
  const dormant = stageCounts.find(s => s.name === "Dormant")?.value ?? 0;
  const prospects = stageCounts.find(s => s.name === "Prospect")?.value ?? 0;

  const conversionRate = total > 0 ? ((clients / total) * 100).toFixed(1) : "0.0";

  if (overviewLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading leads analytics…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Leads Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Overview of your lead pipeline and conversion metrics</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={<Users className="w-5 h-5" />} label="Total Leads" value={total} color="blue" />
        <StatCard icon={<Clock className="w-5 h-5" />} label="Fresh" value={fresh} color="sky" />
        <StatCard icon={<Star className="w-5 h-5" />} label="Qualified" value={qualified} color="purple" />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Prospects" value={prospects} color="cyan" />
        <StatCard icon={<UserCheck className="w-5 h-5" />} label="Clients" value={clients} color="green" />
        <StatCard icon={<UserX className="w-5 h-5" />} label="Dormant" value={dormant} color="gray" />
      </div>

      {/* Conversion Rate Banner */}
      <Card className="border-l-4 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/20">
        <CardContent className="py-4 flex items-center gap-4">
          <div className="text-3xl font-bold text-emerald-600">{conversionRate}%</div>
          <div>
            <div className="font-semibold text-foreground">Overall Conversion Rate</div>
            <div className="text-sm text-muted-foreground">{clients} clients out of {total} total leads</div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stage Distribution Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline Stage Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {stageCounts.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No leads yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={stageCounts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>
                    {stageCounts.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Lead Source Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads by Source</CardTitle>
          </CardHeader>
          <CardContent>
            {sourceCounts.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No source data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={sourceCounts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
                    {sourceCounts.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Conversions Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Leads & Conversions — {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyLoading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" name="Total Leads" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="converted" name="Converted to Client" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Campaign Performance Chart */}
      {campaignCounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">🎯 Leads by Meta Campaign</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(220, campaignCounts.length * 36)}>
              <BarChart data={campaignCounts} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={240}
                  tickFormatter={(v: string) => v.length > 38 ? v.slice(0, 36) + "…" : v}
                />
                <Tooltip formatter={(v: number) => [v, "Leads"]} cursor={{ fill: "rgba(59,130,246,0.08)" }} />
                <Bar
                  dataKey="value"
                  name="Leads"
                  fill="#3b82f6"
                  radius={[0, 4, 4, 0]}
                  style={{ cursor: "pointer" }}
                  onClick={(data: { name: string }) => goToLeadsByCampaign(data.name)}
                >
                  {campaignCounts.map((_, i) => (
                    <Cell key={i} fill={["#3b82f6","#06b6d4","#8b5cf6","#10b981","#f59e0b","#ef4444","#f97316","#ec4899"][i % 8]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Lead Form Performance Chart */}
      {formCounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">📋 Leads by Meta Form</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, formCounts.length * 34)}>
              <BarChart data={formCounts} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={220}
                  tickFormatter={(v: string) => v.length > 32 ? v.slice(0, 30) + "…" : v}
                />
                <Tooltip formatter={(v: number) => [v, "Leads"]} cursor={{ fill: "rgba(16,185,129,0.08)" }} />
                <Bar
                  dataKey="value"
                  name="Leads"
                  fill="#10b981"
                  radius={[0, 4, 4, 0]}
                  style={{ cursor: "pointer" }}
                  onClick={(data: { name: string }) => goToLeadsByForm(data.name)}
                >
                  {formCounts.map((_, i) => (
                    <Cell key={i} fill={["#10b981","#06b6d4","#3b82f6","#8b5cf6","#f59e0b","#ef4444","#f97316","#ec4899"][i % 8]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Program Breakdown */}
      {programCounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads by Interested Program</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={programCounts} layout="vertical" margin={{ top: 4, right: 24, left: 80, bottom: 0 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                <Tooltip />
                <Bar dataKey="value" name="Leads" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-600 bg-blue-100 dark:bg-blue-900/30",
    sky: "text-sky-600 bg-sky-100 dark:bg-sky-900/30",
    purple: "text-purple-600 bg-purple-100 dark:bg-purple-900/30",
    cyan: "text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30",
    green: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30",
    gray: "text-gray-500 bg-gray-100 dark:bg-gray-800/30",
  };
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${colorMap[color]}`}>
          {icon}
        </div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </CardContent>
    </Card>
  );
}
