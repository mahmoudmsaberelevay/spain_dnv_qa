import { useState, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Shield, ArrowLeft, ArrowRight, CheckCircle2, Upload, X, FileText,
  Eye, Loader2, SkipForward, User, Users, Building2, ScrollText, Baby, ShieldCheck, BarChart3
} from "lucide-react";

type DocType =
  | "passport_main" | "passport_family" | "company_owned" | "client_company"
  | "recommendation_letter" | "freelancing_contract" | "birth_certificate"
  | "marriage_certificate" | "police_clearance";

interface WizardStep {
  id: number;
  title: string;
  subtitle: string;
  docType: DocType | DocType[];
  icon: any;
  skippable?: boolean;
  multiple?: boolean;
}

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 1,
    title: "Main Applicant Passport",
    subtitle: "Upload the main applicant's passport scan. AI will extract personal data automatically.",
    docType: "passport_main",
    icon: User,
  },
  {
    id: 2,
    title: "Family Member Passports",
    subtitle: "Upload passports for any family members included in the application.",
    docType: "passport_family",
    icon: Users,
    skippable: true,
    multiple: true,
  },
  {
    id: 3,
    title: "Company Owned by Applicant",
    subtitle: "Upload the company registration/details for the company owned by the main applicant.",
    docType: "company_owned",
    icon: Building2,
    skippable: true,
  },
  {
    id: 4,
    title: "Client Company Details",
    subtitle: "Upload the registration or details of the client company the applicant works with.",
    docType: "client_company",
    icon: Building2,
  },
  {
    id: 5,
    title: "Recommendation Letter",
    subtitle: "Upload the recommendation letter from the client company.",
    docType: "recommendation_letter",
    icon: ScrollText,
  },
  {
    id: 6,
    title: "Freelancing Contract",
    subtitle: "Upload the freelancing agreement or contract with the client.",
    docType: "freelancing_contract",
    icon: ScrollText,
  },
  {
    id: 7,
    title: "Birth & Marriage Certificates",
    subtitle: "Upload birth certificates for dependents and marriage certificate if applicable.",
    docType: ["birth_certificate", "marriage_certificate"],
    icon: Baby,
    skippable: true,
    multiple: true,
  },
  {
    id: 8,
    title: "Police Clearance Certificates",
    subtitle: "Upload police clearance certificates for the applicant and family members.",
    docType: "police_clearance",
    icon: ShieldCheck,
    multiple: true,
  },
];

interface UploadedFile {
  file: File;
  docType: DocType;
  preview?: string;
  uploading?: boolean;
  uploaded?: boolean;
  docId?: number;
}

export default function UploadWizard() {
  const { id } = useParams<{ id: string }>();
  const caseId = parseInt(id || "0");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const [currentStep, setCurrentStep] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [extractingOCR, setExtractingOCR] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: caseData } = trpc.cases.get.useQuery(
    { id: caseId },
    { enabled: isAuthenticated && !!caseId }
  );

  const uploadDoc = trpc.documents.upload.useMutation();
  const extractPassport = trpc.analysis.extractPassportData.useMutation();

  const step = WIZARD_STEPS[currentStep];
  const stepDocTypes = Array.isArray(step.docType) ? step.docType : [step.docType];
  const stepFiles = uploadedFiles.filter(f => stepDocTypes.includes(f.docType));

  const handleFileSelect = useCallback(async (files: FileList | null, docType?: DocType) => {
    if (!files || files.length === 0) return;
    const selectedDocType = docType || (Array.isArray(step.docType) ? step.docType[0] : step.docType);

    for (const file of Array.from(files)) {
      const ALLOWED_TYPES = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      const isImage = file.type.startsWith("image/");
      const isAllowed = isImage || ALLOWED_TYPES.includes(file.type);
      if (!isAllowed) {
        toast.error(`${file.name}: Supported formats are images (JPG, PNG, TIFF, HEIC, WebP), PDF, and Word (.doc/.docx)`);
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name}: File size must be under 20MB`);
        continue;
      }

      const isImageFile = file.type.startsWith("image/");
      const preview = isImageFile ? URL.createObjectURL(file) : undefined;
      const newFile: UploadedFile = { file, docType: selectedDocType, preview, uploading: true };

      setUploadedFiles(prev => [...prev, newFile]);

      try {
        const base64 = await fileToBase64(file);
        const result = await uploadDoc.mutateAsync({
          caseId,
          docType: selectedDocType,
          fileName: file.name,
          fileBase64: base64,
          mimeType: file.type,
          fileSize: file.size,
        });

        setUploadedFiles(prev =>
          prev.map(f => f === newFile ? { ...f, uploading: false, uploaded: true, docId: result?.id } : f)
        );

        toast.success(`${file.name} uploaded successfully`);

        // Auto-extract passport data for main passport
        if (selectedDocType === "passport_main" && result?.id) {
          setExtractingOCR(true);
          try {
            await extractPassport.mutateAsync({ documentId: result.id });
            toast.success("Passport data extracted successfully");
          } catch (e) {
            toast.error("OCR extraction failed — you can retry from the case page");
          } finally {
            setExtractingOCR(false);
          }
        }
      } catch (e: any) {
        setUploadedFiles(prev => prev.filter(f => f !== newFile));
        toast.error(`Failed to upload ${file.name}: ${e.message}`);
      }
    }
  }, [step, caseId, uploadDoc, extractPassport]);

  const removeFile = (file: UploadedFile) => {
    if (file.preview) URL.revokeObjectURL(file.preview);
    setUploadedFiles(prev => prev.filter(f => f !== file));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const canProceed = stepFiles.some(f => f.uploaded) || step.skippable;
  const isLastStep = currentStep === WIZARD_STEPS.length - 1;
  const totalUploaded = uploadedFiles.filter(f => f.uploaded).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/cases/${caseId}`)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back to Case</span>
            </button>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                <Shield className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span className="font-semibold text-sm">Document Upload</span>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {totalUploaded} document{totalUploaded !== 1 ? "s" : ""} uploaded
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Progress steps */}
        <div className="mb-8">
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {WIZARD_STEPS.map((s, idx) => {
              const StepIcon = s.icon;
              const isComplete = uploadedFiles.some(f =>
                (Array.isArray(s.docType) ? s.docType : [s.docType]).includes(f.docType) && f.uploaded
              );
              const isActive = idx === currentStep;
              const isPast = idx < currentStep;
              return (
                <div key={s.id} className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setCurrentStep(idx)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : isComplete
                        ? "bg-green-100 text-green-700"
                        : isPast
                        ? "bg-muted text-muted-foreground hover:bg-muted/80"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <StepIcon className="w-3 h-3" />
                    )}
                    <span className="hidden sm:block">{s.title.split(" ").slice(0, 2).join(" ")}</span>
                    <span className="sm:hidden">{s.id}</span>
                  </button>
                  {idx < WIZARD_STEPS.length - 1 && (
                    <div className={`w-4 h-px flex-shrink-0 ${isPast || isActive ? "bg-primary/30" : "bg-border"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Upload area */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border border-border bg-card p-6">
              {/* Step header */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <step.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-foreground">{step.title}</h2>
                      {step.skippable && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Optional</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Step {currentStep + 1} of {WIZARD_STEPS.length}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.subtitle}</p>
              </div>

              {/* Drop zone */}
              <div
                className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
                }`}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.doc,.docx"
                  multiple={step.multiple}
                  onChange={e => handleFileSelect(e.target.files)}
                />
                <Upload className={`w-8 h-8 mx-auto mb-3 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                <p className="font-medium text-foreground mb-1">
                  {isDragging ? "Drop files here" : "Click or drag files here"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Supports images (JPG, PNG, TIFF, WebP, HEIC), PDF, Word (.doc/.docx) — up to 20MB
                  {step.multiple && " · Multiple files allowed"}
                </p>
              </div>

              {/* Multiple doc type selector for step 7 */}
              {Array.isArray(step.docType) && (
                <div className="mt-4 flex gap-2">
                  {step.docType.map(dt => (
                    <Button
                      key={dt}
                      variant="outline"
                      size="sm"
                      onClick={() => { fileInputRef.current?.click(); }}
                      className="text-xs"
                    >
                      Upload {dt === "birth_certificate" ? "Birth Certificate" : "Marriage Certificate"}
                    </Button>
                  ))}
                </div>
              )}

              {/* OCR status */}
              {extractingOCR && (
                <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20">
                  <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-primary">Extracting passport data...</p>
                    <p className="text-xs text-muted-foreground">AI is reading the passport. This takes a few seconds.</p>
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="mt-6 flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setCurrentStep(s => Math.max(0, s - 1))}
                  disabled={currentStep === 0}
                  className="gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Previous
                </Button>
                <div className="flex items-center gap-2">
                  {step.skippable && stepFiles.filter(f => f.uploaded).length === 0 && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (isLastStep) navigate(`/cases/${caseId}/report`);
                        else setCurrentStep(s => s + 1);
                      }}
                      className="gap-2 text-muted-foreground"
                    >
                      <SkipForward className="w-4 h-4" />
                      Skip
                    </Button>
                  )}
                  {isLastStep ? (
                    <Button
                      onClick={() => navigate(`/cases/${caseId}/report`)}
                      disabled={!canProceed}
                      className="gap-2"
                    >
                      <BarChart3 className="w-4 h-4" />
                      Run Analysis
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setCurrentStep(s => s + 1)}
                      disabled={!canProceed}
                      className="gap-2"
                    >
                      Next Step
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Uploaded files panel */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-border bg-card">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-sm text-foreground">Current Step Files</h3>
                <p className="text-xs text-muted-foreground">{stepFiles.length} file(s) for this step</p>
              </div>
              {stepFiles.length === 0 ? (
                <div className="p-6 text-center">
                  <Upload className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No files uploaded for this step yet</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {stepFiles.map((f, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3">
                      {f.preview ? (
                        <img src={f.preview} alt="" className="w-10 h-10 rounded object-cover border border-border flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{f.file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(f.file.size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {f.uploading && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />}
                        {f.uploaded && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                        <button
                          onClick={() => removeFile(f)}
                          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"
                          disabled={f.uploading}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* All uploaded summary */}
            {totalUploaded > 0 && (
              <div className="mt-4 rounded-xl border border-border bg-card p-4">
                <h3 className="font-semibold text-sm text-foreground mb-3">All Uploaded Documents</h3>
                <div className="space-y-1.5">
                  {WIZARD_STEPS.map(s => {
                    const types = Array.isArray(s.docType) ? s.docType : [s.docType];
                    const count = uploadedFiles.filter(f => types.includes(f.docType) && f.uploaded).length;
                    if (count === 0) return null;
                    const StepIcon = s.icon;
                    return (
                      <div key={s.id} className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0" />
                        <StepIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-foreground">{s.title}</span>
                        {count > 1 && <span className="text-muted-foreground">({count})</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
  });
}
