import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Shield, ArrowLeft, BarChart3, CheckCircle2, XCircle, AlertTriangle,
  Loader2, RefreshCw, Stamp, Building2, ScrollText, FileText, User,
  TrendingUp, ChevronDown, ChevronUp, Info, Star, AlertCircle, Download
} from "lucide-react";

const SEVERITY_CONFIG = {
  critical: { label: "Critical", className: "bg-red-50 border-red-200 text-red-800", icon: XCircle, iconClass: "text-red-500" },
  warning: { label: "Warning", className: "bg-amber-50 border-amber-200 text-amber-800", icon: AlertTriangle, iconClass: "text-amber-500" },
  info: { label: "Info", className: "bg-blue-50 border-blue-200 text-blue-800", icon: Info, iconClass: "text-blue-500" },
} as const;

const PRIORITY_CONFIG = {
  high: { label: "High Priority", className: "bg-red-100 text-red-700" },
  medium: { label: "Medium Priority", className: "bg-amber-100 text-amber-700" },
  low: { label: "Low Priority", className: "bg-green-100 text-green-700" },
} as const;

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#16a34a" : score >= 60 ? "#d97706" : "#dc2626";

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/30" />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={color} strokeWidth="6"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1s ease-out" }}
      />
      <text
        x={size / 2} y={size / 2 + 1}
        textAnchor="middle" dominantBaseline="middle"
        className="rotate-90"
        style={{ transform: `rotate(90deg) translate(0, 0)`, transformOrigin: `${size / 2}px ${size / 2}px`, fill: color, fontSize: size * 0.22, fontWeight: 700 }}
      >
        {score}
      </text>
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = {
    pass: { label: "Pass", className: "bg-green-100 text-green-700", icon: CheckCircle2 },
    fail: { label: "Fail", className: "bg-red-100 text-red-700", icon: XCircle },
    warning: { label: "Warning", className: "bg-amber-100 text-amber-700", icon: AlertTriangle },
    not_uploaded: { label: "Not Uploaded", className: "bg-muted text-muted-foreground", icon: AlertCircle },
    needs_review: { label: "Needs Review", className: "bg-amber-100 text-amber-700", icon: AlertTriangle },
  }[status] || { label: status, className: "bg-muted text-muted-foreground", icon: Info };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function CheckItem({ label, value }: { label: string; value: boolean | null | undefined }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      {value
        ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
        : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
      <span className={value ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

export default function AnalysisReport() {
  const { id } = useParams<{ id: string }>();
  const caseId = parseInt(id || "0");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["stamp", "company", "freelancing", "letter"]));

  const exportReport = trpc.analysis.exportReport.useMutation({
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      toast.success("PDF report ready — opening in new tab.");
      setExporting(false);
    },
    onError: (e) => {
      toast.error(`Export failed: ${e.message}`);
      setExporting(false);
    },
  });

  const { data: caseData } = trpc.cases.get.useQuery({ id: caseId }, { enabled: isAuthenticated && !!caseId });
  const { data: existingResult, refetch: refetchResult } = trpc.analysis.getResult.useQuery(
    { caseId },
    { enabled: isAuthenticated && !!caseId }
  );

  const runAnalysis = trpc.analysis.runFullAnalysis.useMutation({
    onSuccess: () => {
      toast.success("Analysis complete!");
      refetchResult();
      setRunning(false);
    },
    onError: (e) => {
      toast.error(`Analysis failed: ${e.message}`);
      setRunning(false);
    },
  });

  const handleRunAnalysis = async () => {
    setRunning(true);
    await runAnalysis.mutateAsync({ caseId });
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const report = existingResult?.fullReport ? JSON.parse(existingResult.fullReport as string) : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/analysis/cases/${caseId}`)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back to Case</span>
            </button>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                <BarChart3 className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span className="font-semibold text-sm">Analysis Report</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {report && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setExporting(true); exportReport.mutate({ caseId }); }}
                disabled={exporting}
                className="gap-1.5 text-[#1e3a5f] border-[#1e3a5f]/30 hover:bg-[#1e3a5f]/5"
              >
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Export PDF
              </Button>
            )}
            {report && (
              <Button variant="outline" size="sm" onClick={handleRunAnalysis} disabled={running} className="gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${running ? "animate-spin" : ""}`} />
                Re-run
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Client header */}
        {caseData && (
          <div className="mb-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-semibold text-foreground">{caseData.clientName}</h1>
              {caseData.passportFullName && (
                <p className="text-sm text-muted-foreground font-mono">Passport: {caseData.passportFullName}</p>
              )}
            </div>
          </div>
        )}

        {/* No analysis yet */}
        {!report && !running && (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <BarChart3 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h2 className="font-serif text-2xl font-semibold text-foreground mb-2">Run AI Analysis</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              The AI will analyze all uploaded documents, verify stamps, check eligibility criteria, and generate a comprehensive QA report.
            </p>
            <Button onClick={handleRunAnalysis} size="lg" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Start Analysis
            </Button>
          </div>
        )}

        {/* Running state */}
        {running && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-12 text-center">
            <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
            <h2 className="font-serif text-2xl font-semibold text-foreground mb-2">Analyzing Documents...</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              The AI is reading all documents, verifying stamps, checking eligibility, and preparing your comprehensive QA report. This may take 30–60 seconds.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
              {["Reading passports", "Verifying MOFA stamps", "Checking Embassy stamps", "Validating company ownership", "Reviewing freelancing contract", "Analyzing recommendation letter"].map(t => (
                <span key={t} className="px-2 py-1 rounded-full bg-muted">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Report */}
        {report && !running && (
          <div className="space-y-6">
            {/* Overall score */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <ScoreRing score={report.overallScore} size={88} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Overall Score</p>
                    <div className="flex items-center gap-2">
                      <span className="font-serif text-3xl font-bold text-foreground">{report.overallScore}/100</span>
                      <StatusBadge status={report.overallStatus} />
                    </div>
                  </div>
                </div>
                <div className="flex-1 sm:border-l sm:border-border sm:pl-6">
                  <p className="text-sm text-muted-foreground leading-relaxed">{report.executiveSummary}</p>
                </div>
              </div>
            </div>

            {/* Document scores */}
            {report.documentScores?.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Document Checklist
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {report.documentScores.map((doc: any) => (
                    <div key={doc.docType} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                      <div className="w-8 h-8 rounded-lg bg-card flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold" style={{ color: doc.score >= 80 ? "#16a34a" : doc.score >= 60 ? "#d97706" : "#dc2626" }}>
                          {doc.score}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground capitalize">{doc.docType.replace(/_/g, " ")}</p>
                        <p className="text-xs text-muted-foreground truncate">{doc.notes}</p>
                      </div>
                      <StatusBadge status={doc.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stamp verification */}
            {report.stampVerification && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-5 hover:bg-muted/20 transition-colors"
                  onClick={() => toggleSection("stamp")}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Stamp className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <h2 className="font-semibold text-foreground">Stamp Verification</h2>
                      <p className="text-xs text-muted-foreground">MOFA & Spain Embassy attestation — excludes contract & recommendation letter</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={report.stampVerification.status} />
                    {expandedSections.has("stamp") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>
                {expandedSections.has("stamp") && (
                  <div className="px-5 pb-5 border-t border-border pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className={`p-3 rounded-lg border ${report.stampVerification.mofaStampFound ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                        <div className="flex items-center gap-2 mb-1">
                          {report.stampVerification.mofaStampFound
                            ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                            : <XCircle className="w-4 h-4 text-red-500" />}
                          <span className="text-sm font-medium">MOFA Stamp</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Ministry of Foreign Affairs</p>
                      </div>
                      <div className={`p-3 rounded-lg border ${report.stampVerification.embassyStampFound ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                        <div className="flex items-center gap-2 mb-1">
                          {report.stampVerification.embassyStampFound
                            ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                            : <XCircle className="w-4 h-4 text-red-500" />}
                          <span className="text-sm font-medium">Embassy Stamp</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Spain Embassy — Sección Consular</p>
                      </div>
                    </div>
                    {report.stampVerification.documentsWithStamps?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-foreground mb-1.5">Documents with stamps:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {report.stampVerification.documentsWithStamps.map((d: string) => (
                            <span key={d} className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">{d}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {report.stampVerification.documentsWithoutStamps?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-foreground mb-1.5">Documents missing stamps:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {report.stampVerification.documentsWithoutStamps.map((d: string) => (
                            <span key={d} className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">{d}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground leading-relaxed">{report.stampVerification.details}</p>
                  </div>
                )}
              </div>
            )}

            {/* Company owned by applicant */}
            {report.companyOwnership && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-5 hover:bg-muted/20 transition-colors"
                  onClick={() => toggleSection("company")}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <h2 className="font-semibold text-foreground">Applicant’s Company</h2>
                      <p className="text-xs text-muted-foreground">≥50% ownership · operating &gt;1 year</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={report.companyOwnership.status} />
                    {expandedSections.has("company") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>
                {expandedSections.has("company") && (
                  <div className="px-5 pb-5 border-t border-border pt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg border border-border bg-muted/20">
                        <p className="text-xs text-muted-foreground mb-0.5">Ownership Percentage</p>
                        <p className="text-xl font-bold text-foreground">
                          {report.companyOwnership.ownershipPercentage !== null
                            ? `${report.companyOwnership.ownershipPercentage}%`
                            : "100% (assumed — not stated)"}
                        </p>
                      </div>
                      {report.companyOwnership.applicantNameInDocument && (
                        <div className="p-3 rounded-lg border border-border bg-muted/20">
                          <p className="text-xs text-muted-foreground mb-0.5">Name in Document</p>
                          <p className="text-sm font-mono font-medium text-foreground">{report.companyOwnership.applicantNameInDocument}</p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <CheckItem label="Ownership ≥50% (or assumed 100% if not stated)" value={report.companyOwnership.ownershipMeetsThreshold} />
                      <CheckItem label="Applicant is sole owner" value={report.companyOwnership.isSoleOwner} />
                      <CheckItem label="Company operating for more than 1 year" value={report.companyOwnership.companyOperatingMoreThanOneYear} />
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{report.companyOwnership.details}</p>
                  </div>
                )}
              </div>
            )}

            {/* Client company checks */}
            {report.clientCompany && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-5 hover:bg-muted/20 transition-colors"
                  onClick={() => toggleSection("clientCompany")}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <h2 className="font-semibold text-foreground">Client Company</h2>
                      <p className="text-xs text-muted-foreground">Applicant name not present · operating ≥3 years</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={report.clientCompany.status} />
                    {expandedSections.has("clientCompany") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>
                {expandedSections.has("clientCompany") && (
                  <div className="px-5 pb-5 border-t border-border pt-4 space-y-3">
                    <div className="space-y-2">
                      <CheckItem
                        label="Applicant name NOT found in client company docs (required)"
                        value={report.clientCompany.applicantNameAbsent}
                      />
                      <CheckItem
                        label="Client company operating for 3+ years"
                        value={report.clientCompany.operatingThreeYearsOrMore}
                      />
                    </div>
                    {report.clientCompany.applicantNameFound && (
                      <div className="p-3 rounded-lg border border-red-200 bg-red-50">
                        <p className="text-xs font-semibold text-red-700 mb-0.5">⚠ Applicant Name Detected</p>
                        <p className="text-xs text-red-600">"{report.clientCompany.applicantNameFound}" was found in the client company document. This is a critical disqualifying issue.</p>
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground leading-relaxed">{report.clientCompany.details}</p>
                  </div>
                )}
              </div>
            )}

            {/* Freelancing eligibility */}
            {report.freelancingEligibility && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-5 hover:bg-muted/20 transition-colors"
                  onClick={() => toggleSection("freelancing")}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <ScrollText className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <h2 className="font-semibold text-foreground">Freelancing Eligibility</h2>
                      <p className="text-xs text-muted-foreground">Remote & location-independent service check</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={report.freelancingEligibility.status} />
                    {expandedSections.has("freelancing") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>
                {expandedSections.has("freelancing") && (
                  <div className="px-5 pb-5 border-t border-border pt-4 space-y-3">
                    <div className="space-y-2">
                      <CheckItem label="Services are fully remote" value={report.freelancingEligibility.servicesAreRemote} />
                      <CheckItem label="Services are location-independent" value={report.freelancingEligibility.servicesAreLocationIndependent} />
                      <CheckItem label="Services qualify for Spain DNV" value={report.freelancingEligibility.servicesQualifyForDNV} />
                    </div>
                    {report.freelancingEligibility.serviceTypes?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-foreground mb-1.5">Service Types Identified:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {report.freelancingEligibility.serviceTypes.map((s: string) => (
                            <span key={s} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground leading-relaxed">{report.freelancingEligibility.details}</p>
                  </div>
                )}
              </div>
            )}

            {/* Recommendation letter */}
            {report.recommendationLetter && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-5 hover:bg-muted/20 transition-colors"
                  onClick={() => toggleSection("letter")}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <h2 className="font-semibold text-foreground">Recommendation Letter</h2>
                      <p className="text-xs text-muted-foreground">4-element completeness check</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={report.recommendationLetter.status} />
                    {expandedSections.has("letter") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>
                {expandedSections.has("letter") && (
                  <div className="px-5 pb-5 border-t border-border pt-4 space-y-3">
                    <div className="space-y-2">
                      <CheckItem label="Applicant name matches passport exactly" value={report.recommendationLetter.nameMatchesPassport} />
                      <CheckItem label="Service description is present" value={report.recommendationLetter.serviceDescriptionPresent} />
                      <CheckItem label="Yearly income amount is stated" value={report.recommendationLetter.yearlyIncomeStated} />
                      <CheckItem label="No-objection clause for working from Spain" value={report.recommendationLetter.noObjectionClausePresent} />
                    </div>
                    {report.recommendationLetter.nameInLetter && (
                      <div className="p-3 rounded-lg border border-border bg-muted/20">
                        <p className="text-xs text-muted-foreground mb-0.5">Name Found in Letter</p>
                        <p className="text-sm font-mono font-medium text-foreground">{report.recommendationLetter.nameInLetter}</p>
                      </div>
                    )}
                    {report.recommendationLetter.yearlyIncomeAmount && (
                      <div className="p-3 rounded-lg border border-border bg-muted/20">
                        <p className="text-xs text-muted-foreground mb-0.5">Yearly Income Stated</p>
                        <p className="text-sm font-semibold text-foreground">{report.recommendationLetter.yearlyIncomeAmount}</p>
                      </div>
                    )}
                    <div className={`flex items-center gap-2 p-3 rounded-lg border ${report.recommendationLetter.allFourElementsPresent ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                      {report.recommendationLetter.allFourElementsPresent
                        ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        : <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                      <span className="text-sm font-medium">
                        {report.recommendationLetter.allFourElementsPresent
                          ? "All 4 required elements are present"
                          : "Some required elements are missing"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{report.recommendationLetter.details}</p>
                  </div>
                )}
              </div>
            )}

            {/* Flagged issues */}
            {report.flaggedIssues?.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Flagged Issues
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                    {report.flaggedIssues.filter((i: any) => i.severity === "critical").length} critical
                  </span>
                </h2>
                <div className="space-y-3">
                  {report.flaggedIssues.map((issue: any, idx: number) => {
                    const cfg = SEVERITY_CONFIG[issue.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.info;
                    const IssueIcon = cfg.icon;
                    return (
                      <div key={idx} className={`flex gap-3 p-4 rounded-lg border ${cfg.className}`}>
                        <IssueIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${cfg.iconClass}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold uppercase tracking-wide">{issue.severity}</span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs capitalize">{issue.document.replace(/_/g, " ")}</span>
                          </div>
                          <p className="text-sm font-medium mb-1">{issue.issue}</p>
                          <p className="text-xs opacity-80">{issue.action}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {report.recommendations?.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Improvement Recommendations
                </h2>
                <div className="space-y-3">
                  {report.recommendations.map((rec: any, idx: number) => {
                    const cfg = PRIORITY_CONFIG[rec.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.low;
                    return (
                      <div key={idx} className="flex gap-3 p-4 rounded-lg border border-border bg-muted/20">
                        <div className="flex-shrink-0 mt-0.5">
                          <Star className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cfg.className}`}>{cfg.label}</span>
                            <span className="text-xs text-muted-foreground">{rec.category}</span>
                          </div>
                          <p className="text-sm text-foreground leading-relaxed">{rec.recommendation}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
