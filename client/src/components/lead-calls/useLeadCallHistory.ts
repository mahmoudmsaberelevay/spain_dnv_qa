import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { needsCallPolling } from "./callUi";
import { useLeadCalling } from "./LeadCallProvider";

export function useLeadCallHistory(leadId: number) {
  const utils = trpc.useUtils();
  const { readiness, locked } = useLeadCalling();
  const query = trpc.calls.list.useQuery({ leadId }, {
    enabled: leadId > 0 && !!readiness,
    retry: false,
    refetchInterval: data => locked || data.state.data?.some(needsCallPolling) ? 5000 : false,
    refetchIntervalInBackground: true,
  });
  const fingerprint = query.data?.map(call => `${call.id}:${call.updatedAt}`).join("|") ?? "";
  const previous = useRef("");
  useEffect(() => {
    if (fingerprint && fingerprint !== previous.current) {
      previous.current = fingerprint;
      void utils.leads.activities.list.invalidate({ leadId });
    }
  }, [fingerprint, leadId, utils]);
  // A permissions error must not leave cached transcript/audio displayed.
  return { ...query, data: query.error ? [] : query.data ?? [] };
}
