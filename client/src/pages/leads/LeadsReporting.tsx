import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { BarChart3, Users, TrendingUp, ArrowRightLeft, Download, RefreshCw, Filter, Save, Trash2, ChevronDown } from "lucide-react";

// ─── Date range helpers ───────────────────────────────────────────────────────

function startOfDay(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
function endOfDay(d: Date) {
  const x = new Date(d); x.setHours(23, 59, 59, 999); return x;
}
function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type RangePreset = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth" | "custom";

function getPresetRange(preset: RangePreset): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "last7": {
      const f = new Date(now); f.setDate(f.getDate() - 6);
      return { from: startOfDay(f), to: endOfDay(now) };
    }
    case "last30": {
      const f = new Date(now); f.setDate(f.getDate() - 29);
      return { from: startOfDay(f), to: endOfDay(now) };
    }
    case "thisMonth": {
      const f = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(f), to: endOfDay(now) };
    }
    case "lastMonth": {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(f), to: endOfDay(t) };
    }
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}

const PRESET_LABELS: Record<RangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  thisMonth: "This month",
  lastMonth: "Last month",
  custom: "Custom range",
};

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  call: "📞 Call",
  whatsapp: "💬 WhatsApp",
  sms: "📱 SMS",
  email: "📧 Email",
  meeting: "🤝 Meeting",
  note: "📝 Note",
  stage_change: "🔄 Stage Change",
  stage_changed: "🔄 Stage Changed",
  email_sent: "📤 Email Sent",
  created: "✨ Lead Created",
  assigned: "👤 Assigned",
  status_updated: "🔁 Status Updated",
  other: "📌 Other",
};

const STAGE_LABELS: Record<string, string> = {
  fresh: "Fresh",
  contacted: "Contacted",
  qualified: "Qualified",
  prospect: "Prospect",
  client: "Client",
  dormant: "Dormant",
  not_qualified_budget: "NQ — Budget",
  not_qualified_work: "NQ — Work",
  not_qualified_study: "NQ — Study",
  not_qualified_criminal: "NQ — Criminal",
  not_qualified_other: "NQ — Other",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeadsReporting() {
  const [preset, setPreset] = useState<RangePreset>("last30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"activity" | "newLeads" | "stageChanges">("newLeads");
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<string[]>([]);
  const [savePresetName, setSavePresetName] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);

  // Preset CRUD
  const utils = trpc.useUtils();
  const { data: savedPresets } = trpc.leads.reporting.listPresets.useQuery();
  const savePresetMut = trpc.leads.reporting.savePreset.useMutation({
    onSuccess: () => { utils.leads.reporting.listPresets.invalidate(); setSavePresetName(""); setShowSavePreset(false); toast.success("Preset saved"); },
    onError: (e) => toast.error(e.message),
  });
  const deletePresetMut = trpc.leads.reporting.deletePreset.useMutation({
    onSuccess: () => { utils.leads.reporting.listPresets.invalidate(); toast.success("Preset deleted"); },
  });

  function applyPresetFilter(p: { filterJson: string }) {
    try {
      const f = JSON.parse(p.filterJson);
      if (f.preset) setPreset(f.preset as RangePreset);
      if (f.customFrom) setCustomFrom(f.customFrom);
      if (f.customTo) setCustomTo(f.customTo);
      if (f.userId) setSelectedUserId(String(f.userId ?? "all"));
      if (f.activityTypes) setSelectedActivityTypes(f.activityTypes);
      toast.success("Preset applied");
    } catch { toast.error("Failed to apply preset"); }
  }

  function toggleActivityType(type: string) {
    setSelectedActivityTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  }

  // Compute date range
  const { dateFrom, dateTo } = useMemo(() => {
    if (preset === "custom" && customFrom && customTo) {
      return {
        dateFrom: startOfDay(new Date(customFrom)).getTime(),
        dateTo: endOfDay(new Date(customTo)).getTime(),
      };
    }
    const { from, to } = getPresetRange(preset);
    return { dateFrom: from.getTime(), dateTo: to.getTime() };
  }, [preset, customFrom, customTo]);

  const userId = selectedUserId !== "all" ? parseInt(selectedUserId) : undefined;
  const activityTypesFilter = selectedActivityTypes.length > 0 ? selectedActivityTypes : undefined;

  // Queries
  const { data: usersData } = trpc.admin.getAllUsers.useQuery();
  const usersList: any[] = (usersData as any) ?? [];

  const newLeadsQ = trpc.leads.reporting.newLeads.useQuery(
    { dateFrom, dateTo },
    { enabled: activeTab === "newLeads" }
  );
  const stageChangesQ = trpc.leads.reporting.stageChanges.useQuery(
    { dateFrom, dateTo, userId },
    { enabled: activeTab === "stageChanges" }
  );
  const userActivityQ = trpc.leads.reporting.userActivity.useQuery(
    { dateFrom, dateTo, userId, activityTypes: activityTypesFilter },
    { enabled: activeTab === "activity" }
  );

  // Stage change parsing — description format: "Stage changed: Fresh → Contacted"
  const stageChanges: any[] = (stageChangesQ.data as any) ?? [];
  const stageMatrix = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    for (const row of stageChanges) {
      const match = (row.description ?? "").match(/Stage changed:\s*(.+?)\s*→\s*(.+)/i);
      if (match) {
        const from = match[1].trim().toLowerCase().replace(/\s+/g, "_");
        const to = match[2].trim().toLowerCase().replace(/\s+/g, "_");
        if (!matrix[from]) matrix[from] = {};
        matrix[from][to] = (matrix[from][to] ?? 0) + 1;
      }
    }
    return matrix;
  }, [stageChanges]);

  const stageFromKeys = Object.keys(stageMatrix);

  // User activity data
  const activityData = userActivityQ.data as any;
  const activitySummary: any[] = activityData?.summary ?? [];
  const activityBreakdown: any[] = activityData?.breakdown ?? [];

  // New leads data
  const newLeadsData = newLeadsQ.data as any;
  const newLeadsTotal: number = newLeadsData?.total ?? 0;
  const newLeadsByDay: any[] = newLeadsData?.byDay ?? [];

  function downloadCsv(rows: Record<string, unknown>[], filename: string) {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => {
      const v = r[h] ?? "";
      return typeof v === "string" && (v.includes(",") || v.includes('"')) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function exportCurrentTab() {
    const dateLabel = `${new Date(dateFrom).toISOString().slice(0,10)}_to_${new Date(dateTo).toISOString().slice(0,10)}`;
    if (activeTab === "newLeads") {
      downloadCsv(
        newLeadsByDay.map((r: any) => ({ date: r.day, new_leads: Number(r.count) })),
        `new_leads_${dateLabel}.csv`
      );
    } else if (activeTab === "stageChanges") {
      // Export both the raw list and the matrix summary
      const matrixRows: Record<string, unknown>[] = [];
      for (const fromStage of stageFromKeys) {
        for (const toStage of stageFromKeys) {
          const count = stageMatrix[fromStage]?.[toStage] ?? 0;
          if (count > 0) matrixRows.push({ from_stage: fromStage, to_stage: toStage, count });
        }
      }
      const rawRows = stageChanges.map((r: any) => ({
        lead_id: r.leadId,
        user_id: r.userId,
        description: r.description,
        date: new Date(r.createdAt).toLocaleString(),
      }));
      downloadCsv([...matrixRows, {}, ...rawRows], `stage_changes_${dateLabel}.csv`);
    } else if (activeTab === "activity") {
      const rows = activityBreakdown.map((b: any) => {
        const u = usersList.find((u: any) => u.id === b.userId);
        return {
          user_name: u?.name || u?.email || `User #${b.userId}`,
          user_email: u?.email || "",
          activity_type: ACTIVITY_TYPE_LABELS[b.activityType] ?? b.activityType,
          count: Number(b.count),
        };
      });
      downloadCsv(rows, `team_activity_${dateLabel}.csv`);
    }
  }

  const exportDisabled =
    (activeTab === "newLeads" && newLeadsByDay.length === 0) ||
    (activeTab === "stageChanges" && stageChanges.length === 0) ||
    (activeTab === "activity" && activityBreakdown.length === 0);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-rose-500" />
            Leads Reporting
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Analyse team activity, new leads, and stage movement over any time period
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={exportCurrentTab}
          disabled={exportDisabled}
          className="flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/30 rounded-xl border">
        {/* Date range preset */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground font-medium">Date Range</span>
          <Select value={preset} onValueChange={v => setPreset(v as RangePreset)}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PRESET_LABELS) as RangePreset[]).map(k => (
                <SelectItem key={k} value={k}>{PRESET_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Custom date inputs */}
        {preset === "custom" && (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium">From</span>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="h-9 px-3 rounded-md border bg-background text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium">To</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="h-9 px-3 rounded-md border bg-background text-sm" />
            </div>
          </>
        )}

        {/* User filter */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground font-medium">Team Member</span>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-48 h-9">
              <SelectValue placeholder="All team members" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All team members</SelectItem>
              {usersList.map((u: any) => (
                <SelectItem key={u.id} value={String(u.id)}>{u.name || u.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Activity type multi-select (shown on Team Activity tab) */}
        {activeTab === "activity" && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-medium">Activity Types</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm font-normal">
                  <Filter className="w-3.5 h-3.5" />
                  {selectedActivityTypes.length === 0 ? "All types" : `${selectedActivityTypes.length} selected`}
                  <ChevronDown className="w-3.5 h-3.5 ml-1" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <div className="space-y-1">
                  <button className="text-xs text-muted-foreground hover:text-foreground w-full text-left px-2 py-1" onClick={() => setSelectedActivityTypes([])}>
                    Clear all
                  </button>
                  {Object.entries(ACTIVITY_TYPE_LABELS).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer">
                      <Checkbox
                        checked={selectedActivityTypes.includes(key)}
                        onCheckedChange={() => toggleActivityType(key)}
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Saved presets */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground font-medium">Saved Presets</span>
          <div className="flex items-center gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm font-normal">
                  <Save className="w-3.5 h-3.5" />
                  Presets
                  <ChevronDown className="w-3.5 h-3.5 ml-1" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="space-y-1">
                  {(!savedPresets || (savedPresets as any[]).length === 0) && (
                    <p className="text-xs text-muted-foreground px-2 py-2">No saved presets yet</p>
                  )}
                  {(savedPresets as any[] ?? []).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/50">
                      <button className="text-sm text-left flex-1" onClick={() => applyPresetFilter(p)}>{p.name}</button>
                      <button onClick={() => deletePresetMut.mutate({ id: p.id })} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="border-t mt-1 pt-1">
                    {showSavePreset ? (
                      <div className="flex gap-1 px-1">
                        <Input
                          value={savePresetName}
                          onChange={e => setSavePresetName(e.target.value)}
                          placeholder="Preset name…"
                          className="h-7 text-xs"
                          onKeyDown={e => {
                            if (e.key === "Enter" && savePresetName.trim()) {
                              savePresetMut.mutate({ name: savePresetName.trim(), filterJson: JSON.stringify({ preset, customFrom, customTo, userId: selectedUserId, activityTypes: selectedActivityTypes }) });
                            }
                          }}
                        />
                        <Button size="sm" className="h-7 px-2 text-xs" onClick={() => {
                          if (savePresetName.trim()) savePresetMut.mutate({ name: savePresetName.trim(), filterJson: JSON.stringify({ preset, customFrom, customTo, userId: selectedUserId, activityTypes: selectedActivityTypes }) });
                        }}>Save</Button>
                      </div>
                    ) : (
                      <button className="text-xs text-muted-foreground hover:text-foreground w-full text-left px-2 py-1.5" onClick={() => setShowSavePreset(true)}>
                        + Save current filters as preset
                      </button>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Date range display */}
        <div className="ml-auto text-xs text-muted-foreground self-end pb-1">
          {formatDate(dateFrom)} — {formatDate(dateTo)}
        </div>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-2">
        {[
          { key: "newLeads", label: "New Leads", icon: TrendingUp },
          { key: "stageChanges", label: "Stage Changes", icon: ArrowRightLeft },
          { key: "activity", label: "Team Activity", icon: Users },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === key
                ? "bg-rose-500 text-white"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── New Leads Tab ─────────────────────────────────────────────────────── */}
      {activeTab === "newLeads" && (
        <div className="space-y-4">
          {newLeadsQ.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              {/* Summary card */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-xl border bg-gradient-to-br from-rose-500/10 to-rose-500/5 col-span-1">
                  <p className="text-sm text-muted-foreground">Total New Leads</p>
                  <p className="text-4xl font-bold text-rose-500 mt-1">{newLeadsTotal.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(dateFrom)} — {formatDate(dateTo)}</p>
                </div>
                <div className="p-5 rounded-xl border col-span-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium">Daily Breakdown</p>
                    <Button variant="outline" size="sm" onClick={() => downloadCsv(
                      newLeadsByDay.map(r => ({ date: r.day, new_leads: r.count })),
                      `new_leads_${new Date().toISOString().slice(0,10)}.csv`
                    )}>
                      <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
                    </Button>
                  </div>
                  {newLeadsByDay.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No new leads in this period</p>
                  ) : (
                    <div className="overflow-auto max-h-64">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">Date</th>
                            <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">New Leads</th>
                            <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">Bar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {newLeadsByDay.map((row: any) => {
                            const max = Math.max(...newLeadsByDay.map((r: any) => Number(r.count)));
                            const pct = max > 0 ? (Number(row.count) / max) * 100 : 0;
                            return (
                              <tr key={row.day} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="py-1.5 px-2">{row.day}</td>
                                <td className="py-1.5 px-2 text-right font-medium">{Number(row.count).toLocaleString()}</td>
                                <td className="py-1.5 px-2 w-40">
                                  <div className="h-2 bg-rose-500/20 rounded-full overflow-hidden">
                                    <div className="h-full bg-rose-500 rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Stage Changes Tab ─────────────────────────────────────────────────── */}
      {activeTab === "stageChanges" && (
        <div className="space-y-4">
          {stageChangesQ.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{stageChanges.length}</span> stage changes in this period
                  {selectedUserId !== "all" && <span> for selected team member</span>}
                </p>
                <Button variant="outline" size="sm" onClick={() => downloadCsv(
                  stageChanges.map(r => ({
                    lead_id: r.leadId,
                    user_id: r.userId,
                    description: r.description,
                    date: formatDateTime(r.createdAt),
                  })),
                  `stage_changes_${new Date().toISOString().slice(0,10)}.csv`
                )}>
                  <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
                </Button>
              </div>

              {/* Transition matrix */}
              {stageFromKeys.length > 0 && (
                <div className="rounded-xl border overflow-auto">
                  <div className="p-4 border-b bg-muted/20">
                    <p className="text-sm font-medium">Stage Transition Matrix</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Rows = From stage, Columns = To stage</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/10">
                          <th className="text-left p-3 font-medium text-muted-foreground min-w-[140px]">From → To</th>
                          {stageFromKeys.map(s => (
                            <th key={s} className="p-3 font-medium text-muted-foreground text-center min-w-[100px]">
                              {STAGE_LABELS[s] ?? s}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stageFromKeys.map(fromStage => (
                          <tr key={fromStage} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="p-3 font-medium">{STAGE_LABELS[fromStage] ?? fromStage}</td>
                            {stageFromKeys.map(toStage => {
                              const count = stageMatrix[fromStage]?.[toStage] ?? 0;
                              return (
                                <td key={toStage} className="p-3 text-center">
                                  {count > 0 ? (
                                    <Badge variant="secondary" className="font-mono">{count}</Badge>
                                  ) : (
                                    <span className="text-muted-foreground/30">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Raw list */}
              {stageChanges.length > 0 && (
                <div className="rounded-xl border overflow-auto">
                  <div className="p-4 border-b bg-muted/20">
                    <p className="text-sm font-medium">All Stage Changes (latest first)</p>
                  </div>
                  <div className="overflow-auto max-h-80">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 text-muted-foreground font-medium">Lead ID</th>
                          <th className="text-left p-3 text-muted-foreground font-medium">Change</th>
                          <th className="text-left p-3 text-muted-foreground font-medium">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stageChanges.slice(0, 200).map((row: any) => (
                          <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3 font-mono text-xs text-muted-foreground">#{row.leadId}</td>
                            <td className="p-3">{row.description}</td>
                            <td className="p-3 text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {stageChanges.length > 200 && (
                      <p className="text-xs text-muted-foreground text-center py-3">
                        Showing first 200 of {stageChanges.length} — export CSV for full data
                      </p>
                    )}
                  </div>
                </div>
              )}

              {stageChanges.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <ArrowRightLeft className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No stage changes in this period</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Team Activity Tab ─────────────────────────────────────────────────── */}
      {activeTab === "activity" && (
        <div className="space-y-4">
          {userActivityQ.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Total activities: <span className="font-semibold text-foreground">
                    {activitySummary.reduce((s: number, r: any) => s + Number(r.total), 0).toLocaleString()}
                  </span>
                </p>
                <Button variant="outline" size="sm" onClick={() => downloadCsv(
                  activityBreakdown.map((r: any) => {
                    const u = usersList.find((u: any) => u.id === r.userId);
                    return { user: u?.name || u?.email || `User #${r.userId}`, activity_type: r.activityType, count: r.count };
                  }),
                  `team_activity_${new Date().toISOString().slice(0,10)}.csv`
                )}>
                  <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
                </Button>
              </div>

              {activitySummary.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No activity recorded in this period</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activitySummary
                    .sort((a: any, b: any) => Number(b.total) - Number(a.total))
                    .map((row: any) => {
                      const user = usersList.find((u: any) => u.id === row.userId);
                      const userName = user?.name || user?.email || `User #${row.userId}`;
                      const breakdown = activityBreakdown.filter((b: any) => b.userId === row.userId);
                      const maxCount = Math.max(...activitySummary.map((r: any) => Number(r.total)));
                      const pct = maxCount > 0 ? (Number(row.total) / maxCount) * 100 : 0;

                      return (
                        <div key={row.userId} className="rounded-xl border p-5 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-600 font-bold text-sm">
                                {userName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{userName}</p>
                                {user?.email && user.name && (
                                  <p className="text-xs text-muted-foreground">{user.email}</p>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-foreground">{Number(row.total).toLocaleString()}</p>
                              <p className="text-xs text-muted-foreground">total activities</p>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-rose-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>

                          {/* Activity type breakdown */}
                          <div className="flex flex-wrap gap-2">
                            {breakdown.map((b: any) => (
                              <div key={b.activityType} className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-3 py-1.5">
                                <span className="text-xs">{ACTIVITY_TYPE_LABELS[b.activityType] ?? b.activityType}</span>
                                <Badge variant="secondary" className="text-xs font-mono h-5">{Number(b.count)}</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
