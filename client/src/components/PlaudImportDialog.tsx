import { useCallback, useEffect, useRef, useState } from "react";
import { getQueryKey } from "@trpc/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Link2, Loader2, RefreshCw, Unplug } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PLAUD_SHARED_NOTICE } from "@shared/plaud";
import { formatPlaudDuration, plaudSafeError, safePlaudAuthorizationUrl } from "@/lib/plaudUi";

export type PlaudImportDialogProps = { leadId: number; open: boolean; onOpenChange: (open: boolean) => void };

/** Private cache is ephemeral, including on close, identity changes and logout. */
export function useClearPlaudPrivateCache() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    for (const queryKey of [getQueryKey(trpc.plaud.recordings), getQueryKey(trpc.plaud.connection)]) {
      void queryClient.cancelQueries({ queryKey });
      queryClient.removeQueries({ queryKey });
    }
  }, [queryClient]);
}

export default function PlaudImportDialog(props: PlaudImportDialogProps) {
  const { user } = useAuth();
  const clearPrivateCache = useClearPlaudPrivateCache();
  const clearRef = useRef(clearPrivateCache);
  clearRef.current = clearPrivateCache;
  useEffect(() => () => clearRef.current(), [user?.id, props.open, props.leadId]);
  return <Dialog open={props.open && !!user} onOpenChange={props.onOpenChange}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Import from Plaud</DialogTitle>
        <DialogDescription>Choose a recording from your own connected Plaud account and attach its transcript to this Lead. Nothing is imported automatically.</DialogDescription>
      </DialogHeader>
      {props.open && user && <PlaudImportBody key={`${user.id}:${props.leadId}`} {...props} />}
    </DialogContent>
  </Dialog>;
}

function PlaudImportBody({ leadId, onOpenChange }: PlaudImportDialogProps) {
  const utils = trpc.useUtils();
  const clearPrivateCache = useClearPlaudPrivateCache();
  const [acknowledged, setAcknowledged] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const connection = trpc.plaud.connection.useQuery(undefined, {
    retry: false, staleTime: 0, gcTime: 0, refetchOnMount: "always",
  });
  const connect = trpc.plaud.connect.useMutation();
  const disconnect = trpc.plaud.disconnect.useMutation();
  const importRecording = trpc.plaud.importRecording.useMutation();
  const busy = connect.isPending || disconnect.isPending || importRecording.isPending;
  const connected = !disconnected && !disconnect.isPending && !connection.isFetching && !connection.isError &&
    connection.data?.connected === true && !connection.data.needsReconnect;
  const recordings = trpc.plaud.recordings.useQuery({ leadId, page }, {
    enabled: connected, retry: false, staleTime: 0, gcTime: 0,
  });
  const visibleError = error ?? (connection.isError ? plaudSafeError(connection.error) : null) ?? (connected && recordings.isError ? plaudSafeError(recordings.error) : null);

  async function beginConnection() {
    if (!acknowledged || busy) return;
    setError(null); setSuccess(null); setSelected(null);
    clearPrivateCache();
    try {
      const result = await connect.mutateAsync({ leadId, acknowledgedSharing: true });
      if (!mounted.current) return;
      const authorizationUrl = safePlaudAuthorizationUrl(result.authorizationUrl);
      if (!authorizationUrl) { setError("A safe Plaud authorization link was not available. Contact your administrator."); return; }
      // Event initiated only. Plaud handles the employee's own login; CRM receives no password.
      window.location.assign(authorizationUrl);
    } catch (cause) { if (mounted.current) setError(plaudSafeError(cause)); }
  }

  async function disconnectAccount() {
    if (busy) return;
    setDisconnected(true); setSelected(null); setAcknowledged(false); setPage(1); setError(null); setSuccess(null);
    clearPrivateCache();
    try {
      await disconnect.mutateAsync();
      if (!mounted.current) return;
      utils.plaud.connection.setData(undefined, { connected: false, needsReconnect: false });
      setSuccess("Your Plaud account is disconnected. Existing imported Lead notes are unchanged.");
    } catch (cause) {
      if (mounted.current) setError(plaudSafeError(cause));
    }
  }

  async function importSelected() {
    if (!selected || !acknowledged || !connected || busy || recordings.isFetching || recordings.isError) return;
    setError(null); setSuccess(null);
    try {
      const result = await importRecording.mutateAsync({ leadId, recordingId: selected, acknowledgedSharing: true });
      if (!result) throw new Error("PLAUD_IMPORT_FAILED");
      // Invalidate canonical CRM reads, not a second provider transcript fetch.
      await Promise.all([
        utils.leads.notes.list.invalidate({ leadId }),
        utils.leads.activities.list.invalidate({ leadId }),
        utils.plaud.catalogue.invalidate(),
      ]);
      if (!mounted.current) return;
      setSelected(null); setAcknowledged(false);
      setSuccess(result.alreadyImported ? "This recording was already imported. No duplicate note was created." : "Transcript imported into this Lead's notes and added to the shared catalogue.");
    } catch (cause) { if (mounted.current) { setError(plaudSafeError(cause)); setSelected(null); } }
  }

  return <>
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm leading-6" id="plaud-sharing-notice">{PLAUD_SHARED_NOTICE}</div>
    <p className="text-xs leading-5 text-muted-foreground">Use your own Plaud login. Plaud Cloud Sync (PCS) must be enabled and transcription must be ready in Plaud. Team/shared files may not be available through this connection. This integration imports transcripts only; it does not train models.</p>
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm leading-6">
      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} aria-describedby="plaud-sharing-notice" />
      <span>I am authorized to share this recording with the company and understand that imported transcripts are visible and exportable by all active CRM users.</span>
    </label>
    {visibleError && <p role="alert" className="break-words text-sm text-destructive">{visibleError}</p>}
    {success && <p role="status" className="text-sm text-primary">{success}</p>}
    {(connection.isLoading || connection.isFetching) && !disconnected && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Checking your Plaud connection…</p>}
    {!connected && !connection.isFetching && !connection.isLoading && <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{connection.data?.needsReconnect ? "Your Plaud account needs to be reconnected." : "Connect your own Plaud account to choose a recording."} You will return to this same Lead after authorization; reopen Import from Plaud to choose a recording.</p>
      <Button onClick={beginConnection} disabled={!acknowledged || busy}><Link2 aria-hidden="true" className="mr-2 h-4 w-4" />{connect.isPending ? "Connecting…" : connection.data?.needsReconnect ? "Reconnect my Plaud account" : "Connect my Plaud account"}</Button>
      {connection.isError && <Button variant="outline" className="ml-2" onClick={() => connection.refetch()} disabled={busy}>Retry connection status</Button>}
    </div>}
    {connected && <section aria-label="Recordings from your own Plaud account" className="space-y-3" aria-busy={recordings.isFetching}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Your private Plaud recordings</p>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy || recordings.isFetching} onClick={() => { setSelected(null); setError(null); recordings.refetch(); }}><RefreshCw aria-hidden="true" className="mr-1 h-3.5 w-3.5" />Refresh</Button><Button size="sm" variant="outline" onClick={disconnectAccount} disabled={busy}><Unplug aria-hidden="true" className="mr-1 h-3.5 w-3.5" />Disconnect</Button></div>
      </div>
      {recordings.isFetching ? <p role="status" className="text-sm text-muted-foreground">Loading your recordings…</p> : recordings.isError ? <Button variant="outline" onClick={() => recordings.refetch()} disabled={busy}>Retry recordings</Button> : recordings.data?.items.length === 0 ? <p role="status" className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No recordings found on this page. Check PCS and transcription readiness in Plaud.</p> : <fieldset disabled={busy} className="min-w-0 space-y-2"><legend className="mb-2 text-xs text-muted-foreground">Select one recording to import into Lead #{leadId}.</legend>
        {recordings.data?.items.map(recording => <label key={recording.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/30">
          <input type="radio" name="plaud-recording" className="mt-1 shrink-0 accent-primary" value={recording.id} checked={selected === recording.id} onChange={() => { setSelected(recording.id); setError(null); setSuccess(null); }} />
          <span className="min-w-0 space-y-1"><span dir="auto" className="block break-words text-sm font-medium">{recording.title || "Untitled recording"}</span><span className="block text-xs text-muted-foreground">{recording.callAt === null ? "Call date unavailable" : `Call start (UTC): ${new Date(recording.callAt).toISOString().replace("T", " ").slice(0, 16)}`}{formatPlaudDuration(recording.durationMs) ? ` · ${formatPlaudDuration(recording.durationMs)}` : ""}</span></span>
        </label>)}
      </fieldset>}
      <nav aria-label="Private recording pagination" className="flex flex-wrap items-center justify-between gap-2"><Button size="sm" variant="outline" disabled={page <= 1 || busy || recordings.isFetching} onClick={() => { setSelected(null); setPage(value => value - 1); }}>Previous recordings</Button><span className="text-xs">Page {page}</span><Button size="sm" variant="outline" disabled={!recordings.data?.hasMore || busy || recordings.isFetching || recordings.isError} onClick={() => { setSelected(null); setPage(value => value + 1); }}>Next recordings</Button></nav>
    </section>}
    {connection.data?.needsReconnect && <Button variant="outline" disabled={busy} onClick={disconnectAccount}>Disconnect expired connection</Button>}
    {disconnected && !disconnect.isPending && <Button variant="outline" disabled={busy} onClick={() => { setDisconnected(false); connection.refetch(); }}>Check connection status</Button>}
    <DialogFooter>
      <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Close</Button>
      {connected && <Button onClick={importSelected} disabled={!selected || !acknowledged || busy || recordings.isFetching || recordings.isError}><Download aria-hidden="true" className="mr-2 h-4 w-4" />{importRecording.isPending ? "Importing selected recording…" : "Import selected recording"}</Button>}
    </DialogFooter>
  </>;
}
