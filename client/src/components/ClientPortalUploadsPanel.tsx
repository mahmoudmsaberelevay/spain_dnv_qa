import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileCheck2, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";

const statusLabels: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  accepted: "Accepted",
  replacement_required: "Needs replacement",
};

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function ClientPortalUploadsPanel({ clientCaseId }: { clientCaseId: number }) {
  const utils = trpc.useUtils();
  const uploads = trpc.clientPortalDocumentReview.listForClientCase.useQuery({ clientCaseId });
  const [opening, setOpening] = useState<string | null>(null);
  const access = trpc.clientPortalDocumentReview.access.useMutation({
    onSuccess: data => window.open(data.url, "_blank", "noopener,noreferrer"),
    onError: error => toast.error(error.message),
    onSettled: () => setOpening(null),
  });
  const review = trpc.clientPortalDocumentReview.review.useMutation({
    onSuccess: async () => { toast.success("Client upload review updated"); await utils.clientPortalDocumentReview.listForClientCase.invalidate({ clientCaseId }); },
    onError: error => toast.error(error.message),
  });

  if (uploads.isLoading) return <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading client uploads…</div>;
  if (uploads.error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Unable to load client uploads. <button className="font-semibold underline" onClick={() => uploads.refetch()}>Retry</button></div>;

  return (
    <section className="rounded-xl border border-[#5ba3b8]/25 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-sm font-semibold text-[#1e3a5f]"><Smartphone className="h-4 w-4 text-[#5ba3b8]" />Client App Uploads</h3><p className="mt-1 text-xs text-gray-500">Uploads and scans sent by this client are linked to their exact checklist item.</p></div>
        <span className="rounded-full bg-[#eef8fa] px-3 py-1 text-xs font-semibold text-[#1e7184]">{uploads.data?.length ?? 0} file{uploads.data?.length === 1 ? "" : "s"}</span>
      </div>
      {!uploads.data?.length ? <div className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">No documents have been uploaded from the client app yet.</div> : <div className="space-y-3">{uploads.data.map(file => <article key={file.publicId} className="rounded-lg border border-gray-200 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-900">{file.checklistName || file.documentType}</p><p className="mt-1 truncate text-xs text-gray-500">{file.fileName} · {formatBytes(file.fileSize)} · {file.source === "client_scan" ? "Scanned in app" : "Uploaded in app"}</p><p className="mt-1 text-xs text-gray-500">{file.applicantName || "Main applicant"} · {new Date(file.createdAt).toLocaleString()}</p>{file.clientComment ? <p className="mt-2 rounded-md bg-gray-50 p-2 text-xs text-gray-700">Client note: {file.clientComment}</p> : null}</div><FileCheck2 className="h-5 w-5 shrink-0 text-[#5ba3b8]" /></div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" disabled={opening === file.publicId} onClick={() => { setOpening(file.publicId); access.mutate({ clientCaseId, documentPublicId: file.publicId }); }}><Download className="mr-1 h-3.5 w-3.5" />{opening === file.publicId ? "Opening…" : "Open secure file"}</Button><Select value={file.reviewStatus} onValueChange={value => review.mutate({ clientCaseId, documentPublicId: file.publicId, reviewStatus: value as "submitted" | "under_review" | "accepted" | "replacement_required" })}><SelectTrigger className="h-9 w-[180px] bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="submitted">Submitted</SelectItem><SelectItem value="under_review">Under review</SelectItem><SelectItem value="accepted">Accepted</SelectItem><SelectItem value="replacement_required">Needs replacement</SelectItem></SelectContent></Select><span className="text-xs text-gray-500">{statusLabels[file.reviewStatus] || file.reviewStatus}</span></div>
      </article>)}</div>}
    </section>
  );
}
