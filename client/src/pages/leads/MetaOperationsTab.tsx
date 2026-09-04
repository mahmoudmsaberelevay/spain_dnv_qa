import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, BarChart3, Database, ExternalLink, Plus, RefreshCw, ShieldCheck, Trash2, Zap } from "lucide-react";

type MappingType = "form" | "campaign" | "adset" | "ad" | "page" | "crm_stage";

export default function MetaOperationsTab() {
  const [period, setPeriod] = useState("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [program, setProgram] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const [adset, setAdset] = useState("all");
  const [ad, setAd] = useState("all");
  const [formId, setFormId] = useState("all");
  const [consultant, setConsultant] = useState("all");
  const [leadStatus, setLeadStatus] = useState("all");
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [testEventCode, setTestEventCode] = useState("");
  const [mappingForm, setMappingForm] = useState({
    mappingType: "campaign" as MappingType,
    matchValue: "",
    matchName: "",
    program: "",
    outputValue: "",
    priority: "100",
  });

  const range = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    if (period === "today") start.setHours(0, 0, 0, 0);
    else if (period === "week") { start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0); }
    else if (period === "month") { start.setDate(1); start.setHours(0, 0, 0, 0); }
    else if (period === "year") { start.setMonth(0, 1); start.setHours(0, 0, 0, 0); }
    else if (period === "custom") {
      return {
        dateFrom: customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : undefined,
        dateTo: customTo ? new Date(`${customTo}T23:59:59`).getTime() : undefined,
        program: program === "all" ? undefined : program,
        campaign: campaign === "all" ? undefined : campaign,
        adset: adset === "all" ? undefined : adset,
        ad: ad === "all" ? undefined : ad,
        formId: formId === "all" ? undefined : formId,
        consultant: consultant === "all" ? undefined : consultant,
        leadStatus: leadStatus === "all" ? undefined : leadStatus,
      };
    }
    return {
      dateFrom: start.getTime(), dateTo: end.getTime(),
      program: program === "all" ? undefined : program,
      campaign: campaign === "all" ? undefined : campaign,
      adset: adset === "all" ? undefined : adset,
      ad: ad === "all" ? undefined : ad,
      formId: formId === "all" ? undefined : formId,
      consultant: consultant === "all" ? undefined : consultant,
      leadStatus: leadStatus === "all" ? undefined : leadStatus,
    };
  }, [period, customFrom, customTo, program, campaign, adset, ad, formId, consultant, leadStatus]);

  const health = trpc.leadsSettings.metaAdmin.health.useQuery();
  const diagnostics = trpc.leadsSettings.metaAdmin.diagnostics.useQuery(range);
  const mappings = trpc.leadsSettings.metaAdmin.listMappings.useQuery();
  const filterOptions = trpc.leads.metaFilterOptions.useQuery();

  const refreshAll = () => {
    void health.refetch();
    void diagnostics.refetch();
    void mappings.refetch();
  };

  const reconcile = trpc.leadsSettings.metaAdmin.runReconciliation.useMutation({
    onSuccess: data => {
      refreshAll();
      toast.success(`Reconciliation complete: ${data.pull.queued} leads queued, ${data.events.sent} events sent.`);
    },
    onError: error => toast.error(error.message),
  });
  const createMapping = trpc.leadsSettings.metaAdmin.createMapping.useMutation({
    onSuccess: () => {
      refreshAll();
      setShowMappingDialog(false);
      setMappingForm({ mappingType: "campaign", matchValue: "", matchName: "", program: "", outputValue: "", priority: "100" });
      toast.success("Meta mapping added.");
    },
    onError: error => toast.error(error.message),
  });
  const updateMapping = trpc.leadsSettings.metaAdmin.updateMapping.useMutation({
    onSuccess: () => { refreshAll(); toast.success("Mapping updated."); },
    onError: error => toast.error(error.message),
  });
  const deleteMapping = trpc.leadsSettings.metaAdmin.deleteMapping.useMutation({
    onSuccess: () => { refreshAll(); toast.success("Mapping deleted."); },
    onError: error => toast.error(error.message),
  });
  const retryTestEvent = trpc.leadsSettings.metaAdmin.retryTestEvent.useMutation({
    onSuccess: () => { refreshAll(); toast.success("Test event submitted to Meta Test Events."); },
    onError: error => toast.error(error.message),
  });

  const summary = diagnostics.data?.summary;
  const fmtPercent = (value = 0) => `${(value * 100).toFixed(1)}%`;
  const fmtDate = (value?: number | null) => value ? new Date(value).toLocaleString() : "Never";

  const healthCards = [
    { label: "Webhook", value: health.data?.lastWebhookAt ? "Receiving" : "No delivery yet", sub: fmtDate(health.data?.lastWebhookAt), icon: Activity },
    { label: "Lead Sync", value: health.data?.lastLeadSyncAt ? "Processed" : "Awaiting lead", sub: fmtDate(health.data?.lastLeadSyncAt), icon: Database },
    { label: "CRM Events", value: `${health.data?.eventTotals.sent || 0} sent`, sub: `${health.data?.eventTotals.failed || 0} failed`, icon: Zap },
    { label: "Production Sending", value: health.data?.productionSendingEnabled ? "Enabled" : "Approval gated", sub: health.data?.signatureConfigured ? "Webhook signature ready" : "Signature secret required", icon: ShieldCheck },
  ];

  const funnelCards: Array<[string, string | number]> = [
    ["Meta Leads", summary?.metaLeads || 0],
    ["Qualified Meetings", summary?.qualified || 0],
    ["Converted", summary?.converted || 0],
    ["Qualification Rate", fmtPercent(summary?.qualificationRate)],
    ["Meeting-to-Signing Rate", fmtPercent(summary?.meetingToSigningRate)],
    ["Conversion Rate", fmtPercent(summary?.conversionRate)],
    ["Event Success Rate", fmtPercent(summary?.sendSuccessRate)],
    ["Meta Lead ID Coverage", fmtPercent(summary?.leadIdCoverage)],
    ["Phone Hash Coverage", fmtPercent(summary?.phoneHashCoverage)],
    ["Email Hash Coverage", fmtPercent(summary?.emailHashCoverage)],
    ["Webhook Delay", `${Math.round(summary?.averageWebhookDelaySeconds || 0)} sec`],
    ["Average Send Delay", `${Math.round(summary?.averageDelaySeconds || 0)} sec`],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">Meta Lead Ads & CRM Events</h3>
          <p className="text-sm text-muted-foreground">Webhook health, Lead ID coverage, funnel events, retries, reconciliation, and attribution mappings.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => reconcile.mutate({ limit: 200 })} disabled={reconcile.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${reconcile.isPending ? "animate-spin" : ""}`} />
            {reconcile.isPending ? "Reconciling…" : "Run Reconciliation"}
          </Button>
          <a href="https://developers.facebook.com/tools/lead-ads-testing/" target="_blank" rel="noreferrer">
            <Button variant="outline"><ExternalLink className="w-4 h-4 mr-2" />Meta Test Lead Tool</Button>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {healthCards.map(item => (
          <div key={item.label} className="border rounded-lg p-4 bg-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><item.icon className="w-4 h-4" />{item.label}</div>
            <p className="text-lg font-semibold mt-2">{item.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{item.sub}</p>
          </div>
        ))}
      </div>

      {(health.data?.warnings.length ?? 0) > 0 && (
        <div className="border border-amber-300 bg-amber-50 text-amber-950 rounded-lg p-4">
          <h4 className="font-semibold">Integration attention required</h4>
          <ul className="mt-2 list-disc list-inside text-sm space-y-1">
            {health.data?.warnings.map(warning => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}

      <div className="border rounded-lg p-4 space-y-4 bg-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h4 className="font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4" />Funnel Reporting</h4>
            <p className="text-xs text-muted-foreground">Uses only real Lead and CRM event timestamps. No estimated Meta cost figures.</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {period === "custom" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
            <div><Label>From</Label><Input type="date" value={customFrom} onChange={event => setCustomFrom(event.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={customTo} onChange={event => setCustomTo(event.target.value)} /></div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <ReportFilter label="Program" value={program} onChange={setProgram} options={(filterOptions.data?.programs ?? []).map(value => ({ value, label: value }))} />
          <ReportFilter label="Campaign" value={campaign} onChange={setCampaign} options={(filterOptions.data?.campaigns ?? []).map(value => ({ value, label: value }))} />
          <ReportFilter label="Ad Set" value={adset} onChange={setAdset} options={(filterOptions.data?.adsets ?? []).map(value => ({ value, label: value }))} />
          <ReportFilter label="Ad" value={ad} onChange={setAd} options={(filterOptions.data?.ads ?? []).map(value => ({ value, label: value }))} />
          <ReportFilter label="Form" value={formId} onChange={setFormId} options={(filterOptions.data?.forms ?? []).map(item => ({ value: item.id, label: item.name }))} />
          <ReportFilter label="Consultant" value={consultant} onChange={setConsultant} options={(filterOptions.data?.consultants ?? []).map(value => ({ value, label: value }))} />
          <ReportFilter label="Lead Status" value={leadStatus} onChange={setLeadStatus} options={(filterOptions.data?.stages ?? []).map(value => ({ value, label: value.replaceAll("_", " ") }))} />
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(diagnostics.data?.eventByStatus ?? []).map(item => <Badge key={item.status} variant="outline">{item.status}: {Number(item.total || 0)}</Badge>)}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {funnelCards.map(([label, value]) => (
            <div key={label} className="bg-muted/30 rounded-md p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold mt-1">{value}</p></div>
          ))}
        </div>
      </div>

      <div className="border rounded-lg bg-card">
        <div className="p-4 border-b flex items-center justify-between gap-3">
          <div><h4 className="font-semibold">Attribution & Stage Mappings</h4><p className="text-xs text-muted-foreground">Form, campaign, ad set, ad, Page, program, and CRM event rules.</p></div>
          <Button size="sm" onClick={() => setShowMappingDialog(true)}><Plus className="w-4 h-4 mr-1" />Add Mapping</Button>
        </div>
        <div className="divide-y">
          {(mappings.data ?? []).map(mapping => (
            <div key={mapping.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{mapping.mappingType}</Badge><span className="font-medium break-all">{mapping.matchName || mapping.matchValue}</span></div>
                <p className="text-xs text-muted-foreground mt-1">Match: {mapping.matchValue}{mapping.program ? ` · Program: ${mapping.program}` : ""}{mapping.outputValue ? ` · Output: ${mapping.outputValue}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={mapping.isActive} onCheckedChange={isActive => updateMapping.mutate({ id: mapping.id, isActive })} />
                <Button variant="ghost" size="icon" onClick={() => deleteMapping.mutate({ id: mapping.id })}><Trash2 className="w-4 h-4 text-red-500" /></Button>
              </div>
            </div>
          ))}
          {(mappings.data?.length ?? 0) === 0 && <p className="p-6 text-sm text-muted-foreground text-center">No mappings configured.</p>}
        </div>
      </div>

      <div className="border rounded-lg bg-card">
        <div className="p-4 border-b"><h4 className="font-semibold">Failures & Manual Review</h4><p className="text-xs text-muted-foreground">Retries require a Meta Test Events code and cannot silently send a production event.</p></div>
        <div className="p-4"><Input placeholder="Meta Test Event Code" value={testEventCode} onChange={event => setTestEventCode(event.target.value)} className="max-w-sm" /></div>
        <div className="divide-y">
          {(diagnostics.data?.recentFailures ?? []).map(event => (
            <div key={event.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex-1 min-w-0"><p className="font-medium">{event.eventName} · Lead #{event.leadId}</p><p className="text-xs text-red-600 break-words">{event.lastError || event.status}</p><p className="text-[11px] text-muted-foreground">{new Date(event.eventTime * 1000).toLocaleString()} · {event.attempts} attempts</p></div>
              <Button size="sm" variant="outline" disabled={!testEventCode.trim() || retryTestEvent.isPending} onClick={() => retryTestEvent.mutate({ eventLogId: event.id, testEventCode: testEventCode.trim() })}>Retry as Test</Button>
            </div>
          ))}
          {(diagnostics.data?.recentFailures.length ?? 0) === 0 && <p className="p-6 text-sm text-muted-foreground text-center">No failed or manual-review events in this range.</p>}
        </div>
      </div>

      <Dialog open={showMappingDialog} onOpenChange={setShowMappingDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Meta Mapping</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Mapping Type</Label><Select value={mappingForm.mappingType} onValueChange={value => setMappingForm(current => ({ ...current, mappingType: value as MappingType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["form", "campaign", "adset", "ad", "page", "crm_stage"].map(value => <SelectItem key={value} value={value}>{value.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Meta ID or CRM Stage</Label><Input value={mappingForm.matchValue} onChange={event => setMappingForm(current => ({ ...current, matchValue: event.target.value }))} /></div>
            <div><Label>Display Name</Label><Input value={mappingForm.matchName} onChange={event => setMappingForm(current => ({ ...current, matchName: event.target.value }))} /></div>
            <div><Label>Program</Label><Input value={mappingForm.program} onChange={event => setMappingForm(current => ({ ...current, program: event.target.value }))} /></div>
            <div><Label>Output / Meta Event Name</Label><Input value={mappingForm.outputValue} onChange={event => setMappingForm(current => ({ ...current, outputValue: event.target.value }))} /></div>
            <div><Label>Priority</Label><Input type="number" value={mappingForm.priority} onChange={event => setMappingForm(current => ({ ...current, priority: event.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMappingDialog(false)}>Cancel</Button>
            <Button disabled={!mappingForm.matchValue.trim() || createMapping.isPending} onClick={() => createMapping.mutate({ mappingKey: `${mappingForm.mappingType}:${mappingForm.matchValue.trim()}`, mappingType: mappingForm.mappingType, matchValue: mappingForm.matchValue.trim(), matchName: mappingForm.matchName.trim() || undefined, program: mappingForm.program.trim() || undefined, outputValue: mappingForm.outputValue.trim() || undefined, priority: Number(mappingForm.priority) || 100, isActive: true })}>Save Mapping</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportFilter({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
