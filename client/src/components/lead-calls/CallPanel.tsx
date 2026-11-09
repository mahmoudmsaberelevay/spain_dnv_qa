import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Loader2, Mic, MicOff, Phone, PhoneOff, ShieldCheck, X } from "lucide-react";
import type { CallSessionState } from "./CallSession";
import { callStatusLabel, formatCallDuration, isTerminalCallStatus } from "./callUi";

export type CallPanelProps = {
  state: CallSessionState; locked: boolean; agentName: string; consentStatus?: string | null;
  initialize: () => void; start: () => void; end: () => void; mute: () => void; close: () => void;
};

export function CallPanel({ state, locked, agentName, consentStatus, initialize, start, end, mute, close }: CallPanelProps) {
  const [disclosureAck, setDisclosureAck] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { setDisclosureAck(false); }, [state.lead?.id]);
  useEffect(() => {
    if (state.status !== "in_progress" || !state.answeredAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state.status, state.answeredAt]);
  if (!state.lead) return null;
  const finished = isTerminalCallStatus(state.status);
  const reviewing = state.status === "review" || (finished && state.callId == null);
  const seconds = state.answeredAt ? ((state.endedAt ?? now) - state.answeredAt) / 1000 : 0;
  return (
    <aside
      role="region" aria-label="Lead calling panel"
      className="elevay-floating-surface fixed z-40 left-3 right-3 bottom-[calc(env(safe-area-inset-bottom)+5rem)] sm:left-auto sm:right-6 sm:bottom-6 sm:w-96 max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-2xl border p-4 text-foreground backdrop-blur-xl"
      data-testid="lead-call-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="rounded-full bg-primary/10 p-2.5 text-primary"><Phone className="h-4 w-4" aria-hidden="true" /></div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">ELEVAY · Outbound call</p>
            <Link href={`/leads/${state.lead.id}`} className="block break-words text-sm font-semibold hover:text-primary" dir="auto">{state.lead.fullName}</Link>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={close} disabled={locked} aria-label="Close calling panel" title={locked ? "End the call before closing" : "Close calling panel"}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="break-all text-sm font-medium" dir="ltr">{state.destination}</span>
        <Badge variant={state.status === "failed" ? "destructive" : "secondary"} aria-live="polite">{callStatusLabel(state.status)}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground" dir="auto">Agent: {state.agentName || agentName || "Signed-in agent"}</p>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs">
          {state.microphone === "blocked" ? <MicOff className="h-3.5 w-3.5 text-destructive" /> : state.microphone === "allowed" ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Mic className="h-3.5 w-3.5 text-muted-foreground" />}
          Microphone: {state.microphone === "unchecked" ? "not checked" : state.microphone}
        </span>
        <span className="font-mono text-sm tabular-nums" aria-label="Call duration">{formatCallDuration(seconds)}</span>
      </div>
      {reviewing && (
        <div className="mt-3 space-y-3 text-xs">
          <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>This uses an approved paid calling service. The customer hears the approved recording notice and must press 1 before recording. Only consented audio may be transcribed or summarized; no agent action substitutes for customer consent.</p>
          </div>
          <label className="flex cursor-pointer items-start gap-2 leading-relaxed">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={disclosureAck} onChange={event => setDisclosureAck(event.target.checked)} />
            I have reviewed the calling and recording disclosure and am authorized to contact this lead.
          </label>
          <Button type="button" size="sm" className="w-full gap-2" disabled={!disclosureAck || locked} onClick={initialize}><Mic className="h-4 w-4" /> Check microphone & prepare</Button>
        </div>
      )}
      {state.status === "initializing" && <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Checking microphone and preparing a secure session…</p>}
      {state.message && <p className={`mt-3 flex items-start gap-2 text-xs leading-relaxed ${state.status === "failed" ? "text-destructive" : "text-muted-foreground"}`} role={state.status === "failed" ? "alert" : "status"}><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{state.message}</p>}
      {state.status === "ready" && <Button type="button" className="mt-3 w-full gap-2" onClick={start}><Phone className="h-4 w-4" /> Start call</Button>}
      {locked && (
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="outline" size="sm" className="flex-1 gap-1.5" disabled={state.status !== "in_progress"} onClick={mute} aria-pressed={state.muted}>
            {state.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}{state.muted ? "Unmute" : "Mute"}
          </Button>
          <Button type="button" variant="destructive" size="sm" className="flex-1 gap-1.5" onClick={end}><PhoneOff className="h-4 w-4" />{state.status === "ready" || state.status === "initializing" ? "Cancel" : "End call"}</Button>
        </div>
      )}
      {state.status === "in_progress" && <p className="mt-2 text-xs text-muted-foreground">Recording consent: {consentStatus === "accepted" ? "customer accepted" : consentStatus === "declined" ? "declined — not recorded" : "awaiting server confirmation"}</p>}
      <p className="mt-3 text-[11px] text-muted-foreground">You can navigate the CRM during a call. Closing this tab or signing out ends your browser connection.</p>
    </aside>
  );
}
