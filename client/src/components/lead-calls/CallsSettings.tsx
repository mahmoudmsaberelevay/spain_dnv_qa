import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Phone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { safeCallError } from "./callUi";

const INITIAL_POLICY = { policyVersion: "", enabled: false, callingApproved: false, processingApproved: false, mediaProtectionConfirmed: false, recordingNoticeAr: "", recordingNoticeEn: "", retentionDays: 90 };
type AgentSetting = { userId: number; name: string | null; canCall: boolean; canListen: boolean; callerId: string | null; maxCallsPerHour: number };
function Approval({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) {
  return <label className="flex cursor-pointer items-start gap-2 text-sm leading-relaxed"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-primary" />{children}</label>;
}
function AgentRow({ agent, callerIds }: { agent: AgentSetting; callerIds: string[] }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState(agent);
  useEffect(() => setForm(agent), [agent]);
  const save = trpc.calls.setAgentSettings.useMutation({ onSuccess: () => { void utils.calls.agentSettings.invalidate(); void utils.calls.readiness.invalidate(); toast.success("Calling grant saved"); }, onError: error => toast.error(safeCallError(error)) });
  return <div className="space-y-3 rounded-xl border border-border p-3">
    <p className="text-sm font-semibold" dir="auto">{agent.name || `User #${agent.userId}`}</p>
    <div className="flex flex-wrap gap-4"><Approval checked={form.canCall} onChange={canCall => setForm({ ...form, canCall })}>Allow outbound calls</Approval><Approval checked={form.canListen} onChange={canListen => setForm({ ...form, canListen })}>Allow recording, transcript & summary access</Approval></div>
    <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
      <div className="space-y-1"><Label className="text-xs">Approved caller ID</Label><Select value={form.callerId ?? "default"} onValueChange={value => setForm({ ...form, callerId: value === "default" ? null : value })}><SelectTrigger aria-label={`Caller ID for ${agent.name || agent.userId}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">Server default</SelectItem>{callerIds.map(callerId => <SelectItem key={callerId} value={callerId}>{callerId}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label className="text-xs" htmlFor={`calls-limit-${agent.userId}`}>Calls / hour</Label><Input id={`calls-limit-${agent.userId}`} type="number" min={1} max={60} value={form.maxCallsPerHour} onChange={event => setForm({ ...form, maxCallsPerHour: Number(event.target.value) })} /></div>
      <Button type="button" variant="outline" size="sm" disabled={save.isPending || !Number.isInteger(form.maxCallsPerHour) || form.maxCallsPerHour < 1 || form.maxCallsPerHour > 60} onClick={() => save.mutate({ userId: form.userId, canCall: form.canCall, canListen: form.canListen, callerId: form.callerId, maxCallsPerHour: form.maxCallsPerHour })}>Save grant</Button>
    </div>
  </div>;
}

export function CallsSettings() {
  const utils = trpc.useUtils();
  const readiness = trpc.calls.readiness.useQuery(undefined, { retry: false });
  const owner = readiness.data?.canManage === true;
  const agents = trpc.calls.agentSettings.useQuery(undefined, { retry: false });
  const policy = trpc.calls.policy.useQuery(undefined, { enabled: owner, retry: false });
  const recovery = trpc.callRecovery.status.useQuery(undefined, { enabled: owner, retry: false });
  const [form, setForm] = useState(INITIAL_POLICY);
  const [confirmed, setConfirmed] = useState(false);
  const [recoveryApproved, setRecoveryApproved] = useState(false);
  useEffect(() => {
    if (!policy.data) return;
    const data = policy.data;
    setForm({ policyVersion: data.policyVersion ?? "", enabled: data.enabled, callingApproved: data.callingApproved, processingApproved: data.processingApproved, mediaProtectionConfirmed: data.mediaProtectionConfirmed, recordingNoticeAr: data.recordingNoticeAr ?? "", recordingNoticeEn: data.recordingNoticeEn ?? "", retentionDays: data.retentionDays });
    setConfirmed(false);
  }, [policy.data]);
  const confirmPolicy = trpc.calls.confirmPolicy.useMutation({
    onSuccess: () => { void utils.calls.policy.invalidate(); void utils.calls.readiness.invalidate(); void utils.callRecovery.status.invalidate(); setConfirmed(false); toast.success("Calling policy saved. Server environment gates still apply."); },
    onError: error => toast.error(safeCallError(error)),
  });
  const enableRecovery = trpc.callRecovery.enable.useMutation({ onSuccess: () => { void utils.callRecovery.status.invalidate(); void utils.calls.readiness.invalidate(); setRecoveryApproved(false); toast.success("Automatic transcription recovery enabled"); }, onError: error => toast.error(safeCallError(error)) });
  const pauseRecovery = trpc.callRecovery.pause.useMutation({ onSuccess: () => { void utils.callRecovery.status.invalidate(); void utils.calls.readiness.invalidate(); toast.success("Automatic transcription recovery paused"); }, onError: error => toast.error(safeCallError(error)) });
  const valid = form.policyVersion.trim().length > 0 && form.recordingNoticeAr.trim().length >= 10 && form.recordingNoticeEn.trim().length >= 10 && Number.isInteger(form.retentionDays) && form.retentionDays >= 1 && form.retentionDays <= 365;
  return <div className="space-y-5">
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Phone className="h-4 w-4 text-primary" />Calling readiness<Badge variant={readiness.data?.ready ? "default" : "secondary"}>{readiness.data?.ready ? "Ready" : "Setup required"}</Badge></CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      <p>Configure Twilio and transcription credentials through the secure server environment first. This page never requests or displays secrets. Calling remains disabled unless environment gates, owner approval and agent grants all permit it.</p>
      {readiness.isLoading && <p className="text-muted-foreground">Checking calling readiness…</p>}
      {readiness.error && <p role="alert" className="text-destructive">Calling readiness could not be checked. Review your login, database migration and access.</p>}
      {!!readiness.data?.reasons.length && <ul className="list-inside list-disc space-y-1 rounded-xl bg-muted/30 p-3 text-xs text-muted-foreground">{readiness.data.reasons.map(reason => <li key={reason}>{reason.replaceAll("_", " ")}</li>)}</ul>}
      <p className="flex items-start gap-2 text-xs text-muted-foreground"><AlertCircle className="h-4 w-4 shrink-0" />Policy and grant changes are accepted only from the pinned production HTTPS origin. Missing secure environment configuration must be resolved before saving.</p>
    </CardContent></Card>
    {owner && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />Owner recording & spending policy</CardTitle></CardHeader><CardContent className="space-y-4">
      {policy.error && <p role="alert" className="text-xs text-destructive">Policy unavailable. Apply the calling migration and verify owner access before saving.</p>}
      <div className="space-y-1.5"><Label htmlFor="call-policy-version">Reviewed policy version</Label><Input id="call-policy-version" maxLength={100} value={form.policyVersion} onChange={event => setForm({ ...form, policyVersion: event.target.value })} placeholder="Your reviewed legal policy version" /></div>
      <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="call-notice-ar">Approved Arabic recording notice</Label><Textarea id="call-notice-ar" dir="auto" rows={4} maxLength={2000} value={form.recordingNoticeAr} onChange={event => setForm({ ...form, recordingNoticeAr: event.target.value })} placeholder="Enter the legally reviewed Arabic customer notice" /></div><div className="space-y-1.5"><Label htmlFor="call-notice-en">Approved English recording notice</Label><Textarea id="call-notice-en" dir="auto" rows={4} maxLength={2000} value={form.recordingNoticeEn} onChange={event => setForm({ ...form, recordingNoticeEn: event.target.value })} placeholder="Enter the legally reviewed English customer notice" /></div></div>
      <div className="max-w-48 space-y-1.5"><Label htmlFor="call-retention">Retention (days)</Label><Input id="call-retention" type="number" min={1} max={365} value={form.retentionDays} onChange={event => setForm({ ...form, retentionDays: Number(event.target.value) })} /></div>
      <div className="space-y-3 rounded-xl border border-border p-3">
        <Approval checked={form.enabled} onChange={enabled => setForm({ ...form, enabled })}>Enable the CRM calling feature (does not override server gates)</Approval>
        <Approval checked={form.callingApproved} onChange={callingApproved => setForm({ ...form, callingApproved })}>Approve paid outbound calling under this policy</Approval>
        <Approval checked={form.processingApproved} onChange={processingApproved => setForm({ ...form, processingApproved })}>Separately approve paid transcription and AI summarization of consented recordings</Approval>
        <Approval checked={form.mediaProtectionConfirmed} onChange={mediaProtectionConfirmed => setForm({ ...form, mediaProtectionConfirmed })}>Confirm provider recording protection, retention and deletion controls have been configured and reviewed</Approval>
      </div>
      <Approval checked={confirmed} onChange={setConfirmed}>I am the authorized owner and have reviewed the legal notices, required customer consent, data protection and spending approvals above.</Approval>
      <Button type="button" disabled={!valid || !confirmed || policy.isLoading || !!policy.error || confirmPolicy.isPending} onClick={() => confirmPolicy.mutate({ ...form, confirmed })}>Save reviewed policy</Button>
      <p className="text-xs text-muted-foreground">Customer consent is collected by the signed server calling flow before recording. Saving this policy does not place a call, activate a provider subscription, or enable automatic recovery.</p>
    </CardContent></Card>}
    <Card><CardHeader><CardTitle className="text-base">Agent calling permissions</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="text-xs text-muted-foreground">New agents have no calling or recording access by default. Only IDs approved in the server allowlist can be selected. An existing mobile number is not automatically an approved caller ID.</p>
      {agents.isLoading && <p className="text-sm text-muted-foreground">Loading agent settings…</p>}
      {agents.error && <p className="text-xs text-muted-foreground">Agent grants are unavailable. Administrator access and the calling migration are required.</p>}
      {!agents.error && agents.data?.map(agent => <AgentRow key={agent.userId} agent={agent} callerIds={readiness.data?.approvedCallerIds ?? []} />)}
    </CardContent></Card>
    {owner && <Card><CardHeader><CardTitle className="text-base">Automatic transcription recovery</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      <p>Recovery checks eligible consented recordings in the background every {recovery.data?.cadenceSeconds ?? 60} seconds. It is a separate opt-in and may incur approved transcription and AI usage. No recovery is enabled by opening this page.</p>
      <Badge variant="secondary">{recovery.data?.enabled ? "Enabled" : "Paused / not enabled"}</Badge>
      {recovery.error && <p role="alert" className="text-xs text-destructive">Recovery status unavailable. Configure the server and verify owner access.</p>}
      {!recovery.data?.enabled ? <><Approval checked={recoveryApproved} onChange={setRecoveryApproved}>I explicitly approve unattended recovery using the configured paid transcription and AI providers.</Approval><Button type="button" size="sm" disabled={!recoveryApproved || !readiness.data?.processingEnabled || !policy.data?.processingApproved || recovery.isLoading || !!recovery.error || enableRecovery.isPending} onClick={() => enableRecovery.mutate({ approveRecovery: true })}>Enable automatic transcription recovery</Button></>
        : <Button type="button" variant="outline" size="sm" disabled={pauseRecovery.isPending} onClick={() => pauseRecovery.mutate()}>Pause automatic recovery</Button>}
      <p className="text-xs text-muted-foreground">Requires secure provider configuration and a separately saved processing approval. Environment master flags remain authoritative.</p>
    </CardContent></Card>}
  </div>;
}
