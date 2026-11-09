import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { LeadCallsReadiness } from "@shared/leadCalls";
import { CallSession, emptyCallSession, type CallLead } from "./CallSession";
import { CallPanel } from "./CallPanel";
import { needsCallPolling, normalizeDisplayPhone, safeCallError } from "./callUi";

type CallContextValue = { readiness: LeadCallsReadiness | undefined; locked: boolean; open: (lead: CallLead) => void };
const CallContext = createContext<CallContextValue | null>(null);
export function useLeadCalling() {
  const context = useContext(CallContext);
  if (!context) throw new Error("Lead calling provider is not mounted");
  return context;
}

export function LeadCallProvider({ children }: { children: ReactNode }) {
  const utils = trpc.useUtils();
  const auth = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const readiness = trpc.calls.readiness.useQuery(undefined, { enabled: !!auth.data, retry: false, staleTime: 30_000, refetchOnWindowFocus: true });
  // Security-sensitive mutations must not retain voice tokens in the mutation cache.
  const prepare = trpc.calls.prepare.useMutation({ gcTime: 0 });
  const token = trpc.calls.token.useMutation({ gcTime: 0 });
  const refreshToken = trpc.calls.refreshToken.useMutation({ gcTime: 0 });
  const cancel = trpc.calls.cancel.useMutation({ gcTime: 0 });
  const [state, setState] = useState(emptyCallSession);
  const current = useRef({ prepare, token, refreshToken, cancel, utils });
  current.current = { prepare, token, refreshToken, cancel, utils };
  const sessionRef = useRef<CallSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new CallSession({
      prepare: async leadId => {
        try { return await current.current.prepare.mutateAsync({ leadId }); }
        finally { current.current.prepare.reset(); }
      },
      token: async (callId, intentToken) => {
        try { return await current.current.token.mutateAsync({ callId, intentToken }); }
        finally { current.current.token.reset(); }
      },
      refreshToken: async callId => {
        try { return await current.current.refreshToken.mutateAsync({ callId }); }
        finally { current.current.refreshToken.reset(); }
      },
      cancel: async callId => {
        try { return await current.current.cancel.mutateAsync({ callId }); }
        finally { current.current.cancel.reset(); }
      },
      getMicrophone: () => {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return Promise.reject({ name: "SecurityError" });
        return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      },
      // This import is reached only after an explicit microphone/prepare click.
      loadSdk: () => import("@twilio/voice-sdk"),
      changed: setState,
      activityChanged: leadId => {
        void current.current.utils.calls.list.invalidate({ leadId });
        void current.current.utils.calls.get.invalidate();
        void current.current.utils.leads.activities.list.invalidate({ leadId });
      },
    });
  }
  const session = sessionRef.current;
  const callQuery = trpc.calls.get.useQuery({ callId: state.callId ?? 0 }, {
    enabled: !!auth.data && !!state.callId,
    retry: false,
    refetchInterval: query => query.state.data && !needsCallPolling(query.state.data) ? false : 5000,
    refetchIntervalInBackground: true,
  });
  const lastUpdate = useRef(0);
  useEffect(() => {
    if (!callQuery.data || callQuery.data.id !== session.state.callId) return;
    const call = callQuery.data;
    session.applyServerStatus(call.status, call.answeredAt, call.endedAt);
    if (call.updatedAt !== lastUpdate.current) {
      lastUpdate.current = call.updatedAt;
      void utils.leads.activities.list.invalidate({ leadId: call.leadId });
      void utils.calls.list.invalidate({ leadId: call.leadId });
    }
  }, [callQuery.data, session, utils]);
  useEffect(() => {
    if (callQuery.error) {
      // The UI message is deliberately sanitized; keep local audio control available.
      if (callQuery.error.data?.code === "UNAUTHORIZED" || callQuery.error.data?.code === "FORBIDDEN") {
        void session.end();
      }
      toast.error(safeCallError(callQuery.error), { id: "lead-call-status-error" });
    }
  }, [callQuery.error, session]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!session.locked) return;
      event.preventDefault();
      event.returnValue = "An active call will disconnect if you leave this tab.";
    };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); session.dispose(); };
  }, [session]);
  const userId = auth.data?.id;
  const previousUser = useRef(userId);
  useEffect(() => {
    if (previousUser.current != null && previousUser.current !== userId) {
      session.dispose();
      session.close();
    }
    previousUser.current = userId;
  }, [userId, session]);
  const open = (lead: CallLead) => {
    if (!readiness.data?.canCall) return;
    if (!normalizeDisplayPhone(lead.phone)) { toast.error("A valid lead phone number is required before calling."); return; }
    if (!readiness.data.ready) { toast.error("Calling setup is required. Ask your administrator to review calling readiness."); return; }
    if (!session.review(lead)) { toast.info("Finish your current calling session before starting another."); return; }
    lastUpdate.current = 0;
  };
  return (
    <CallContext.Provider value={{ readiness: readiness.data, locked: session.locked, open }}>
      {children}
      <CallPanel state={state} locked={session.locked} agentName={auth.data?.name ?? ""} consentStatus={callQuery.data?.consentStatus}
        initialize={() => void session.initialize()} start={() => session.start()} end={() => void session.end()} mute={() => session.mute()} close={() => session.close()} />
    </CallContext.Provider>
  );
}
