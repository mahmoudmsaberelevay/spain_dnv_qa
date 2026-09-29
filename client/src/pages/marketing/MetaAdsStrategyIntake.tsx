import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, CalendarClock, FileUp, LockKeyhole, PauseCircle, RotateCcw, Save, ShieldCheck, Target } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Attachment = { label: string; url: string };

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("Could not read this evidence file."));
  reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
  reader.readAsDataURL(file);
});

export default function MetaAdsStrategyIntake() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: access, isLoading: accessLoading } = trpc.marketingSystem.access.useQuery();
  const isOwner = access?.role === "owner";
  const { data: session } = trpc.marketingSystem.getCurrentMetaAdsStrategy.useQuery(undefined, { enabled: isOwner });
  const start = trpc.marketingSystem.startOrResumeMetaAdsStrategy.useMutation({ onSuccess: () => { utils.marketingSystem.getCurrentMetaAdsStrategy.invalidate(); toast.success("Meta Ads Strategy Intake started. Campaigns and spend remain locked."); }, onError: error => toast.error(error.message) });
  const save = trpc.marketingSystem.saveMetaAdsStrategyAnswer.useMutation({ onSuccess: () => utils.marketingSystem.getCurrentMetaAdsStrategy.invalidate(), onError: error => toast.error(error.message) });
  const upload = trpc.marketingSystem.uploadMetaAdsStrategyEvidence.useMutation({ onError: error => toast.error(error.message) });
  const reset = trpc.marketingSystem.resetMetaAdsStrategy.useMutation({ onSuccess: () => { setVisibleQuestion(null); utils.marketingSystem.getCurrentMetaAdsStrategy.invalidate(); toast.success("A new Meta Ads Strategy Intake version has started. The earlier version remains in the audit history."); }, onError: error => toast.error(error.message) });
  const [visibleQuestion, setVisibleQuestion] = useState<number | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [decisionStatus, setDecisionStatus] = useState<"answered" | "unknown">("answered");
  const [gapDueDate, setGapDueDate] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const currentQuestion = useMemo(() => session?.questions.find(question => question.number === (visibleQuestion ?? session.nextQuestionNumber ?? 1)) ?? null, [session, visibleQuestion]);
  const savedAnswer = useMemo(() => currentQuestion ? session?.answers.find(answer => answer.questionNumber === currentQuestion.number) : undefined, [currentQuestion, session]);

  useEffect(() => {
    if (!currentQuestion) return;
    setAnswerText(savedAnswer?.answerText ?? "");
    setDecisionStatus((savedAnswer?.decisionStatus as "answered" | "unknown" | undefined) ?? "answered");
    setGapDueDate(savedAnswer?.gapDueAt ? new Date(savedAnswer.gapDueAt).toISOString().slice(0, 10) : "");
    setAttachments((savedAnswer?.attachments as Attachment[] | undefined) ?? []);
  }, [currentQuestion?.number, savedAnswer?.updatedAt]);

  const addEvidence = async (file?: File) => {
    if (!file || !session || !currentQuestion) return;
    if (file.size > 10 * 1024 * 1024) return toast.error("Evidence must be 10 MB or smaller.");
    try {
      const response = await upload.mutateAsync({ sessionId: session.session.id, questionNumber: currentQuestion.number, fileName: file.name, mimeType: file.type as "application/pdf" | "image/png" | "image/jpeg" | "image/webp" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileBase64: await toBase64(file) });
      setAttachments(previous => [...previous, { label: response.label, url: response.url }]);
      toast.success("Evidence attached. Save this answer to retain it.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Evidence upload failed."); }
  };

  const saveAndMove = async (direction: "next" | "stay") => {
    if (!session || !currentQuestion) return;
    if (!answerText.trim()) return toast.error("Please answer this question or record it as Unknown with a follow-up deadline.");
    const gapDueAt = decisionStatus === "unknown" ? new Date(`${gapDueDate}T12:00:00Z`).getTime() : undefined;
    if (decisionStatus === "unknown" && (!gapDueDate || Number.isNaN(gapDueAt))) return toast.error("Choose a follow-up deadline for this tracked data gap.");
    const result = await save.mutateAsync({ sessionId: session.session.id, questionNumber: currentQuestion.number, answerText, decisionStatus, attachments, gapDueAt });
    if (direction === "next") setVisibleQuestion(result.nextQuestionNumber ?? currentQuestion.number);
    toast.success(decisionStatus === "unknown" ? "Data gap saved with your follow-up deadline." : "Answer saved.");
  };

  if (accessLoading) return <div className="flex min-h-[65vh] items-center justify-center text-slate-400">Loading controlled strategy workspace…</div>;
  if (!isOwner) return <div className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-6 text-center"><LockKeyhole className="mb-4 h-12 w-12 text-amber-300" /><h1 className="text-2xl font-bold text-white">Strategy Intake is owner-controlled</h1><p className="mt-3 text-sm leading-6 text-slate-400">Only Mahmoud can complete, confirm, reset, or approve the Meta Ads Strategy Intake. This protects commercial strategy, campaign policy, and paid-media controls.</p></div>;

  const shownNumber = currentQuestion?.number ?? 1;
  const progress = session ? Math.round((session.answeredCount / session.totalQuestions) * 100) : 0;
  const previousNumber = session?.questions.filter(question => question.number < shownNumber).at(-1)?.number;

  return <div className="min-h-full bg-[#0c1320] px-4 py-6 text-white md:px-8"><div className="mx-auto max-w-4xl space-y-6">
    <section className="rounded-3xl border border-[#C9A84C]/25 bg-[radial-gradient(circle_at_92%_0%,rgba(201,168,76,.18),transparent_40%),linear-gradient(115deg,#182337,#0d1524)] p-6 md:p-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="mb-3 flex items-center gap-2 text-[#EBD990]"><Target className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[.16em]">Paid media prerequisite · planning only</span></div><h1 className="text-3xl font-semibold tracking-tight">Meta Ads Strategy Intake</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">The exact 66-question strategy interview required before any future paid-media pilot can be considered. It does not create campaigns, change existing campaigns, connect an ad account, or spend money.</p></div><Badge variant="outline" className="w-fit border-amber-300/30 bg-amber-300/10 text-amber-100">Campaigns locked</Badge></div></section>

    {!session ? <Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader><CardTitle>Start the 66-question strategy intake</CardTitle><CardDescription className="text-slate-400">Questions appear one at a time in the original blueprint order. Progress saves after every answer and resumes securely across devices. Any unknown answer becomes a tracked data gap with your deadline.</CardDescription></CardHeader><CardContent><Button onClick={() => start.mutate()} disabled={start.isPending} className="bg-[#C9A84C] text-[#1A3A5C] hover:bg-[#EBD990]">{start.isPending ? "Starting…" : "Begin Question 01"}<ArrowRight className="ml-2 h-4 w-4" /></Button></CardContent></Card> : currentQuestion ? <Card className="border-white/10 bg-[#111b2c] text-white shadow-2xl"><CardHeader className="border-b border-white/10"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#EBD990]">{currentQuestion.sectionLabel}</p><CardTitle className="mt-1">Question {shownNumber} of {session.totalQuestions}</CardTitle></div><div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={() => window.confirm("Start a new empty strategy interview version? The current answers remain in history.") && reset.mutate({ scope: "all" })} disabled={reset.isPending} className="text-slate-400 hover:bg-white/5 hover:text-white"><RotateCcw className="mr-2 h-4 w-4" />Reset all</Button><Badge variant="outline" className="border-[#C9A84C]/30 text-[#EBD990]">Interview v{session.session.version}</Badge></div></div><Progress value={progress} className="mt-5 h-2 bg-slate-800 [&>div]:bg-[#C9A84C]" /><p className="mt-3 text-xs text-slate-400">{session.answeredCount} saved · {progress}% complete · company-wide answers first</p></CardHeader><CardContent className="space-y-5 pt-6"><div className="rounded-2xl border border-white/10 bg-[#0c1320] p-5"><p className="text-lg font-medium leading-8">{currentQuestion.prompt}</p></div><div className="rounded-xl border border-[#5BA3B8]/20 bg-[#5BA3B8]/5 p-4 text-sm leading-6 text-slate-300"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /><p>Answer from your commercial knowledge. Later program-specific reviews can confirm Spain DNV and Malta MPRP variations without replacing this company answer. No value is silently inferred, and no answer changes Meta or CRM data.</p></div></div><div className="space-y-2"><Label htmlFor="meta-strategy-answer">Your answer</Label><Textarea id="meta-strategy-answer" value={answerText} onChange={event => { setAnswerText(event.target.value); setDecisionStatus("answered"); }} className="min-h-44 border-white/10 bg-[#0c1320] text-white placeholder:text-slate-600" placeholder="Enter your answer in Arabic or English, or record Unknown below with a follow-up deadline." /></div><div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setDecisionStatus("answered")} className={`rounded-xl border p-4 text-left ${decisionStatus === "answered" ? "border-emerald-400/50 bg-emerald-400/10" : "border-white/10 bg-[#0c1320]"}`}><p className="font-medium text-emerald-200">Confirmed answer</p><p className="mt-1 text-xs leading-5 text-slate-400">This is the current commercial answer, subject to the eventual strategy review.</p></button><button type="button" onClick={() => { setDecisionStatus("unknown"); if (!answerText) setAnswerText("Unknown — follow-up required."); }} className={`rounded-xl border p-4 text-left ${decisionStatus === "unknown" ? "border-amber-400/50 bg-amber-400/10" : "border-white/10 bg-[#0c1320]"}`}><p className="font-medium text-amber-200">Unknown — track a gap</p><p className="mt-1 text-xs leading-5 text-slate-400">No estimate is fabricated. You must set the owner deadline below.</p></button></div>{decisionStatus === "unknown" && <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-4"><Label htmlFor="meta-gap-deadline" className="flex items-center gap-2 text-amber-100"><CalendarClock className="h-4 w-4" />Follow-up deadline (Mahmoud owns this gap)</Label><Input id="meta-gap-deadline" type="date" value={gapDueDate} onChange={event => setGapDueDate(event.target.value)} className="mt-3 max-w-xs border-amber-300/30 bg-[#0c1320] text-white" /></div>}<div className="rounded-xl border border-dashed border-white/15 bg-[#0c1320] p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="font-medium text-slate-200">Supporting evidence</p><p className="mt-1 text-xs leading-5 text-slate-400">Attach an approved report, screenshot, funnel export, price evidence, privacy wording, or brand reference. Max 10 MB.</p></div><label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/5"><FileUp className="h-4 w-4" />Attach<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx" className="hidden" onChange={event => addEvidence(event.target.files?.[0])} /></label></div>{attachments.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{attachments.map((attachment, index) => <span key={`${attachment.url}-${index}`} className="inline-flex items-center gap-2 rounded-full border border-[#5BA3B8]/30 bg-[#5BA3B8]/10 px-3 py-1 text-xs text-[#a9d6e3]"><a href={attachment.url} target="_blank" rel="noreferrer">{attachment.label}</a><button type="button" onClick={() => setAttachments(previous => previous.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${attachment.label}`} className="text-slate-400 hover:text-rose-200">×</button></span>)}</div>}</div><div className="flex flex-col-reverse justify-between gap-3 border-t border-white/10 pt-5 sm:flex-row"><Button variant="outline" disabled={!previousNumber} onClick={() => previousNumber && setVisibleQuestion(previousNumber)} className="border-white/15 bg-transparent text-slate-200 hover:bg-white/5 hover:text-white"><ArrowLeft className="mr-2 h-4 w-4" />Back / edit</Button><div className="flex gap-3"><Button variant="outline" onClick={() => saveAndMove("stay")} disabled={save.isPending || upload.isPending} className="border-[#5BA3B8]/40 bg-transparent text-[#a9d6e3] hover:bg-[#5BA3B8]/10 hover:text-white"><Save className="mr-2 h-4 w-4" />Save</Button><Button onClick={() => saveAndMove("next")} disabled={save.isPending || upload.isPending} className="bg-[#C9A84C] text-[#1A3A5C] hover:bg-[#EBD990]">Save & continue<ArrowRight className="ml-2 h-4 w-4" /></Button></div></div></CardContent></Card> : null}
    {session?.isComplete && <Card className="border-emerald-400/30 bg-emerald-400/10 text-white"><CardHeader><CardTitle className="flex items-center gap-2 text-emerald-100"><PauseCircle className="h-5 w-5" />All 66 answers are recorded — planning gate remains closed</CardTitle><CardDescription className="text-emerald-100/70">The future Ads Strategy Approval Packet, program-specific overrides, campaign architecture, budget caps, permissions, and any limited measurement-pilot decision are deliberately separate and are not created by this intake.</CardDescription></CardHeader></Card>}
    <div className="flex justify-end"><Button variant="ghost" onClick={() => navigate("/marketing")} className="text-slate-400 hover:bg-white/5 hover:text-white">Back to Marketing module</Button></div>
  </div></div>;
}
