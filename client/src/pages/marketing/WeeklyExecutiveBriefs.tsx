import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, ClipboardCheck, LockKeyhole, PauseCircle, ShieldCheck, StopCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const DECISIONS = [
  { value: "acknowledge_blocked", label: "Acknowledge — remain planning-only", icon: CheckCircle2 },
  { value: "request_evidence", label: "Request more aggregate evidence", icon: ClipboardCheck },
  { value: "hold_planning", label: "Hold further planning", icon: PauseCircle },
  { value: "stop", label: "Stop this brief", icon: StopCircle },
] as const;

type DecisionValue = (typeof DECISIONS)[number]["value"];
type Snapshot = {
  measuredAt?: number;
  windowDays?: number;
  metrics?: { rawLeads?: number; qualifiedLeads?: number; clientStageLeads?: number; attributedLeads?: number; marketingOriginContracts?: number; signedMarketingOriginContracts?: number; crmAttributionCoverageBps?: number };
  controls?: { monitoringCapturedAt?: number | null; reconciliationStatus?: string | null; failedInboxCount?: number; retryInboxCount?: number; testLeadLeakageCount?: number; metaEventAttentionCount?: number; productionSendingEnabled?: boolean };
  readiness?: { status?: "ready" | "blocked"; gates?: Array<{ key: string; label: string; status: "ready" | "attention" | "blocked"; detail: string }> };
};

function mondayForCurrentWeek() {
  const date = new Date();
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: number | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

function formatNumber(value: number | undefined) {
  return Number(value ?? 0).toLocaleString("en-US");
}

function briefStatusStyle(status: string) {
  if (status === "acknowledged") return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
  if (status === "evidence_requested" || status === "held") return "border-amber-300/30 bg-amber-400/10 text-amber-100";
  if (status === "stopped") return "border-rose-300/30 bg-rose-400/10 text-rose-100";
  return "border-sky-300/30 bg-sky-400/10 text-sky-100";
}

function gateStyle(status: "ready" | "attention" | "blocked") {
  if (status === "ready") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  if (status === "attention") return "border-amber-300/25 bg-amber-400/10 text-amber-100";
  return "border-rose-300/25 bg-rose-400/10 text-rose-100";
}

export default function WeeklyExecutiveBriefs() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: access, isLoading: accessLoading } = trpc.marketingSystem.access.useQuery();
  const canView = Boolean(access?.capabilities.includes("view_analytics"));
  const isOwner = access?.role === "owner";
  const briefsQuery = trpc.marketingSystem.listWeeklyExecutiveBriefs.useQuery(undefined, { enabled: canView });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [periodStart, setPeriodStart] = useState(mondayForCurrentWeek);
  const [contextNote, setContextNote] = useState("");
  const [decision, setDecision] = useState<DecisionValue>("acknowledge_blocked");
  const [decisionNote, setDecisionNote] = useState("");

  useEffect(() => {
    if (!selectedId && briefsQuery.data?.briefs[0]) setSelectedId(briefsQuery.data.briefs[0].id);
  }, [briefsQuery.data?.briefs, selectedId]);

  const capture = trpc.marketingSystem.captureWeeklyExecutiveBrief.useMutation({
    onSuccess: async (result) => {
      setContextNote("");
      setSelectedId(result.briefId);
      await utils.marketingSystem.listWeeklyExecutiveBriefs.invalidate();
    },
  });
  const decide = trpc.marketingSystem.decideWeeklyExecutiveBrief.useMutation({
    onSuccess: async () => {
      setDecisionNote("");
      await utils.marketingSystem.listWeeklyExecutiveBriefs.invalidate();
    },
  });

  const selected = useMemo(() => briefsQuery.data?.briefs.find(brief => brief.id === selectedId) ?? briefsQuery.data?.briefs[0] ?? null, [briefsQuery.data?.briefs, selectedId]);
  const snapshot = (selected?.snapshot ?? {}) as Snapshot;

  if (accessLoading || (canView && briefsQuery.isLoading)) return <div className="flex min-h-[65vh] items-center justify-center text-slate-400">Loading Weekly Executive Briefs…</div>;
  if (!canView) return <div className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-6 text-center text-white"><LockKeyhole className="mb-4 h-12 w-12 text-amber-300" /><h1 className="text-2xl font-bold">Executive Brief access is restricted</h1><p className="mt-3 text-sm leading-6 text-slate-400">This aggregate-only review space is available to Mahmoud and assigned Marketing System analytics roles.</p></div>;

  return <div className="min-h-full bg-[#0c1320] px-4 py-6 text-white md:px-8"><div className="mx-auto max-w-7xl space-y-6">
    <section className="rounded-3xl border border-[#5BA3B8]/25 bg-[radial-gradient(circle_at_88%_0%,rgba(91,163,184,.22),transparent_42%),linear-gradient(115deg,#172941,#0d1524)] p-6 md:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div className="max-w-3xl"><div className="mb-3 flex items-center gap-2 text-[#a9d6e3]"><CalendarDays className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[.16em]">Manual weekly review · aggregate only</span></div><h1 className="text-3xl font-semibold tracking-tight">Weekly Executive Brief & Decision Log</h1><p className="mt-3 text-sm leading-6 text-slate-300">Create a hash-locked weekly snapshot of the existing Pilot Readiness evidence, then record Mahmoud’s internal decision. No schedule, email, message, campaign, spend, publication, provider call, CAPI event, or CRM mutation is available here.</p></div><Badge variant="outline" className="border-rose-300/30 bg-rose-400/10 text-rose-100">External actions locked</Badge></div></section>

    {isOwner && <Card className="border-[#5BA3B8]/25 bg-[#111b2c] text-white"><CardHeader><CardTitle>Capture this week’s aggregate snapshot</CardTitle><CardDescription className="text-slate-400">Choose the Monday that starts the review period. Notes are optional and must remain aggregate-only: do not enter client, Lead, contact, identity, or financial-row details.</CardDescription></CardHeader><CardContent className="grid gap-4 lg:grid-cols-[220px_1fr_auto]"><div><label className="mb-2 block text-sm text-slate-300">Week starting Monday</label><input type="date" value={periodStart} onChange={event => setPeriodStart(event.target.value)} className="h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white" /></div><div><label className="mb-2 block text-sm text-slate-300">Optional aggregate context</label><input value={contextNote} onChange={event => setContextNote(event.target.value)} maxLength={4000} placeholder="Example: Review monitoring freshness before the next internal planning discussion." className="h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-slate-500" /></div><div className="flex items-end"><Button disabled={capture.isPending} onClick={() => capture.mutate({ periodStart, contextNote: contextNote.trim() || undefined })} className="w-full bg-[#5BA3B8] text-slate-950 hover:bg-[#76b9ca]">{capture.isPending ? "Capturing…" : "Capture aggregate brief"}</Button></div>{capture.error && <p className="text-sm text-rose-200 lg:col-span-3">{capture.error.message}</p>}</CardContent></Card>}

    <section className="grid gap-6 xl:grid-cols-[300px_1fr]"><Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader><CardTitle>Review history</CardTitle><CardDescription className="text-slate-400">Every version preserves its evidence snapshot and decision trail.</CardDescription></CardHeader><CardContent className="space-y-2">{briefsQuery.data?.briefs.length ? briefsQuery.data.briefs.map(brief => <button key={brief.id} onClick={() => setSelectedId(brief.id)} className={`w-full rounded-xl border p-3 text-left transition ${selected?.id === brief.id ? "border-[#5BA3B8]/60 bg-[#5BA3B8]/10" : "border-white/10 bg-white/[.03] hover:bg-white/[.06]"}`}><div className="flex items-center justify-between gap-2"><strong className="text-sm">{brief.periodStart} · v{brief.version}</strong><Badge variant="outline" className={briefStatusStyle(brief.status)}>{brief.status.replaceAll("_", " ")}</Badge></div><p className="mt-2 text-xs text-slate-400">Captured {formatDate(brief.capturedAt)}</p></button>) : <p className="rounded-lg border border-dashed border-white/15 p-4 text-sm leading-6 text-slate-400">No brief has been captured. Mahmoud can create the first immutable aggregate snapshot above.</p>}</CardContent></Card>

      <div className="space-y-6">{selected ? <>
        <Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div><CardTitle>Week of {selected.periodStart} · version {selected.version}</CardTitle><CardDescription className="mt-1 text-slate-400">Captured {formatDate(selected.capturedAt)} · SHA-256 {selected.snapshotHash.slice(0, 12)}…</CardDescription></div><Badge variant="outline" className={briefStatusStyle(selected.status)}>{selected.status.replaceAll("_", " ")}</Badge></div></CardHeader><CardContent>{selected.contextNote && <p className="mb-4 rounded-lg border border-white/10 bg-white/[.03] p-3 text-sm text-slate-300"><strong>Context:</strong> {selected.contextNote}</p>}<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Raw Leads" value={formatNumber(snapshot.metrics?.rawLeads)} /><Metric label="Qualified Leads" value={formatNumber(snapshot.metrics?.qualifiedLeads)} /><Metric label="Campaign-attributed Leads" value={formatNumber(snapshot.metrics?.attributedLeads)} /><Metric label="Signed marketing contracts" value={formatNumber(snapshot.metrics?.signedMarketingOriginContracts)} /></div></CardContent></Card>

        <Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader><CardTitle>Evidence gates in this snapshot</CardTitle><CardDescription className="text-slate-400">This is preserved evidence. It does not trigger monitoring, reconciliation, CAPI, provider, publication, campaign, or spending work.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{snapshot.readiness?.gates?.map(gate => <div key={gate.key} className={`rounded-xl border p-4 ${gateStyle(gate.status)}`}><div className="flex items-start gap-3">{gate.status === "ready" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />}<div><p className="font-medium">{gate.label}</p><p className="mt-1 text-sm leading-5 opacity-90">{gate.detail}</p></div></div></div>)}</CardContent></Card>

        <Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader><CardTitle>Owner decision trail</CardTitle><CardDescription className="text-slate-400">Each decision is internal and planning-only. It never authorizes external operations.</CardDescription></CardHeader><CardContent className="space-y-4">{selected.decision && <div className="rounded-lg border border-white/10 bg-white/[.03] p-3 text-sm"><p><strong>Latest decision:</strong> {selected.decision.replaceAll("_", " ")}</p><p className="mt-1 text-slate-300">{selected.decisionNote}</p></div>}<div className="space-y-2">{selected.events.map((event, index) => <div key={`${event.createdAt}-${index}`} className="border-l border-[#5BA3B8]/40 pl-3 text-sm"><p className="font-medium">{event.action.replaceAll("_", " ")}</p>{event.note && <p className="mt-1 text-slate-400">{event.note}</p>}<p className="mt-1 text-xs text-slate-500">{formatDate(event.createdAt)}</p></div>)}</div>{isOwner && selected.status !== "stopped" && <div className="mt-5 grid gap-3 border-t border-white/10 pt-5 lg:grid-cols-[260px_1fr_auto]"><select value={decision} onChange={event => setDecision(event.target.value as DecisionValue)} className="h-10 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white">{DECISIONS.map(item => <option key={item.value} value={item.value} className="bg-slate-900">{item.label}</option>)}</select><input value={decisionNote} onChange={event => setDecisionNote(event.target.value)} maxLength={8000} placeholder="Required aggregate-only decision note; no client or Lead data." className="h-10 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-slate-500" /><Button disabled={decide.isPending || decisionNote.trim().length < 8} onClick={() => decide.mutate({ briefId: selected.id, decision, note: decisionNote })} variant={decision === "stop" ? "destructive" : "outline"}>{decide.isPending ? "Recording…" : "Record owner decision"}</Button>{decide.error && <p className="text-sm text-rose-200 lg:col-span-3">{decide.error.message}</p>}</div>}</CardContent></Card>
      </> : <Card className="border-dashed border-white/15 bg-[#111b2c] text-white"><CardContent className="p-8 text-center text-slate-400">Select or create a weekly aggregate brief to review its evidence and decision trail.</CardContent></Card>}</div>
    </section>

    <Card className="border-rose-400/20 bg-rose-400/5 text-white"><CardContent className="flex gap-3 p-5"><LockKeyhole className="h-5 w-5 shrink-0 text-rose-200" /><p className="text-sm leading-6 text-rose-100">This workspace is not an automation system. It does not send a weekly email, schedule a background task, connect Meta, create or edit a campaign, spend, publish, call a provider, send a message, create a CAPI event, or change any CRM record.</p></CardContent></Card>
    <Button variant="ghost" onClick={() => navigate("/marketing/agentic-system")} className="text-slate-400 hover:bg-white/5 hover:text-white"><ArrowLeft className="mr-2 h-4 w-4" />Back to Agentic Marketing System</Button>
  </div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[.03] p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>;
}
