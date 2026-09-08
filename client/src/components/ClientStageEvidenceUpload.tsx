import { useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

export function ClientStageEvidenceUpload({ clientCaseId, kind, onUploaded }: { clientCaseId: number; kind: "submission_receipt" | "approval_letter"; onUploaded: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = trpc.clientPortalDocumentReview.uploadStageEvidence.useMutation({
    onSuccess: data => { onUploaded(data.url); toast.success(kind === "submission_receipt" ? "Submission receipt uploaded" : "Approval letter uploaded"); },
    onError: error => toast.error(error.message),
  });

  const choose = async (file?: File) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return toast.error("Files must be 25 MB or smaller");
    if (!(["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif"] as string[]).includes(file.type)) return toast.error("Use PDF, JPG, PNG, HEIC, or HEIF");
    const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
    upload.mutate({ clientCaseId, kind, fileName: file.name, mimeType: file.type as "application/pdf" | "image/jpeg" | "image/png" | "image/heic" | "image/heif", fileSize: file.size, base64 });
  };

  return <div><input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/heif" className="hidden" onChange={event => void choose(event.target.files?.[0])} /><Button type="button" variant="outline" disabled={upload.isPending} onClick={() => inputRef.current?.click()} className="w-full border-dashed border-[#5ba3b8] text-[#1e7184]">{upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}{upload.isPending ? "Uploading securely…" : kind === "submission_receipt" ? "Upload official submission receipt" : "Upload approval letter"}</Button><p className="mt-1 text-[11px] text-gray-500">PDF or image, maximum 25 MB. The client receives it in Application Activity.</p></div>;
}
