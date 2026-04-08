import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Users, AlertTriangle, CheckCircle2, Clock, FileText, Stamp, Building2 } from "lucide-react";

function getProgressColor(pct: number) {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-blue-500";
  if (pct >= 25) return "bg-amber-500";
  return "bg-red-500";
}

function DeadlineBadge({ days, label }: { days: number | null; label: string }) {
  if (days === null) return null;
  const urgent = days <= 12;
  const warning = days <= 30;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
        urgent
          ? "bg-red-100 text-red-700"
          : warning
          ? "bg-amber-100 text-amber-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      <Clock className="h-3 w-3" />
      {label}: {days}d
    </span>
  );
}

export default function ClientDocsDashboard() {
  const [, setLocation] = useLocation();
  const { data: clients, isLoading } = trpc.clientDocs.dashboard.useQuery();

  const totalClients = clients?.length ?? 0;
  const fullyComplete = clients?.filter(c => c.overallPercent === 100).length ?? 0;
  const inProgress = clients?.filter(c => c.overallPercent > 0 && c.overallPercent < 100).length ?? 0;
  const notStarted = clients?.filter(c => c.overallPercent === 0).length ?? 0;
  const urgentDeadlines = clients?.filter(c =>
    (c.daysToSchengen !== null && c.daysToSchengen <= 30) ||
    (c.daysToSubmission !== null && c.daysToSubmission <= 12)
  ).length ?? 0;

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-white">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Client Documentation Dashboard</h1>
            <p className="text-gray-500 mt-1">Track document collection progress for all clients</p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{totalClients}</p>
                  <p className="text-xs text-gray-500">Total Clients</p>
                </div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{fullyComplete}</p>
                  <p className="text-xs text-gray-500">Complete</p>
                </div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{inProgress}</p>
                  <p className="text-xs text-gray-500">In Progress</p>
                </div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{urgentDeadlines}</p>
                  <p className="text-xs text-gray-500">Urgent Deadlines</p>
                </div>
              </div>
            </div>
          </div>

          {/* Client Table */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !clients || clients.length === 0 ? (
            <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No clients yet</p>
              <p className="text-gray-400 text-sm mt-1">Add clients from the Clients page to track their progress here</p>
              <button
                onClick={() => setLocation("/docs")}
                className="mt-4 px-4 py-2 bg-[#1e3a5f] text-white text-sm rounded-lg hover:bg-[#16304f] transition-colors"
              >
                Go to Clients
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <div className="col-span-3">Client</div>
                <div className="col-span-2">Team</div>
                <div className="col-span-2 text-center">Documents</div>
                <div className="col-span-3">Progress</div>
                <div className="col-span-2 text-right">Deadlines</div>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-gray-50">
                {clients.map((client) => (
                  <div
                    key={client.id}
                    onClick={() => setLocation(`/docs/clients/${client.id}`)}
                    className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors group"
                  >
                    {/* Client Name & Code */}
                    <div className="col-span-3 flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center text-sm font-bold shrink-0">
                        {client.clientName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate group-hover:text-[#1e3a5f] transition-colors">
                          {client.clientName}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {client.clientCode && (
                            <span className="text-xs text-gray-400">{client.clientCode}</span>
                          )}
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {client.applicationType === "freelancer" ? "Freelancer" : "Business Owner"}
                          </span>
                          {client.maritalStatus === "family" && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">Family</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Team */}
                    <div className="col-span-2 flex flex-col justify-center gap-0.5">
                      {client.paralegal && (
                        <p className="text-xs text-gray-600 truncate">
                          <span className="text-gray-400">Para:</span> {client.paralegal}
                        </p>
                      )}
                      {client.consultant && (
                        <p className="text-xs text-gray-600 truncate">
                          <span className="text-gray-400">Con:</span> {client.consultant}
                        </p>
                      )}
                    </div>

                    {/* Documents count */}
                    <div className="col-span-2 flex items-center justify-center gap-1">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">
                        {client.receivedDocs}/{client.totalDocs}
                      </span>
                    </div>

                    {/* Progress bars */}
                    <div className="col-span-3 flex flex-col justify-center gap-1.5">
                      {/* Overall */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${getProgressColor(client.overallPercent)}`}
                            style={{ width: `${client.overallPercent}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-gray-700 w-8 text-right">
                          {client.overallPercent}%
                        </span>
                      </div>
                      {/* Sub-bars */}
                      <div className="grid grid-cols-3 gap-1">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <FileText className="h-2.5 w-2.5 text-gray-400" />
                            <span className="text-[10px] text-gray-400">Docs</span>
                          </div>
                          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${client.receivePercent}%` }} />
                          </div>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <Stamp className="h-2.5 w-2.5 text-gray-400" />
                            <span className="text-[10px] text-gray-400">MOFA</span>
                          </div>
                          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${client.mofaPercent}%` }} />
                          </div>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <Building2 className="h-2.5 w-2.5 text-gray-400" />
                            <span className="text-[10px] text-gray-400">Embassy</span>
                          </div>
                          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-purple-400 rounded-full" style={{ width: `${client.embassyPercent}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Deadlines */}
                    <div className="col-span-2 flex flex-col items-end justify-center gap-1">
                      <DeadlineBadge days={client.daysToSchengen} label="Schengen" />
                      <DeadlineBadge days={client.daysToSubmission} label="Submit" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legend */}
          {clients && clients.length > 0 && (
            <div className="mt-4 flex items-center gap-6 text-xs text-gray-400">
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-emerald-500 inline-block" /> ≥80% complete</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-blue-500 inline-block" /> 50–79%</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-amber-500 inline-block" /> 25–49%</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-red-500 inline-block" /> &lt;25%</span>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
