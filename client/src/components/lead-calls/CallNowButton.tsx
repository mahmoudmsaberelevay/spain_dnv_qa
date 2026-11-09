import React, { useId } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CallLead } from "./CallSession";
import { normalizeDisplayPhone } from "./callUi";
import { useLeadCalling } from "./LeadCallProvider";

export function CallNowButton({ lead, compact = false }: { lead: CallLead; compact?: boolean }) {
  const { readiness, readinessLoading, readinessError, locked, open } = useLeadCalling();
  const hintId = useId();
  const valid = !!normalizeDisplayPhone(lead.phone);
  // Discoverable does not mean authorized: only a successful server readiness
  // result with canCall AND ready may enable a paid CRM calling action.
  const disabled = !valid || locked || !!readinessError || readinessLoading || !readiness?.ready || !readiness.canCall;
  let hint: string | null = null;
  let reason = "Call this lead through the CRM. Recording requires customer consent.";
  if (!valid) {
    hint = "Valid phone required";
    reason = "A valid phone number is required";
  } else if (locked) {
    hint = "Call already active";
    reason = "Finish the current calling session first";
  } else if (readinessError) {
    hint = "Calling unavailable";
    reason = readinessError;
  } else if (readinessLoading || !readiness) {
    hint = "Checking calling…";
    reason = "Checking CRM calling readiness. Device calling remains separate.";
  } else if (!readiness.canCall && !readiness.hasCallGrant && !readiness.canManage) {
    hint = "Calling access required";
    reason = "CRM calling is not enabled for this account. Ask your administrator to review agent access.";
  } else if (!readiness.ready || !readiness.canCall) {
    hint = "Setup required";
    reason = "Calling setup required — ask your administrator to review readiness and agent grants";
  }
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-0.5" title={reason}>
      <Button type="button" size="sm" variant="outline" className={`gap-1.5 text-primary ${compact ? "h-7 px-2 text-xs" : ""}`} disabled={disabled}
        aria-label={`Call Now — ${lead.fullName}`} aria-describedby={hintId} onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          if (!disabled) open(lead);
        }}>
        <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Call Now
      </Button>
      <span id={hintId} className="sr-only">{reason}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </span>
  );
}
