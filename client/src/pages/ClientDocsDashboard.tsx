import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Users, AlertTriangle, CheckCircle2, Clock, FileText, Stamp, Building2, Search, X, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";

type Stage = "preparation" | "spain_team_received" | "submission" | "approved";

function getProgressColor(pct: number) {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-blue-500";
  if (pct >= 25) return "bg-amber-500";
  return "bg-red-500";
}

function StageBadge({ stage }: { stage: Stage }) {
  const map: Record<Stage, { label: string; cls: string }> = {
    preparation: { label: "Preparation", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    spain_team_received: { label: "Spain Team Received", cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
    submission: { label: "Submission", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  };
  const s = map[stage] ?? map.preparation;
  return (
    <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function DeadlineBadge({ days, label }: { days: number | null; label: string }) {
  if (days === null) return null;
  const urgent = days <= 12;
  const warning = days <= 30;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
      urgent ? "bg-red-100 text-red-700" : warning ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
    }`}>
      <Clock className="h-3 w-3" />
      {label}: {days}d
    </span>
  );
}

const PARALEGALS = ["All", "Madonna", "Monica", "Marina"];
const CONSULTANTS = ["All", "Mahmoud", "Ziad", "Fouad", "Kirolos"];
const STAGE_OPTIONS = [
  { value: "all", label: "All Stages" },
  { value: "preparation", label: "Preparation" },
  { value: "spain_team_received", label: "Spain Team Received" },
  { value: "submission", label: "Submission" },
  { value: "approved", label: "Approved" },
];
const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "complete", label: "Complete (100%)" },
  { value: "in_progress", label: "In Progress" },
  { value: "not_started", label: "Not Started" },
  { value: "urgent", label: "Urgent Deadline" },
];

export default function ClientDocsDashboard() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = trpc.clientDocs.dashboard.useQuery();

  const clients = data?.clients ?? [];
  const stats = data?.stats;

  const [search, setSearch] = useState("");
  const [paralegalFilter, setParalegalFilter] = useState("All");
  const [consultantFilter, setConsultantFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");

  const totalClients = clients.length;
  const fullyComplete = clients.filter(c => c.overallPercent === 100).length;
  const inProgress = clients.filter(c => c.overallPercent > 0 && c.overallPercent < 100).length;
  const urgentDeadlines = clients.filter(c =>
    (c.daysToSchengen !== null && c.daysToSchengen <= 30) ||
    (c.daysToSubmission !== null && c.daysToSubmission <= 12)
  ).length;

  const filtered = useMemo(() => {
    return clients.filter(c => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        c.clientName.toLowerCase().includes(q) ||
        (c.clientCode ?? "").toLowerCase().includes(q) ||
        (c.paralegal ?? "").toLowerCase().includes(q) ||
        (c.consultant ?? "").toLowerCase().includes(q);
      const matchParalegal = paralegalFilter === "All" || c.paralegal === paralegalFilter;
      const matchConsultant = consultantFilter === "All" || c.consultant === consultantFilter;
      const matchStage = stageFilter === "all" || c.stage === stageFilter;
      const matchStatus = statusFilter === "all" ? true
        : statusFilter === "complete" ? c.overallPercent === 100
        : statusFilter === "in_progress" ? c.overallPercent > 0 && c.overallPercent < 100
        : statusFilter === "not_started" ? c.overallPercent === 0
        : statusFilter === "urgent" ? (
            (c.daysToSchengen !== null && c.daysToSchengen <= 30) ||
            (c.daysToSubmission !== null && c.daysToSubmission <= 12)
          ) : true;
      return matchSearch && matchParalegal && matchConsultant && matchStage && matchStatus;
    });
  }, [clients, search, paralegalFilter, consultantFilter, statusFilter, stageFilter]);

  const hasFilters = search || paralegalFilter !== "All" || consultantFilter !== "All" || statusFilter !== "all" || stageFilter !== "all";

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-white">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Page Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Client Documentation Dashboard</h1>
            <p className="text-gray-500 mt-1">Track document collection progress and case stages for all clients</p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[
              { label: "Total Clients", value: totalClients, icon: Users, bg: "bg-blue-50", color: "text-blue-600" },
              { label: "Complete Docs", value: fullyComplete, icon: CheckCircle2, bg: "bg-emerald-50", color: "text-emerald-600" },
              { label: "In Progress", value: inProgress, icon: Clock, bg: "bg-amber-50", color: "text-amber-600" },
              { label: "Urgent Deadlines", value: urgentDeadlines, icon: AlertTriangle, bg: "bg-red-50", color: "text-red-600" },
            ].map(({ label, value, icon: Icon, bg, color }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg ${bg} flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{value}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Stage Stats Row */}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              {[
                { label: "Preparation", value: stats.preparation, cls: "border-blue-200 bg-blue-50 text-blue-700" },
                { label: "Spain Team Received", value: stats.spainTeamReceived, cls: "border-cyan-200 bg-cyan-50 text-cyan-700" },
                { label: "Submission", value: stats.submission, cls: "border-amber-200 bg-amber-50 text-amber-700" },
                { label: "Approved", value: stats.approved, cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
                {
                  label: "Approved On Time",
                  value: stats.onTimePercent !== null ? `${stats.onTimePercent}%` : "—",
                  cls: "border-purple-200 bg-purple-50 text-purple-700",
                  icon: TrendingUp,
                },
              ].map(({ label, value, cls, icon: Icon }) => (
                <div key={label} className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${cls}`}>
                  {Icon && <Icon className="h-4 w-4 shrink-0 opacity-70" />}
                  <div>
                    <p className="text-xl font-bold">{value}</p>
                    <p className="text-xs opacity-70">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Search & Filters */}
          <div className="flex flex-wrap gap-3 mb-5">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name, code, paralegal, consultant…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm border-gray-200"
              />
            </div>
            <select
              value={stageFilter}
              onChange={e => setStageFilter(e.target.value)}
              className="h-9 px-3 text-sm border border-gray-200 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
            >
              {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-9 px-3 text-sm border border-gray-200 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
            >
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={paralegalFilter}
              onChange={e => setParalegalFilter(e.target.value)}
              className="h-9 px-3 text-sm border border-gray-200 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
            >
              {PARALEGALS.map(p => <option key={p} value={p}>{p === "All" ? "All Paralegals" : p}</option>)}
            </select>
            <select
              value={consultantFilter}
              onChange={e => setConsultantFilter(e.target.value)}
              className="h-9 px-3 text-sm border border-gray-200 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
            >
              {CONSULTANTS.map(c => <option key={c} value={c}>{c === "All" ? "All Consultants" : c}</option>)}
            </select>
            {hasFilters && (
              <button
                onClick={() => { setSearch(""); setParalegalFilter("All"); setConsultantFilter("All"); setStatusFilter("all"); setStageFilter("all"); }}
                className="h-9 px-3 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-md flex items-center gap-1.5 bg-white"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>

          {/* Results count */}
          {hasFilters && (
            <p className="text-sm text-gray-500 mb-3">
              Showing <strong>{filtered.length}</strong> of {totalClients} clients
            </p>
          )}

          {/* Client Table */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No clients yet</p>
              <p className="text-gray-400 text-sm mt-1">Add clients from the Clients page to track their progress here</p>
              <button onClick={() => setLocation("/docs")} className="mt-4 px-4 py-2 bg-[#1e3a5f] text-white text-sm rounded-lg hover:bg-[#16304f] transition-colors">
                Go to Clients
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <Search className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No clients match your filters</p>
              <button onClick={() => { setSearch(""); setParalegalFilter("All"); setConsultantFilter("All"); setStatusFilter("all"); setStageFilter("all"); }} className="mt-3 text-sm text-[#1e3a5f] hover:underline">
                Clear filters
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <div className="col-span-3">Client</div>
                <div className="col-span-2">Team</div>
                <div className="col-span-1 text-center">Stage</div>
                <div className="col-span-2 text-center">Documents</div>
                <div className="col-span-2">Progress</div>
                <div className="col-span-2 text-right">Deadlines</div>
              </div>
              <div className="divide-y divide-gray-50">
                {filtered.map((client) => {
                  const isUrgent = (client.daysToSchengen !== null && client.daysToSchengen <= 12) ||
                    (client.daysToSubmission !== null && client.daysToSubmission <= 12);
                  return (
                    <div
                      key={client.id}
                      onClick={() => setLocation(`/docs/clients/${client.id}`)}
                      className={`grid grid-cols-12 gap-4 px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors group ${isUrgent ? "border-l-4 border-red-400" : ""}`}
                    >
                      <div className="col-span-3 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center text-sm font-bold shrink-0">
                          {client.clientName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate group-hover:text-[#1e3a5f] transition-colors">{client.clientName}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {client.clientCode && <span className="text-xs text-gray-400">{client.clientCode}</span>}
                            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {client.applicationType === "freelancer" ? "Freelancer" : "Business Owner"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-2 flex flex-col justify-center gap-0.5">
                        {client.paralegal && <p className="text-xs text-gray-600 truncate"><span className="text-gray-400">Para:</span> {client.paralegal}</p>}
                        {client.consultant && <p className="text-xs text-gray-600 truncate"><span className="text-gray-400">Con:</span> {client.consultant}</p>}
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <StageBadge stage={(client.stage ?? "preparation") as Stage} />
                      </div>
                      <div className="col-span-2 flex items-center justify-center gap-1">
                        <FileText className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-700">{client.receivedDocs}/{client.totalDocs}</span>
                      </div>
                      <div className="col-span-2 flex flex-col justify-center gap-1.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${getProgressColor(client.overallPercent)}`} style={{ width: `${client.overallPercent}%` }} />
                          </div>
                          <span className="text-xs font-bold text-gray-700 w-8 text-right">{client.overallPercent}%</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {[
                            { icon: FileText, label: "Docs", pct: client.receivePercent, color: "bg-blue-400" },
                            { icon: Stamp, label: "MOFA", pct: client.mofaPercent, color: "bg-amber-400" },
                            { icon: Building2, label: "Embassy", pct: client.embassyPercent, color: "bg-purple-400" },
                          ].map(({ icon: Icon, label, pct, color }) => (
                            <div key={label} className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1">
                                <Icon className="h-2.5 w-2.5 text-gray-400" />
                                <span className="text-[10px] text-gray-400">{label}</span>
                              </div>
                              <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="col-span-2 flex flex-col items-end justify-center gap-1">
                        <DeadlineBadge days={client.daysToSchengen} label="Schengen" />
                        <DeadlineBadge days={client.daysToSubmission} label="Submit" />
                        {client.stage === "approved" && client.approvedOnTime !== null && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${client.approvedOnTime ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                            {client.approvedOnTime ? "✓ On Time" : "✗ Delayed"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {clients.length > 0 && (
            <div className="mt-4 flex items-center gap-6 text-xs text-gray-400">
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-emerald-500 inline-block" /> ≥80%</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-blue-500 inline-block" /> 50–79%</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-amber-500 inline-block" /> 25–49%</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-red-500 inline-block" /> &lt;25%</span>
              <span className="flex items-center gap-1.5"><span className="h-1 w-4 bg-red-400 inline-block" /> Urgent (red left border)</span>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
