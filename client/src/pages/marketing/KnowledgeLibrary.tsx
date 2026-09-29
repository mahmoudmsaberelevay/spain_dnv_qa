import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle, BadgeCheck, BookOpenText, CheckCircle2, CircleAlert, ExternalLink,
  FileSearch, LockKeyhole, Plus, RefreshCw, SearchCheck, ShieldCheck, XCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type SourceStatus = "candidate" | "approved" | "needs_review" | string;
type ClaimStatus = "proposed" | "approved" | "rejected" | "needs_review" | string;
type InternalProgrammeAnalysis = {
  executive_summary?: string;
  programmes?: Array<{ name?: string; positioning?: string; citations?: string[] }>;
  critical_review_flags?: string[];
};

function StatusBadge({ status }: { status: SourceStatus | ClaimStatus }) {
  const styles: Record<string, string> = {
    approved: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    candidate: "border-amber-400/30 bg-amber-400/10 text-amber-100",
    proposed: "border-sky-400/30 bg-sky-400/10 text-sky-200",
    needs_review: "border-rose-400/30 bg-rose-400/10 text-rose-200",
    rejected: "border-slate-400/30 bg-slate-400/10 text-slate-200",
  };
  return <Badge variant="outline" className={styles[status] ?? "border-slate-400/30 bg-slate-400/10 text-slate-200"}>{status.replaceAll("_", " ")}</Badge>;
}

function formatDate(value: number | null | undefined) {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

export default function KnowledgeLibrary() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: access, isLoading: accessLoading } = trpc.marketingSystem.access.useQuery();
  const canView = access?.capabilities.includes("view_knowledge") === true;
  const canManageSources = access?.capabilities.includes("manage_knowledge_sources") === true;
  const canCreateClaims = access?.capabilities.includes("create_knowledge_claims") === true;
  const canReviewClaims = access?.capabilities.includes("review_knowledge_claims") === true;
  const isOwner = ["owner", "marketing_system_admin"].includes(access?.role ?? "");
  const { data: library, isLoading: libraryLoading } = trpc.marketingSystem.getKnowledgeLibrary.useQuery(undefined, { enabled: canView });

  const [sourceForm, setSourceForm] = useState({
    programKey: "spain_digital_nomad_residency",
    programLabel: "Spain International Teleworker Residency",
    title: "",
    authorityName: "",
    sourceType: "official_programme",
    sourceUrl: "",
    snapshotText: "",
  });
  const [claimForm, setClaimForm] = useState({ programKey: "spain_digital_nomad_residency", claimType: "programme_overview", sourceId: "", riskLevel: "medium", claimText: "" });
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [changeNotes, setChangeNotes] = useState<Record<number, string>>({});

  const sources = library?.sources ?? [];
  const internalReferences = library?.internalReferences ?? [];
  const claims = library?.claims ?? [];
  const approvedSources = useMemo(() => sources.filter(source => source.status === "approved" && source.changeState === "tracked"), [sources]);
  const activeSourceOptions = useMemo(() => approvedSources.filter(source => source.programKey === claimForm.programKey), [approvedSources, claimForm.programKey]);

  useEffect(() => {
    if (!claimForm.sourceId && activeSourceOptions[0]) setClaimForm(current => ({ ...current, sourceId: String(activeSourceOptions[0].id) }));
  }, [activeSourceOptions, claimForm.sourceId]);

  const invalidateLibrary = async () => {
    await utils.marketingSystem.getKnowledgeLibrary.invalidate();
  };
  const addSource = trpc.marketingSystem.addKnowledgeSource.useMutation({
    onSuccess: async () => {
      await invalidateLibrary();
      setSourceForm({ programKey: "spain_digital_nomad_residency", programLabel: "Spain International Teleworker Residency", title: "", authorityName: "", sourceType: "official_programme", sourceUrl: "", snapshotText: "" });
      toast.success("Official source submitted as a candidate for owner review.");
    },
    onError: error => toast.error(error.message),
  });
  const approveSource = trpc.marketingSystem.approveKnowledgeSource.useMutation({
    onSuccess: async () => { await invalidateLibrary(); toast.success("Official source approved and tracked."); },
    onError: error => toast.error(error.message),
  });
  const reportChange = trpc.marketingSystem.reportMaterialSourceChange.useMutation({
    onSuccess: async () => { await invalidateLibrary(); toast.success("Source and supported claims now require review."); },
    onError: error => toast.error(error.message),
  });
  const proposeClaim = trpc.marketingSystem.proposeKnowledgeClaim.useMutation({
    onSuccess: async () => { await invalidateLibrary(); setClaimForm(current => ({ ...current, claimText: "" })); toast.success("Claim saved as proposed for owner review."); },
    onError: error => toast.error(error.message),
  });
  const reviewClaim = trpc.marketingSystem.reviewKnowledgeClaim.useMutation({
    onSuccess: async () => { await invalidateLibrary(); toast.success("Claim review recorded."); },
    onError: error => toast.error(error.message),
  });

  if (accessLoading || libraryLoading) return <div className="flex min-h-[65vh] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-[#5BA3B8]" /></div>;
  if (!canView) return <div className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-6 text-center"><LockKeyhole className="mb-4 h-12 w-12 text-amber-300" /><h1 className="text-2xl font-bold text-white">Knowledge Library access is controlled</h1><p className="mt-3 text-sm leading-6 text-slate-400">Ask Mahmoud to assign a Marketing System role if you need read-only knowledge, research, creative, or analytics access.</p></div>;

  const submitSource = () => addSource.mutate({
    ...sourceForm,
    sourceType: sourceForm.sourceType as "official_programme" | "official_law_or_regulation" | "official_consular_guidance" | "official_authority_update",
  });
  const submitClaim = () => proposeClaim.mutate({
    programKey: claimForm.programKey,
    claimType: claimForm.claimType as "programme_overview" | "eligibility" | "family" | "process" | "document" | "timeline" | "cost_or_fee" | "restriction",
    sourceId: Number(claimForm.sourceId),
    riskLevel: claimForm.riskLevel as "low" | "medium" | "high",
    claimText: claimForm.claimText,
  });

  return <div className="min-h-full bg-[#0c1320] px-4 py-6 text-white md:px-8"><div className="mx-auto max-w-7xl space-y-6">
    <section className="relative overflow-hidden rounded-3xl border border-[#5BA3B8]/25 bg-[radial-gradient(circle_at_15%_0%,rgba(91,163,184,.22),transparent_36%),linear-gradient(115deg,#15263d,#0d1524_52%,#111827)] p-6 md:p-8">
      <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-[#C9A84C]/10 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div className="max-w-3xl"><div className="mb-3 flex items-center gap-2 text-[#a9d6e3]"><BookOpenText className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[.18em]">Agentic Marketing System · Phase 2</span></div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Official Knowledge Library</h1><p className="mt-3 text-sm leading-6 text-slate-300">A controlled source-of-truth for programme evidence and claims. It does not provide legal advice, publish content, contact clients, or change advertising.</p></div><div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-slate-400">Internal refs</p><p className="mt-1 font-semibold text-sky-200">{internalReferences.length}</p></div><div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-slate-400">Sources</p><p className="mt-1 font-semibold">{sources.length}</p></div><div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-slate-400">Tracked</p><p className="mt-1 font-semibold text-emerald-200">{approvedSources.length}</p></div><div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-slate-400">Approved claims</p><p className="mt-1 font-semibold">{claims.filter(claim => claim.status === "approved").length}</p></div></div></div>
    </section>

    <Card className="border-amber-400/30 bg-amber-400/10 text-white"><CardContent className="flex gap-3 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" /><div><p className="font-semibold text-amber-100">Evidence and approval gate</p><p className="mt-1 text-sm leading-6 text-amber-100/75">{library?.policy}</p></div></CardContent></Card>

    <Card className="border-sky-400/25 bg-sky-400/5 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><BookOpenText className="h-5 w-5 text-sky-200" />Your internal Spain & Malta programme references</CardTitle><CardDescription className="text-sky-100/70">These are extracted only from documents supplied by Mahmoud. They help the internal model analyse programme material but are not official evidence, are not used to create claims, and cannot publish or advise clients.</CardDescription></CardHeader><CardContent className="space-y-4">{internalReferences.length === 0 ? <p className="text-sm text-slate-400">No user-supplied internal programme reference has been loaded yet.</p> : internalReferences.map(reference => { const analysis = reference.analysis as InternalProgrammeAnalysis; return <div key={reference.id} className="rounded-2xl border border-sky-400/20 bg-[#0c1320] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold">{reference.title}</p><p className="mt-1 text-xs text-slate-400">{reference.sourceFileName} · document update {reference.documentUpdatedLabel || "not stated"}</p></div><Badge variant="outline" className="border-sky-400/30 bg-sky-400/10 text-sky-100">internal reference only</Badge></div><p className="mt-3 text-sm leading-6 text-slate-300">{analysis.executive_summary || "Internal analysis is available for controlled review."}</p>{analysis.programmes?.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{analysis.programmes.map((programme, index) => <div key={`${reference.id}-${index}`} className="rounded-xl border border-white/10 bg-white/[.03] p-3"><p className="font-medium text-sky-100">{programme.name || "Programme"}</p>{programme.positioning && <p className="mt-1 text-xs leading-5 text-slate-400">{programme.positioning}</p>}{programme.citations?.length ? <p className="mt-2 text-xs text-slate-500">{programme.citations.slice(0, 2).join(" · ")}</p> : null}</div>)}</div> : null}{analysis.critical_review_flags?.length ? <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3"><p className="text-sm font-medium text-amber-100">Verification holds</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-amber-100/80">{analysis.critical_review_flags.slice(0, 5).map((flag, index) => <li key={`${reference.id}-flag-${index}`}>{flag}</li>)}</ul></div> : null}</div>})}</CardContent></Card>

    <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
      <Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader><CardTitle className="flex items-center gap-2"><FileSearch className="h-5 w-5 text-[#8ad5e7]" />Official source register</CardTitle><CardDescription className="text-slate-400">Only allowlisted HTTPS government or authority domains are accepted. Every record stores a source snapshot hash and review trail.</CardDescription></CardHeader><CardContent className="space-y-4">{sources.length === 0 ? <p className="text-sm text-slate-400">No source candidates are loaded yet.</p> : sources.map(source => <div key={source.id} className="rounded-2xl border border-white/10 bg-[#0c1320] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold">{source.title}</p><p className="mt-1 text-xs text-slate-400">{source.programLabel} · {source.authorityName}</p></div><div className="flex flex-wrap gap-2"><StatusBadge status={source.status} />{source.changeState !== "tracked" && <Badge variant="outline" className="border-rose-400/30 bg-rose-400/10 text-rose-200">{source.changeState.replaceAll("_", " ")}</Badge>}</div></div><a href={source.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 break-all text-sm text-[#8ad5e7] hover:text-white">{source.sourceDomain}<ExternalLink className="h-3.5 w-3.5" /></a><div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2"><p>Tier {source.trustTier} · {source.sourceType.replaceAll("_", " ")}</p><p>Snapshot {source.snapshotHash ? `${source.snapshotHash.slice(0, 12)}…` : "pending"}</p><p>Retrieved: {formatDate(source.snapshotRetrievedAt)}</p><p>Reviewed: {formatDate(source.reviewedAt)}</p></div>{source.changeSummary && <p className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 text-xs leading-5 text-slate-300">{source.changeSummary}</p>}{isOwner && <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row sm:items-center"><Button size="sm" disabled={source.status === "approved" && source.changeState === "tracked" || approveSource.isPending} onClick={() => approveSource.mutate({ sourceId: source.id })} className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200"><BadgeCheck className="mr-1.5 h-4 w-4" />Approve source</Button><Input value={changeNotes[source.id] ?? ""} onChange={event => setChangeNotes(current => ({ ...current, [source.id]: event.target.value }))} placeholder="Material-change note" className="border-white/10 bg-white/5 text-white placeholder:text-slate-600" /><Button size="sm" variant="outline" disabled={!changeNotes[source.id]?.trim() || reportChange.isPending} onClick={() => reportChange.mutate({ sourceId: source.id, changeSummary: changeNotes[source.id] ?? "" })} className="border-rose-400/30 bg-transparent text-rose-200 hover:bg-rose-400/10 hover:text-white"><AlertTriangle className="mr-1.5 h-4 w-4" />Mark changed</Button></div>}</div>)}</CardContent></Card>

      <div className="space-y-6">{canManageSources && <Card className="border-[#5BA3B8]/25 bg-[#111b2c] text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-[#8ad5e7]" />Submit an official source</CardTitle><CardDescription className="text-slate-400">Add an official authority page and a concise review snapshot. Submission creates a candidate only; it is not a claim.</CardDescription></CardHeader><CardContent className="grid gap-3"><div className="grid gap-3 md:grid-cols-2"><div><Label>Programme key</Label><Input value={sourceForm.programKey} onChange={event => setSourceForm(current => ({ ...current, programKey: event.target.value }))} className="mt-1 border-white/10 bg-[#0c1320] text-white" /></div><div><Label>Programme label</Label><Input value={sourceForm.programLabel} onChange={event => setSourceForm(current => ({ ...current, programLabel: event.target.value }))} className="mt-1 border-white/10 bg-[#0c1320] text-white" /></div></div><div><Label>Source title</Label><Input value={sourceForm.title} onChange={event => setSourceForm(current => ({ ...current, title: event.target.value }))} className="mt-1 border-white/10 bg-[#0c1320] text-white" placeholder="Official page title" /></div><div><Label>Issuing authority</Label><Input value={sourceForm.authorityName} onChange={event => setSourceForm(current => ({ ...current, authorityName: event.target.value }))} className="mt-1 border-white/10 bg-[#0c1320] text-white" placeholder="Government agency or official authority" /></div><div className="grid gap-3 md:grid-cols-2"><div><Label>Source type</Label><Select value={sourceForm.sourceType} onValueChange={value => setSourceForm(current => ({ ...current, sourceType: value }))}><SelectTrigger className="mt-1 border-white/10 bg-[#0c1320]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="official_programme">Official programme</SelectItem><SelectItem value="official_law_or_regulation">Official law / regulation</SelectItem><SelectItem value="official_consular_guidance">Official consular guidance</SelectItem><SelectItem value="official_authority_update">Official authority update</SelectItem></SelectContent></Select></div><div><Label>HTTPS source URL</Label><Input type="url" value={sourceForm.sourceUrl} onChange={event => setSourceForm(current => ({ ...current, sourceUrl: event.target.value }))} className="mt-1 border-white/10 bg-[#0c1320] text-white" placeholder="https://…" /></div></div><div><Label>Review snapshot</Label><Textarea value={sourceForm.snapshotText} onChange={event => setSourceForm(current => ({ ...current, snapshotText: event.target.value }))} className="mt-1 min-h-28 border-white/10 bg-[#0c1320] text-white" placeholder="Briefly record what this authority page proves, when it was reviewed, and any jurisdiction or date caveat. Do not add client data." /></div><Button disabled={addSource.isPending || !sourceForm.title || !sourceForm.authorityName || !sourceForm.sourceUrl || sourceForm.snapshotText.trim().length < 30} onClick={submitSource} className="w-fit bg-[#5BA3B8] text-slate-950 hover:bg-[#82c8d9]">Submit candidate source</Button></CardContent></Card>}</div>
    </div>

    <Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader><CardTitle className="flex items-center gap-2"><SearchCheck className="h-5 w-5 text-[#8ad5e7]" />Evidence-backed claim review</CardTitle><CardDescription className="text-slate-400">A claim is a controlled internal statement, not legal advice or a publish command. Only approved and tracked source snapshots can support it.</CardDescription></CardHeader><CardContent className="space-y-5">{canCreateClaims && <div className="rounded-2xl border border-[#5BA3B8]/20 bg-[#0c1320] p-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><div><Label>Programme key</Label><Input value={claimForm.programKey} onChange={event => setClaimForm(current => ({ ...current, programKey: event.target.value, sourceId: "" }))} className="mt-1 border-white/10 bg-white/5 text-white" /></div><div><Label>Claim type</Label><Select value={claimForm.claimType} onValueChange={value => setClaimForm(current => ({ ...current, claimType: value }))}><SelectTrigger className="mt-1 border-white/10 bg-white/5"><SelectValue /></SelectTrigger><SelectContent>{["programme_overview", "eligibility", "family", "process", "document", "timeline", "cost_or_fee", "restriction"].map(type => <SelectItem key={type} value={type}>{type.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></div><div><Label>Approved source</Label><Select value={claimForm.sourceId} onValueChange={value => setClaimForm(current => ({ ...current, sourceId: value }))}><SelectTrigger className="mt-1 border-white/10 bg-white/5"><SelectValue placeholder="Select evidence" /></SelectTrigger><SelectContent>{activeSourceOptions.map(source => <SelectItem key={source.id} value={String(source.id)}>{source.title}</SelectItem>)}</SelectContent></Select></div><div><Label>Risk level</Label><Select value={claimForm.riskLevel} onValueChange={value => setClaimForm(current => ({ ...current, riskLevel: value }))}><SelectTrigger className="mt-1 border-white/10 bg-white/5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></div></div>{activeSourceOptions.length === 0 && <p className="mt-3 text-sm text-amber-200">There is no approved tracked source for this programme. Submit or approve an official source before proposing a claim.</p>}<div className="mt-3"><Label>Proposed wording</Label><Textarea value={claimForm.claimText} onChange={event => setClaimForm(current => ({ ...current, claimText: event.target.value }))} className="mt-1 min-h-28 border-white/10 bg-white/5 text-white" placeholder="Use factual, qualified wording. Never state that an approval, outcome, fee, processing timeline or eligibility is guaranteed." /></div><Button disabled={proposeClaim.isPending || !claimForm.sourceId || claimForm.claimText.trim().length < 12} onClick={submitClaim} className="mt-3 bg-[#5BA3B8] text-slate-950 hover:bg-[#82c8d9]">Propose claim for review</Button></div>}
      {claims.length === 0 ? <div className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-slate-400">No claims have been proposed. Sources can be reviewed without creating public or client-facing content.</div> : <div className="space-y-3">{claims.map(claim => <div key={claim.id} className="rounded-2xl border border-white/10 bg-[#0c1320] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-[#8ad5e7]">{claim.programKey.replaceAll("_", " ")} · {claim.claimType.replaceAll("_", " ")} · {claim.riskLevel} risk</p><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-200">{claim.claimText}</p></div><StatusBadge status={claim.status} /></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400"><a href={claim.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#8ad5e7] hover:text-white">{claim.sourceTitle}<ExternalLink className="h-3.5 w-3.5" /></a><span>Evidence {claim.sourceSnapshotHash.slice(0, 12)}…</span><span>Updated {formatDate(claim.updatedAt)}</span></div>{claim.reviewerNote && <p className="mt-3 rounded-lg bg-white/5 p-3 text-sm text-slate-300">Review: {claim.reviewerNote}</p>}{canReviewClaims && claim.status !== "approved" && claim.status !== "rejected" && <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row"><Input value={reviewNotes[claim.id] ?? ""} onChange={event => setReviewNotes(current => ({ ...current, [claim.id]: event.target.value }))} placeholder="Owner review note (required)" className="border-white/10 bg-white/5 text-white placeholder:text-slate-600" /><Button size="sm" disabled={(reviewNotes[claim.id] ?? "").trim().length < 4 || reviewClaim.isPending} onClick={() => reviewClaim.mutate({ claimId: claim.id, decision: "approved", reviewerNote: reviewNotes[claim.id] ?? "" })} className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200"><CheckCircle2 className="mr-1.5 h-4 w-4" />Approve</Button><Button size="sm" variant="outline" disabled={(reviewNotes[claim.id] ?? "").trim().length < 4 || reviewClaim.isPending} onClick={() => reviewClaim.mutate({ claimId: claim.id, decision: "needs_review", reviewerNote: reviewNotes[claim.id] ?? "" })} className="border-amber-400/30 bg-transparent text-amber-100 hover:bg-amber-400/10 hover:text-white"><CircleAlert className="mr-1.5 h-4 w-4" />Hold</Button><Button size="sm" variant="outline" disabled={(reviewNotes[claim.id] ?? "").trim().length < 4 || reviewClaim.isPending} onClick={() => reviewClaim.mutate({ claimId: claim.id, decision: "rejected", reviewerNote: reviewNotes[claim.id] ?? "" })} className="border-rose-400/30 bg-transparent text-rose-200 hover:bg-rose-400/10 hover:text-white"><XCircle className="mr-1.5 h-4 w-4" />Reject</Button></div>}</div>)}</div>}</CardContent></Card>
    <div className="flex justify-end"><Button variant="ghost" onClick={() => navigate("/marketing")} className="text-slate-400 hover:bg-white/5 hover:text-white">Back to Marketing module</Button></div>
  </div></div>;
}
