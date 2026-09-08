import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Circle, Clock, ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";

type AuthorityAction = "mofa_submitted" | "mofa_received" | "embassy_submitted" | "embassy_received";

function cairoDateKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function StatusButton(props: { label: string; date?: string | null; complete: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={`text-[11px] rounded-md border px-2 py-1 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${props.complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-white text-gray-600 hover:border-[#5ba3b8]"}`}
    >
      <span className="flex items-center gap-1"><span>{props.complete ? "✓" : "○"}</span>{props.label}</span>
      {props.date ? <span className="mt-0.5 block text-[10px] opacity-70">{props.date}</span> : null}
    </button>
  );
}

export function ClientDocumentWorkflowRow({ clientCaseId, document }: { clientCaseId: number; document: any }) {
  const utils = trpc.useUtils();
  const [linkOpen, setLinkOpen] = useState(false);
  const [documentLink, setDocumentLink] = useState(document.documentLink ?? "");
  const [authorityAction, setAuthorityAction] = useState<AuthorityAction | null>(null);
  const [authorityDate, setAuthorityDate] = useState(cairoDateKey());

  const invalidate = async () => {
    await Promise.all([
      utils.clientDocs.get.invalidate({ id: clientCaseId }),
      utils.clientDocs.report.invalidate({ id: clientCaseId }),
      utils.clientDocs.dashboard.invalidate(),
    ]);
  };

  const linkMutation = trpc.clientDocs.setDocumentLink.useMutation({
    onSuccess: async () => { toast.success("Document link saved"); setLinkOpen(false); await invalidate(); },
    onError: error => toast.error(error.message),
  });
  const authorityMutation = trpc.clientDocs.recordDocumentAuthorityMilestone.useMutation({
    onSuccess: async () => { toast.success("Document status updated"); setAuthorityAction(null); await invalidate(); },
    onError: error => toast.error(error.message),
  });

  const openAuthority = (action: AuthorityAction) => {
    setAuthorityDate(cairoDateKey());
    setAuthorityAction(action);
  };
  const receivedFromMofa = Boolean(document.mofaReceived || document.mofaAttested);
  const receivedFromEmbassy = Boolean(document.embassyReceived || document.embassyAttested);

  return (
    <div className="border-b border-gray-100 py-3 last:border-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            {document.received ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" /> : <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-300" />}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800">{document.docName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge className={`border text-[10px] ${document.received ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-500"}`}>{document.received ? "Received" : "Not received"}</Badge>
                {document.receivedDate ? <span className="text-[10px] text-gray-400">{new Date(document.receivedDate).toLocaleDateString()}</span> : null}
                {document.documentLink ? (
                  <a href={document.documentLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1e7184] hover:underline"><ExternalLink className="h-3 w-3" />Open document</a>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex max-w-full flex-col gap-2 lg:w-[470px]">
          <Button type="button" variant="outline" size="sm" className="h-8 justify-start gap-1.5 border-[#5ba3b8]/40 text-xs text-[#1e7184]" onClick={() => { setDocumentLink(document.documentLink ?? ""); setLinkOpen(true); }}>
            <Link2 className="h-3.5 w-3.5" />{document.documentLink ? "Update document link" : "Add document link"}
          </Button>
          {(document.requiresMofa || document.requiresEmbassy) ? (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {document.requiresMofa ? <>
                <StatusButton label="Submitted to MOFA" complete={Boolean(document.mofaSubmitted)} date={document.mofaSubmittedDate} disabled={!document.received} onClick={() => openAuthority("mofa_submitted")} />
                <StatusButton label="Received from MOFA" complete={receivedFromMofa} date={document.mofaReceivedDate} disabled={!document.mofaSubmitted} onClick={() => openAuthority("mofa_received")} />
              </> : <><span /><span /></>}
              {document.requiresEmbassy ? <>
                <StatusButton label="Submitted to Embassy" complete={Boolean(document.embassySubmitted)} date={document.embassySubmittedDate} disabled={!document.received || (document.requiresMofa && !receivedFromMofa)} onClick={() => openAuthority("embassy_submitted")} />
                <StatusButton label="Received from Embassy" complete={receivedFromEmbassy} date={document.embassyReceivedDate} disabled={!document.embassySubmitted} onClick={() => openAuthority("embassy_received")} />
              </> : null}
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="bg-white text-gray-900 sm:max-w-lg">
          <DialogHeader><DialogTitle>Document Drive Link</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">{document.docName}</p>
          <Input type="url" placeholder="https://drive.google.com/..." value={documentLink} onChange={event => setDocumentLink(event.target.value)} />
          <Button disabled={!documentLink.trim() || linkMutation.isPending} onClick={() => linkMutation.mutate({ clientCaseId, documentId: document.id, documentLink: documentLink.trim() })} className="bg-[#1e3a5f] text-white hover:bg-[#16304f]">{linkMutation.isPending ? "Saving..." : "Save Link"}</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={authorityAction !== null} onOpenChange={open => !open && setAuthorityAction(null)}>
        <DialogContent className="bg-white text-gray-900 sm:max-w-md">
          <DialogHeader><DialogTitle>Record Official Document Movement</DialogTitle></DialogHeader>
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900"><Clock className="mr-2 inline h-4 w-4" />{document.docName}</div>
          <Input type="date" value={authorityDate} onChange={event => setAuthorityDate(event.target.value)} />
          <Button disabled={!authorityAction || !authorityDate || authorityMutation.isPending} onClick={() => authorityAction && authorityMutation.mutate({ clientCaseId, documentId: document.id, milestone: authorityAction, date: authorityDate })} className="bg-[#1e3a5f] text-white hover:bg-[#16304f]">{authorityMutation.isPending ? "Saving..." : "Confirm"}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
