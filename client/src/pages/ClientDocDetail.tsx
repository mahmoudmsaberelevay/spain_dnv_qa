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
  ChevronRight, CalendarClock, X, Check
} from "lucide-react";

type ActionType = "receive" | "mofa" | "embassy" | "schengen" | "appointment" | "submission" | null;

export default function ClientDocDetail() {
  const { id } = useParams<{ id: string }>();
  const clientId = parseInt(id ?? "0");
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [activeTab, setActiveTab] = useState("main");

  // For receive action: map docId -> date string
  const [receiveDates, setReceiveDates] = useState<Record<number, string>>({});
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([]);
  const [dateInputs, setDateInputs] = useState<Record<string, string>>({
    schengenDate: "",
    embassyAppointmentDate: "",
    expectedSubmissionDate: "",
  });

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

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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

  const toggleDocId = (id: number) => {
    setSelectedDocIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const DocStatusIcon = ({ doc }: { doc: typeof docs[0] }) => {
    if (!doc.received) return <Circle className="w-4 h-4 text-white/20" />;
    if (doc.requiresMofa && !doc.mofaAttested) return <Clock className="w-4 h-4 text-amber-400" />;
    if (doc.requiresEmbassy && !doc.embassyAttested) return <Clock className="w-4 h-4 text-orange-400" />;
    return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  };

  const DocRow = ({ doc }: { doc: typeof docs[0] }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-3">
        <DocStatusIcon doc={doc} />
        <span className="text-sm text-white/80">{doc.docName}</span>
      </div>
      <div className="flex items-center gap-2">
        {doc.requiresMofa && (
          <Badge className={`text-xs px-1.5 py-0 border ${doc.mofaAttested ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-amber-500/20 text-amber-300 border-amber-500/30"}`}>
            MOFA
          </Badge>
        )}
        {doc.requiresEmbassy && (
          <Badge className={`text-xs px-1.5 py-0 border ${doc.embassyAttested ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-orange-500/20 text-orange-300 border-orange-500/30"}`}>
            Embassy
          </Badge>
        )}
        {doc.received && doc.receivedDate && (
          <span className="text-xs text-white/30">{new Date(doc.receivedDate).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => setLocation("/docs")} className="text-white/40 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-white">{data.clientName}</h1>
          <p className="text-xs text-white/40 mt-0.5">{data.clientCode} · {data.applicationType === "freelancer" ? "Freelancer" : "Business Owner"} · {data.maritalStatus === "family" ? "Family" : "Single"}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-white/40">
          <span>Paralegal: <span className="text-white/70">{data.paralegal}</span></span>
          <span className="text-white/20">|</span>
          <span>Consultant: <span className="text-white/70">{data.consultant}</span></span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-white/70">Document Collection Progress</span>
          <span className="text-sm font-semibold text-white">{receivedCount}/{totalDocs}</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: "Received", value: `${receivedCount}/${totalDocs}`, color: "text-white" },
            { label: "MOFA Done", value: `${mofaCount}/${totalDocs}`, color: "text-amber-300" },
            { label: "Embassy Done", value: `${embassyCount}/${totalDocs}`, color: "text-orange-300" },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className={`text-lg font-semibold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-white/40">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { action: "receive" as ActionType, icon: FileCheck, label: "Receive Documents", count: notReceived.length, color: "text-blue-300" },
          { action: "mofa" as ActionType, icon: Stamp, label: "MOFA Attestation", count: needsMofaDocs.length, color: "text-amber-300" },
          { action: "embassy" as ActionType, icon: Building2, label: "Embassy Attestation", count: needsEmbassyDocs.length, color: "text-orange-300" },
          { action: "schengen" as ActionType, icon: CalendarDays, label: "Schengen Date", count: null, color: "text-purple-300" },
          { action: "appointment" as ActionType, icon: CalendarClock, label: "Embassy Appointment", count: null, color: "text-cyan-300" },
          { action: "submission" as ActionType, icon: ClipboardList, label: "Submission Date", count: null, color: "text-emerald-300" },
        ].map(btn => (
          <button
            key={btn.action}
            onClick={() => openAction(btn.action)}
            className="flex items-center gap-3 p-3.5 bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-xl transition-all text-left group"
          >
            <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
              <btn.icon className={`w-4 h-4 ${btn.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-white/80 font-medium leading-tight">{btn.label}</p>
              {btn.count !== null && (
                <p className="text-xs text-white/40 mt-0.5">{btn.count} pending</p>
              )}
              {btn.action === "schengen" && data.schengenDate && (
                <p className="text-xs text-white/40 mt-0.5">{new Date(data.schengenDate).toLocaleDateString()}</p>
              )}
              {btn.action === "appointment" && data.embassyAppointmentDate && (
                <p className="text-xs text-white/40 mt-0.5">{new Date(data.embassyAppointmentDate).toLocaleDateString()}</p>
              )}
              {btn.action === "submission" && data.expectedSubmissionDate && (
                <p className="text-xs text-white/40 mt-0.5">{new Date(data.expectedSubmissionDate).toLocaleDateString()}</p>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/50 ml-auto transition-colors" />
          </button>
        ))}
      </div>

      {/* Document checklist tabs */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full bg-white/5 rounded-none border-b border-white/10 h-10">
            <TabsTrigger value="main" className="flex-1 text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">
              Main Applicant ({mainDocs.length})
            </TabsTrigger>
            {familyDocs.length > 0 && (
              <TabsTrigger value="family" className="flex-1 text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">
                Family ({familyDocs.length})
              </TabsTrigger>
            )}
            <TabsTrigger value="report" className="flex-1 text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">
              Report
            </TabsTrigger>
          </TabsList>

          <TabsContent value="main" className="p-4">
            {mainDocs.map(doc => <DocRow key={doc.id} doc={doc} />)}
          </TabsContent>

          {familyDocs.length > 0 && (
            <TabsContent value="family" className="p-4">
              {familyDocs.map(doc => <DocRow key={doc.id} doc={doc} />)}
            </TabsContent>
          )}

          <TabsContent value="report" className="p-4 space-y-4">
            {report ? (
              <>
                {/* Dates summary */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Schengen Expiry", value: data.schengenDate, color: "text-purple-300" },
                    { label: "Embassy Appointment", value: data.embassyAppointmentDate, color: "text-cyan-300" },
                    { label: "Expected Submission", value: data.expectedSubmissionDate, color: "text-emerald-300" },
                  ].map(d => (
                    <div key={d.label} className="bg-white/5 rounded-lg p-3 text-center">
                      <p className={`text-sm font-semibold ${d.color}`}>
                        {d.value ? new Date(d.value).toLocaleDateString() : "—"}
                      </p>
                      <p className="text-xs text-white/40 mt-0.5">{d.label}</p>
                    </div>
                  ))}
                </div>

                {/* Expiry warnings */}
                {report.expiryWarnings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Expiry Warnings</p>
                    {report.expiryWarnings.map(w => (
                      <div key={w.id} className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-sm text-white/80">{w.docName}</span>
                        </div>
                        <span className="text-xs text-amber-300">{w.daysLeft <= 0 ? "Expired" : `${w.daysLeft}d left`}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Remaining docs */}
                {report.notReceived.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Documents Not Yet Received ({report.notReceived.length})</p>
                    {report.notReceived.map(d => (
                      <div key={d.id} className="flex items-center gap-2 text-sm text-white/60 py-1.5 border-b border-white/5 last:border-0">
                        <Circle className="w-3.5 h-3.5 text-white/20 flex-shrink-0" />
                        {d.docName}
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending MOFA */}
                {report.receivedNotMofa.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Pending MOFA Attestation ({report.receivedNotMofa.length})</p>
                    {report.receivedNotMofa.map(d => (
                      <div key={d.id} className="flex items-center gap-2 text-sm text-white/60 py-1.5 border-b border-white/5 last:border-0">
                        <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        {d.docName}
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending Embassy */}
                {report.receivedNotEmbassy.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-orange-300 uppercase tracking-wider">Pending Embassy Attestation ({report.receivedNotEmbassy.length})</p>
                    {report.receivedNotEmbassy.map(d => (
                      <div key={d.id} className="flex items-center gap-2 text-sm text-white/60 py-1.5 border-b border-white/5 last:border-0">
                        <Clock className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                        {d.docName}
                      </div>
                    ))}
                  </div>
                )}

                {report.notReceived.length === 0 && report.receivedNotMofa.length === 0 && report.receivedNotEmbassy.length === 0 && report.expiryWarnings.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3" />
                    <p className="text-white/70 font-medium">All documents complete</p>
                    <p className="text-white/30 text-sm mt-1">This client is ready for submission</p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Action Dialogs ── */}

      {/* Receive Documents */}
      <Dialog open={activeAction === "receive"} onOpenChange={o => !o && setActiveAction(null)}>
        <DialogContent className="bg-[#0f0f0f] border-white/10 text-white max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Receive Documents</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-white/40 -mt-2">Select documents and set the issue/received date for each</p>
          <div className="space-y-2 mt-2">
            {notReceived.length === 0 ? (
              <p className="text-sm text-white/50 text-center py-4">All documents have been received</p>
            ) : notReceived.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                <Checkbox
                  id={`recv-${doc.id}`}
                  checked={doc.id in receiveDates}
                  onCheckedChange={checked => {
                    if (checked) {
                      setReceiveDates(prev => ({ ...prev, [doc.id]: new Date().toISOString().split("T")[0] }));
                    } else {
                      setReceiveDates(prev => { const n = { ...prev }; delete n[doc.id]; return n; });
                    }
                  }}
                  className="border-white/30"
                />
                <Label htmlFor={`recv-${doc.id}`} className="flex-1 text-sm text-white/80 cursor-pointer">{doc.docName}</Label>
                {doc.id in receiveDates && (
                  <input
                    type="date"
                    value={receiveDates[doc.id]}
                    onChange={e => setReceiveDates(prev => ({ ...prev, [doc.id]: e.target.value }))}
                    className="bg-white/10 border border-white/20 text-white text-xs rounded px-2 py-1 w-36"
                  />
                )}
              </div>
            ))}
          </div>
          {notReceived.length > 0 && (
            <Button className="w-full bg-primary hover:bg-primary/90 text-white mt-2" onClick={handleReceiveSubmit} disabled={receiveMutation.isPending}>
              {receiveMutation.isPending ? "Saving..." : `Mark ${Object.keys(receiveDates).length} Document(s) Received`}
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* MOFA Attestation */}
      <Dialog open={activeAction === "mofa"} onOpenChange={o => !o && setActiveAction(null)}>
        <DialogContent className="bg-[#0f0f0f] border-white/10 text-white max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">MOFA Attestation</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-white/40 -mt-2">Select documents that have been MOFA attested</p>
          <div className="space-y-2 mt-2">
            {needsMofaDocs.length === 0 ? (
              <p className="text-sm text-white/50 text-center py-4">No documents pending MOFA attestation</p>
            ) : needsMofaDocs.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                <Checkbox
                  id={`mofa-${doc.id}`}
                  checked={selectedDocIds.includes(doc.id)}
                  onCheckedChange={() => toggleDocId(doc.id)}
                  className="border-white/30"
                />
                <Label htmlFor={`mofa-${doc.id}`} className="flex-1 text-sm text-white/80 cursor-pointer">{doc.docName}</Label>
              </div>
            ))}
          </div>
          {needsMofaDocs.length > 0 && (
            <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white mt-2" onClick={handleMofaSubmit} disabled={mofaMutation.isPending}>
              {mofaMutation.isPending ? "Saving..." : `Mark ${selectedDocIds.length} Document(s) MOFA Attested`}
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Embassy Attestation */}
      <Dialog open={activeAction === "embassy"} onOpenChange={o => !o && setActiveAction(null)}>
        <DialogContent className="bg-[#0f0f0f] border-white/10 text-white max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Embassy Attestation</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-white/40 -mt-2">Select documents that have been Embassy attested</p>
          <div className="space-y-2 mt-2">
            {needsEmbassyDocs.length === 0 ? (
              <p className="text-sm text-white/50 text-center py-4">No documents pending Embassy attestation</p>
            ) : needsEmbassyDocs.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                <Checkbox
                  id={`emb-${doc.id}`}
                  checked={selectedDocIds.includes(doc.id)}
                  onCheckedChange={() => toggleDocId(doc.id)}
                  className="border-white/30"
                />
                <Label htmlFor={`emb-${doc.id}`} className="flex-1 text-sm text-white/80 cursor-pointer">{doc.docName}</Label>
              </div>
            ))}
          </div>
          {needsEmbassyDocs.length > 0 && (
            <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white mt-2" onClick={handleEmbassySubmit} disabled={embassyMutation.isPending}>
              {embassyMutation.isPending ? "Saving..." : `Mark ${selectedDocIds.length} Document(s) Embassy Attested`}
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Schengen Date */}
      <Dialog open={activeAction === "schengen"} onOpenChange={o => !o && setActiveAction(null)}>
        <DialogContent className="bg-[#0f0f0f] border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Schengen Visa Expiry Date</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-white/40 -mt-2">Set the expiry date of the client's current Schengen visa</p>
          <input
            type="date"
            value={dateInputs.schengenDate}
            onChange={e => setDateInputs(prev => ({ ...prev, schengenDate: e.target.value }))}
            className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-3 py-2 mt-2"
          />
          <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white mt-2" onClick={() => handleDatesSubmit("schengenDate")} disabled={datesMutation.isPending}>
            {datesMutation.isPending ? "Saving..." : "Save Date"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Embassy Appointment */}
      <Dialog open={activeAction === "appointment"} onOpenChange={o => !o && setActiveAction(null)}>
        <DialogContent className="bg-[#0f0f0f] border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Embassy Appointment Date</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-white/40 -mt-2">Set the scheduled embassy appointment date</p>
          <input
            type="date"
            value={dateInputs.embassyAppointmentDate}
            onChange={e => setDateInputs(prev => ({ ...prev, embassyAppointmentDate: e.target.value }))}
            className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-3 py-2 mt-2"
          />
          <Button className="w-full bg-cyan-600 hover:bg-cyan-700 text-white mt-2" onClick={() => handleDatesSubmit("embassyAppointmentDate")} disabled={datesMutation.isPending}>
            {datesMutation.isPending ? "Saving..." : "Save Date"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Submission Date */}
      <Dialog open={activeAction === "submission"} onOpenChange={o => !o && setActiveAction(null)}>
        <DialogContent className="bg-[#0f0f0f] border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Expected Submission Date</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-white/40 -mt-2">Set the expected date for submitting the application</p>
          <input
            type="date"
            value={dateInputs.expectedSubmissionDate}
            onChange={e => setDateInputs(prev => ({ ...prev, expectedSubmissionDate: e.target.value }))}
            className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-3 py-2 mt-2"
          />
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white mt-2" onClick={() => handleDatesSubmit("expectedSubmissionDate")} disabled={datesMutation.isPending}>
            {datesMutation.isPending ? "Saving..." : "Save Date"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
