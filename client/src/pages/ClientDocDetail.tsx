import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ClientDocumentationPayments } from "@/components/ClientDocumentationPayments";
import { ClientDocumentWorkflowRow } from "@/components/ClientDocumentWorkflowRow";
import { ClientDocumentationSpainMilestones } from "@/components/ClientDocumentationSpainMilestones";
import { ClientPortalUploadsPanel } from "@/components/ClientPortalUploadsPanel";
import { ClientStageEvidenceUpload } from "@/components/ClientStageEvidenceUpload";
import {
  ArrowLeft, CheckCircle2, Circle, Clock, AlertTriangle,
  FileCheck, CalendarDays, CalendarClock,
  FileDown, Trash2, Link2, Mail, UserCheck, ShieldCheck
} from "lucide-react";

type ActionType = "receive" | "schengen" | "appointment" | null;
type Stage = "preparation" | "spain_team_received" | "submission" | "approved";

export default function ClientDocDetail() {
  const { id } = useParams<{ id: string }>();
  const clientId = parseInt(id ?? "0");
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [activeTab, setActiveTab] = useState("main");

  const [receiveDates, setReceiveDates] = useState<Record<number, string>>({});
  const [dateInputs, setDateInputs] = useState<Record<string, string>>({
    schengenDate: "",
    embassyAppointmentDate: "",
  });
  // Stage workflow state
  const [stageInputs, setStageInputs] = useState<Record<string, string>>({});
  const [showStageDialog, setShowStageDialog] = useState<Stage | null>(null);

  // New fields state
  const [showParalegalDialog, setShowParalegalDialog] = useState(false);
  const [selectedParalegal, setSelectedParalegal] = useState<string>("");
  const [showDriveLinkDialog, setShowDriveLinkDialog] = useState(false);
  const [driveLinkInput, setDriveLinkInput] = useState("");
  const [showEmbassyEmailDialog, setShowEmbassyEmailDialog] = useState(false);
  const [embassyEmailDateInput, setEmbassyEmailDateInput] = useState("");
  const [showSchengenDialog, setShowSchengenDialog] = useState(false);
  const [schengenVisaValid, setSchengenVisaValid] = useState<boolean | null>(null);
  const [schengenExpiryInput, setSchengenExpiryInput] = useState("");
  const [showSpouseDialog, setShowSpouseDialog] = useState(false);
  const [spouseNameInput, setSpouseNameInput] = useState("");
  const [showChildrenDialog, setShowChildrenDialog] = useState(false);
  const [childrenEdit, setChildrenEdit] = useState<{ name: string; age: number }[]>([]);
  const [showPortalFolderDialog, setShowPortalFolderDialog] = useState(false);
  const [selectedPortalUser, setSelectedPortalUser] = useState("");

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.clientDocs.get.useQuery(
    { id: clientId },
    { enabled: isAuthenticated && clientId > 0 }
  );

  const { data: report } = trpc.clientDocs.report.useQuery(
    { id: clientId },
    { enabled: isAuthenticated && clientId > 0 }
  );
  const { data: portalAccounts = [], isLoading: portalAccountsLoading } = trpc.clientPortalAdmin.listAccounts.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin" && showPortalFolderDialog,
  });
  const linkFolderMutation = trpc.clientPortalAdmin.linkDocumentationFolder.useMutation({
    onSuccess: result => {
      toast.success(result.alreadyLinked ? "This folder is already linked" : "Documentation folder assigned to the client app");
      setShowPortalFolderDialog(false);
      setSelectedPortalUser("");
    },
    onError: error => toast.error(error.message),
  });

  const receiveMutation = trpc.clientDocs.receiveDocuments.useMutation({
    onSuccess: () => {
      toast.success("Documents marked as received");
      setActiveAction(null);
      setReceiveDates({});
      utils.clientDocs.get.invalidate({ id: clientId });
      utils.clientDocs.report.invalidate({ id: clientId });
    },
    onError: (e) => toast.error(e.message),
  });

  const datesMutation = trpc.clientDocs.setDates.useMutation({
    onSuccess: () => {
      toast.success("Dates updated");
      setActiveAction(null);
      utils.clientDocs.get.invalidate({ id: clientId });
      utils.clientDocs.report.invalidate({ id: clientId });
    },
    onError: (e) => toast.error(e.message),
  });

  const stageMutation = trpc.clientDocs.updateStage.useMutation({
    onSuccess: () => {
      toast.success("Stage updated");
      setShowStageDialog(null);
      setStageInputs({});
      utils.clientDocs.get.invalidate({ id: clientId });
      utils.clientDocs.report.invalidate({ id: clientId });
      utils.clientDocs.dashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const paralegalMutation = trpc.clientDocs.updateParalegal.useMutation({
    onSuccess: () => {
      toast.success("Paralegal updated");
      setShowParalegalDialog(false);
      utils.clientDocs.get.invalidate({ id: clientId });
    },
    onError: (e) => toast.error(e.message),
  });

  const driveLinkMutation = trpc.clientDocs.setDriveLink.useMutation({
    onSuccess: () => {
      toast.success("Google Drive link saved");
      setShowDriveLinkDialog(false);
      utils.clientDocs.get.invalidate({ id: clientId });
    },
    onError: (e) => toast.error(e.message),
  });

  const embassyEmailMutation = trpc.clientDocs.setEmbassyEmailDate.useMutation({
    onSuccess: () => {
      toast.success("Embassy attestation email date saved");
      setShowEmbassyEmailDialog(false);
      utils.clientDocs.get.invalidate({ id: clientId });
    },
    onError: (e) => toast.error(e.message),
  });

  const schengenVisaMutation = trpc.clientDocs.setSchengenVisa.useMutation({
    onSuccess: () => {
      toast.success("Schengen visa status updated");
      setShowSchengenDialog(false);
      utils.clientDocs.get.invalidate({ id: clientId });
    },
    onError: (e) => toast.error(e.message),
  });

  const spouseNameMutation = trpc.clientDocs.setSpouseName.useMutation({
    onSuccess: () => {
      toast.success("Spouse name updated");
      setShowSpouseDialog(false);
      utils.clientDocs.get.invalidate({ id: clientId });
    },
    onError: (e) => toast.error(e.message),
  });

  const updateChildrenMutation = trpc.clientDocs.updateChildren.useMutation({
    onSuccess: () => {
      toast.success("Children data updated");
      setShowChildrenDialog(false);
      utils.clientDocs.get.invalidate({ id: clientId });
    },
    onError: (e) => toast.error(e.message),
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteMutation = trpc.clientDocs.deleteClient.useMutation({
    onSuccess: () => {
      toast.success("تم حذف العميل بنجاح");
      setLocation("/docs");
    },
    onError: (e) => toast.error(e.message),
  });
  const exportMutation = trpc.clientDocs.exportChecklist.useMutation({
    onSuccess: (result) => {
      const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${result.clientName} - قائمة المستندات.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم تحميل قائمة المستندات");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="w-8 h-8 border-2 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const docs = data.documents ?? [];
  const mainDocs = docs.filter(d => d.category === "main");
  const familyDocs = docs.filter(d => d.category === "family");

  const notReceived = docs.filter(d => !d.received);
  const receivedDocs = docs.filter(d => d.received);
  const needsMofaDocs = receivedDocs.filter(d => d.requiresMofa && !(d.mofaReceived || d.mofaAttested));
  const needsEmbassyDocs = receivedDocs.filter(d => d.requiresEmbassy && !(d.embassyReceived || d.embassyAttested));

  const totalDocs = docs.length;
  const receivedCount = receivedDocs.length;
  const mofaCount = docs.filter(d => !d.requiresMofa || d.mofaReceived || d.mofaAttested).length;
  const embassyCount = docs.filter(d => !d.requiresEmbassy || d.embassyReceived || d.embassyAttested).length;
  const progressPct = totalDocs > 0 ? Math.round((receivedCount / totalDocs) * 100) : 0;

  const handleReceiveSubmit = () => {
    const items = Object.entries(receiveDates)
      .filter(([, date]) => date)
      .map(([docId, receivedDate]) => ({ docId: parseInt(docId), receivedDate }));
    if (items.length === 0) { toast.error("Please select at least one document and set its date"); return; }
    receiveMutation.mutate({ clientCaseId: clientId, items });
  };

  const handleDatesSubmit = (field: "schengenDate" | "embassyAppointmentDate") => {
    const val = dateInputs[field];
    if (!val) { toast.error("Please select a date"); return; }
    datesMutation.mutate({ id: clientId, [field]: val });
  };

  const openAction = (action: ActionType) => {
    setReceiveDates({});
    setActiveAction(action);
  };

  const DocStatusIcon = ({ doc }: { doc: typeof docs[0] }) => {
    if (!doc.received) return <Circle className="w-4 h-4 text-gray-300" />;
    if (doc.requiresMofa && !doc.mofaAttested) return <Clock className="w-4 h-4 text-amber-500" />;
    if (doc.requiresEmbassy && !doc.embassyAttested) return <Clock className="w-4 h-4 text-orange-500" />;
    return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  };

  const DocRow = ({ doc }: { doc: typeof docs[0] }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        <DocStatusIcon doc={doc} />
        <span className="text-sm text-gray-700">{doc.docName}</span>
      </div>
      <div className="flex items-center gap-2">
        {doc.requiresMofa && (
          <Badge className={`text-xs px-1.5 py-0 border ${doc.mofaAttested ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
            MOFA
          </Badge>
        )}
        {doc.requiresEmbassy && (
          <Badge className={`text-xs px-1.5 py-0 border ${doc.embassyAttested ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-orange-50 text-orange-700 border-orange-200"}`}>
            Embassy
          </Badge>
        )}
        {doc.received && doc.receivedDate && (
          <span className="text-xs text-gray-400">{new Date(doc.receivedDate).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );

  const caseData = data as any;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 bg-white min-h-screen">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => setLocation("/docs")} className="text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{data.clientName}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {data.clientCode} · {data.applicationType === "freelancer" ? "Freelancer" : "Business Owner"} · {data.maritalStatus === "family" ? "Family" : "Single"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 flex-wrap justify-end">
          {/* Export Checklist Button */}
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-[#1e3a5f]/30 text-[#1e3a5f] hover:bg-[#1e3a5f]/5 gap-1.5"
            onClick={() => exportMutation.mutate({ id: clientId })}
            disabled={exportMutation.isPending}
          >
            <FileDown className="w-3.5 h-3.5" />
            {exportMutation.isPending ? "جاري التحميل..." : "تصدير القائمة"}
          </Button>
          {user?.role === "admin" && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs border-[#5ba3b8]/40 text-[#1e7184] hover:bg-[#5ba3b8]/10 gap-1.5"
              onClick={() => setShowPortalFolderDialog(true)}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Assign to Client App
            </Button>
          )}
          {/* Delete Client Button */}
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-red-300 text-red-600 hover:bg-red-50 gap-1.5"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="w-3.5 h-3.5" />
            حذف العميل
          </Button>
          {/* Stage Selector */}
          <select
            value={caseData.stage ?? "preparation"}
            onChange={e => {
              const newStage = e.target.value as Stage;
              if (newStage === "preparation") {
                stageMutation.mutate({ id: clientId, stage: "preparation" });
              } else {
                setStageInputs({});
                setShowStageDialog(newStage);
              }
            }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer focus:outline-none ${
              (caseData.stage ?? "preparation") === "preparation"
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : (caseData.stage ?? "preparation") === "spain_team_received"
                ? "bg-cyan-50 text-cyan-700 border-cyan-200"
                : (caseData.stage ?? "preparation") === "submission"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            <option value="preparation">📋 Preparation</option>
            <option value="spain_team_received">🇪🇸 Spain Team Received</option>
            <option value="submission">📤 Submission</option>
            <option value="approved">✅ Approved</option>
          </select>
        </div>
      </div>

      {/* ── Client Info Panel ── */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Paralegal */}
        <div>
          <p className="text-xs text-gray-400 mb-1">Paralegal</p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">{caseData.paralegal ?? <span className="text-gray-400 italic">Not assigned</span>}</span>
            <button
              onClick={() => {
                setSelectedParalegal(caseData.paralegal ?? "");
                setShowParalegalDialog(true);
              }}
              className="text-[#1e3a5f] hover:text-[#16304f] text-xs underline"
            >
              {caseData.paralegal ? "Change" : "Assign"}
            </button>
          </div>
        </div>
        {/* Consultant */}
        <div>
          <p className="text-xs text-gray-400 mb-1">Consultant</p>
          <span className="text-sm font-medium text-gray-800">{data.consultant}</span>
        </div>
        {/* Schengen Visa */}
        <div>
          <p className="text-xs text-gray-400 mb-1">Schengen Visa</p>
          <div className="flex items-center gap-2">
            {caseData.schengenVisaValid ? (
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                ✓ Valid
                {caseData.schengenExpiryDate && (
                  <span className="ml-1 text-emerald-600">— {new Date(caseData.schengenExpiryDate).toLocaleDateString()}</span>
                )}
              </span>
            ) : (
              <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">✗ None</span>
            )}
            <button
              onClick={() => {
                setSchengenVisaValid(caseData.schengenVisaValid ?? false);
                setSchengenExpiryInput(caseData.schengenExpiryDate ?? "");
                setShowSchengenDialog(true);
              }}
              className="text-[#1e3a5f] hover:text-[#16304f] text-xs underline"
            >
              Edit
            </button>
          </div>
        </div>
        {/* Google Drive Link */}
        <div>
          <p className="text-xs text-gray-400 mb-1">Google Drive</p>
          <div className="flex items-center gap-2">
            {caseData.driveLink ? (
              <a
                href={caseData.driveLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#1e3a5f] underline flex items-center gap-1 truncate max-w-[120px]"
              >
                <Link2 className="w-3 h-3 flex-shrink-0" />
                Open Folder
              </a>
            ) : (
              <span className="text-xs text-gray-400 italic">No link</span>
            )}
            <button
              onClick={() => {
                setDriveLinkInput(caseData.driveLink ?? "");
                setShowDriveLinkDialog(true);
              }}
              className="text-[#1e3a5f] hover:text-[#16304f] text-xs underline"
            >
              {caseData.driveLink ? "Edit" : "Add"}
            </button>
          </div>
        </div>
        {/* Spouse Name (family only) */}
        {caseData.maritalStatus === "family" && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Spouse Name</p>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800">
                {(caseData as any).spouseName ?? <span className="text-gray-400 italic">Not set</span>}
              </span>
              <button
                onClick={() => {
                  setSpouseNameInput((caseData as any).spouseName ?? "");
                  setShowSpouseDialog(true);
                }}
                className="text-[#1e3a5f] hover:text-[#16304f] text-xs underline"
              >
                {(caseData as any).spouseName ? "Edit" : "Add"}
              </button>
            </div>
          </div>
        )}
        {/* Children (family only) */}
        {caseData.maritalStatus === "family" && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Children</p>
            <div className="flex items-center gap-2">
              {(() => {
                const kids = (() => { try { return JSON.parse((caseData as any).childrenData ?? "[]"); } catch { return []; } })();
                return kids.length > 0 ? (
                  <span className="text-sm font-medium text-gray-800">{kids.length} child{kids.length !== 1 ? "ren" : ""}</span>
                ) : (
                  <span className="text-sm text-gray-400 italic">None</span>
                );
              })()}
              <button
                onClick={() => {
                  const kids = (() => { try { return JSON.parse((caseData as any).childrenData ?? "[]"); } catch { return []; } })();
                  setChildrenEdit(kids.length > 0 ? kids : []);
                  setShowChildrenDialog(true);
                }}
                className="text-[#1e3a5f] hover:text-[#16304f] text-xs underline"
              >
                Edit
              </button>
            </div>
          </div>
        )}
      </div>

      <ClientDocumentationPayments
        clientCaseId={clientId}
        contractDriveLink={caseData.contractDriveLink}
        finClientId={caseData.finClientId}
      />

      <ClientDocumentationSpainMilestones clientCaseId={clientId} clientCase={caseData} />

      {/* ── Embassy Attestation Email Date Panel ── */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-900">Embassy Attestation Email Request</p>
            {caseData.embassyEmailDate ? (
              <p className="text-xs text-blue-700 mt-0.5">
                Sent on: <strong>{new Date(caseData.embassyEmailDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</strong>
                <span className="ml-2 text-blue-500">— Follow-up reminder will be sent 15 days after this date</span>
              </p>
            ) : (
              <p className="text-xs text-blue-500 mt-0.5">No date recorded yet. Set the date when the email was sent.</p>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-blue-300 text-blue-700 hover:bg-blue-100 gap-1.5 text-xs flex-shrink-0"
          onClick={() => {
            setEmbassyEmailDateInput(caseData.embassyEmailDate ?? "");
            setShowEmbassyEmailDialog(true);
          }}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          {caseData.embassyEmailDate ? "Update Date" : "Set Date"}
        </Button>
      </div>

      {/* Stage Info Panel */}
      {caseData.stage !== "preparation" && (
        <div className={`rounded-xl border p-4 ${caseData.stage === "spain_team_received" ? "border-cyan-200 bg-cyan-50" : caseData.stage === "submission" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
          <h3 className={`mb-3 text-sm font-semibold ${caseData.stage === "spain_team_received" ? "text-cyan-800" : caseData.stage === "submission" ? "text-amber-800" : "text-emerald-800"}`}>
            {caseData.stage === "spain_team_received" ? "🇪🇸 Spain Team Received" : caseData.stage === "submission" ? "📤 Submission Details" : "✅ Approval Details"}
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Spain Team Received", value: caseData.spainTeamReceivedDate },
              { label: "Submission Date", value: caseData.submissionDate },
              { label: "Expected Approval", value: caseData.expectedApprovalDate },
              { label: "Sent to Sworn Translator", value: caseData.translationDate },
              { label: "Approval Date", value: caseData.approvalDate },
              { label: "Settlement Fee Date", value: caseData.settlementFeeDate },
            ].filter(item => item.value).map(item => (
              <div key={item.label} className="rounded-lg border border-white/80 bg-white px-3 py-2">
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className="mt-0.5 text-sm font-medium text-gray-900">{new Date(item.value).toLocaleDateString()}</p>
              </div>
            ))}
            {caseData.submissionReceiptLink ? <a href={caseData.submissionReceiptLink} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/80 bg-white px-3 py-2 text-xs font-medium text-amber-800 hover:underline">Open Submission Receipt</a> : null}
            {caseData.approvalLetterLink ? <a href={caseData.approvalLetterLink} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/80 bg-white px-3 py-2 text-xs font-medium text-emerald-800 hover:underline">Open Approval Letter</a> : null}
            {caseData.settlementFeeAmount ? (
              <div className="rounded-lg border border-white/80 bg-white px-3 py-2"><p className="text-xs text-gray-500">Settlement Fee</p><p className="mt-0.5 text-sm font-medium text-gray-900">€ {caseData.settlementFeeAmount}</p></div>
            ) : null}
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Document Collection Progress</span>
          <span className="text-sm font-semibold text-gray-900">{receivedCount}/{totalDocs}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#1e3a5f] rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: "Received", value: `${receivedCount}/${totalDocs}`, color: "text-[#1e3a5f]" },
            { label: "MOFA Done", value: `${mofaCount}/${totalDocs}`, color: "text-amber-600" },
            { label: "Embassy Done", value: `${embassyCount}/${totalDocs}`, color: "text-orange-600" },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className={`text-lg font-semibold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Dates row */}
      {(data.schengenDate || data.embassyAppointmentDate || data.expectedSubmissionDate) && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Schengen Expiry", value: data.schengenDate, color: "border-purple-200 bg-purple-50 text-purple-800" },
            { label: "Embassy Appointment", value: data.embassyAppointmentDate, color: "border-cyan-200 bg-cyan-50 text-cyan-800" },
            { label: "Expected Submission", value: data.expectedSubmissionDate, color: "border-emerald-200 bg-emerald-50 text-emerald-800" },
          ].filter(d => d.value).map(d => (
            <div key={d.label} className={`rounded-lg border px-3 py-2 ${d.color}`}>
              <p className="text-xs opacity-70">{d.label}</p>
              <p className="text-sm font-medium mt-0.5">{new Date(d.value!).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { action: "receive" as ActionType, icon: FileCheck, label: "Receive Documents", count: notReceived.length, bg: "bg-[#1e3a5f] hover:bg-[#16304f]" },
          { action: "schengen" as ActionType, icon: CalendarDays, label: "Schengen Date", count: null, bg: "bg-purple-700 hover:bg-purple-800" },
          { action: "appointment" as ActionType, icon: CalendarClock, label: "Embassy Appointment", count: null, bg: "bg-cyan-700 hover:bg-cyan-800" },
        ].map(btn => (
          <button
            key={btn.action}
            onClick={() => openAction(btn.action)}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-white text-sm font-medium transition-all shadow-sm ${btn.bg}`}
          >
            <btn.icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-left">{btn.label}</span>
            {btn.count !== null && btn.count > 0 && (
              <span className="bg-white/20 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                {btn.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Document tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gray-100 border border-gray-200">
          <TabsTrigger value="main" className="data-[state=active]:bg-white data-[state=active]:text-gray-900 text-gray-500">
            Main Applicant ({mainDocs.length})
          </TabsTrigger>
          {familyDocs.length > 0 && (
            <TabsTrigger value="family" className="data-[state=active]:bg-white data-[state=active]:text-gray-900 text-gray-500">
              Family ({familyDocs.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="report" className="data-[state=active]:bg-white data-[state=active]:text-gray-900 text-gray-500">
            Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="main" className="mt-4">
          <div className="mb-4"><ClientPortalUploadsPanel clientCaseId={clientId} /></div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            {mainDocs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No main applicant documents</p>
            ) : (
              mainDocs.map(doc => <ClientDocumentWorkflowRow key={doc.id} clientCaseId={clientId} document={doc} />)
            )}
          </div>
        </TabsContent>

        {familyDocs.length > 0 && (
          <TabsContent value="family" className="mt-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              {familyDocs.map(doc => <ClientDocumentWorkflowRow key={doc.id} clientCaseId={clientId} document={doc} />)}
            </div>
          </TabsContent>
        )}

        <TabsContent value="report" className="mt-4 space-y-4">
          {report ? (
            <>
              {/* Expiry warnings */}
              {report.expiryWarnings && report.expiryWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Expiry Warnings
                  </h3>
                  <ul className="space-y-1">
                    {report.expiryWarnings.map((w: any, i: number) => (
                      <li key={i} className="text-xs text-amber-700 flex items-start gap-2">
                        <span className="mt-0.5">•</span>
                        {w.docName} — expires {new Date(w.expiryDate).toLocaleDateString()} ({w.daysLeft} days left)
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Not yet received */}
              {report.notReceived && report.notReceived.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Documents Not Yet Received ({report.notReceived.length})</h3>
                  <div className="space-y-2">
                    {report.notReceived.map((d: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <Circle className="w-3 h-3 text-gray-300 flex-shrink-0" />
                        {d.docName}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending MOFA */}
              {report.receivedNotMofa && report.receivedNotMofa.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Pending MOFA Attestation ({report.receivedNotMofa.length})</h3>
                  <div className="space-y-2">
                    {report.receivedNotMofa.map((d: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <Clock className="w-3 h-3 text-amber-500 flex-shrink-0" />
                        {d.docName}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending Embassy */}
              {report.receivedNotEmbassy && report.receivedNotEmbassy.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Pending Embassy Attestation ({report.receivedNotEmbassy.length})</h3>
                  <div className="space-y-2">
                    {report.receivedNotEmbassy.map((d: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <Clock className="w-3 h-3 text-orange-500 flex-shrink-0" />
                        {d.docName}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Summary</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Total Documents", value: report.summary.totalDocs },
                    { label: "Received", value: report.summary.receivedCount },
                    { label: "MOFA Complete", value: report.summary.mofaComplete },
                    { label: "Embassy Complete", value: report.summary.embassyComplete },
                  ].map(s => (
                    <div key={s.label} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-lg font-semibold text-[#1e3a5f]">{s.value}</p>
                      <p className="text-xs text-gray-500">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">Loading report...</p>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Dialogs ── */}

      {/* Receive Documents */}
      <Dialog open={activeAction === "receive"} onOpenChange={o => !o && setActiveAction(null)}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Receive Documents</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-400 -mt-2">Select documents and set the date each was received</p>
          <div className="space-y-3 mt-2">
            {notReceived.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">All documents have been received</p>
            ) : (
              notReceived.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                  <Checkbox
                    id={`doc-${doc.id}`}
                    checked={doc.id in receiveDates}
                    onCheckedChange={checked => {
                      if (checked) {
                        setReceiveDates(prev => ({ ...prev, [doc.id]: new Date().toISOString().split("T")[0] }));
                      } else {
                        setReceiveDates(prev => { const n = { ...prev }; delete n[doc.id]; return n; });
                      }
                    }}
                    className="border-gray-400"
                  />
                  <Label htmlFor={`doc-${doc.id}`} className="flex-1 text-sm text-gray-700 cursor-pointer">{doc.docName}</Label>
                  {doc.id in receiveDates && (
                    <input
                      type="date"
                      value={receiveDates[doc.id]}
                      onChange={e => setReceiveDates(prev => ({ ...prev, [doc.id]: e.target.value }))}
                      className="text-xs border border-gray-300 rounded px-2 py-1 text-gray-700 bg-white"
                    />
                  )}
                </div>
              ))
            )}
          </div>
          {notReceived.length > 0 && (
            <Button
              className="w-full bg-[#1e3a5f] hover:bg-[#16304f] text-white mt-2"
              onClick={handleReceiveSubmit}
              disabled={receiveMutation.isPending}
            >
              {receiveMutation.isPending ? "Saving..." : "Mark as Received"}
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Schengen Date */}
      <Dialog open={activeAction === "schengen"} onOpenChange={o => !o && setActiveAction(null)}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Schengen Visa Expiry Date</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-400 -mt-2">Set the client's current Schengen visa expiry date</p>
          <input
            type="date"
            value={dateInputs.schengenDate}
            onChange={e => setDateInputs(prev => ({ ...prev, schengenDate: e.target.value }))}
            className="w-full border border-gray-300 text-gray-900 rounded-lg px-3 py-2 mt-2 bg-white focus:outline-none focus:border-[#1e3a5f]"
          />
          <Button
            className="w-full bg-[#1e3a5f] hover:bg-[#16304f] text-white mt-2"
            onClick={() => handleDatesSubmit("schengenDate")}
            disabled={datesMutation.isPending}
          >
            {datesMutation.isPending ? "Saving..." : "Save Date"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Embassy Appointment */}
      <Dialog open={activeAction === "appointment"} onOpenChange={o => !o && setActiveAction(null)}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Embassy Appointment Date</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-400 -mt-2">Set the scheduled embassy appointment date</p>
          <input
            type="date"
            value={dateInputs.embassyAppointmentDate}
            onChange={e => setDateInputs(prev => ({ ...prev, embassyAppointmentDate: e.target.value }))}
            className="w-full border border-gray-300 text-gray-900 rounded-lg px-3 py-2 mt-2 bg-white focus:outline-none focus:border-[#1e3a5f]"
          />
          <Button
            className="w-full bg-[#1e3a5f] hover:bg-[#16304f] text-white mt-2"
            onClick={() => handleDatesSubmit("embassyAppointmentDate")}
            disabled={datesMutation.isPending}
          >
            {datesMutation.isPending ? "Saving..." : "Save Date"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* ── Paralegal Assignment Dialog ── */}
      <Dialog open={showParalegalDialog} onOpenChange={setShowParalegalDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gray-900 flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              {caseData.paralegal ? "Change Paralegal" : "Assign Paralegal"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-400 -mt-2">Select the paralegal responsible for this client's documentation</p>
          <div className="mt-3 space-y-2">
            {["Madonna", "Monica", "Marina"].map(p => (
              <div
                key={p}
                onClick={() => setSelectedParalegal(p)}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedParalegal === p
                    ? "border-[#1e3a5f] bg-[#1e3a5f]/5"
                    : "border-gray-200 bg-gray-50 hover:border-gray-300"
                }`}
              >
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                  selectedParalegal === p ? "bg-[#1e3a5f] border-[#1e3a5f]" : "border-gray-400"
                }`}>
                  {selectedParalegal === p && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <span className="text-sm text-gray-700 font-medium">{p}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            {caseData.paralegal && (
              <Button
                variant="outline"
                size="sm"
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => paralegalMutation.mutate({ id: clientId, paralegal: null })}
                disabled={paralegalMutation.isPending}
              >
                Remove
              </Button>
            )}
            <Button
              className="flex-1 bg-[#1e3a5f] hover:bg-[#16304f] text-white"
              disabled={!selectedParalegal || paralegalMutation.isPending}
              onClick={() => paralegalMutation.mutate({ id: clientId, paralegal: selectedParalegal as any })}
            >
              {paralegalMutation.isPending ? "Saving..." : "Confirm Assignment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Google Drive Link Dialog ── */}
      <Dialog open={showDriveLinkDialog} onOpenChange={setShowDriveLinkDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gray-900 flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Google Drive Link
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-400 -mt-2">Paste the Google Drive folder link for this client's documents</p>
          <Input
            type="url"
            placeholder="https://drive.google.com/drive/folders/..."
            value={driveLinkInput}
            onChange={e => setDriveLinkInput(e.target.value)}
            className="mt-3 border-gray-300 text-gray-900 placeholder:text-gray-400"
          />
          <div className="flex gap-2 mt-3">
            {caseData.driveLink && (
              <Button
                variant="outline"
                size="sm"
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => driveLinkMutation.mutate({ id: clientId, driveLink: null })}
                disabled={driveLinkMutation.isPending}
              >
                Remove
              </Button>
            )}
            <Button
              className="flex-1 bg-[#1e3a5f] hover:bg-[#16304f] text-white"
              disabled={!driveLinkInput.trim() || driveLinkMutation.isPending}
              onClick={() => driveLinkMutation.mutate({ id: clientId, driveLink: driveLinkInput.trim() })}
            >
              {driveLinkMutation.isPending ? "Saving..." : "Save Link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Embassy Attestation Email Date Dialog ── */}
      <Dialog open={showEmbassyEmailDialog} onOpenChange={setShowEmbassyEmailDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gray-900 flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Embassy Attestation Email Date
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-400 -mt-2">
            Set the date when the Embassy Attestation email request was sent.
            A follow-up reminder will be automatically sent to the paralegal and consultant 15 days after this date.
          </p>
          <input
            type="date"
            value={embassyEmailDateInput}
            onChange={e => setEmbassyEmailDateInput(e.target.value)}
            className="w-full border border-gray-300 text-gray-900 rounded-lg px-3 py-2 mt-3 bg-white focus:outline-none focus:border-[#1e3a5f]"
          />
          <div className="flex gap-2 mt-3">
            {caseData.embassyEmailDate && (
              <Button
                variant="outline"
                size="sm"
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => embassyEmailMutation.mutate({ id: clientId, embassyEmailDate: null })}
                disabled={embassyEmailMutation.isPending}
              >
                Clear
              </Button>
            )}
            <Button
              className="flex-1 bg-[#1e3a5f] hover:bg-[#16304f] text-white"
              disabled={!embassyEmailDateInput || embassyEmailMutation.isPending}
              onClick={() => embassyEmailMutation.mutate({ id: clientId, embassyEmailDate: embassyEmailDateInput })}
            >
              {embassyEmailMutation.isPending ? "Saving..." : "Save Date"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Schengen Visa Status Dialog ── */}
      <Dialog open={showSchengenDialog} onOpenChange={setShowSchengenDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gray-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Schengen Visa Status
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-400 -mt-2">
            Update the client's Schengen visa status. Reminders will be sent 30 and 20 days before expiry.
          </p>
          <div className="mt-3 space-y-3">
            <div className="flex gap-3">
              <Button
                type="button"
                size="sm"
                variant={schengenVisaValid === true ? "default" : "outline"}
                className={schengenVisaValid === true
                  ? "bg-green-600 hover:bg-green-700 text-white border-green-600 flex-1"
                  : "border-gray-300 text-gray-700 flex-1"}
                onClick={() => setSchengenVisaValid(true)}
              >
                ✓ Has Valid Visa
              </Button>
              <Button
                type="button"
                size="sm"
                variant={schengenVisaValid === false ? "default" : "outline"}
                className={schengenVisaValid === false
                  ? "bg-red-600 hover:bg-red-700 text-white border-red-600 flex-1"
                  : "border-gray-300 text-gray-700 flex-1"}
                onClick={() => { setSchengenVisaValid(false); setSchengenExpiryInput(""); }}
              >
                ✗ No Visa
              </Button>
            </div>
            {schengenVisaValid === true && (
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Expiry Date <span className="text-red-500">*</span></Label>
                <input
                  type="date"
                  value={schengenExpiryInput}
                  onChange={e => setSchengenExpiryInput(e.target.value)}
                  className="w-full border border-gray-300 text-gray-900 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#1e3a5f]"
                />
              </div>
            )}
          </div>
          <Button
            className="w-full bg-[#1e3a5f] hover:bg-[#16304f] text-white mt-4"
            disabled={
              schengenVisaValid === null ||
              (schengenVisaValid === true && !schengenExpiryInput) ||
              schengenVisaMutation.isPending
            }
            onClick={() => schengenVisaMutation.mutate({
              id: clientId,
              schengenVisaValid: schengenVisaValid!,
              schengenExpiryDate: schengenVisaValid ? schengenExpiryInput : null,
            })}
          >
            {schengenVisaMutation.isPending ? "Saving..." : "Update Visa Status"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* ── Stage Change Dialog ── */}
      <Dialog open={showStageDialog !== null} onOpenChange={o => !o && setShowStageDialog(null)}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900">
              {showStageDialog === "spain_team_received" ? "Move to Spain Team Received" : showStageDialog === "submission" ? "Move to Submission Stage" : "Mark as Approved"}
            </DialogTitle>
          </DialogHeader>

          {showStageDialog === "spain_team_received" && (
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Spain Team Received Date <span className="text-red-500">*</span></label>
                <input type="date" value={stageInputs.spainTeamReceivedDate ?? ""} onChange={e => setStageInputs(p => ({ ...p, spainTeamReceivedDate: e.target.value }))} className="w-full border border-gray-300 text-gray-900 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#1e3a5f] text-sm" />
              </div>
              <Button className="w-full bg-cyan-700 hover:bg-cyan-800 text-white" disabled={!stageInputs.spainTeamReceivedDate || stageMutation.isPending} onClick={() => stageMutation.mutate({ id: clientId, stage: "spain_team_received", spainTeamReceivedDate: stageInputs.spainTeamReceivedDate || null })}>
                {stageMutation.isPending ? "Saving..." : "Confirm Spain Team Received"}
              </Button>
            </div>
          )}

          {showStageDialog === "submission" && (
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Submission Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={stageInputs.submissionDate ?? ""}
                  onChange={e => setStageInputs(p => ({ ...p, submissionDate: e.target.value }))}
                  className="w-full border border-gray-300 text-gray-900 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#1e3a5f] text-sm"
                />
                {stageInputs.submissionDate && (() => {
                  const start = new Date(stageInputs.submissionDate);
                  let wd = 0; const cur = new Date(start);
                  while (wd < 25) { cur.setDate(cur.getDate() + 1); const d = cur.getDay(); if (d !== 0 && d !== 6) wd++; }
                  return <p className="text-xs text-emerald-700 mt-1">Expected Approval Date: <strong>{cur.toLocaleDateString()}</strong> (25 working days)</p>;
                })()}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Submission Receipt Link <span className="text-red-500">*</span></label>
                <input type="url" placeholder="https://drive.google.com/..." value={stageInputs.submissionReceiptLink ?? ""} onChange={e => setStageInputs(p => ({ ...p, submissionReceiptLink: e.target.value }))} className="w-full border border-gray-300 text-gray-900 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#1e3a5f] text-sm" />
                <div className="mt-2"><ClientStageEvidenceUpload clientCaseId={clientId} kind="submission_receipt" onUploaded={url => setStageInputs(p => ({ ...p, submissionReceiptLink: url }))} /></div>
              </div>
              <Button
                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                disabled={!stageInputs.submissionDate || !stageInputs.submissionReceiptLink || stageMutation.isPending}
                onClick={() => stageMutation.mutate({
                  id: clientId,
                  stage: "submission",
                  submissionDate: stageInputs.submissionDate || null,
                  submissionReceiptLink: stageInputs.submissionReceiptLink || null,
                })}
              >
                {stageMutation.isPending ? "Saving..." : "Confirm Submission Stage"}
              </Button>
            </div>
          )}

          {showStageDialog === "approved" && (
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Approval Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={stageInputs.approvalDate ?? ""}
                  onChange={e => setStageInputs(p => ({ ...p, approvalDate: e.target.value }))}
                  className="w-full border border-gray-300 text-gray-900 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#1e3a5f] text-sm"
                />
                {stageInputs.approvalDate && data.expectedApprovalDate && (() => {
                  const actual = new Date(stageInputs.approvalDate);
                  const expected = new Date(data.expectedApprovalDate);
                  const onTime = actual <= expected;
                  return (
                    <p className={`text-xs mt-1 font-medium ${onTime ? "text-emerald-700" : "text-red-600"}`}>
                      {onTime ? "✓ Within expected date" : "✗ After expected date"} (Expected: {expected.toLocaleDateString()})
                    </p>
                  );
                })()}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Approval Letter Link <span className="text-red-500">*</span></label>
                <input type="url" placeholder="https://drive.google.com/..." value={stageInputs.approvalLetterLink ?? ""} onChange={e => setStageInputs(p => ({ ...p, approvalLetterLink: e.target.value }))} className="w-full border border-gray-300 text-gray-900 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#1e3a5f] text-sm" />
                <div className="mt-2"><ClientStageEvidenceUpload clientCaseId={clientId} kind="approval_letter" onUploaded={url => setStageInputs(p => ({ ...p, approvalLetterLink: url }))} /></div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">After-Settlement Fee Amount (€) <span className="text-gray-400">(optional)</span></label>
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={stageInputs.settlementFeeAmount ?? ""}
                  onChange={e => setStageInputs(p => ({ ...p, settlementFeeAmount: e.target.value }))}
                  className="w-full border border-gray-300 text-gray-900 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#1e3a5f] text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Settlement Fee Payment Date <span className="text-gray-400">(optional)</span></label>
                <input
                  type="date"
                  value={stageInputs.settlementFeeDate ?? ""}
                  onChange={e => setStageInputs(p => ({ ...p, settlementFeeDate: e.target.value }))}
                  className="w-full border border-gray-300 text-gray-900 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#1e3a5f] text-sm"
                />
              </div>
              <Button
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white"
                disabled={!stageInputs.approvalDate || !stageInputs.approvalLetterLink || stageMutation.isPending}
                onClick={() => stageMutation.mutate({
                  id: clientId,
                  stage: "approved",
                  approvalDate: stageInputs.approvalDate || null,
                  approvalLetterLink: stageInputs.approvalLetterLink || null,
                  settlementFeeAmount: stageInputs.settlementFeeAmount || null,
                  settlementFeeDate: stageInputs.settlementFeeDate || null,
                })}
              >
                {stageMutation.isPending ? "Saving..." : "Confirm Approval"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Client Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              حذف العميل
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm text-gray-700">
              هل أنت متأكد من حذف العميل <span className="font-semibold text-gray-900">{data.clientName}</span>؟
            </p>
            <p className="text-xs text-red-500">
              سيتم حذف جميع بيانات العميل ومستنداته بشكل نهائي ولا يمكن التراجع.
            </p>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteMutation.isPending}
              >
                إلغاء
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={() => deleteMutation.mutate({ id: clientId })}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "جاري الحذف..." : "حذف نهائياً"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Spouse Name Dialog */}
      <Dialog open={showSpouseDialog} onOpenChange={setShowSpouseDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Spouse Name</DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <Input
              placeholder="Enter spouse / wife name..."
              value={spouseNameInput}
              onChange={e => setSpouseNameInput(e.target.value)}
              className="border-gray-300 text-gray-900"
            />
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowSpouseDialog(false)}>Cancel</Button>
              <Button
                size="sm"
                className="flex-1 bg-[#1e3a5f] hover:bg-[#16304f] text-white"
                onClick={() => spouseNameMutation.mutate({ id: clientId, spouseName: spouseNameInput || null })}
                disabled={spouseNameMutation.isPending}
              >
                {spouseNameMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign this CRM documentation folder to a client-app account */}
      <Dialog open={showPortalFolderDialog} onOpenChange={setShowPortalFolderDialog}>
        <DialogContent className="max-w-md bg-white border-gray-200 text-gray-900">
          <DialogHeader>
            <DialogTitle className="text-gray-900 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-[#5ba3b8]" />Assign folder to Client App</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <p className="text-sm text-gray-600">This will make <strong>{data.clientName}</strong>’s documentation folder visible in the selected client account.</p>
            {portalAccountsLoading ? <p className="text-sm text-gray-500">Loading client accounts…</p> : portalAccounts.length === 0 ? <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">Create the client’s username and password in Client Portal Administration first.</p> : <select value={selectedPortalUser} onChange={event => setSelectedPortalUser(event.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900"><option value="">Select client account</option>{portalAccounts.map(account => <option key={account.publicId} value={account.publicId}>{account.clientName} · {account.username} · {account.email}</option>)}</select>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowPortalFolderDialog(false)}>Cancel</Button>
              <Button className="flex-1 bg-[#1e3a5f] hover:bg-[#16304f] text-white" disabled={!selectedPortalUser || linkFolderMutation.isPending} onClick={() => linkFolderMutation.mutate({ portalUserPublicId: selectedPortalUser, clientCaseId: clientId, makePrimary: true })}>{linkFolderMutation.isPending ? "Assigning…" : "Assign folder"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Children Edit Dialog */}
      <Dialog open={showChildrenDialog} onOpenChange={setShowChildrenDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Edit Children</DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-4">
            <div className="flex items-center gap-2">
              <Label className="text-gray-700 text-sm">Number of Children</Label>
              <div className="flex items-center gap-2 ml-auto">
                <Button type="button" variant="outline" size="sm" className="w-8 h-8 p-0"
                  onClick={() => setChildrenEdit(e => e.slice(0, Math.max(0, e.length - 1)))}
                  disabled={childrenEdit.length <= 0}>−</Button>
                <span className="w-8 text-center font-medium">{childrenEdit.length}</span>
                <Button type="button" variant="outline" size="sm" className="w-8 h-8 p-0"
                  onClick={() => setChildrenEdit(e => [...e, { name: "", age: 10 }])}>+</Button>
              </div>
            </div>
            {childrenEdit.length > 0 && (
              <div className="space-y-3">
                {childrenEdit.map((child, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-14 shrink-0">Child {idx + 1}</span>
                    <Input
                      placeholder="Name (optional)"
                      value={child.name}
                      onChange={e => setChildrenEdit(arr => arr.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                      className="border-gray-300 text-gray-900 flex-1"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <Input
                        type="number" min={0} max={50}
                        value={child.age}
                        onChange={e => setChildrenEdit(arr => arr.map((c, i) => i === idx ? { ...c, age: parseInt(e.target.value) || 0 } : c))}
                        className="border-gray-300 text-gray-900 w-16 text-center"
                      />
                      <span className="text-xs text-gray-500">yrs</span>
                    </div>
                    <span className="text-xs shrink-0 px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: child.age < 18 ? '#dbeafe' : '#ede9fe', color: child.age < 18 ? '#1d4ed8' : '#6d28d9' }}>
                      {child.age < 18 ? "<18" : "18+"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowChildrenDialog(false)}>Cancel</Button>
              <Button
                size="sm"
                className="flex-1 bg-[#1e3a5f] hover:bg-[#16304f] text-white"
                onClick={() => updateChildrenMutation.mutate({ id: clientId, children: childrenEdit })}
                disabled={updateChildrenMutation.isPending}
              >
                {updateChildrenMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
