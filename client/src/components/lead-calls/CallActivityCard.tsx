import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, ChevronDown, ChevronRight, Clock, PhoneCall, ShieldCheck } from "lucide-react";
import type { LeadCallDto, LeadCallSummary } from "@shared/leadCalls";
import { callStatusLabel, formatCallDuration, protectedRecordingPath, transcriptSpeakerLabel } from "./callUi";

const SUMMARY_FIELDS: [keyof LeadCallSummary, string][] = [
  ["mainReason", "Main reason"], ["customerInterests", "Customer interests"], ["requirements", "Requirements"],
  ["servicesDiscussed", "Services discussed"], ["pricingQuestions", "Pricing questions"], ["objections", "Objections"],
  ["sentiment", "Customer sentiment"], ["commitments", "Commitments"], ["followUpActions", "Follow-up actions"],
  ["suggestedFollowUpDate", "Suggested follow-up date"], ["outcome", "Outcome"],
];
function Summary({ summary }: { summary: LeadCallSummary }) {
  return <dl className="space-y-2" dir="auto">{SUMMARY_FIELDS.map(([key, label]) => {
    const value = summary[key];
    if (!value || (Array.isArray(value) && !value.length)) return null;
    if (typeof value !== "string" && !Array.isArray(value)) return null;
    return <div key={key}><dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words text-sm" dir="auto">{Array.isArray(value) ? value.filter(item => typeof item === "string").join("\n") : value}</dd></div>;
  })}</dl>;
}
function processingLabel(status: string, label: string) {
  if (status === "queued" || status === "processing") return `${label} in progress`;
  if (status === "failed") return `${label} unavailable — processing failed`;
  if (status === "disabled") return `${label} disabled by calling policy`;
  if (status === "completed") return `${label} complete`;
  return `${label} not requested`;
}

export function CallActivityCard({ call }: { call: LeadCallDto }) {
  const [expanded, setExpanded] = useState(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const source = protectedRecordingPath(call.id, call.recordingAvailable);
  const noConsent = call.consentStatus === "declined";
  return (
    <article className="flex items-start gap-3 text-sm" data-testid={`call-activity-${call.id}`}>
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><PhoneCall className="h-3.5 w-3.5" /></div>
      <div className="min-w-0 flex-1 space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Outbound Call — {callStatusLabel(call.status)}</p><Badge variant="secondary" className="gap-1 font-mono"><Clock className="h-3 w-3" />{formatCallDuration(call.durationSeconds)}</Badge></div>
        <p className="text-xs text-muted-foreground" dir="auto">Agent: {call.agentName} · {new Date(call.startedAt ?? call.createdAt).toLocaleString()}</p>
        <p className="break-all text-xs text-muted-foreground" dir="ltr">To: {call.destination} · Caller ID: {call.callerId}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-live="polite">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          {noConsent ? "Customer declined consent — no recording or transcription" : call.consentStatus === "accepted" ? "Customer consent accepted" : "Recording requires customer consent"}
        </div>
        {!noConsent && <p className="text-xs text-muted-foreground" role="status">{processingLabel(call.transcriptionStatus, "Transcription")} · {processingLabel(call.summaryStatus, "AI summary")}</p>}
        {call.callOutcome && <p className="text-xs" dir="auto"><strong>Outcome:</strong> {call.callOutcome}</p>}
        {call.aiSummary && <div className="space-y-2 border-t border-border/60 pt-2"><p className="text-xs font-semibold">AI Summary</p><Summary summary={call.aiSummary} /></div>}
        {call.suggestedNextAction && <p className="rounded-lg bg-primary/5 p-2 text-xs" dir="auto"><strong>Next action:</strong> {call.suggestedNextAction}</p>}
        <Button type="button" size="sm" variant="ghost" className="h-7 px-0 text-xs" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          {expanded ? <ChevronDown className="mr-1 h-3 w-3" /> : <ChevronRight className="mr-1 h-3 w-3" />}{expanded ? "Hide call details" : "Transcript & recording"}
        </Button>
        {expanded && <div className="space-y-3 border-t border-border/60 pt-3">
          <section aria-label="Call transcript" className="space-y-2">
            <h4 className="text-xs font-semibold">Full Transcript</h4>
            {call.transcriptSegments?.some(segment => segment.speaker === "unknown" && (segment.channel === 0 || segment.channel === 1)) && <p className="text-xs text-muted-foreground">Channel labels are not verified agent/customer roles.</p>}
            {call.transcriptSegments?.length ? <div className="max-h-80 space-y-2 overflow-y-auto pr-1">{call.transcriptSegments.map((segment, index) => <p key={index} className="rounded-lg bg-background/50 p-2 text-sm" dir="auto"><strong>{transcriptSpeakerLabel(segment)}:</strong> <span dir="auto" className="whitespace-pre-wrap break-words">{segment.text}</span></p>)}</div>
              : call.transcript ? <p className="whitespace-pre-wrap break-words text-sm" dir="auto">{call.transcript}</p>
              : <p className="text-xs text-muted-foreground">{noConsent ? "Not recorded: customer consent was declined." : call.transcriptionStatus === "completed" ? "Transcript is unavailable for your recording permissions or retention policy." : processingLabel(call.transcriptionStatus, "Transcription")}</p>}
          </section>
          <section aria-label="Call recording" className="space-y-2">
            <h4 className="text-xs font-semibold">Recording</h4>
            {source ? <><audio controls preload="none" src={source} className="h-10 w-full max-w-full" onError={() => setPlaybackFailed(true)} aria-label="Protected call recording" />{playbackFailed && <p role="alert" className="flex items-start gap-1 text-xs text-destructive"><AlertCircle className="h-3 w-3 shrink-0" />Playback is unavailable. Check your access or ask your administrator about retention.</p>}</>
              : <p className="text-xs text-muted-foreground">{noConsent ? "No recording was created." : call.recordingStatus === "available" ? "Recording is not available for your permissions or retention policy." : call.recordingStatus === "failed" ? "Recording unavailable." : `Recording: ${call.recordingStatus.replaceAll("_", " ")}`}</p>}
          </section>
          <p className="text-[11px] text-muted-foreground">Call #{call.id} · Activity #{call.activityId} · {call.direction}</p>
          {call.parentCallSid && <p className="break-all font-mono text-[10px] text-muted-foreground">Browser leg: {call.parentCallSid}</p>}
          {call.childCallSid && <p className="break-all font-mono text-[10px] text-muted-foreground">Customer leg: {call.childCallSid}</p>}
        </div>}
      </div>
    </article>
  );
}
