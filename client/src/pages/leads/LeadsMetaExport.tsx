import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Download,
  FileSpreadsheet,
  Filter,
  Info,
  BarChart2,
  Users,
  Target,
  ShoppingCart,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

const ALL_STAGES = [
  { value: "fresh", label: "Fresh", event: "Lead", color: "bg-slate-500" },
  { value: "contacted", label: "Contacted", event: "Lead", color: "bg-blue-500" },
  { value: "qualified", label: "Qualified", event: "QualifiedLead", color: "bg-purple-500" },
  { value: "prospect", label: "Prospect", event: "QualifiedLead", color: "bg-amber-500" },
  { value: "client", label: "Client", event: "Purchase", color: "bg-emerald-500" },
  { value: "dormant", label: "Dormant", event: "Lead", color: "bg-gray-500" },
  { value: "not_qualified_budget", label: "Not Qualified (Budget)", event: "Lead", color: "bg-red-400" },
  { value: "not_qualified_work", label: "Not Qualified (Work)", event: "Lead", color: "bg-red-400" },
  { value: "not_qualified_study", label: "Not Qualified (Study)", event: "Lead", color: "bg-red-400" },
  { value: "not_qualified_criminal", label: "Not Qualified (Criminal)", event: "Lead", color: "bg-red-400" },
  { value: "not_qualified_other", label: "Not Qualified (Other)", event: "Lead", color: "bg-red-400" },
];

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function LeadsMetaExport() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [quickFilter, setQuickFilter] = useState<"all" | "contract" | "payment">("all");

  const queryInput = useMemo(() => ({
    dateFrom: dateFrom ? new Date(dateFrom).getTime() : undefined,
    dateTo: dateTo ? new Date(dateTo + "T23:59:59").getTime() : undefined,
    stages: selectedStages.length > 0 ? selectedStages : undefined,
  }), [dateFrom, dateTo, selectedStages]);

  const { data, isLoading } = trpc.leads.metaExport.useQuery(queryInput, {
    staleTime: 30_000,
  });

  const allRows = data?.rows ?? [];
  // Apply quick filter on top of server-side results
  const rows = useMemo(() => {
    if (quickFilter === "contract") return allRows.filter(r => r.contract_signed_date);
    if (quickFilter === "payment") return allRows.filter(r => r.payment_received_date);
    return allRows;
  }, [allRows, quickFilter]);

  // Summary stats
  const stats = useMemo(() => {
    const byEvent: Record<string, number> = {};
    let withCampaign = 0;
    let withConsent = 0;
    let clients = 0;
    for (const r of rows) {
      byEvent[r.meta_event] = (byEvent[r.meta_event] ?? 0) + 1;
      if (r.meta_campaign_name) withCampaign++;
      if (r.gdpr_consent === "true") withConsent++;
      if (r.lead_status === "client") clients++;
    }
    return { byEvent, withCampaign, withConsent, clients };
  }, [rows]);

  function toggleStage(v: string) {
    setSelectedStages(prev =>
      prev.includes(v) ? prev.filter(s => s !== v) : [...prev, v]
    );
  }

  function exportCSV() {
    if (rows.length === 0) {
      toast.error("No data to export");
      return;
    }
    setIsExporting(true);
    try {
      const headers = Object.keys(rows[0]);
      const csvLines = [
        headers.join(","),
        ...rows.map(row =>
          headers.map(h => {
            const val = (row as any)[h];
            if (val === null || val === undefined) return "";
            const str = String(val);
            // Escape commas and quotes
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          }).join(",")
        ),
      ];
      const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const now = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `elevay_meta_crm_export_${now}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} leads`, { description: "CSV file downloaded successfully." });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-rose-400" />
            Meta CRM Export Report
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Export your CRM data in Meta's required format — includes SHA256-hashed PII, attribution IDs, pipeline stage → Meta event mapping, and GDPR consent fields.
          </p>
        </div>
        <Button
          onClick={exportCSV}
          disabled={isLoading || rows.length === 0 || isExporting}
          className="bg-rose-600 hover:bg-rose-700 text-white shrink-0"
        >
          <Download className="h-4 w-4 mr-2" />
          Download CSV ({rows.length})
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Export Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date range */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Date From</Label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Date To</Label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {(dateFrom || dateTo || selectedStages.length > 0 || quickFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setDateFrom(""); setDateTo(""); setSelectedStages([]); setQuickFilter("all"); }}
                className="text-muted-foreground"
              >
                Clear filters
              </Button>
            )}
          </div>

          {/* Quick filters */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center mr-1">Quick:</span>
            {[
              { key: "all" as const, label: "All Leads", icon: "👥" },
              { key: "contract" as const, label: "Contract Signed", icon: "📝" },
              { key: "payment" as const, label: "Payment Received", icon: "💳" },
            ].map(q => (
              <button
                key={q.key}
                onClick={() => setQuickFilter(q.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  quickFilter === q.key
                    ? q.key === "contract" ? "border-blue-500 bg-blue-500/15 text-blue-300"
                      : q.key === "payment" ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                      : "border-rose-500 bg-rose-500/15 text-rose-300"
                    : "border-border text-muted-foreground hover:border-muted-foreground"
                }`}
              >
                <span>{q.icon}</span> {q.label}
                {quickFilter === q.key && q.key !== "all" && (
                  <span className="ml-1 bg-current/20 rounded-full px-1.5 py-0.5 text-[10px]">{rows.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Stage filter */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Filter by Stage (leave empty for all)</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_STAGES.map(s => (
                <label
                  key={s.value}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer border transition-colors ${
                    selectedStages.includes(s.value)
                      ? "border-rose-500 bg-rose-500/10 text-rose-300"
                      : "border-border text-muted-foreground hover:border-rose-400"
                  }`}
                >
                  <Checkbox
                    checked={selectedStages.includes(s.value)}
                    onCheckedChange={() => toggleStage(s.value)}
                    className="h-3 w-3"
                  />
                  {s.label}
                  <span className="opacity-60 ml-0.5">→ {s.event}</span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      {!isLoading && rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Users className="h-3.5 w-3.5" /> Total Leads
              </div>
              <div className="text-2xl font-bold">{rows.length.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Target className="h-3.5 w-3.5" /> Qualified Leads
              </div>
              <div className="text-2xl font-bold text-purple-400">
                {(stats.byEvent["QualifiedLead"] ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <ShoppingCart className="h-3.5 w-3.5" /> Clients (Purchase)
              </div>
              <div className="text-2xl font-bold text-emerald-400">
                {stats.clients.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <BarChart2 className="h-3.5 w-3.5" /> With Campaign
              </div>
              <div className="text-2xl font-bold text-rose-400">
                {stats.withCampaign.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Meta Event Breakdown */}
      {!isLoading && rows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-400" />
              Meta Event Breakdown
              <span className="text-xs font-normal text-muted-foreground ml-1">
                — how your leads map to Meta Conversions API events
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(stats.byEvent).map(([event, count]) => (
                <div key={event} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30">
                  <Badge
                    variant="outline"
                    className={
                      event === "Purchase" ? "border-emerald-500 text-emerald-400" :
                      event === "QualifiedLead" ? "border-purple-500 text-purple-400" :
                      "border-blue-500 text-blue-400"
                    }
                  >
                    {event}
                  </Badge>
                  <span className="font-semibold text-sm">{count.toLocaleString()} leads</span>
                </div>
              ))}
            </div>
            <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-300">
                <strong>Meta CAPI guidance:</strong> Send <code>Lead</code> events for fresh/contacted leads,{" "}
                <code>QualifiedLead</code> for qualified/prospect, and <code>Purchase</code> with contract value for clients.
                The <strong>em</strong>, <strong>ph</strong>, <strong>fn</strong>, <strong>ln</strong> columns in the CSV are
                SHA256-hashed and ready for CAPI upload.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Preview (first 20 rows of {rows.length.toLocaleString()})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              Loading export data…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              No leads match the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["full_name", "email", "phone", "lead_status", "meta_event", "meta_campaign_name", "meta_form_name", "program_of_interest", "gdpr_consent", "data_sharing_consent", "lead_created_time"].map(col => (
                      <th key={col} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{row.full_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.email ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.phone ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[10px] capitalize">{row.lead_status}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            row.meta_event === "Purchase" ? "border-emerald-500 text-emerald-400" :
                            row.meta_event === "QualifiedLead" ? "border-purple-500 text-purple-400" :
                            "border-blue-500 text-blue-400"
                          }`}
                        >
                          {row.meta_event}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[160px] truncate">{row.meta_campaign_name ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{row.meta_form_name ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.program_of_interest ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className={row.gdpr_consent === "true" ? "text-emerald-400" : "text-muted-foreground"}>
                          {row.gdpr_consent === "true" ? "✓" : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={row.data_sharing_consent === "true" ? "text-emerald-400" : "text-muted-foreground"}>
                          {row.data_sharing_consent === "true" ? "✓" : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {row.lead_created_time ? new Date(row.lead_created_time).toLocaleDateString("en-GB") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 && (
                <div className="px-4 py-3 text-xs text-muted-foreground border-t">
                  Showing 20 of {rows.length.toLocaleString()} rows. Download CSV to see all.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Column Reference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Info className="h-4 w-4" />
            CSV Column Reference
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {[
              { group: "Hashed PII (Meta CAPI)", cols: ["em — SHA256 email", "ph — SHA256 phone", "fn — SHA256 first name", "ln — SHA256 last name"] },
              { group: "Identity", cols: ["full_name", "email", "phone", "nationality", "country_of_residence", "gender"] },
              { group: "Meta Attribution", cols: ["meta_lead_id", "meta_form_id", "meta_form_name", "meta_page_id", "meta_campaign_id", "meta_adset_id", "meta_ad_id", "meta_campaign_name", "meta_adset_name", "meta_ad_name", "is_organic"] },
              { group: "UTM & Tracking", cols: ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "fbc", "fbp"] },
              { group: "Pipeline", cols: ["lead_status", "meta_event", "lead_score", "program_of_interest", "investment_budget", "number_of_applicants", "estimated_deal_value", "deal_currency"] },
              { group: "Conversion", cols: ["consultation_booked_date", "consultation_completed_date", "contract_signed_date", "contract_value_usd", "contract_value_eur", "payment_received_date", "total_payments_received"] },
              { group: "GDPR & Consent", cols: ["gdpr_consent", "data_sharing_consent", "marketing_opt_in", "opt_out_signal", "data_region"] },
              { group: "Meta", cols: ["lead_created_time", "lead_source", "assigned_to"] },
            ].map(g => (
              <div key={g.group} className="p-3 rounded-lg border bg-muted/20">
                <div className="font-semibold text-foreground mb-2">{g.group}</div>
                <ul className="space-y-0.5">
                  {g.cols.map(c => (
                    <li key={c} className="text-muted-foreground font-mono text-[11px]">{c}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
