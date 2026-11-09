import React from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizeDisplayPhone } from "./callUi";

/** Opens only the device dialer; never creates a CRM call, activity or recording. */
export function DeviceCallButton({ phone }: { phone: string | null | undefined }) {
  const destination = normalizeDisplayPhone(phone);
  if (!destination) return null;
  return (
    <Button asChild size="sm" variant="outline" className="gap-1.5">
      <a
        href={`tel:${destination}`}
        aria-label="Call with your device"
        title="Opens your device's phone app. This call is not recorded by the CRM."
      >
        <Phone className="w-3.5 h-3.5" aria-hidden="true" />
        Call
      </a>
    </Button>
  );
}
