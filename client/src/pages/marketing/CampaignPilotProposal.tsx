import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, BadgeCheck, CircleStop, FileLock2, LockKeyhole, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const PROGRAMS = [
  { key: "spain_dnv" as const, label: "Spain Digital Nomad Residency" },
  { key: "malta_mprp" as const, label: "Malta Permanent Residence Programme" },
];
const PERMISSIONS = ["ads_read", "ads_management", "business_management", "leads_retrieval", "pages_read_engagement"] as const;

type Proposal = { id: number; version: number; status: string; title: string; proposalHash: string; strategyPacketId: number; ownerNote: string | null; budgetPlan: { monthlyMediaCapEgp?: number; dailyMediaCapEgp?: number; campaignCapEgp?: number }; requestedPermissions: string[]; programKeys: string[] };
type ApprovedPacket = { id: number; version: number; packetHash: string; approvedAt: number | null };

const initialForm = {
  title: "",
  programKeys: ["spain_dnv"] as string[],
  requestedPermissions: ["ads_read"] as string[],
  monthlyMediaCapEgp: "",
  dailyMediaCapEgp: "",
  campaignCapEgp: "",
  primaryMetric: "Cost per qualified consultation",
  attributionWindow: "Defined after a future approved Meta measurement configuration",
  requiredEvidence: "Verified CRM funnel definitions, approved program facts, consent review, measurement baseline and documented attribution reconciliation.",
  successCriteria: "A measurable, reconciled pilot result within the approved ceiling; no result is treated as proof without adequate sample size and attribution delay.",
  missingDataLockout: "Pause any future operating decision when attribution, consent, delivery receipt, reconciliation or source evidence is missing or stale.",
  cadence: "daily" as "daily" | "business_days",
  monitoringOwner: "Mahmoud Saber",
  alerts: "Escalate any cap breach, stale data, rejected delivery, attribution gap, privacy concern, factual issue or rollback trigger immediately.",
  stopConditions: "Immediately stop any future pilot upon cap breach, data-quality failure, permission issue, factual/compliance concern, missed reconciliation, or explicit owner stop.",
  rollbackOwner: "Mahmoud Saber",
  rollbackSteps: "Pause future operating changes, preserve the decision evidence, reconcile measured results, document the reason, and require a fresh owner-reviewed proposal before any retry.",
};

function statusClass(status: string) {
  if (status === "internally_approved") return "bg-emerald-500/20 text-emerald-100";
  if (status === "stopped" || status === "rejected") return "bg-rose-500/20 text-rose-100";
  if (status === "changes_requested") return "bg-blue-500/20 text-blue-100";
  return "bg-amber-500/20 text-amber-100";
}

export default function CampaignPilotProposal() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: access, isLoading: accessLoading } = trpc.marketingSystem.access.useQuery();
  const isOwner = ["owner", "marketing_system_admin"].includes(access?.role ?? "");
  const { data, isLoading } = trpc.marketingSystem.getCampaignPilotProposalWorkspace.useQuery(undefined, { enabled: isOwner });
  const [form, setForm] = useState(initialForm);
  const [decisionNotes, setDecisionNotes] = useState<Record<number, string>>({});
  const propose = trpc.marketingSystem.proposeCampaignPilot.useMutation({
    onSuccess: () => { utils.marketingSystem.getCampaignPilotProposalWorkspace.invalidate(); setForm(initialForm); toast.success("Internal Campaign Pilot Proposal recorded. Meta, campaigns, and spend remain locked."); },
    onError: error => toast.error(error.message),
  });
  const decide = trpc.marketingSystem.decideCampaignPilot.useMutation({
    onSuccess: () => { utils.marketingSystem.getCampaignPilotProposalWorkspace.invalidate(); toast.success("Internal proposal decision saved. No external action has occurred."); },
    onError: error => toast.error(error.message),
  });
  const selectedPacket = useMemo(() => data?.approvedPackets?.[0] as ApprovedPacket | undefined, [data]);
  const update = <K extends keyof typeof form>(key: K, value: typeof form[K]) => setForm(current => ({ ...current, [key]: value }));
  const toggleList = (field: "programKeys" | "requestedPermissions", value: string) => setForm(current => {
    const existing = current[field];
    const next = existing.includes(value) ? existing.filter(item => item !== value) : [...existing, value];
    return { ...current, [field]: next };
  });
  const submit = () => {
    if (!selectedPacket) return toast.error("An approved Strategy Approval Packet is required before a pilot proposal can be created.");
    propose.mutate({
      strategyPacketId: selectedPacket.id,
      title: form.title,
      programKeys: form.programKeys as ("spain_dnv" | "malta_mprp")[],
      requestedPermissions: form.requestedPermissions,
      budgetPlan: { monthlyMediaCapEgp: Number(form.monthlyMediaCapEgp), dailyMediaCapEgp: Number(form.dailyMediaCapEgp), campaignCapEgp: Number(form.campaignCapEgp) },
      measurementPlan: { primaryMetric: form.primaryMetric, attributionWindow: form.attributionWindow, requiredEvidence: form.requiredEvidence, successCriteria: form.successCriteria, missingDataLockout: form.missingDataLockout },
      monitoringPlan: { cadence: form.cadence, owner: form.monitoringOwner, alerts: form.alerts },
      rollbackPlan: { stopConditions: form.stopConditions, rollbackOwner: form.rollbackOwner, rollbackSteps: form.rollbackSteps },
    });
  };

  if (accessLoading || (isOwner && isLoading)) return <div className="flex min-h-[65vh] items-center justify-center text-slate-400">Loading controlled pilot proposals…</div>;
  if (!isOwner) return <div className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-6 text-center"><LockKeyhole className="mb-4 h-12 w-12 text-amber-300" /><h1 className="text-2xl font-bold text-white">Campaign Pilot Proposals are administrator-controlled</h1><p className="mt-3 text-sm leading-6 text-slate-400">Mahmoud or a scoped Agentic Marketing administrator can create, decide or stop an internal Campaign Pilot Proposal.</p></div>;

  return <div className="min-h-full bg-[#0c1320] px-4 py-6 text-white md:px-8"><div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-3xl border border-[#C9A84C]/25 bg-[radial-gradient(circle_at_90%_0%,rgba(201,168,76,.18),transparent_40%),linear-gradient(115deg,#182337,#0d1524)] p-6 md:p-8"><div className="flex flex-wrap items-end justify-between gap-5"><div><div className="mb-3 flex items-center gap-2 text-[#EBD990]"><FileLock2 className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[.16em]">Phase 5b · proposal only</span></div><h1 className="text-3xl font-semibold tracking-tight">Campaign Pilot Proposal</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Document the exact permissions, maximum proposed caps, measurement, monitoring and rollback for a possible future pilot. An internal approval here does not connect Meta, grant permissions, create campaigns, reserve budget, or spend money.</p></div><Badge variant="outline" className="w-fit border-amber-300/30 bg-amber-300/10 text-amber-100">External operations locked</Badge></div></section>

    <div className="grid gap-4 md:grid-cols-3"><Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader className="pb-3"><CardDescription className="text-slate-400">Strategy prerequisite</CardDescription><CardTitle className="text-lg">{selectedPacket ? `Approved packet v${selectedPacket.version}` : "Blocking"}</CardTitle></CardHeader></Card><Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader className="pb-3"><CardDescription className="text-slate-400">Monthly proposal ceiling</CardDescription><CardTitle className="text-lg">EGP {(data?.policy.maximumMonthlyMediaCapEgp ?? 200000).toLocaleString("en-US")}</CardTitle></CardHeader></Card><Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader className="pb-3"><CardDescription className="text-slate-400">Actual external actions</CardDescription><CardTitle className="text-lg text-emerald-200">0 enabled</CardTitle></CardHeader></Card></div>

    {!selectedPacket ? <Card className="border-amber-400/25 bg-amber-400/10 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-200" />Proposal blocked</CardTitle><CardDescription className="text-amber-100">Complete the Strategy Intake, program confirmations, and explicit Strategy Approval Packet decision first.</CardDescription></CardHeader><CardContent><Button onClick={() => navigate("/marketing/meta-ads-strategy-packet")} className="bg-[#C9A84C] text-[#1A3A5C] hover:bg-[#EBD990]">Open Strategy Approval Packet</Button></CardContent></Card> : <>
      <Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader><CardTitle>Create an internal pilot proposal</CardTitle><CardDescription className="text-slate-400">Every field becomes an immutable review snapshot. Use figures only as a proposed maximum; this form never reserves or transfers funds.</CardDescription></CardHeader><CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="pilot-title">Proposal title</Label><Input id="pilot-title" value={form.title} onChange={event => update("title", event.target.value)} placeholder="Example: Spain DNV and Malta MPRP measurement pilot" className="border-white/10 bg-[#0c1320] text-white" /></div><div className="space-y-2"><Label>Linked approved Strategy Packet</Label><div className="rounded-md border border-white/10 bg-[#0c1320] px-3 py-2 text-sm text-slate-300">v{selectedPacket.version} · {selectedPacket.packetHash.slice(0, 16)}…</div></div></div>
        <div className="grid gap-5 md:grid-cols-2"><div><Label>Programs in scope</Label><div className="mt-3 space-y-3">{PROGRAMS.map(program => <label key={program.key} className="flex cursor-pointer items-center gap-3 text-sm text-slate-200"><Checkbox checked={form.programKeys.includes(program.key)} onCheckedChange={() => toggleList("programKeys", program.key)} /><span>{program.label}</span></label>)}</div></div><div><Label>Proposed permission inventory</Label><p className="mt-1 text-xs text-slate-500">These labels are for review only. Their current external requirements must be verified separately before any future connection.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{PERMISSIONS.map(permission => <label key={permission} className="flex cursor-pointer items-center gap-3 text-sm text-slate-200"><Checkbox checked={form.requestedPermissions.includes(permission)} onCheckedChange={() => toggleList("requestedPermissions", permission)} /><span className="font-mono text-xs">{permission}</span></label>)}</div></div></div>
        <div><Label>Proposed caps in EGP</Label><div className="mt-3 grid gap-3 md:grid-cols-3">{([['monthlyMediaCapEgp','Monthly cap'], ['dailyMediaCapEgp','Daily cap'], ['campaignCapEgp','Per-campaign cap']] as const).map(([key,label]) => <div key={key} className="space-y-2"><Label htmlFor={key}>{label}</Label><Input id={key} type="number" min="1" max={data?.policy.maximumMonthlyMediaCapEgp ?? 200000} value={form[key]} onChange={event => update(key, event.target.value)} className="border-white/10 bg-[#0c1320] text-white" /></div>)}</div></div>
        <div className="grid gap-5 md:grid-cols-2"><div className="space-y-4"><div className="space-y-2"><Label>Primary metric</Label><Input value={form.primaryMetric} onChange={event => update("primaryMetric", event.target.value)} className="border-white/10 bg-[#0c1320] text-white" /></div><div className="space-y-2"><Label>Attribution window</Label><Textarea value={form.attributionWindow} onChange={event => update("attributionWindow", event.target.value)} className="min-h-20 border-white/10 bg-[#0c1320] text-white" /></div><div className="space-y-2"><Label>Required evidence</Label><Textarea value={form.requiredEvidence} onChange={event => update("requiredEvidence", event.target.value)} className="min-h-28 border-white/10 bg-[#0c1320] text-white" /></div><div className="space-y-2"><Label>Success criteria</Label><Textarea value={form.successCriteria} onChange={event => update("successCriteria", event.target.value)} className="min-h-28 border-white/10 bg-[#0c1320] text-white" /></div><div className="space-y-2"><Label>Missing-data lockout</Label><Textarea value={form.missingDataLockout} onChange={event => update("missingDataLockout", event.target.value)} className="min-h-28 border-white/10 bg-[#0c1320] text-white" /></div></div><div className="space-y-4"><div className="space-y-2"><Label>Monitoring cadence</Label><select value={form.cadence} onChange={event => update("cadence", event.target.value as "daily" | "business_days")} className="flex h-10 w-full rounded-md border border-white/10 bg-[#0c1320] px-3 text-sm text-white"><option value="daily">Daily</option><option value="business_days">Business days</option></select></div><div className="space-y-2"><Label>Monitoring owner</Label><Input value={form.monitoringOwner} onChange={event => update("monitoringOwner", event.target.value)} className="border-white/10 bg-[#0c1320] text-white" /></div><div className="space-y-2"><Label>Alert conditions</Label><Textarea value={form.alerts} onChange={event => update("alerts", event.target.value)} className="min-h-32 border-white/10 bg-[#0c1320] text-white" /></div><div className="space-y-2"><Label>Stop conditions</Label><Textarea value={form.stopConditions} onChange={event => update("stopConditions", event.target.value)} className="min-h-28 border-white/10 bg-[#0c1320] text-white" /></div><div className="space-y-2"><Label>Rollback owner</Label><Input value={form.rollbackOwner} onChange={event => update("rollbackOwner", event.target.value)} className="border-white/10 bg-[#0c1320] text-white" /></div><div className="space-y-2"><Label>Rollback steps</Label><Textarea value={form.rollbackSteps} onChange={event => update("rollbackSteps", event.target.value)} className="min-h-32 border-white/10 bg-[#0c1320] text-white" /></div></div></div>
        <div className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>Still internal-only.</strong> Creating or approving this proposal does not authorize a Meta sign-in, permission grant, campaign, ad set, ad, audience, CAPI event, payment, budget reservation, publication, message, or provider request.</p></div>
        <Button onClick={submit} disabled={propose.isPending} className="bg-[#C9A84C] text-[#1A3A5C] hover:bg-[#EBD990]">Create hash-locked internal proposal</Button>
      </CardContent></Card>
    </>}

    <Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader><CardTitle>Proposal decision history</CardTitle><CardDescription className="text-slate-400">All decisions remain inside ELEVAY. No status allows external campaign or spend activity.</CardDescription></CardHeader><CardContent className="space-y-4">{(data?.proposals as Proposal[] | undefined)?.length ? (data?.proposals as Proposal[]).map(proposal => <div key={proposal.id} className="rounded-xl border border-white/10 bg-[#0c1320] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">v{proposal.version} · {proposal.title}</p><p className="mt-1 font-mono text-xs text-slate-500">{proposal.proposalHash.slice(0, 16)}…</p></div><Badge className={statusClass(proposal.status)}>{proposal.status.replaceAll("_", " ")}</Badge></div><div className="mt-4 grid gap-3 text-xs text-slate-400 md:grid-cols-3"><p><strong className="text-slate-200">Programs:</strong> {proposal.programKeys.join(", ")}</p><p><strong className="text-slate-200">Monthly cap:</strong> EGP {Number(proposal.budgetPlan.monthlyMediaCapEgp ?? 0).toLocaleString("en-US")}</p><p><strong className="text-slate-200">Permission labels:</strong> {proposal.requestedPermissions.join(", ")}</p></div>{proposal.status === "proposed" && <div className="mt-4 space-y-3"><Textarea value={decisionNotes[proposal.id] ?? ""} onChange={event => setDecisionNotes(notes => ({ ...notes, [proposal.id]: event.target.value }))} placeholder="Required owner decision note. This remains an internal planning decision only." className="min-h-24 border-white/10 bg-[#111b2c] text-white" /><div className="flex flex-wrap gap-2"><Button onClick={() => decide.mutate({ proposalId: proposal.id, nextStatus: "internally_approved", ownerNote: decisionNotes[proposal.id] ?? "" })} disabled={(decisionNotes[proposal.id] ?? "").trim().length < 8 || decide.isPending} className="bg-emerald-500 text-white hover:bg-emerald-400"><BadgeCheck className="mr-2 h-4 w-4" />Approve internally only</Button><Button variant="outline" onClick={() => decide.mutate({ proposalId: proposal.id, nextStatus: "changes_requested", ownerNote: decisionNotes[proposal.id] ?? "" })} disabled={(decisionNotes[proposal.id] ?? "").trim().length < 8 || decide.isPending} className="border-white/15 bg-transparent text-white hover:bg-white/5">Request changes</Button><Button variant="outline" onClick={() => decide.mutate({ proposalId: proposal.id, nextStatus: "rejected", ownerNote: decisionNotes[proposal.id] ?? "" })} disabled={(decisionNotes[proposal.id] ?? "").trim().length < 8 || decide.isPending} className="border-rose-400/30 bg-transparent text-rose-100 hover:bg-rose-400/10">Reject</Button></div></div>}{proposal.status === "internally_approved" && <div className="mt-4 space-y-3"><p className="text-xs leading-5 text-amber-100">Internal approval does not activate any external capability. An independently reviewed go-live checklist and explicit external confirmation would still be required.</p><Textarea value={decisionNotes[proposal.id] ?? ""} onChange={event => setDecisionNotes(notes => ({ ...notes, [proposal.id]: event.target.value }))} placeholder="Reason for immediate stop" className="min-h-20 border-white/10 bg-[#111b2c] text-white" /><Button variant="outline" onClick={() => decide.mutate({ proposalId: proposal.id, nextStatus: "stopped", ownerNote: decisionNotes[proposal.id] ?? "" })} disabled={(decisionNotes[proposal.id] ?? "").trim().length < 8 || decide.isPending} className="border-rose-400/30 bg-transparent text-rose-100 hover:bg-rose-400/10"><CircleStop className="mr-2 h-4 w-4" />Stop proposal</Button></div>}{proposal.ownerNote && <p className="mt-4 rounded-lg bg-white/5 p-3 text-sm text-slate-300"><strong>Owner record:</strong> {proposal.ownerNote}</p>}</div>) : <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-slate-400">No Campaign Pilot Proposal exists. All Meta operations remain locked.</p>}</CardContent></Card>
    <Button variant="ghost" onClick={() => navigate("/marketing/meta-ads-strategy-packet")} className="text-slate-400 hover:bg-white/5 hover:text-white"><ArrowLeft className="mr-2 h-4 w-4" />Back to Strategy Approval Packet</Button>
  </div></div>;
}
