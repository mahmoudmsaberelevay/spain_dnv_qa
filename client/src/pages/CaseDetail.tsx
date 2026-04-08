import { useLocation, useParams } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Shield, ArrowLeft, Upload, BarChart3, FileText, CheckCircle2,
  AlertTriangle, Clock, User, Mail, Globe, Trash2,
  FileImage, FileBadge, Building2, ScrollText, Baby, ShieldCheck
} from "lucide-react";
import { format } from "date-fns";

const DOC_TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  passport_main: { label: "Main Passport", icon: FileText, color: "text-blue-600" },
  passport_family: { label: "Family Passport", icon: FileText, color: "text-blue-500" },
  company_owned: { label: "Company (Owned)", icon: Building2, color: "text-purple-600" },
  client_company: { label: "Client Company", icon: Building2, color: "text-purple-500" },
  recommendation_letter: { label: "Recommendation Letter", icon: ScrollText, color: "text-amber-600" },
  freelancing_contract: { label: "Freelancing Contract", icon: ScrollText, color: "text-amber-500" },
  birth_certificate: { label: "Birth Certificate", icon: Baby, color: "text-green-600" },
  marriage_certificate: { label: "Marriage Certificate", icon: Baby, color: "text-green-500" },
  police_clearance: { label: "Police Clearance", icon: ShieldCheck, color: "text-red-600" },
  education_certificate: { label: "Education Certificate", icon: FileBadge, color: "text-indigo-600" },
  other: { label: "Other Document", icon: FileImage, color: "text-gray-600" },
};

const STATUS_CONFIG = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-700" },
  complete: { label: "Complete", className: "bg-green-100 text-green-700" },
  issues_found: { label: "Issues Found", className: "bg-red-100 text-red-700" },
} as const;

const DOC_STATUS_CONFIG = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-700" },
  pass: { label: "Pass", className: "bg-green-100 text-green-700" },
  fail: { label: "Fail", className: "bg-red-100 text-red-700" },
  warning: { label: "Warning", className: "bg-amber-100 text-amber-700" },
} as const;

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const caseId = parseInt(id || "0");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const { data: caseData, isLoading: caseLoading } = trpc.cases.get.useQuery(
    { id: caseId },
    { enabled: isAuthenticated && !!caseId }
  );

  const { data: documents, isLoading: docsLoading, refetch: refetchDocs } = trpc.documents.list.useQuery(
    { caseId },
    { enabled: isAuthenticated && !!caseId }
  );

  const deleteDoc = trpc.documents.delete.useMutation({
    onSuccess: () => { toast.success("Document removed"); refetchDocs(); },
    onError: (e) => toast.error(e.message),
  });

  if (caseLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Loading case...</p>
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="font-serif text-2xl font-semibold mb-2">Case Not Found</h2>
          <Button onClick={() => navigate("/analysis")} variant="outline">Back to Cases</Button>
        </div>
      </div>
    );
  }

  const status = STATUS_CONFIG[caseData.status] || STATUS_CONFIG.draft;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/analysis")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Cases</span>
            </button>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                <Shield className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span className="font-semibold text-sm truncate max-w-48">{caseData.clientName}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/analysis/cases/${caseId}/upload`)} className="gap-1.5">
              <Upload className="w-3.5 h-3.5" />
              Upload Docs
            </Button>
            {(documents?.length ?? 0) > 0 && (
              <Button size="sm" onClick={() => navigate(`/analysis/cases/${caseId}/report`)} className="gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" />
                {caseData.analysisCompleted ? "View Report" : "Run Analysis"}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Case info */}
          <div className="lg:col-span-1 space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-foreground">Client Information</h2>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`}>
                  {status.label}
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Client Name</p>
                    <p className="font-medium text-sm">{caseData.clientName}</p>
                  </div>
                </div>
                {caseData.clientEmail && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="w-3.5 h-3.5" />
                    <span>{caseData.clientEmail}</span>
                  </div>
                )}
                {caseData.clientNationality && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Globe className="w-3.5 h-3.5" />
                    <span>{caseData.clientNationality}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t border-border">
                  <Clock className="w-3 h-3" />
                  <span>Updated {format(new Date(caseData.updatedAt), "MMM d, yyyy")}</span>
                </div>
              </div>
            </div>

            {/* Passport data */}
            {caseData.passportFullName && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Extracted Passport Data
                </h3>
                <div className="space-y-2">
                  {[
                    { label: "Full Name", value: caseData.passportFullName, mono: true },
                    { label: "Passport No.", value: caseData.passportNumber, mono: true },
                    { label: "Date of Birth", value: caseData.passportDob },
                    { label: "Place of Birth", value: caseData.passportPob },
                    { label: "Expiry Date", value: caseData.passportExpiry },
                  ].filter(f => f.value).map(field => (
                    <div key={field.label} className="flex flex-col">
                      <span className="text-xs text-muted-foreground">{field.label}</span>
                      <span className={`text-sm font-medium ${field.mono ? "font-mono" : ""}`}>{field.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {caseData.notes && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-semibold text-foreground mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{caseData.notes}</p>
              </div>
            )}
          </div>

          {/* Right: Documents */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-border bg-card">
              <div className="p-5 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-foreground">Uploaded Documents</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{documents?.length || 0} documents uploaded</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate(`/analysis/cases/${caseId}/upload`)} className="gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  Add Documents
                </Button>
              </div>

              {docsLoading ? (
                <div className="p-8 text-center">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : !documents?.length ? (
                <div className="p-12 text-center">
                  <Upload className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="font-medium text-foreground mb-1">No documents uploaded</p>
                  <p className="text-sm text-muted-foreground mb-4">Start the upload wizard to add client documents.</p>
                  <Button onClick={() => navigate(`/analysis/cases/${caseId}/upload`)} className="gap-2">
                    <Upload className="w-4 h-4" />
                    Start Upload Wizard
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {documents.map(doc => {
                    const config = DOC_TYPE_CONFIG[doc.docType] || DOC_TYPE_CONFIG.other;
                    const statusCfg = DOC_STATUS_CONFIG[doc.analysisStatus] || DOC_STATUS_CONFIG.pending;
                    const DocIcon = config.icon;
                    return (
                      <div key={doc.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors group">
                        <div className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0`}>
                          <DocIcon className={`w-4 h-4 ${config.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground">{config.label}</p>
                          <p className="text-xs text-muted-foreground truncate">{doc.fileName}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.className}`}>
                            {statusCfg.label}
                          </span>
                          <a
                            href={doc.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            onClick={e => e.stopPropagation()}
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={() => deleteDoc.mutate({ id: doc.id })}
                            className="p-1.5 rounded hover:bg-red-50 hover:text-red-600 transition-colors text-muted-foreground opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Analysis CTA */}
            {(documents?.length ?? 0) > 0 && (
              <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-5 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-foreground">
                    {caseData.analysisCompleted ? "Analysis Complete" : "Ready for Analysis"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {caseData.analysisCompleted
                      ? "View the full QA report with scores and recommendations."
                      : "Run the AI analysis to verify all documents and generate a QA report."}
                  </p>
                </div>
                <Button onClick={() => navigate(`/analysis/cases/${caseId}/report`)} className="gap-2 flex-shrink-0">
                  <BarChart3 className="w-4 h-4" />
                  {caseData.analysisCompleted ? "View Report" : "Run Analysis"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
