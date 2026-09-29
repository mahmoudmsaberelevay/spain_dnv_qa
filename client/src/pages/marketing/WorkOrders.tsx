import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle, Ban, CheckCircle2, ChevronDown, CircleDollarSign, ClipboardCheck,
  FileClock, FileSearch, LockKeyhole, PauseCircle, PlayCircle, Plus, RefreshCw,
  Send, ShieldCheck, Sparkles, XCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type WorkType = "source_research" | "strategy_brief" | "creative_package" | "voiceover_draft" | "media_render_brief" | "qa_review";
type WorkStatus = "draft" | "submitted" | "approved" | "hold" | "rejected" | "cancelled" | string;

const WORK_TYPES: Array<{ value: WorkType; label: string; description: string }> = [
  { value: "source_research", label: "Source research", description: "Research plan and evidence gaps. No factual claim is created or published." },
  { value: "strategy_brief", label: "Strategy brief", description: "Evidence-backed campaign or content strategy proposal." },
  { value: "creative_package", label: "Creative package", description: "Copy, visual direction, CTA and testing brief based on approved claims." },
  { value: "voiceover_draft", label: "Arabic voice-over draft", description: "Controlled voice draft request from an approved final script." },
  { value: "media_render_brief", label: "Media-render brief", description: "Platform render requirements and asset-provenance plan." },
  { value: "qa_review", label: "QA review", description: "Structured factual, brand, visual and technical QA specification." },
];

function formatDate(value?: number | null) {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

function formatUsd(value?: string | number | null) {
  const numeric = typeof value === "string" ? Number(value) : value ?? 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number.isFinite(numeric) ? numeric : 0);
}

function StatusBadge({ status }: { status: WorkStatus }) {
  const style: Record<string, string> = {
    draft: "border-slate-400/30 bg-slate-400/10 text-slate-200",
    submitted: "border-sky-400/30 bg-sky-400/10 text-sky-100",
    approved: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
    hold: "border-amber-400/30 bg-amber-400/10 text-amber-100",
    rejected: "border-rose-400/30 bg-rose-400/10 text-rose-100",
    cancelled: "border-slate-400/30 bg-slate-400/10 text-slate-300",
  };
  return <Badge variant="outline" className={style[status] ?? style.draft}>{status.replaceAll("_", " ")}</Badge>;
}

function providerState(provider?: { isEnabled?: boolean; killSwitchEnabled?: boolean; status?: string } | null) {
  if (!provider) return "Provider profile unavailable";
  if (!provider.isEnabled) return "Provider disabled";
  if (provider.killSwitchEnabled) return "Kill switch engaged";
  return provider.status ?? "Unavailable";
}

export default function WorkOrders() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: access, isLoading: accessLoading } = trpc.marketingSystem.access.useQuery();
  const canView = access?.capabilities.includes("view_work_orders") === true;
  const canSubmit = access?.capabilities.includes("submit_work_orders") === true;
  const canReview = access?.capabilities.includes("review_work_orders") === true;
  const canDryRun = access?.capabilities.includes("run_work_order_dry_runs") === true;
  const canCancel = access?.capabilities.includes("cancel_work_orders") === true;
  const isOwner = access?.role === "owner";
  const { data: workOrderData, isLoading: ordersLoading } = trpc.marketingSystem.getWorkOrders.useQuery(undefined, { enabled: canView });
  const { data: config } = trpc.marketingSystem.getWorkOrderConfiguration.useQuery(undefined, { enabled: canSubmit });

  const [form, setForm] = useState({
    workType: "source_research" as WorkType,
    title: "",
    programKey: "",
    objective: "",
    brief: "",
    requestedProviderAlias: "source-research",
    costCeilingUsd: "10",
    estimatedCostUsd: "0",
    maxIterations: "1",
  });
  const [selectedClaims, setSelectedClaims] = useState<number[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [cancelNotes, setCancelNotes] = useState<Record<number, string>>({});

  const workOrders = workOrderData?.orders ?? [];
  const typeInfo = useMemo(() => WORK_TYPES.find(type => type.value === form.workType) ?? WORK_TYPES[0], [form.workType]);
  const requiresClaim = form.workType !== "source_research";
  const requiresBrandBook = form.workType !== "source_research";
  const matchingClaims = useMemo(
    () => (config?.claims ?? []).filter(claim => !form.programKey || claim.programKey === form.programKey),
    [config?.claims, form.programKey],
  );

  const invalidate = async () => {
    await Promise.all([
      utils.marketingSystem.getWorkOrders.invalidate(),
      utils.marketingSystem.getWorkOrderConfiguration.invalidate(),
    ]);
  };

  const create = trpc.marketingSystem.createWorkOrder.useMutation({
    onSuccess: async () => {
      await invalidate();
      setForm(current => ({ ...current, title: "", programKey: "", objective: "", brief: "", costCeilingUsd: "10", estimatedCostUsd: "0" }));
      setSelectedClaims([]);
      toast.success("Draft work order created with a zero-spend cost ledger.");
    },
    onError: error => toast.error(error.message),
  });
  const submit = trpc.marketingSystem.submitWorkOrder.useMutation({
    onSuccess: async () => { await invalidate(); toast.success("Work order submitted for Mahmoud’s explicit review."); },
    onError: error => toast.error(error.message),
  });
  const review = trpc.marketingSystem.reviewWorkOrder.useMutation({
    onSuccess: async () => { await invalidate(); toast.success("Owner review recorded in the immutable work-order lineage."); },
    onError: error => toast.error(error.message),
  });
  const dryRun = trpc.marketingSystem.dryRunWorkOrder.useMutation({
    onSuccess: async result => {
      await invalidate();
      toast.success(result.executionAllowed ? "Dry-run complete." : "Dry-run complete: execution remains blocked by the displayed safeguards.");
    },
    onError: error => toast.error(error.message),
  });
  const cancel = trpc.marketingSystem.cancelWorkOrder.useMutation({
    onSuccess: async () => { await invalidate(); toast.success("Work order cancelled. Its lineage remains available for audit."); },
    onError: error => toast.error(error.message),
  });

  const submitForm = () => {
    const ceiling = Number(form.costCeilingUsd);
    const estimate = Number(form.estimatedCostUsd);
    if (!Number.isFinite(ceiling) || !Number.isFinite(estimate) || estimate > ceiling) return toast.error("Enter a valid estimate that does not exceed the cost ceiling.");
    if (requiresBrandBook && !config?.brandBook) return toast.error("This work type requires an active owner-approved Brand Book.");
    if (requiresClaim && selectedClaims.length === 0) return toast.error("This work type requires at least one approved tracked claim.");
    create.mutate({
      workType: form.workType,
      title: form.title,
      programKey: form.programKey || undefined,
      objective: form.objective,
      brief: form.brief,
      requestedProviderAlias: form.requestedProviderAlias,
      knowledgeClaimIds: selectedClaims,
      inputArtifactIds: [],
      costCeilingUsd: ceiling,
      estimatedCostUsd: estimate,
      maxIterations: Number(form.maxIterations),
    });
  };

  if (accessLoading || ordersLoading) return <div className="flex min-h-[65vh] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-[#5BA3B8]" /></div>;
  if (!canView) return <div className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-6 text-center"><LockKeyhole className="mb-4 h-12 w-12 text-amber-300" /><h1 className="text-2xl font-bold text-white">Work Order access is controlled</h1><p className="mt-3 text-sm leading-6 text-slate-400">Ask Mahmoud to assign a Marketing System role. Work Orders do not grant publishing, paid-campaign, or provider access.</p></div>;

  return <div className="min-h-full bg-[#0c1320] px-4 py-6 text-white md:px-8"><div className="mx-auto max-w-7xl space-y-6">
    <section className="relative overflow-hidden rounded-3xl border border-[#5BA3B8]/25 bg-[radial-gradient(circle_at_15%_0%,rgba(91,163,184,.22),transparent_36%),linear-gradient(115deg,#15263d,#0d1524_52%,#111827)] p-6 md:p-8">
      <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-[#C9A84C]/10 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div className="max-w-3xl"><div className="mb-3 flex items-center gap-2 text-[#a9d6e3]"><ClipboardCheck className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[.18em]">Agentic Marketing System · Phase 3</span></div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Controlled Work Orders</h1><p className="mt-3 text-sm leading-6 text-slate-300">Typed, cost-capped internal planning with visible approval lineage. This workspace is not an autonomous agent, publishing tool, client-messaging tool, or spend-control panel.</p></div><div className="grid grid-cols-3 gap-3 text-sm"><div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-slate-400">Orders</p><p className="mt-1 font-semibold">{workOrders.length}</p></div><div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-slate-400">Awaiting review</p><p className="mt-1 font-semibold text-amber-200">{workOrders.filter(order => order.status === "submitted").length}</p></div><div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-slate-400">Actual spend</p><p className="mt-1 font-semibold text-emerald-200">{formatUsd(workOrders.reduce((sum, order) => sum + Number(order.actualCostUsd ?? 0), 0))}</p></div></div></div>
    </section>

    <Card className="border-amber-400/30 bg-amber-400/10 text-white"><CardContent className="flex gap-3 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" /><div><p className="font-semibold text-amber-100">Phase 3 execution boundary</p><p className="mt-1 text-sm leading-6 text-amber-100/75">{workOrderData?.policy}</p></div></CardContent></Card>

    {canSubmit && <Card className="border-[#5BA3B8]/25 bg-[#111b2c] text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-[#8ad5e7]" />Create a work order</CardTitle><CardDescription className="text-slate-400">Do not include client names, contact details, passport data, Lead IDs, or other personal data. A draft has no provider call and no actual charge.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><div><Label>Work type</Label><Select value={form.workType} onValueChange={value => { setForm(current => ({ ...current, workType: value as WorkType })); setSelectedClaims([]); }}><SelectTrigger className="mt-1 border-white/10 bg-[#0c1320]"><SelectValue /></SelectTrigger><SelectContent>{WORK_TYPES.map(type => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select></div><div><Label>Programme key <span className="text-slate-500">optional for general research</span></Label><Input value={form.programKey} onChange={event => { setForm(current => ({ ...current, programKey: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })); setSelectedClaims([]); }} className="mt-1 border-white/10 bg-[#0c1320] text-white" placeholder="spain_digital_nomad_residency" /></div><div><Label>Provider alias</Label><Select value={form.requestedProviderAlias} onValueChange={value => setForm(current => ({ ...current, requestedProviderAlias: value }))}><SelectTrigger className="mt-1 border-white/10 bg-[#0c1320]"><SelectValue /></SelectTrigger><SelectContent>{(config?.providers ?? []).map(provider => <SelectItem key={provider.alias} value={provider.alias}>{provider.alias} · {provider.isEnabled ? "enabled" : "disabled"}</SelectItem>)}</SelectContent></Select></div></div><p className="rounded-xl bg-white/5 px-3 py-2 text-xs leading-5 text-slate-400">{typeInfo.description} {requiresBrandBook && "An active Brand Book and approved source-backed claim(s) are required before this type can be created."}</p><div className="grid gap-3 md:grid-cols-2"><div><Label>Internal title</Label><Input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} className="mt-1 border-white/10 bg-[#0c1320] text-white" placeholder="What should this controlled plan accomplish?" /></div><div><Label>Objective</Label><Input value={form.objective} onChange={event => setForm(current => ({ ...current, objective: event.target.value }))} className="mt-1 border-white/10 bg-[#0c1320] text-white" placeholder="Measurable internal outcome, not a guarantee" /></div></div><div><Label>Internal brief</Label><Textarea value={form.brief} onChange={event => setForm(current => ({ ...current, brief: event.target.value }))} className="mt-1 min-h-32 border-white/10 bg-[#0c1320] text-white" placeholder="Describe the approved inputs, desired structured output, uncertainty, and review expectation. Keep it free of client or Lead data." /></div>
      {requiresClaim && <div className="rounded-2xl border border-[#5BA3B8]/20 bg-[#0c1320] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">Approved claim references</p><p className="mt-1 text-xs text-slate-400">Only owner-approved claims backed by tracked official sources are available.</p></div><Badge variant="outline" className="border-[#5BA3B8]/30 text-[#a9d6e3]">{selectedClaims.length} selected</Badge></div>{matchingClaims.length === 0 ? <p className="mt-3 text-sm text-amber-200">No approved claim is available for this programme yet. Complete source and claim review first.</p> : <div className="mt-3 grid gap-2 lg:grid-cols-2">{matchingClaims.map(claim => <label key={claim.id} className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm"><input type="checkbox" checked={selectedClaims.includes(claim.id)} onChange={event => setSelectedClaims(current => event.target.checked ? [...current, claim.id] : current.filter(id => id !== claim.id))} className="mt-1 h-4 w-4 accent-[#5BA3B8]" /><span><span className="font-medium text-slate-200">{claim.programKey.replaceAll("_", " ")} · {claim.claimType.replaceAll("_", " ")}</span><span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-400">{claim.claimText}</span></span></label>)}</div>}</div>}
      <div className="grid gap-3 md:grid-cols-3"><div><Label>Cost ceiling (USD)</Label><Input type="number" min="0" max="10000" step="0.01" value={form.costCeilingUsd} onChange={event => setForm(current => ({ ...current, costCeilingUsd: event.target.value }))} className="mt-1 border-white/10 bg-[#0c1320] text-white" /></div><div><Label>Declared estimate (USD)</Label><Input type="number" min="0" max="10000" step="0.01" value={form.estimatedCostUsd} onChange={event => setForm(current => ({ ...current, estimatedCostUsd: event.target.value }))} className="mt-1 border-white/10 bg-[#0c1320] text-white" /></div><div><Label>Maximum iterations</Label><Select value={form.maxIterations} onValueChange={value => setForm(current => ({ ...current, maxIterations: value }))}><SelectTrigger className="mt-1 border-white/10 bg-[#0c1320]"><SelectValue /></SelectTrigger><SelectContent>{["1", "2", "3", "4", "5"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div></div><p className="text-xs text-slate-500">A ceiling is a review constraint, not a payment authorization. Phase 3 records a cost ledger but can only write zero-cost dry-run entries.</p><Button disabled={create.isPending || !form.title.trim() || !form.objective.trim() || form.brief.trim().length < 30 || !form.requestedProviderAlias} onClick={submitForm} className="bg-[#5BA3B8] text-slate-950 hover:bg-[#82c8d9]"><CircleDollarSign className="mr-2 h-4 w-4" />Create protected draft</Button></CardContent></Card>}

    <section className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Work-order lineage</h2><p className="mt-1 text-sm text-slate-400">Every status transition, cost entry, and dry-run artifact remains visible. Nothing is deleted when cancelled or rejected.</p></div><Badge variant="outline" className="border-white/15 text-slate-300">{workOrders.length} retained</Badge></div>
      {workOrders.length === 0 ? <Card className="border-dashed border-white/15 bg-[#111b2c] text-white"><CardContent className="py-12 text-center"><FileClock className="mx-auto h-8 w-8 text-slate-500" /><p className="mt-3 text-sm text-slate-400">No work orders exist yet. Create a protected source-research draft to begin the governed workflow.</p></CardContent></Card> : workOrders.map(order => <Card key={order.id} className="border-white/10 bg-[#111b2c] text-white"><CardHeader className="pb-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="mb-2 flex flex-wrap items-center gap-2"><StatusBadge status={order.status} /><Badge variant="outline" className="border-white/15 text-slate-300">{String(order.workType).replaceAll("_", " ")}</Badge>{order.programKey && <Badge variant="outline" className="border-[#5BA3B8]/30 text-[#a9d6e3]">{order.programKey.replaceAll("_", " ")}</Badge>}</div><CardTitle className="text-lg">{order.title}</CardTitle><CardDescription className="mt-2 max-w-3xl text-slate-400">{order.objective}</CardDescription></div><div className="text-left text-xs text-slate-400 lg:text-right"><p>{order.workOrderKey}</p><p className="mt-1">Created {formatDate(order.createdAt)}</p></div></div></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4"><div className="rounded-xl bg-[#0c1320] p-3"><p className="text-xs text-slate-500">Provider</p><p className="mt-1 font-medium">{order.requestedProviderAlias}</p><p className="mt-1 text-xs text-amber-200">{providerState(order.provider)}</p></div><div className="rounded-xl bg-[#0c1320] p-3"><p className="text-xs text-slate-500">Cost ceiling / estimate</p><p className="mt-1 font-medium">{formatUsd(order.costCeilingUsd)} / {formatUsd(order.estimatedCostUsd)}</p><p className="mt-1 text-xs text-emerald-200">Actual {formatUsd(order.actualCostUsd)}</p></div><div className="rounded-xl bg-[#0c1320] p-3"><p className="text-xs text-slate-500">Evidence</p><p className="mt-1 font-medium">{order.knowledgeClaimIds.length} approved claim ref{order.knowledgeClaimIds.length === 1 ? "" : "s"}</p><p className="mt-1 text-xs text-slate-400">Brand v{order.brandBookVersion ?? "not required"}</p></div><div className="rounded-xl bg-[#0c1320] p-3"><p className="text-xs text-slate-500">Latest dry-run</p><p className="mt-1 font-medium">{formatDate(order.lastDryRunAt)}</p><p className="mt-1 text-xs text-slate-400">{order.artifacts.length} immutable artifact{order.artifacts.length === 1 ? "" : "s"}</p></div></div>
        <details className="group rounded-xl border border-white/10 bg-[#0c1320] p-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium"><span className="flex items-center gap-2"><FileSearch className="h-4 w-4 text-[#8ad5e7]" />Inputs, schema, costs and lineage</span><ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" /></summary><div className="mt-4 grid gap-4 xl:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Structured output contract</p><pre className="mt-2 max-h-44 overflow-auto rounded-lg bg-black/20 p-3 text-xs leading-5 text-slate-300">{JSON.stringify(order.outputSchema, null, 2)}</pre><p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Internal brief</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{order.brief}</p></div><div className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Append-only events</p><div className="mt-2 space-y-2">{order.events.length === 0 ? <p className="text-sm text-slate-500">No events recorded.</p> : order.events.map(event => <div key={event.id} className="rounded-lg bg-white/5 p-2 text-xs"><span className="font-semibold text-slate-200">{event.action.replaceAll("_", " ")}</span>{event.fromStatus || event.toStatus ? <span className="ml-2 text-slate-400">{event.fromStatus ?? "—"} → {event.toStatus ?? "—"}</span> : null}<p className="mt-1 text-slate-500">{formatDate(event.createdAt)}{event.reason ? ` · ${event.reason}` : ""}</p></div>)}</div></div><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cost ledger</p><div className="mt-2 space-y-2">{order.costs.map(cost => <div key={cost.id} className="flex items-center justify-between rounded-lg bg-white/5 p-2 text-xs"><span className="capitalize text-slate-300">{cost.entryType.replaceAll("_", " ")}</span><span className="font-medium text-slate-100">{formatUsd(cost.amountUsd)}</span></div>)}</div></div></div></div></details>
        {order.reviewNote && <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-50"><span className="font-semibold">Latest review: </span>{order.reviewNote}</div>}
        <div className="flex flex-col gap-3 border-t border-white/10 pt-4"><div className="flex flex-wrap gap-2">{canSubmit && order.status === "draft" && <Button size="sm" disabled={submit.isPending} onClick={() => submit.mutate({ workOrderId: order.id })} className="bg-[#5BA3B8] text-slate-950 hover:bg-[#82c8d9]"><Send className="mr-1.5 h-4 w-4" />Submit for owner review</Button>}{canDryRun && order.status === "approved" && <Button size="sm" variant="outline" disabled={dryRun.isPending} onClick={() => dryRun.mutate({ workOrderId: order.id })} className="border-[#5BA3B8]/40 bg-transparent text-[#a9d6e3] hover:bg-[#5BA3B8]/10 hover:text-white"><PlayCircle className="mr-1.5 h-4 w-4" />Run zero-cost dry-run</Button>}{canCancel && !["cancelled", "rejected"].includes(order.status) && <Button size="sm" variant="outline" disabled={cancel.isPending || !(cancelNotes[order.id] ?? "").trim()} onClick={() => cancel.mutate({ workOrderId: order.id, note: cancelNotes[order.id] ?? "" })} className="border-rose-400/30 bg-transparent text-rose-200 hover:bg-rose-400/10 hover:text-white"><Ban className="mr-1.5 h-4 w-4" />Cancel</Button>}</div>{canCancel && !["cancelled", "rejected"].includes(order.status) && <Input value={cancelNotes[order.id] ?? ""} onChange={event => setCancelNotes(current => ({ ...current, [order.id]: event.target.value }))} placeholder="Cancellation reason is required and retained in the audit trail" className="max-w-2xl border-white/10 bg-white/5 text-white placeholder:text-slate-600" />}
          {isOwner && canReview && ["submitted", "hold"].includes(order.status) && <div className="rounded-xl border border-[#5BA3B8]/20 bg-[#5BA3B8]/5 p-3"><p className="mb-2 text-sm font-medium text-[#c7edf5]">Mahmoud’s explicit decision</p><div className="flex flex-col gap-2 sm:flex-row"><Input value={reviewNotes[order.id] ?? ""} onChange={event => setReviewNotes(current => ({ ...current, [order.id]: event.target.value }))} placeholder="Decision note (required)" className="border-white/10 bg-[#0c1320] text-white placeholder:text-slate-600" /><Button size="sm" disabled={review.isPending || (reviewNotes[order.id] ?? "").trim().length < 4} onClick={() => review.mutate({ workOrderId: order.id, nextStatus: "approved", note: reviewNotes[order.id] ?? "" })} className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200"><CheckCircle2 className="mr-1.5 h-4 w-4" />Approve</Button><Button size="sm" variant="outline" disabled={review.isPending || (reviewNotes[order.id] ?? "").trim().length < 4} onClick={() => review.mutate({ workOrderId: order.id, nextStatus: "hold", note: reviewNotes[order.id] ?? "" })} className="border-amber-400/30 bg-transparent text-amber-100 hover:bg-amber-400/10 hover:text-white"><PauseCircle className="mr-1.5 h-4 w-4" />Hold</Button><Button size="sm" variant="outline" disabled={review.isPending || (reviewNotes[order.id] ?? "").trim().length < 4} onClick={() => review.mutate({ workOrderId: order.id, nextStatus: "rejected", note: reviewNotes[order.id] ?? "" })} className="border-rose-400/30 bg-transparent text-rose-200 hover:bg-rose-400/10 hover:text-white"><XCircle className="mr-1.5 h-4 w-4" />Reject</Button></div></div>}</div>
      </CardContent></Card>)}</section>
    <div className="flex justify-end"><Button variant="ghost" onClick={() => navigate("/marketing")} className="text-slate-400 hover:bg-white/5 hover:text-white">Back to Marketing module</Button></div>
  </div></div>;
}
