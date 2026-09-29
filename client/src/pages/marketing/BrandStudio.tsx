import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  BadgeCheck, BookOpenCheck, BrainCircuit, CheckCircle2, CircleAlert, FileUp,
  ListChecks, LockKeyhole, RefreshCw, Save, ShieldCheck, Sparkles, UsersRound,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

type Attachment = { label: string; url: string };
type DraftAnswer = {
  answerText: string;
  attachments: Attachment[];
  decisionStatus: "answered" | "unknown" | "needs_confirmation";
};

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("Could not read the selected evidence file."));
  reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
  reader.readAsDataURL(file);
});

function StateBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-300 border-emerald-400/20",
    proposed: "bg-amber-500/15 text-amber-300 border-amber-400/20",
    in_progress: "bg-sky-500/15 text-sky-300 border-sky-400/20",
    available_internal: "bg-emerald-500/15 text-emerald-300 border-emerald-400/20",
    requires_configuration: "bg-amber-500/15 text-amber-300 border-amber-400/20",
    not_configured: "bg-slate-500/15 text-slate-300 border-slate-400/20",
  };
  return <Badge variant="outline" className={styles[state] ?? "bg-slate-500/15 text-slate-300 border-slate-400/20"}>{state.replaceAll("_", " ")}</Badge>;
}

function BrandStudio() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: access, isLoading: accessLoading } = trpc.marketingSystem.access.useQuery();
  const isOwner = access?.role === "owner";
  const canView = access?.brandStudioAvailable === true;
  const { data: activeBook } = trpc.marketingSystem.getActiveBrandBook.useQuery(undefined, { enabled: canView });
  const { data: books = [] } = trpc.marketingSystem.getBrandBooks.useQuery(undefined, { enabled: canView });
  const { data: session } = trpc.marketingSystem.getCurrentDiscovery.useQuery(undefined, { enabled: isOwner });
  const { data: providers } = trpc.marketingSystem.providerReadiness.useQuery(undefined, { enabled: Boolean(access?.capabilities.includes("view_provider_readiness")) });
  const { data: baseline } = trpc.marketingSystem.dashboardBaseline.useQuery(undefined, { enabled: Boolean(access?.capabilities.includes("view_analytics")) });
  const { data: assignments = [] } = trpc.marketingSystem.listRoleAssignments.useQuery(undefined, { enabled: isOwner });
  const { data: users = [] } = trpc.permissions.listUsers.useQuery(undefined, { enabled: isOwner });

  const start = trpc.marketingSystem.startOrResumeDiscovery.useMutation({
    onSuccess: () => { utils.marketingSystem.getCurrentDiscovery.invalidate(); toast.success("All 35 Brand Discovery questions are ready in one form."); },
    onError: error => toast.error(error.message),
  });
  const saveAnswers = trpc.marketingSystem.saveDiscoveryAnswers.useMutation({
    onSuccess: () => { utils.marketingSystem.getCurrentDiscovery.invalidate(); toast.success("Brand Discovery answers saved securely."); },
    onError: error => toast.error(error.message),
  });
  const uploadEvidence = trpc.marketingSystem.uploadDiscoveryEvidence.useMutation({ onError: error => toast.error(error.message) });
  const propose = trpc.marketingSystem.proposeBrandBook.useMutation({
    onSuccess: () => { utils.marketingSystem.getCurrentDiscovery.invalidate(); utils.marketingSystem.getBrandBooks.invalidate(); toast.success("Brand Book proposal created for your final approval."); },
    onError: error => toast.error(error.message),
  });
  const approve = trpc.marketingSystem.approveBrandBook.useMutation({
    onSuccess: () => { utils.marketingSystem.getActiveBrandBook.invalidate(); utils.marketingSystem.getBrandBooks.invalidate(); toast.success("Brand Book approved and activated."); },
    onError: error => toast.error(error.message),
  });
  const reset = trpc.marketingSystem.resetDiscovery.useMutation({
    onSuccess: () => { utils.marketingSystem.getCurrentDiscovery.invalidate(); toast.success("A new Brand Discovery version has started. Earlier answers remain in the audit history."); },
    onError: error => toast.error(error.message),
  });
  const assignRole = trpc.marketingSystem.assignRole.useMutation({
    onSuccess: () => { utils.marketingSystem.listRoleAssignments.invalidate(); toast.success("Marketing role assigned."); },
    onError: error => toast.error(error.message),
  });
  const revokeRole = trpc.marketingSystem.revokeRole.useMutation({
    onSuccess: () => { utils.marketingSystem.listRoleAssignments.invalidate(); toast.success("Marketing role revoked."); },
    onError: error => toast.error(error.message),
  });

  const [drafts, setDrafts] = useState<Record<number, DraftAnswer>>({});
  const [draftSessionId, setDraftSessionId] = useState<number | null>(null);
  const [roleUserId, setRoleUserId] = useState("");
  const [roleName, setRoleName] = useState("researcher");
  const sessionSnapshot = useMemo(() => session
    ? `${session.session.id}:${session.answers.map(answer => `${answer.questionNumber}:${answer.updatedAt}:${answer.decisionStatus}`).join("|")}`
    : "", [session]);

  useEffect(() => {
    if (!session) return;
    const isNewSession = draftSessionId !== session.session.id;
    setDrafts(previous => {
      const next: Record<number, DraftAnswer> = {};
      for (const question of session.questions) {
        const stored = session.answers.find(answer => answer.questionNumber === question.number);
        next[question.number] = (isNewSession ? undefined : previous[question.number]) ?? {
          answerText: stored?.answerText ?? "",
          attachments: (stored?.attachments as Attachment[] | undefined) ?? [],
          decisionStatus: (stored?.decisionStatus as DraftAnswer["decisionStatus"] | undefined) ?? "answered",
        };
      }
      return next;
    });
    setDraftSessionId(session.session.id);
  }, [draftSessionId, session, sessionSnapshot]);

  const updateDraft = (questionNumber: number, patch: Partial<DraftAnswer>) => {
    setDrafts(previous => ({
      ...previous,
      [questionNumber]: {
        answerText: previous[questionNumber]?.answerText ?? "",
        attachments: previous[questionNumber]?.attachments ?? [],
        decisionStatus: previous[questionNumber]?.decisionStatus ?? "answered",
        ...patch,
      },
    }));
  };

  const addEvidence = async (questionNumber: number, file?: File) => {
    if (!file || !session) return;
    if (file.size > 10 * 1024 * 1024) return toast.error("Evidence must be 10 MB or smaller.");
    try {
      const fileBase64 = await toBase64(file);
      const item = await uploadEvidence.mutateAsync({
        sessionId: session.session.id,
        questionNumber,
        fileName: file.name,
        mimeType: file.type as "application/pdf" | "image/png" | "image/jpeg" | "image/webp" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileBase64,
      });
      updateDraft(questionNumber, { attachments: [...(drafts[questionNumber]?.attachments ?? []), { label: item.label, url: item.url }] });
      toast.success("Evidence attached. Save the form to retain it with this answer.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not attach evidence.");
    }
  };

  const saveCompleteForm = async () => {
    if (!session) return;
    const answers = session.questions
      .map(question => ({ question, draft: drafts[question.number] }))
      .filter(({ draft }) => Boolean(draft?.answerText.trim()))
      .map(({ question, draft }) => ({
        questionNumber: question.number,
        answerText: draft!.answerText,
        attachments: draft!.attachments,
        decisionStatus: draft!.decisionStatus,
      }));
    if (answers.length === 0) return toast.error("Add at least one answer before saving the complete form.");
    await saveAnswers.mutateAsync({ sessionId: session.session.id, answers });
  };

  if (accessLoading) {
    return <div className="flex min-h-[65vh] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-[#5BA3B8]" /></div>;
  }

  if (!canView) {
    return <div className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-6 text-center"><LockKeyhole className="mb-4 h-12 w-12 text-amber-300" /><h1 className="text-2xl font-bold text-white">Brand Studio access is controlled</h1><p className="mt-3 text-sm leading-6 text-slate-400">This workspace requires an assigned Agentic Marketing System role. Ask Mahmoud to assign Marketing Manager, Researcher, Creative Producer, or Analyst access.</p></div>;
  }

  const proposedBook = books.find(book => book.status === "proposed");
  const answeredPercent = session ? Math.round((session.answeredCount / session.totalQuestions) * 100) : 0;
  const draftedCount = session?.questions.filter(question => Boolean(drafts[question.number]?.answerText.trim())).length ?? 0;
  const pendingConfirmationCount = session?.questions.filter(question => drafts[question.number]?.decisionStatus === "needs_confirmation").length ?? 0;
  const baselineRow = Array.isArray(baseline?.data) ? baseline?.data[0] as Record<string, string | number> | undefined : undefined;
  const questionsBySection = session?.sections.map(section => ({
    ...section,
    questions: session.questions.filter(question => question.section === section.key),
  })) ?? [];

  return (
    <div className="min-h-full bg-[#0c1320] px-4 py-6 text-white md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-[#5BA3B8]/25 bg-[radial-gradient(circle_at_80%_0%,rgba(91,163,184,.24),transparent_36%),linear-gradient(115deg,#15263d,#0d1524_52%,#111827)] p-6 md:p-8">
          <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-[#5BA3B8]/15 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-2xl"><div className="mb-3 flex items-center gap-2 text-[#a9d6e3]"><Sparkles className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[.18em]">Agentic Marketing System · Phase 1</span></div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">ELEVAY Brand Studio</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">The controlled source of truth for positioning, tone, visuals, claims, and approval. Complete the full discovery form at your own pace; drafts save securely and publishing remains locked.</p></div>
            <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-slate-400">Brand Book</p><p className="mt-1 font-semibold">{activeBook ? `v${activeBook.version} active` : "Awaiting approval"}</p></div><div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-slate-400">Safety mode</p><p className="mt-1 font-semibold text-amber-200">Publishing locked</p></div></div>
          </div>
        </section>

        <Tabs defaultValue="studio" className="space-y-5">
          <TabsList className="h-auto flex-wrap justify-start gap-1 bg-[#111b2c] p-1.5"><TabsTrigger value="studio">Brand Studio</TabsTrigger><TabsTrigger value="book">Brand Book</TabsTrigger>{isOwner && <TabsTrigger value="governance">Governance</TabsTrigger>}</TabsList>

          <TabsContent value="studio" className="space-y-5">
            {!session && !proposedBook && !activeBook && isOwner && <Card className="border-[#5BA3B8]/30 bg-[#111b2c] text-white"><CardHeader><CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-[#8ad5e7]" />Start the required Brand Discovery</CardTitle><CardDescription className="text-slate-400">The blueprint’s exact 35 questions appear in one complete, sectioned form. You can save any completed answers and resume later on any device.</CardDescription></CardHeader><CardContent><Button onClick={() => start.mutate()} disabled={start.isPending} className="bg-[#5BA3B8] text-slate-950 hover:bg-[#82c8d9]">{start.isPending ? "Preparing…" : "Open all 35 questions"}<ListChecks className="ml-2 h-4 w-4" /></Button></CardContent></Card>}

            {session && isOwner && <Card className="border-white/10 bg-[#111b2c] text-white shadow-2xl"><CardHeader className="border-b border-white/10 pb-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-[#8ad5e7]">Owner-controlled discovery · all questions in one form</p><CardTitle className="mt-1 text-xl">ELEVAY Brand Discovery — 35 Questions</CardTitle><CardDescription className="mt-2 max-w-3xl text-slate-400">Fill any question in any order. <strong className="text-slate-200">Save complete form</strong> stores every completed answer together; you may return later. A Brand Book proposal remains unavailable until all questions are saved and any recommended response is explicitly confirmed.</CardDescription></div><Badge variant="outline" className="w-fit border-[#5BA3B8]/40 bg-[#5BA3B8]/10 text-[#a9d6e3]">Version {session.session.version}</Badge></div><Progress value={answeredPercent} className="mt-5 h-2 bg-slate-800 [&>div]:bg-[#5BA3B8]" /><div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400"><span>{session.answeredCount} of {session.totalQuestions} answers securely saved</span><span>{draftedCount} questions currently completed in this form</span>{pendingConfirmationCount > 0 && <span className="text-amber-200">{pendingConfirmationCount} recommendation{pendingConfirmationCount === 1 ? "" : "s"} await confirmation</span>}</div></CardHeader>
              <CardContent className="space-y-8 pt-6">
                <div className="rounded-2xl border border-[#5BA3B8]/20 bg-[#0c1320] p-4 text-sm leading-6 text-slate-300"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /><p>Use your own answers or select a suggested starting point and explicitly confirm it. Attach only approved brand evidence. This is a private Brand Book interview, not a publishing, advertising, spend, or provider-execution action.</p></div></div>
                {questionsBySection.map(section => <section key={section.key} className="space-y-4"><div className="sticky top-0 z-10 flex flex-col gap-2 border-y border-white/10 bg-[#111b2c]/95 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-[#8ad5e7]">{section.label}</p><h2 className="mt-1 font-semibold">Questions {section.start}–{section.end}</h2></div><Badge variant="outline" className="w-fit border-white/10 text-slate-300">{section.questions.filter(question => Boolean(drafts[question.number]?.answerText.trim())).length}/{section.questions.length} drafted</Badge></div>
                  <div className="grid gap-4">{section.questions.map(question => {
                    const draft = drafts[question.number] ?? { answerText: "", attachments: [], decisionStatus: "answered" as const };
                    const saved = session.answers.some(answer => answer.questionNumber === question.number);
                    const isRecommendation = draft.answerText === question.recommendation;
                    return <article key={question.number} className="rounded-2xl border border-white/10 bg-[#0c1320] p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="max-w-4xl"><div className="flex flex-wrap items-center gap-2"><Badge className="bg-[#5BA3B8]/15 text-[#a9d6e3]">{String(question.number).padStart(2, "0")}</Badge>{saved && <Badge variant="outline" className="border-emerald-400/30 text-emerald-200">Saved</Badge>}{draft.decisionStatus === "needs_confirmation" && <Badge variant="outline" className="border-amber-400/30 text-amber-200">Confirm recommendation</Badge>}</div><h3 className="mt-3 text-base font-medium leading-7 text-white">{question.prompt}</h3></div><Button type="button" variant="outline" size="sm" onClick={() => updateDraft(question.number, { answerText: question.recommendation, decisionStatus: "needs_confirmation" })} className="shrink-0 border-[#5BA3B8]/40 bg-transparent text-[#a9d6e3] hover:bg-[#5BA3B8]/10 hover:text-white">Use suggestion</Button></div>
                      <div className="mt-4 space-y-2"><Label htmlFor={`brand-answer-${question.number}`} className="text-slate-200">Your answer</Label><Textarea id={`brand-answer-${question.number}`} value={draft.answerText} onChange={event => updateDraft(question.number, { answerText: event.target.value, decisionStatus: "answered" })} className="min-h-32 border-white/10 bg-[#111b2c] text-white placeholder:text-slate-600" placeholder="Write in Arabic or English. You can return to any answer before saving." /></div>
                      {isRecommendation && <div className="mt-3 flex items-start gap-3 rounded-xl bg-[#5BA3B8]/10 p-3"><Checkbox id={`confirm-recommendation-${question.number}`} checked={draft.decisionStatus === "answered"} onCheckedChange={value => updateDraft(question.number, { decisionStatus: value === true ? "answered" : "needs_confirmation" })} /><Label htmlFor={`confirm-recommendation-${question.number}`} className="cursor-pointer text-sm leading-5 text-slate-200">I confirm this suggested answer for the Brand Book. It remains subject to the final Brand Book approval.</Label></div>}
                      <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-black/10 p-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-slate-200">Evidence or reference</p><p className="mt-1 text-xs leading-5 text-slate-400">PDF, PNG, JPG, WebP, or DOCX; maximum 10 MB. Evidence is retained only after you save the form.</p></div><label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5"><FileUp className="h-4 w-4" />Attach<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx" className="hidden" onChange={event => addEvidence(question.number, event.target.files?.[0])} /></label></div>{draft.attachments.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{draft.attachments.map((attachment, index) => <div key={`${attachment.url}-${index}`} className="inline-flex items-center gap-2 rounded-full border border-[#5BA3B8]/30 bg-[#5BA3B8]/10 px-3 py-1 text-xs text-[#a9d6e3]"><a href={attachment.url} target="_blank" rel="noreferrer" className="hover:text-white">{attachment.label}</a><button type="button" onClick={() => updateDraft(question.number, { attachments: draft.attachments.filter((_, attachmentIndex) => attachmentIndex !== index) })} className="text-slate-400 hover:text-rose-200" aria-label={`Remove ${attachment.label}`}>×</button></div>)}</div>}</div>
                    </article>;
                  })}</div>
                </section>)}
                <div className="sticky bottom-3 z-20 flex flex-col gap-3 rounded-2xl border border-[#5BA3B8]/30 bg-[#15263d]/95 p-4 shadow-2xl backdrop-blur lg:flex-row lg:items-center lg:justify-between"><div><p className="font-semibold text-white">Ready to save your progress?</p><p className="mt-1 text-sm text-slate-300">Save all completed answers at once. You can continue editing until you create the versioned Brand Book proposal.</p></div><Button onClick={saveCompleteForm} disabled={saveAnswers.isPending || uploadEvidence.isPending} className="bg-[#5BA3B8] text-slate-950 hover:bg-[#82c8d9]">{saveAnswers.isPending ? "Saving all answers…" : "Save complete form"}<Save className="ml-2 h-4 w-4" /></Button></div>
                {session.isComplete && <div className="flex flex-col gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-emerald-200">All 35 questions are saved</p><p className="mt-1 text-sm text-emerald-100/70">Create a versioned Brand Book proposal. No downstream automation is enabled by this action.</p></div><Button onClick={() => propose.mutate({ sessionId: session.session.id })} disabled={propose.isPending} className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200">Create proposal</Button></div>}
              </CardContent>
            </Card>}

            {proposedBook && isOwner && <Card className="border-amber-400/30 bg-amber-400/10 text-white"><CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><CircleAlert className="h-5 w-5" />Brand Book v{proposedBook.version} needs your final approval</CardTitle><CardDescription className="text-amber-100/70">The proposal is versioned and immutable after approval. Publishing, campaigns, and spend remain locked.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3 sm:flex-row"><Button onClick={() => approve.mutate({ brandBookId: proposedBook.id })} disabled={approve.isPending} className="bg-amber-200 text-amber-950 hover:bg-amber-100"><BadgeCheck className="mr-2 h-4 w-4" />Approve & activate v{proposedBook.version}</Button><Button variant="outline" onClick={() => reset.mutate({ scope: "all" })} className="border-amber-300/30 bg-transparent text-amber-100 hover:bg-amber-100/10 hover:text-white">Start a new interview version</Button></CardContent></Card>}

            <div className="grid gap-4 lg:grid-cols-3"><Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader className="pb-3"><CardTitle className="text-base">CRM baseline</CardTitle><CardDescription className="text-slate-400">Read-only, non-test Lead snapshot</CardDescription></CardHeader><CardContent>{baselineRow ? <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-slate-500">90-day Leads</p><p className="mt-1 text-lg font-semibold">{String(baselineRow.leads90d ?? "—")}</p></div><div><p className="text-slate-500">Qualified</p><p className="mt-1 text-lg font-semibold">{String(baselineRow.qualified90d ?? "—")}</p></div><div><p className="text-slate-500">Client stage</p><p className="mt-1 text-lg font-semibold">{String(baselineRow.clientStage90d ?? "—")}</p></div><div><p className="text-slate-500">Campaign gap</p><p className="mt-1 text-lg font-semibold">{String(baselineRow.unattributedCampaign90d ?? "—")}</p></div></div> : <p className="text-sm text-slate-500">Analytics role required.</p>}</CardContent></Card><Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader className="pb-3"><CardTitle className="text-base">Approval policy</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-slate-400">Every proposed Brand Book needs Mahmoud’s explicit approval. No silence is treated as approval. This workspace has no publish or spend action.</p></CardContent></Card><Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader className="pb-3"><CardTitle className="text-base">Production protections</CardTitle></CardHeader><CardContent><div className="space-y-2 text-sm text-slate-400"><p className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" />Live Meta lead operations are unchanged.</p><p className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" />CAPI remains under existing production approval control.</p><p className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" />No client PII is sent to a content model.</p></div></CardContent></Card></div>
          </TabsContent>

          <TabsContent value="book" className="space-y-5"><Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader><CardTitle className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5 text-[#8ad5e7]" />Versioned Brand Books</CardTitle><CardDescription className="text-slate-400">A published version is a governed source of truth. It cannot be silently changed; a refresh begins a new interview version.</CardDescription></CardHeader><CardContent className="space-y-4">{books.length === 0 ? <p className="text-sm text-slate-400">Complete the 35-question discovery form to create the first proposal.</p> : books.map(book => <div key={book.id} className="rounded-2xl border border-white/10 bg-[#0c1320] p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-lg font-semibold">{book.title}</p><p className="mt-1 text-sm text-slate-400">Version {book.version} · SHA-256 {book.contentHash.slice(0, 12)}… · Interview session {book.sessionId}</p></div><StateBadge state={book.status} /></div><div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-white/5 p-3"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Positioning</p><p className="mt-2 text-sm leading-6 text-slate-300">{String((book.payload as Record<string, unknown>).positioning ?? "Not available")}</p></div><div className="rounded-xl bg-white/5 p-3"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Prohibited claims</p><p className="mt-2 text-sm leading-6 text-slate-300">{String((book.payload as Record<string, unknown>).prohibitedClaims ?? "Not available")}</p></div></div></div>)}</CardContent></Card></TabsContent>

          {isOwner && <TabsContent value="governance" className="space-y-5"><div className="grid gap-5 xl:grid-cols-2"><Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader><CardTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-[#8ad5e7]" />Marketing System roles</CardTitle><CardDescription className="text-slate-400">Only Mahmoud can grant or revoke these roles. They never grant publishing or paid-campaign authority.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-[1fr_190px_auto]"><Select value={roleUserId} onValueChange={setRoleUserId}><SelectTrigger className="border-white/10 bg-[#0c1320]"><SelectValue placeholder="Select a CRM user" /></SelectTrigger><SelectContent>{users.filter(user => user.id !== undefined).map(user => <SelectItem key={user.id} value={String(user.id)}>{user.name || user.email || `User ${user.id}`}</SelectItem>)}</SelectContent></Select><Select value={roleName} onValueChange={setRoleName}><SelectTrigger className="border-white/10 bg-[#0c1320]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="marketing_manager">Marketing Manager</SelectItem><SelectItem value="researcher">Researcher</SelectItem><SelectItem value="creative_producer">Creative Producer</SelectItem><SelectItem value="analyst">Analyst</SelectItem></SelectContent></Select><Button disabled={!roleUserId || assignRole.isPending} onClick={() => assignRole.mutate({ userId: Number(roleUserId), role: roleName as "marketing_manager" | "researcher" | "creative_producer" | "analyst" })} className="bg-[#5BA3B8] text-slate-950 hover:bg-[#82c8d9]">Assign</Button></div><div className="space-y-2">{assignments.length === 0 ? <p className="text-sm text-slate-500">No roles assigned yet.</p> : assignments.map(assignment => <div key={assignment.assignmentId} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0c1320] p-3"><div><p className="font-medium">{assignment.userName || assignment.userEmail || `User ${assignment.userId}`}</p><p className="mt-1 text-xs text-slate-400">{String(assignment.role).replaceAll("_", " ")} · {assignment.isActive ? "active" : "revoked"}</p></div>{assignment.isActive && <Button variant="ghost" size="sm" onClick={() => revokeRole.mutate({ userId: assignment.userId })} className="text-rose-300 hover:bg-rose-500/10 hover:text-rose-200">Revoke</Button>}</div>)}</div></CardContent></Card>
            <Card className="border-white/10 bg-[#111b2c] text-white"><CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-[#8ad5e7]" />Provider readiness</CardTitle><CardDescription className="text-slate-400">Aliases and safe readiness only. Credentials stay server-side and no profile is enabled in Phase 1.</CardDescription></CardHeader><CardContent className="space-y-3">{providers?.profiles.map(profile => <div key={profile.id} className="rounded-xl border border-white/10 bg-[#0c1320] p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{profile.alias}</p><p className="mt-1 text-xs text-slate-400">{profile.provider}{profile.modelId ? ` · ${profile.modelId}` : ""}</p></div><StateBadge state={profile.status} /></div><p className="mt-2 text-xs leading-5 text-slate-500">{profile.notes}</p></div>)}</CardContent></Card></div></TabsContent>}
        </Tabs>
        <div className="flex justify-end"><Button variant="ghost" onClick={() => navigate("/marketing")} className="text-slate-400 hover:bg-white/5 hover:text-white">Back to Marketing module</Button></div>
      </div>
    </div>
  );
}

export default BrandStudio;
