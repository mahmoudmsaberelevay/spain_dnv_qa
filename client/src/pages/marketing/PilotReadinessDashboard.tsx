import { useMemo } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, LockKeyhole, ShieldCheck, TriangleAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function formatNumber(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US");
}

function formatPercent(numerator: number | null | undefined, denominator: number | null | undefined) {
  const total = Number(denominator ?? 0);
  if (!total) return "—";
  return `${((Number(numerator ?? 0) / total) * 100).toFixed(1)}%`;
}

function formatDate(value: number | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

function gateStyle(status: "ready" | "blocked" | "attention") {
  if (status === "ready") return { icon: CheckCircle2, className: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100", label: "Ready" };
  if (status === "attention") return { icon: TriangleAlert, className: "border-amber-400/25 bg-amber-400/10 text-amber-100", label: "Attention" };
  return { icon: LockKeyhole, className: "border-rose-400/25 bg-rose-400/10 text-rose-100", label: "Blocked" };
}

export default function PilotReadinessDashboard() {
  const [, navigate] = useLocation();
  const { data: access, isLoading: accessLoading } = trpc.marketingSystem.access.useQuery();
  const canView = Boolean(access?.capabilities.includes("view_analytics"));
  const query = trpc.marketingSystem.getPilotReadinessExecutiveDashboard.useQuery(undefined, { enabled: canView });
  const freshnessLabel = useMemo(() => formatDate(query.data?.measuredAt), [query.data?.measuredAt]);

  if (accessLoading || (canView && query.isLoading)) return <div className="flex min-h-[65vh] items-center justify-center text-slate-400">Loading read-only executive measurement…</div>;
  if (!canView) return <div className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-6 text-center"><LockKeyhole className="mb-4 h-12 w-12 text-amber-300" /><h1 className="text-2xl font-bold text-white">Executive measurement access is restricted</h1><p className="mt-3 text-sm leading-6 text-slate-400">This aggregate-only dashboard is available to Mahmoud and assigned Marketing System analytics roles.</p></div>;
  if (!query.data) return <div className="flex min-h-[65vh] items-center justify-center text-slate-400">Executive measurement is unavailable. Refresh and try again.</div>;

  const { metrics, controls, readiness, definitions, measuredAt, windowDays } = query.data;
  const readinessBlocked = readiness.status !== "ready";

  return <div className="min-h-full bg-[#0c1320] px-4 py-6 text-white md:px-8"><div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-3xl border border-[#5BA3B8]/25 bg-[radial-gradient(circle_at_88%_0%,rgba(91,163,184,.22),transparent_42%),linear-gradient(115deg,#172941,#0d1524)] p-6 md:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div className="max-w-3xl"><div className="mb-3 flex items-center gap-2 text-[#a9d6e3]"><BarChart3 className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[.16em]">Phase 6 prerequisite · read-only</span></div><h1 className="text-3xl font-semibold tracking-tight">Pilot Readiness & Executive Measurement</h1><p className="mt-3 text-sm leading-6 text-slate-300">A privacy-safe, aggregate CRM and Meta operations view. It distinguishes the current baseline from a proven measurement pilot, so no optimisation can be mistaken for readiness.</p></div><div className="flex flex-col items-end gap-2"><Badge variant="outline" className={readinessBlocked ? "border-amber-300/30 bg-amber-300/10 text-amber-100" : "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"}>{readinessBlocked ? "Optimisation blocked" : "Evidence ready"}</Badge><p className="text-xs text-slate-400">Measured {freshnessLabel}</p></div></div></section>

    <Card className={readinessBlocked ? "border-amber-400/25 bg-amber-400/10 text-white" : "border-emerald-400/25 bg-emerald-400/10 text-white"}><CardHeader><CardTitle className="flex items-center gap-2">{readinessBlocked ? <AlertTriangle className="h-5 w-5 text-amber-200" /> : <ShieldCheck className="h-5 w-5 text-emerald-200" />}{readinessBlocked ? "Controlled optimisation remains blocked" : "Evidence gate complete"}</CardTitle><CardDescription className={readinessBlocked ? "text-amber-100" : "text-emerald-100"}>{definitions.executiveGate}</CardDescription></CardHeader></Card>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label={`Raw Leads · ${windowDays} days`} value={formatNumber(metrics.rawLeads)} detail={definitions.rawLeads} /><MetricCard label="Qualified Leads" value={formatNumber(metrics.qualifiedLeads)} detail={`${formatPercent(metrics.qualifiedLeads, metrics.rawLeads)} of raw Leads · ${definitions.qualifiedLeads}`} /><MetricCard label="Client-stage Leads" value={formatNumber(metrics.clientStageLeads)} detail={`${formatPercent(metrics.clientStageLeads, metrics.rawLeads)} of raw Leads · ${definitions.clientStageLeads}`} /><MetricCard label="Campaign-attributed Leads" value={formatNumber(metrics.attributedLeads)} detail={`${formatPercent(metrics.attributedLeads, metrics.rawLeads)} of raw Leads · ${definitions.attributedLeads}`} /></section>

    <section className="grid gap-4 lg:grid-cols-2"><Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader><CardTitle>Commercial attribution baseline</CardTitle><CardDescription className="text-slate-400">Aggregate CRM counts only; no client, Lead, contact, or financial-record details are returned.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><DataRow label="Marketing-origin contracts" value={formatNumber(metrics.marketingOriginContracts)} /><DataRow label="Signed marketing-origin contracts" value={formatNumber(metrics.signedMarketingOriginContracts)} /><DataRow label="CRM attribution coverage" value={`${(Number(metrics.crmAttributionCoverageBps) / 100).toFixed(2)}%`} /><DataRow label="Latest monitoring snapshot" value={formatDate(controls.monitoringCapturedAt)} /><p className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs leading-5 text-slate-400">{definitions.marketingContracts}</p></CardContent></Card><Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader><CardTitle>Operations evidence</CardTitle><CardDescription className="text-slate-400">Monitoring is visible as evidence; it does not trigger a retry, reconciliation, event, or Meta request.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><DataRow label="Reconciliation" value={controls.reconciliationStatus || "Not recorded"} /><DataRow label="Last successful reconciliation" value={formatDate(controls.reconciliationLastSuccessAt)} /><DataRow label="Meta event attention queue" value={formatNumber(controls.metaEventAttentionCount)} danger={Number(controls.metaEventAttentionCount) > 0} /><DataRow label="Inbox failures / retries" value={`${formatNumber(controls.failedInboxCount)} / ${formatNumber(controls.retryInboxCount)}`} danger={Number(controls.failedInboxCount) + Number(controls.retryInboxCount) > 0} /><DataRow label="Test-lead leakage indicator" value={formatNumber(controls.testLeadLeakageCount)} danger={Number(controls.testLeadLeakageCount) > 0} /><DataRow label="Production CAPI sending" value={controls.productionSendingEnabled ? "Enabled" : "Disabled"} danger={Boolean(controls.productionSendingEnabled)} /></CardContent></Card></section>

    <Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader><CardTitle>Readiness gates</CardTitle><CardDescription className="text-slate-400">Every item must be ready before a later, separately approved optimisation phase can be considered.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{readiness.gates.map(gate => { const style = gateStyle(gate.status); const Icon = style.icon; return <div key={gate.key} className={`rounded-xl border p-4 ${style.className}`}><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><Icon className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-medium">{gate.label}</p><p className="mt-1 text-sm leading-5 opacity-90">{gate.detail}</p></div></div><Badge variant="outline" className="border-current/30 text-current">{style.label}</Badge></div></div>})}</CardContent></Card>

    <Card className="border-rose-400/20 bg-rose-400/5 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-rose-200" />What this dashboard cannot do</CardTitle><CardDescription className="text-rose-100">It reads aggregate metrics only. It cannot connect Meta, create or alter campaigns, spend money, send CAPI events, publish content, call a provider, change Leads, or make optimisation decisions.</CardDescription></CardHeader></Card>

    <Button variant="ghost" onClick={() => navigate("/marketing/agentic-system")} className="text-slate-400 hover:bg-white/5 hover:text-white"><ArrowLeft className="mr-2 h-4 w-4" />Back to Agentic Marketing System</Button>
  </div></div>;
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader className="pb-3"><CardDescription className="text-slate-400">{label}</CardDescription><CardTitle className="text-2xl">{value}</CardTitle></CardHeader><CardContent><p className="text-xs leading-5 text-slate-500">{detail}</p></CardContent></Card>;
}

function DataRow({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-3 last:border-0 last:pb-0"><span className="text-slate-400">{label}</span><strong className={danger ? "text-amber-200" : "text-slate-100"}>{value}</strong></div>;
}
