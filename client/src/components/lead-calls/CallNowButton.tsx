import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CallLead } from "./CallSession";
import { normalizeDisplayPhone } from "./callUi";
import { useLeadCalling } from "./LeadCallProvider";

export function CallNowButton({ lead, compact = false }: { lead: CallLead; compact?: boolean }) {
  const { readiness, locked, open } = useLeadCalling();
  // Only explicit server authority may show calling; never infer grants from role or reasons.
  const hasCallGrant = readiness && "hasCallGrant" in readiness && readiness.hasCallGrant === true;
  if (!readiness || (!readiness.canCall && !hasCallGrant && !readiness.canManage)) return null;
  const valid = !!normalizeDisplayPhone(lead.phone);
  const setupRequired = !readiness.ready || !readiness.canCall;
  const reason = !valid ? "A valid phone number is required" : locked ? "Finish the current calling session first" : setupRequired ? "Calling setup required — ask your administrator to review readiness and agent grants" : "Call this lead from the CRM";
  const disabled = !valid || locked || setupRequired;
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-0.5" title={reason}>
      <Button type="button" size="sm" variant="outline" className={`gap-1.5 text-primary ${compact ? "h-7 px-2 text-xs" : ""}`} disabled={disabled}
        aria-label={`Call Now — ${lead.fullName}`} onClick={event => { event.preventDefault(); event.stopPropagation(); open(lead); }}>
        <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Call Now
      </Button>
      {setupRequired && valid && <span className="text-[10px] text-muted-foreground">Setup required</span>}
    </span>
  );
}
