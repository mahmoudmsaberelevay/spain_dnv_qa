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
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, Circle, Clock, AlertTriangle,
  FileCheck, Stamp, Building2, CalendarDays, ClipboardList,
  CalendarClock, Check
} from "lucide-react";

type ActionType = "receive" | "mofa" | "embassy" | "schengen" | "appointment" | "submission" | null;
type Stage = "preparation" | "submission" | "approved";

export default function ClientDocDetail() {
  const { id } = useParams<{ id: string }>();
  const clientId = parseInt(id ?? "0");
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [activeTab, setActiveTab] = useState("main");

  const [receiveDates, setReceiveDates] = useState<Record<number, string>>({});
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([]);
  const [dateInputs, setDateInputs] = useState<Record<string, string>>({
    schengenDate: "",
    embassyAppointmentDate: "",
    expectedSubmissionDate: "",
  });
  // Stage workflow state
  const [stageInputs, setStageInputs] = useState<Record<string, string>>({});
  const [showStageDialog, setShowStageDialog] = useState<Stage | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.clientDocs.get.useQuery(
    { id: clientId },
    { enabled: isAuthenticated && clientId > 0 }
  );

  const { data: report } = trpc.clientDocs.report.useQuery(
    { id: clientId },
    { enabled: isAuthenticated && clientId > 0 }
  );

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

  const mofaMutation = trpc.clientDocs.markMofa.useMutation({
    onSuccess: () => {
      toast.success("MOFA attestation recorded");
      setActiveAction(null);
      setSelectedDocIds([]);
      utils.clientDocs.get.invalidate({ id: clientId });
      utils.clientDocs.report.invalidate({ id: clientId });
    },
    onError: (e) => toast.error(e.message),
  });

  const embassyMutation = trpc.clientDocs.markEmbassy.useMutation({
    onSuccess: () => {
      toast.success("Embassy attestation recorded");
      setActiveAction(null);
      setSelectedDocIds([]);
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
  const needsMofaDocs = receivedDocs.filter(d => d.requiresMofa && !d.mofaAttested);
  const needsEmbassyDocs = receivedDocs.filter(d => d.requiresEmbassy && !d.embassyAttested);

  const totalDocs = docs.length;
  const receivedCount = receivedDocs.length;
  const mofaCount = docs.filter(d => !d.requiresMofa || d.mofaAttested).length;
  const embassyCount = docs.filter(d => !d.requiresEmbassy || d.embassyAttested).length;
  const progressPct = totalDocs > 0 ? Math.round((receivedCount / totalDocs) * 100) : 0;

  const handleReceiveSubmit = () => {
    const items = Object.entries(receiveDates)
      .filter(([, date]) => date)
      .map(([docId, receivedDate]) => ({ docId: parseInt(docId), receivedDate }));
    if (items.length === 0) { toast.error("Please select at least one document and set its date"); return; }
    receiveMutation.mutate({ clientCaseId: clientId, items });
  };

  const handleMofaSubmit = () => {
    if (selectedDocIds.length === 0) { toast.error("Please select at least one document"); return; }
    mofaMutation.mutate({ clientCaseId: clientId, docIds: selectedDocIds });
  };

  const handleEmbassySubmit = () => {
    if (selectedDocIds.length === 0) { toast.error("Please select at least one document"); return; }
    embassyMutation.mutate({ clientCaseId: clientId, docIds: selectedDocIds });
  };

  const handleDatesSubmit = (field: "schengenDate" | "embassyAppointmentDate" | "expectedSubmissionDate") => {
    const val = dateInputs[field];
    if (!val) { toast.error("Please select a date"); return; }
    datesMutation.mutate({ id: clientId, [field]: val });
  };

  const openAction = (action: ActionType) => {
    setSelectedDocIds([]);
    setReceiveDates({});
    setActiveAction(action);
  };

  const toggleDocId = (docId: number) => {
    setSelectedDocIds(prev => prev.includes(docId) ? prev.filter(x => x !== docId) : [...prev, docId]);
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
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Paralegal: <span className="text-gray-600 font-medium">{data.paralegal}</span></span>
            <span className="text-gray-200">|</span>
            <span>Consultant: <span className="text-gray-600 font-medium">{data.consultant}</span></span>
          </div>
          {/* Stage Selector */}
          <select
            value={(data as any).stage ?? "preparation"}
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
              ((data as any).stage ?? "preparation") === "preparation"
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : ((data as any).stage ?? "preparation") === "submission"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            <option value="preparation">📋 Preparation</option>
            <option value="submission">📤 Submission</option>
            <option value="approved">✅ Approved</option>
          </select>
        </div>
      </div>

      {/* Stage Info Panel */}
      {((data as any).stage === "submission" || (data as any).stage === "approved") && (
        <div className={`rounded-xl border p-4 ${
          (data as any).stage === "submission" ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"
        }`}>
          <h3 className={`text-sm font-semibold mb-3 ${
            (data as any).stage === "submission" ? "text-amber-800" : "text-emerald-800"
          }`}>
            {(data as any).stage === "submission" ? "📤 Submission Details" : "✅ Approval Details"}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(data as any).stage === "submission" && [
              { label: "Submission Date", value: (data as any).submissionDate },
              { label: "Expected Approval", value: (data as any).expectedApprovalDate },
              { label: "Translation Done", value: (data as any).translationDate },
            ].map(f => f.value ? (
              <div key={f.label} className="bg-white rounded-lg px-3 py-2 border border-amber-100">
                <p className="text-xs text-amber-600 opacity-70">{f.label}</p>
                <p className="text-sm font-medium text-amber-900 mt-0.5">{new Date(f.value).toLocaleDateString()}</p>
              </div>
            ) : null)}
            {(data as any).stage === "approved" && [
              { label: "Approval Date", value: (data as any).approvalDate },
              { label: "Expected Approval", value: (data as any).expectedApprovalDate },
              { label: "Settlement Fee Date", value: (data as any).settlementFeeDate },
              { label: "Biometrics Date", value: (data as any).biometricsDate },
            ].map(f => f.value ? (
              <div key={f.label} className="bg-white rounded-lg px-3 py-2 border border-emerald-100">
                <p className="text-xs text-emerald-600 opacity-70">{f.label}</p>
                <p className="text-sm font-medium text-emerald-900 mt-0.5">{new Date(f.value).toLocaleDateString()}</p>
              </div>
            ) : null)}
            {(data as any).stage === "approved" && (data as any).settlementFeeAmount && (
              <div className="bg-white rounded-lg px-3 py-2 border border-emerald-100">
                <p className="text-xs text-emerald-600 opacity-70">Settlement Fee</p>
                <p className="text-sm font-medium text-emerald-900 mt-0.5">€ {(data as any).settlementFeeAmount}</p>
              </div>
            )}
            {(data as any).stage === "approved" && (data as any).approvalDate && (data as any).expectedApprovalDate && (
              <div className={`rounded-lg px-3 py-2 border ${
                new Date((data as any).approvalDate) <= new Date((data as any).expectedApprovalDate)
                  ? "bg-emerald-100 border-emerald-200"
                  : "bg-red-50 border-red-200"
              }`}>
                <p className="text-xs opacity-70">On-Time Status</p>
                <p className="text-sm font-semibold mt-0.5">
                  {new Date((data as any).approvalDate) <= new Date((data as any).expectedApprovalDate) ? "✓ On Time" : "✗ Delayed"}
                </p>
              </div>
            )}
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
          { action: "mofa" as ActionType, icon: Stamp, label: "MOFA Attestation", count: needsMofaDocs.length, bg: "bg-amber-600 hover:bg-amber-700" },
          { action: "embassy" as ActionType, icon: Building2, label: "Embassy Attestation", count: needsEmbassyDocs.length, bg: "bg-orange-600 hover:bg-orange-700" },
          { action: "schengen" as ActionType, icon: CalendarDays, label: "Schengen Date", count: null, bg: "bg-purple-700 hover:bg-purple-800" },
          { action: "appointment" as ActionType, icon: CalendarClock, label: "Embassy Appointment", count: null, bg: "bg-cyan-700 hover:bg-cyan-800" },
          { action: "submission" as ActionType, icon: ClipboardList, label: "Submission Date", count: null, bg: "bg-emerald-700 hover:bg-emerald-800" },
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
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            {mainDocs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No main applicant documents</p>
            ) : (
              mainDocs.map(doc => <DocRow key={doc.id} doc={doc} />)
            )}
          </div>
        </TabsContent>

        {familyDocs.length > 0 && (
          <TabsContent value="family" className="mt-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              {familyDocs.map(doc => <DocRow key={doc.id} doc={doc} />)}
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

      {/* MOFA Attestation */}
      <Dialog open={activeAction === "mofa"} onOpenChange={o => !o && setActiveAction(null)}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-gray-900">MOFA Attestation</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-400 -mt-2">Select documents that have been attested by MOFA</p>
          <div className="space-y-2 mt-2">
            {needsMofaDocs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No documents pending MOFA attestation</p>
            ) : (
              needsMofaDocs.map(doc => (
                <div
                  key={doc.id}
                  onClick={() => toggleDocId(doc.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedDocIds.includes(doc.id)
                      ? "border-amber-400 bg-amber-50"
                      : "border-gray-200 bg-gray-50 hover:border-gray-300"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    selectedDocIds.includes(doc.id) ? "bg-amber-500 border-amber-500" : "border-gray-400"
                  }`}>
                    {selectedDocIds.includes(doc.id) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-sm text-gray-700">{doc.docName}</span>
                </div>
              ))
            )}
          </div>
          {needsMofaDocs.length > 0 && (
            <Button
              className="w-full bg-amber-600 hover:bg-amber-700 text-white mt-2"
              onClick={handleMofaSubmit}
              disabled={mofaMutation.isPending}
            >
              {mofaMutation.isPending ? "Saving..." : "Mark MOFA Attested"}
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Embassy Attestation */}
      <Dialog open={activeAction === "embassy"} onOpenChange={o => !o && setActiveAction(null)}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Embassy Attestation</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-400 -mt-2">Select documents that have been attested by the Embassy</p>
          <div className="space-y-2 mt-2">
            {needsEmbassyDocs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No documents pending Embassy attestation</p>
            ) : (
              needsEmbassyDocs.map(doc => (
                <div
                  key={doc.id}
                  onClick={() => toggleDocId(doc.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedDocIds.includes(doc.id)
                      ? "border-orange-400 bg-orange-50"
                      : "border-gray-200 bg-gray-50 hover:border-gray-300"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    selectedDocIds.includes(doc.id) ? "bg-orange-500 border-orange-500" : "border-gray-400"
                  }`}>
                    {selectedDocIds.includes(doc.id) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-sm text-gray-700">{doc.docName}</span>
                </div>
              ))
            )}
          </div>
          {needsEmbassyDocs.length > 0 && (
            <Button
              className="w-full bg-orange-600 hover:bg-orange-700 text-white mt-2"
              onClick={handleEmbassySubmit}
              disabled={embassyMutation.isPending}
            >
              {embassyMutation.isPending ? "Saving..." : "Mark Embassy Attested"}
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

      {/* Submission Date */}
      <Dialog open={activeAction === "submission"} onOpenChange={o => !o && setActiveAction(null)}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Expected Submission Date</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-400 -mt-2">Set the expected date for submitting the application</p>
          <input
            type="date"
            value={dateInputs.expectedSubmissionDate}
            onChange={e => setDateInputs(prev => ({ ...prev, expectedSubmissionDate: e.target.value }))}
            className="w-full border border-gray-300 text-gray-900 rounded-lg px-3 py-2 mt-2 bg-white focus:outline-none focus:border-[#1e3a5f]"
          />
          <Button
            className="w-full bg-[#1e3a5f] hover:bg-[#16304f] text-white mt-2"
            onClick={() => handleDatesSubmit("expectedSubmissionDate")}
            disabled={datesMutation.isPending}
          >
            {datesMutation.isPending ? "Saving..." : "Save Date"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* ── Stage Change Dialog ── */}
      <Dialog open={showStageDialog !== null} onOpenChange={o => !o && setShowStageDialog(null)}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900">
              {showStageDialog === "submission" ? "Move to Submission Stage" : "Mark as Approved"}
            </DialogTitle>
          </DialogHeader>

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
                <label className="text-xs font-medium text-gray-700 block mb-1">Translation Done Date <span className="text-gray-400">(optional)</span></label>
                <input
                  type="date"
                  value={stageInputs.translationDate ?? ""}
                  onChange={e => setStageInputs(p => ({ ...p, translationDate: e.target.value }))}
                  className="w-full border border-gray-300 text-gray-900 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#1e3a5f] text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">Date when all document translations were completed</p>
              </div>
              <Button
                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                disabled={!stageInputs.submissionDate || stageMutation.isPending}
                onClick={() => stageMutation.mutate({
                  id: clientId,
                  stage: "submission",
                  submissionDate: stageInputs.submissionDate || null,
                  translationDate: stageInputs.translationDate || null,
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
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Biometrics Date <span className="text-gray-400">(optional)</span></label>
                <input
                  type="date"
                  value={stageInputs.biometricsDate ?? ""}
                  onChange={e => setStageInputs(p => ({ ...p, biometricsDate: e.target.value }))}
                  className="w-full border border-gray-300 text-gray-900 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#1e3a5f] text-sm"
                />
              </div>
              <Button
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white"
                disabled={!stageInputs.approvalDate || stageMutation.isPending}
                onClick={() => stageMutation.mutate({
                  id: clientId,
                  stage: "approved",
                  approvalDate: stageInputs.approvalDate || null,
                  settlementFeeAmount: stageInputs.settlementFeeAmount || null,
                  settlementFeeDate: stageInputs.settlementFeeDate || null,
                  biometricsDate: stageInputs.biometricsDate || null,
                })}
              >
                {stageMutation.isPending ? "Saving..." : "Confirm Approval"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
