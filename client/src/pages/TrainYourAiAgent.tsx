import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Download, FileText, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlaudCataloguePage, PlaudRange } from "@shared/plaud";
import {
  fetchPlaudTranscriptDownload, formatPlaudDate, formatPlaudDuration,
  PlaudDownloadError, plaudDownloadErrorMessage, plaudRangeError, plaudSafeError,
} from "@/lib/plaudUi";

export function PlaudCatalogueEntries({ data }: { data: PlaudCataloguePage }) {
  return <div className="space-y-3">
    {data.items.map(entry => <Card key={entry.id} className="min-w-0 overflow-hidden">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <h2 className="break-words text-base font-semibold text-foreground" dir="auto">{entry.title || "Untitled recording"}</h2>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span>{entry.usesImportDate ? "Import date used" : "Call date"}: {formatPlaudDate(entry.effectiveAt, data.timeZone)}</span>
          <span>Imported by <bdi>{entry.importerName || "CRM user"}</bdi></span>
          {formatPlaudDuration(entry.durationMs) && <span>Duration: {formatPlaudDuration(entry.durationMs)}</span>}
        </div>
        {entry.lead && /^\/leads\/\d+$/.test(entry.lead.path) && <p className="text-sm">
          <span dir="auto">{entry.lead.name} · {entry.lead.code}</span>{" "}
          <Link href={entry.lead.path} className="inline-block rounded text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2">View Lead<span className="sr-only">: {entry.lead.name}</span></Link>
        </p>}
        <details className="group rounded-lg border border-border">
          <summary className="cursor-pointer rounded-lg px-3 py-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            Full transcript<span className="sr-only">: {entry.title || "Untitled recording"}</span>
          </summary>
          <pre dir="auto" className="m-0 max-w-full whitespace-pre-wrap break-words border-t border-border bg-muted/30 p-3 font-sans text-sm leading-7 text-foreground [overflow-wrap:anywhere] [text-align:start] [unicode-bidi:plaintext]">{entry.transcript}</pre>
        </details>
      </CardContent>
    </Card>)}
  </div>;
}

export function PlaudCatalogueState({ loading, error, empty, filtered, retry }: {
  loading: boolean; error: string | null; empty: boolean; filtered: boolean; retry: () => void;
}) {
  if (loading) return <div role="status" className="flex items-center gap-2 rounded-xl border p-6 text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Loading Plaud transcripts…</div>;
  if (error) return <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 p-5"><p>{error}</p><Button variant="outline" onClick={retry}>Try again</Button></div>;
  if (empty) return <div role="status" className="rounded-xl border border-dashed p-8 text-center text-muted-foreground"><FileText aria-hidden="true" className="mx-auto mb-3 h-8 w-8" /><p>{filtered ? "No Plaud transcripts found for this date range" : "No Plaud transcripts have been imported into Lead notes yet."}</p></div>;
  return null;
}

export default function TrainYourAiAgent() {
  const { user, loading: authLoading } = useAuth();
  // Draft controls never silently change the applied listing or export scope.
  const [draft, setDraft] = useState({ from: "", to: "" });
  const [applied, setApplied] = useState<PlaudRange>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 20 | 50>(20);
  const [validation, setValidation] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [receivedBytes, setReceivedBytes] = useState(0);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const catalogue = trpc.plaud.catalogue.useQuery({ ...applied, page, pageSize }, {
    enabled: !!user, retry: false, gcTime: 0,
  });
  useEffect(() => () => controller.current?.abort(), [user?.id]);
  const changed = draft.from !== (applied.from ?? "") || draft.to !== (applied.to ?? "");
  const draftError = plaudRangeError(draft);
  const exportRangeError = plaudRangeError(applied, true);
  const rangeError = validation ?? draftError;
  const data = catalogue.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  async function exportTranscripts() {
    if (!user || exporting || changed || exportRangeError || catalogue.isFetching || !data?.total) return;
    setExporting(true); setReceivedBytes(0); setExportError(null); setExportMessage(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const result = await fetchPlaudTranscriptDownload({ from: applied.from!, to: applied.to! }, {
        signal: abort.signal, onProgress: setReceivedBytes,
      });
      if (abort.signal.aborted) return;
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = result.filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      // Allow the browser to consume the Blob before releasing its object URL.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setExportMessage(`Download prepared: ${result.count.toLocaleString()} transcripts, ${result.bytes.toLocaleString()} bytes. All matches across all pages are included.`);
    } catch (error) {
      if (!abort.signal.aborted) setExportError(error instanceof PlaudDownloadError ? error.message : plaudDownloadErrorMessage(0));
    } finally {
      if (controller.current === abort) { controller.current = null; setExporting(false); }
    }
  }

  if (authLoading) return <p role="status">Checking your CRM session…</p>;
  if (!user) return <p role="alert">Sign in to view the shared transcript catalogue.</p>;

  return <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 p-4 md:p-0">
    <header className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">Shared transcript catalogue</p>
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Train Your AI Agent</h1>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">Browse Plaud transcripts successfully imported into Lead notes by the team. This module prepares a dataset only; it does not train models, generate summaries, or upload data to an AI provider.</p>
      <p className="flex items-start gap-2 text-sm text-muted-foreground"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />All active CRM users can view and export these imported transcripts. Private and unassigned Plaud recordings are not included. Lead links appear only where authorized.</p>
    </header>

    <Card><CardContent className="space-y-4 p-4 sm:p-5">
      <form onSubmit={event => {
        event.preventDefault();
        const error = plaudRangeError(draft);
        setValidation(error);
        if (error) return;
        setApplied(draft.from ? { from: draft.from, to: draft.to } : {});
        setPage(1); setExportError(null); setExportMessage(null);
      }} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto_auto] xl:items-end">
        <div className="min-w-0 space-y-1.5"><Label htmlFor="plaud-from">From date</Label><Input id="plaud-from" type="date" value={draft.from} max="9999-12-31" disabled={exporting} aria-invalid={!!rangeError} aria-describedby={rangeError ? "plaud-range-error" : "plaud-date-help"} onChange={event => { setDraft(value => ({ ...value, from: event.target.value })); setValidation(null); }} /></div>
        <div className="min-w-0 space-y-1.5"><Label htmlFor="plaud-to">To date</Label><Input id="plaud-to" type="date" value={draft.to} max="9999-12-31" disabled={exporting} aria-invalid={!!rangeError} aria-describedby={rangeError ? "plaud-range-error" : "plaud-date-help"} onChange={event => { setDraft(value => ({ ...value, to: event.target.value })); setValidation(null); }} /></div>
        <Button type="submit" disabled={exporting}>Apply</Button>
        <Button type="button" variant="outline" disabled={exporting} onClick={() => { setDraft({ from: "", to: "" }); setApplied({}); setPage(1); setValidation(null); setExportError(null); setExportMessage(null); }}>Clear filters</Button>
      </form>
      <p id="plaud-date-help" className="text-xs leading-5 text-muted-foreground">Business timezone: <strong>{data?.timeZone ?? "Loading configured timezone…"}</strong>. Dates include the entire From and To days. Call date is used; missing call dates use the labelled import date.</p>
      {rangeError && <p id="plaud-range-error" role="alert" className="text-sm text-destructive">{rangeError}</p>}
      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl space-y-1">
          <p className="text-sm font-medium">{applied.from ? `Applied range: ${applied.from} to ${applied.to}` : "Showing all imported transcripts"}</p>
          <p id="plaud-export-notice" className="text-xs leading-5 text-muted-foreground">Export includes every matching transcript across all pages, as plain UTF-8 text only. This file may contain sensitive, identifying client data; it is not anonymized. Share only as authorized by company policy.</p>
          <p className="text-xs text-muted-foreground">{changed ? "Apply your changed dates before exporting." : exportRangeError ? "Choose and Apply a complete valid date range to export." : "Export scope matches the applied date range."}</p>
        </div>
        <Button type="button" className="shrink-0" aria-describedby="plaud-export-notice" onClick={exportTranscripts} disabled={exporting || changed || !!exportRangeError || catalogue.isFetching || catalogue.isError || !data?.total}>
          {exporting ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <Download aria-hidden="true" className="mr-2 h-4 w-4" />}{exporting ? "Receiving export…" : "Export TXT"}
        </Button>
      </div>
      {exporting && <div role="status" className="space-y-2 text-sm"><p>{receivedBytes.toLocaleString()} bytes received. The browser will prepare the file when the server stream finishes.</p><Button variant="outline" size="sm" onClick={() => { controller.current?.abort(); setExportMessage("Export cancelled. No file was downloaded."); }}>Cancel export</Button></div>}
      {exportMessage && <p role="status" className="text-sm text-primary">{exportMessage}</p>}
      {exportError && <p role="alert" className="text-sm text-destructive">{exportError}</p>}
    </CardContent></Card>

    <section aria-label="Imported Plaud transcripts" aria-busy={catalogue.isFetching} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm font-semibold">{catalogue.isError ? "Matching count unavailable" : data ? `${data.total.toLocaleString()} matching transcript${data.total === 1 ? "" : "s"}` : "Loading matching count…"}</p>
        <Button size="sm" variant="outline" onClick={() => catalogue.refetch()} disabled={catalogue.isFetching || exporting}><RefreshCw aria-hidden="true" className="mr-2 h-3.5 w-3.5" />Refresh</Button>
      </div>
      <PlaudCatalogueState loading={catalogue.isLoading || (!data && catalogue.isFetching)} error={catalogue.isError ? plaudSafeError(catalogue.error) : null} empty={!!data && data.items.length === 0} filtered={!!applied.from} retry={() => catalogue.refetch()} />
      {!catalogue.isError && data && data.items.length > 0 && <PlaudCatalogueEntries data={data} />}
      {!catalogue.isError && data && data.total > 0 && <nav aria-label="Transcript pagination" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Label htmlFor="plaud-page-size" className="text-xs">Per page</Label><select id="plaud-page-size" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={pageSize} disabled={exporting || catalogue.isFetching} onChange={event => { setPageSize(Number(event.target.value) as 10 | 20 | 50); setPage(1); }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></div>
        <div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || catalogue.isFetching || exporting} onClick={() => setPage(value => value - 1)}>Previous</Button><span className="text-xs" aria-live="polite">Page {page} of {totalPages}</span><Button variant="outline" size="sm" disabled={page >= totalPages || catalogue.isFetching || exporting} onClick={() => setPage(value => value + 1)}>Next</Button></div>
      </nav>}
    </section>
  </div>;
}
