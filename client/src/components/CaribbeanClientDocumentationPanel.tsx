import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Circle, ClipboardCopy, FileText, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CARIBBEAN_QUESTIONNAIRE_STEPS, questionnaireStepSummary, type CaribbeanQuestionnaireAnswers } from "@shared/caribbeanQuestionnaire";
import { CARIBBEAN_JOURNEY_LABELS, CARIBBEAN_JOURNEY_STAGES, clientDocumentationProgramLabel, type CaribbeanJourneyStage } from "@shared/clientDocumentationPrograms";
import { projectCaribbeanTimeline } from "@shared/caribbeanTimeline";

type TimelineDates = {
  expectedSubmissionDate: string;
  submissionDate: string;
  approvalDate: string;
  naturalizationIssuingDate: string;
  naturalizationIssuedDate: string;
  passportsIssuingDate: string;
  passportsIssuedDate: string;
};

const dateFields: Array<{ key: keyof TimelineDates; label: string }> = [
  { key: "expectedSubmissionDate", label: "Planned Submission Date" },
  { key: "submissionDate", label: "Actual Submitted Date" },
  { key: "approvalDate", label: "Approval Date" },
  { key: "naturalizationIssuingDate", label: "Naturalization Certificate Issuing Date" },
  { key: "naturalizationIssuedDate", label: "Naturalization Certificate Issued Date" },
  { key: "passportsIssuingDate", label: "Passports Issuing Date" },
  { key: "passportsIssuedDate", label: "Passports Issued Date" },
];

function formatDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00Z` : String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function CaribbeanClientDocumentationPanel({ clientCaseId, clientCase, receivedDocuments, totalDocuments }: { clientCaseId: number; clientCase: any; receivedDocuments: number; totalDocuments: number }) {
  const utils = trpc.useUtils();
  const { data: questionnaire, isLoading: questionnaireLoading } = trpc.clientDocs.questionnaire.useQuery({ id: clientCaseId });
  const { data: paymentSchedule } = trpc.clientDocs.paymentSchedule.useQuery({ clientCaseId });
  const [stage, setStage] = useState<CaribbeanJourneyStage>(clientCase.caribbeanJourneyStage ?? "questionnaire");
  const [dates, setDates] = useState<TimelineDates>({
    expectedSubmissionDate: clientCase.expectedSubmissionDate?.slice?.(0, 10) ?? clientCase.expectedSubmissionDate ?? "",
    submissionDate: clientCase.submissionDate?.slice?.(0, 10) ?? clientCase.submissionDate ?? "",
    approvalDate: clientCase.approvalDate?.slice?.(0, 10) ?? clientCase.approvalDate ?? "",
    naturalizationIssuingDate: clientCase.naturalizationIssuingDate ?? "",
    naturalizationIssuedDate: clientCase.naturalizationIssuedDate ?? "",
    passportsIssuingDate: clientCase.passportsIssuingDate ?? "",
    passportsIssuedDate: clientCase.passportsIssuedDate ?? "",
  });

  useEffect(() => {
    setStage(clientCase.caribbeanJourneyStage ?? "questionnaire");
    setDates({
      expectedSubmissionDate: clientCase.expectedSubmissionDate?.slice?.(0, 10) ?? clientCase.expectedSubmissionDate ?? "",
      submissionDate: clientCase.submissionDate?.slice?.(0, 10) ?? clientCase.submissionDate ?? "",
      approvalDate: clientCase.approvalDate?.slice?.(0, 10) ?? clientCase.approvalDate ?? "",
      naturalizationIssuingDate: clientCase.naturalizationIssuingDate ?? "",
      naturalizationIssuedDate: clientCase.naturalizationIssuedDate ?? "",
      passportsIssuingDate: clientCase.passportsIssuingDate ?? "",
      passportsIssuedDate: clientCase.passportsIssuedDate ?? "",
    });
  }, [clientCase]);

  const timeline = useMemo(() => projectCaribbeanTimeline({ clientCase, receivedDocuments, totalDocuments, payments: paymentSchedule?.payments ?? [] }), [clientCase, receivedDocuments, totalDocuments, paymentSchedule]);
  const updateTimeline = trpc.clientDocs.updateCaribbeanTimeline.useMutation({
    onSuccess: async () => {
      toast.success("Caribbean timeline updated");
      await Promise.all([utils.clientDocs.get.invalidate({ id: clientCaseId }), utils.clientDocs.questionnaire.invalidate({ id: clientCaseId }), utils.clientDocs.paymentSchedule.invalidate({ clientCaseId })]);
    },
    onError: error => toast.error(error.message),
  });

  const saveTimeline = () => updateTimeline.mutate({
    id: clientCaseId,
    stage,
    dates: Object.fromEntries(Object.entries(dates).map(([key, value]) => [key, value || null])),
  });

  const copyClientLink = async () => {
    const link = `${window.location.origin}/client-questionnaire`;
    await navigator.clipboard.writeText(link);
    toast.success("Client questionnaire link copied");
  };

  const answers = (questionnaire?.answers ?? {}) as CaribbeanQuestionnaireAnswers;
  const sections = Array.from(new Set(CARIBBEAN_QUESTIONNAIRE_STEPS.map(step => step.section)));

  return <div className="space-y-5">
    <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-widest text-cyan-700">{clientDocumentationProgramLabel(clientCase.program)} Citizenship Journey</p><h2 className="mt-1 text-lg font-semibold text-cyan-950">{CARIBBEAN_JOURNEY_LABELS[stage]}</h2><p className="mt-1 text-xs text-cyan-800">Consultants and paralegals can update the current stage and milestone dates below.</p></div>
        <Button variant="outline" className="border-cyan-300 text-cyan-900" onClick={copyClientLink}><ClipboardCopy className="mr-2 h-4 w-4" />Copy client questionnaire link</Button>
      </div>
    </div>

    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold text-gray-900">13-Step Client Timeline</h3><p className="text-xs text-gray-500">Visible through the protected Client Portal APIs and client interface.</p></div><span className="text-sm font-semibold text-[#1e3a5f]">{timeline.progressPercent}%</span></div>
      <div className="space-y-3">
        {timeline.stages.map(step => <div key={step.key} className={`rounded-lg border p-3 ${step.status === "completed" ? "border-emerald-200 bg-emerald-50" : step.status === "active" ? "border-cyan-300 bg-cyan-50" : "border-gray-200 bg-gray-50"}`}>
          <div className="flex items-start gap-3">{step.status === "completed" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className={`mt-0.5 h-5 w-5 shrink-0 ${step.status === "active" ? "text-cyan-600" : "text-gray-300"}`} />}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-gray-900">{step.order}. {step.titleEn}</p>{(step.date || step.dueDate) && <span className="text-xs text-gray-600">{step.date ? formatDate(step.date) : `Due ${formatDate(step.dueDate)}`}</span>}</div><p className="mt-1 text-xs text-gray-600">{step.detailEn}{step.amountEur ? ` Amount: €${Number(step.amountEur).toLocaleString()}.` : ""}</p></div></div>
        </div>)}
      </div>
    </div>

    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2"><Settings2 className="h-4 w-4 text-[#1e3a5f]" /><h3 className="font-semibold text-gray-900">Stage and Timeline Control</h3></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2"><Label>Current Stage</Label><Select value={stage} onValueChange={value => setStage(value as CaribbeanJourneyStage)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CARIBBEAN_JOURNEY_STAGES.map(value => <SelectItem key={value} value={value}>{CARIBBEAN_JOURNEY_LABELS[value]}</SelectItem>)}</SelectContent></Select></div>
        {dateFields.map(field => <div key={field.key} className="space-y-2"><Label>{field.label}</Label><Input type="date" value={dates[field.key]} onChange={event => setDates(current => ({ ...current, [field.key]: event.target.value }))} /></div>)}
      </div>
      <p className="mt-3 text-xs text-amber-700">The planned Submission Date automatically activates In Process. Submission Payment is due 12 days before that date; Approval Payment is due the day after approval.</p>
      <Button className="mt-4 bg-[#1e3a5f] hover:bg-[#16304f]" onClick={saveTimeline} disabled={updateTimeline.isPending}>{updateTimeline.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save timeline</Button>
    </div>

    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-[#1e3a5f]" /><h3 className="font-semibold text-gray-900">Client Questionnaire</h3></div><p className="mt-1 text-xs text-gray-500">Every answer is stored in this protected Client Documentation case.</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${questionnaire?.status === "submitted" ? "bg-emerald-100 text-emerald-800" : questionnaire?.status === "draft" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}>{questionnaire?.status === "submitted" ? "Submitted" : questionnaire?.status === "draft" ? "Draft in progress" : "Not started"}</span></div>
      {questionnaireLoading ? <Loader2 className="h-5 w-5 animate-spin text-[#5BA3B8]" /> : questionnaire?.status === "not_started" ? <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">Share the protected questionnaire link after assigning this Documentation folder to a Client Portal account.</div> : <div className="space-y-3">{sections.map(section => {
        const steps = CARIBBEAN_QUESTIONNAIRE_STEPS.filter(step => step.section === section);
        const answered = steps.filter(step => questionnaireStepSummary(step, answers[step.key], answers) !== "Not answered").length;
        return <details key={section} className="rounded-lg border border-gray-200"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-gray-800">{section} <span className="ml-2 text-xs font-normal text-gray-400">{answered}/{steps.length}</span></summary><div className="space-y-3 border-t border-gray-100 px-4 py-3">{steps.map(step => <div key={step.key}><p className="text-xs font-medium text-gray-500">{step.prompt}</p><p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-900">{questionnaireStepSummary(step, answers[step.key], answers)}</p>{step.type === "repeatable" && Array.isArray(answers[step.key]) && (answers[step.key] as Array<Record<string, unknown>>).map((row, index) => <div key={index} className="mt-2 rounded-md bg-gray-50 p-2 text-xs text-gray-700">{step.fields?.map(field => <p key={field.key}><strong>{field.label}:</strong> {String(row[field.key] ?? "") || "—"}</p>)}</div>)}</div>)}</div></details>;
      })}</div>}
    </div>
  </div>;
}
