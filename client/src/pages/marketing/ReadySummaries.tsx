import { useAuth } from "@/_core/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  Download,
  FileText,
  FolderOpen,
  Loader2,
  Search,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const CATEGORIES = ["Residency", "Citizenship", "Immigration", "Other"] as const;
const MAX_PDF_BYTES = 25 * 1024 * 1024;

type ReadySummary = {
  id: number;
  title: string;
  category: string;
  originalFileName: string;
  fileSizeBytes: number;
  pageCount: number | null;
  uploadedByEmail: string | null;
  createdAt: number;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function titleFromFileName(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/^_+/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read PDF"));
    reader.readAsDataURL(file);
  });
}

export default function ReadySummaries() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Residency");
  const [deleteTarget, setDeleteTarget] = useState<ReadySummary | null>(null);

  const summariesQuery = trpc.marketing.listReadySummaries.useQuery();
  const downloadMutation = trpc.marketing.getReadySummaryDownload.useMutation({
    onSuccess: result => {
      const link = document.createElement("a");
      link.href = result.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
    onError: error => toast.error(error.message || "Unable to prepare this download"),
  });
  const uploadMutation = trpc.marketing.uploadReadySummary.useMutation({
    onSuccess: async () => {
      await utils.marketing.listReadySummaries.invalidate();
      toast.success("Ready summary added");
      setUploadOpen(false);
      setFile(null);
      setTitle("");
      setCategory("Residency");
      if (inputRef.current) inputRef.current.value = "";
    },
    onError: error => toast.error(error.message || "Unable to add this summary"),
  });
  const deleteMutation = trpc.marketing.deleteReadySummary.useMutation({
    onSuccess: async () => {
      await utils.marketing.listReadySummaries.invalidate();
      toast.success("Ready summary removed");
      setDeleteTarget(null);
    },
    onError: error => toast.error(error.message || "Unable to remove this summary"),
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return ((summariesQuery.data ?? []) as ReadySummary[]).filter(summary => {
      if (categoryFilter !== "All" && summary.category !== categoryFilter) return false;
      return !needle || `${summary.title} ${summary.category} ${summary.originalFileName}`.toLowerCase().includes(needle);
    });
  }, [categoryFilter, search, summariesQuery.data]);

  const chooseFile = (nextFile?: File) => {
    if (!nextFile) return;
    if (nextFile.type !== "application/pdf" || !nextFile.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please select a PDF file");
      return;
    }
    if (nextFile.size <= 0 || nextFile.size > MAX_PDF_BYTES) {
      toast.error("PDF files must be 25 MB or smaller");
      return;
    }
    setFile(nextFile);
    if (!title.trim()) setTitle(titleFromFileName(nextFile.name));
  };

  const submitUpload = async () => {
    if (!file) return toast.error("Select a PDF file");
    if (title.trim().length < 2) return toast.error("Enter a clear summary title");
    const fileBase64 = await fileToBase64(file);
    uploadMutation.mutate({
      title: title.trim(),
      category,
      fileName: file.name,
      mimeType: "application/pdf",
      fileSize: file.size,
      fileBase64,
    });
  };

  return (
    <div className="min-h-screen bg-[#0b1120] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#A1C6CF]">
              <FolderOpen className="h-4 w-4" /> Marketing Library
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Ready Summaries</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Download approved ELEVAY country and program summaries as PDF files. The library is shared with every authorized CRM user.
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setUploadOpen(true)} className="bg-[#5BA3B8] text-[#07111f] hover:bg-[#73b4c4]">
              <UploadCloud className="mr-2 h-4 w-4" /> Add summary
            </Button>
          )}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by country, program, or category" className="border-white/10 bg-white/5 pl-10 text-white placeholder:text-slate-500" />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="border-white/10 bg-white/5 text-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All categories</SelectItem>
              {CATEGORIES.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center rounded-md border border-white/10 bg-white/5 px-4 text-sm text-slate-300">
            {filtered.length} PDF{filtered.length === 1 ? "" : "s"}
          </div>
        </div>

        {summariesQuery.isLoading ? (
          <div className="flex min-h-72 items-center justify-center text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading summaries…</div>
        ) : summariesQuery.isError ? (
          <div className="mt-8 border border-red-400/20 bg-red-500/10 p-6 text-sm text-red-200">Unable to load Ready Summaries. Please refresh and try again.</div>
        ) : filtered.length === 0 ? (
          <div className="mt-8 border border-dashed border-white/15 bg-white/[0.03] px-6 py-16 text-center">
            <FileText className="mx-auto h-10 w-10 text-slate-600" />
            <h2 className="mt-4 text-lg font-semibold">No matching summaries</h2>
            <p className="mt-2 text-sm text-slate-400">Change the search or category filter{isAdmin ? ", or add a PDF." : "."}</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map(summary => (
              <article key={summary.id} className="flex min-h-56 flex-col border border-white/10 bg-[#111a2d] p-5 transition-colors hover:border-[#5BA3B8]/50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center bg-[#5BA3B8]/15 text-[#A1C6CF]">
                    <FileText className="h-5 w-5" />
                  </div>
                  <span className="border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-2.5 py-1 text-xs font-medium text-[#EBD990]">{summary.category}</span>
                </div>
                <h2 className="mt-5 text-lg font-semibold leading-snug">{summary.title}</h2>
                <p className="mt-2 text-xs text-slate-500">
                  {summary.pageCount ? `${summary.pageCount} pages · ` : ""}{formatBytes(summary.fileSizeBytes)} · PDF
                </p>
                <div className="mt-auto flex items-center gap-2 pt-6">
                  <Button disabled={downloadMutation.isPending} onClick={() => downloadMutation.mutate({ id: summary.id })} className="flex-1 bg-white text-[#0b1120] hover:bg-slate-200">
                    {downloadMutation.isPending && downloadMutation.variables?.id === summary.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Download PDF
                  </Button>
                  {isAdmin && (
                    <Button variant="outline" size="icon" aria-label={`Delete ${summary.title}`} onClick={() => setDeleteTarget(summary)} className="border-red-400/30 text-red-300 hover:bg-red-500/10 hover:text-red-200">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-8 flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 text-[#5BA3B8]" /> Downloads require an authenticated CRM account. Files are stored outside the application database.
        </div>
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="border-white/10 bg-[#111a2d] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Ready Summary</DialogTitle>
            <DialogDescription className="text-slate-400">Upload one approved PDF. Duplicate file content is rejected automatically.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="ready-summary-pdf">PDF file</Label>
              <Input ref={inputRef} id="ready-summary-pdf" type="file" accept="application/pdf,.pdf" onChange={event => chooseFile(event.target.files?.[0])} className="border-white/10 bg-white/5 file:text-white" />
              <p className="text-xs text-slate-500">PDF only, maximum 25 MB.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ready-summary-title">Display title</Label>
              <Input id="ready-summary-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="Spain Digital Nomad Visa" className="border-white/10 bg-white/5 text-white" />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={value => setCategory(value as (typeof CATEGORIES)[number])}>
                <SelectTrigger className="border-white/10 bg-white/5 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploadMutation.isPending}>Cancel</Button>
            <Button onClick={() => void submitUpload()} disabled={!file || title.trim().length < 2 || uploadMutation.isPending} className="bg-[#5BA3B8] text-[#07111f] hover:bg-[#73b4c4]">
              {uploadMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />} Add summary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this ready summary?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.title} will disappear immediately for every user. Its audit history is retained and the stored PDF is no longer referenced.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })} className="bg-red-600 text-white hover:bg-red-700">
              {deleteMutation.isPending ? "Deleting…" : "Delete summary"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
