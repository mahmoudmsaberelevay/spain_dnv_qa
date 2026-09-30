import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeDollarSign,
  BrainCircuit,
  CircleAlert,
  FileSearch,
  Gavel,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

type CouncilRole = "strategy" | "critical_review" | "research_execution" | "financial" | "opposition" | "chairperson";

const ROLE_CARDS: Array<{ role: CouncilRole; title: string; provider: string; description: string; icon: typeof Sparkles; accent: string }> = [
  { role: "strategy", title: "ChatGPT", provider: "OpenAI", description: "Strategy and integrated solution", icon: Sparkles, accent: "text-emerald-600 bg-emerald-50 border-emerald-100" },
  { role: "critical_review", title: "Claude", provider: "Anthropic", description: "Critique, logic, contracts and risk", icon: Scale, accent: "text-orange-600 bg-orange-50 border-orange-100" },
  { role: "research_execution", title: "Manus", provider: "Manus API", description: "Research, execution and file production", icon: FileSearch, accent: "text-sky-600 bg-sky-50 border-sky-100" },
  { role: "financial", title: "Financial Advisor", provider: "OpenAI", description: "Cost, return and scenario analysis", icon: BadgeDollarSign, accent: "text-amber-700 bg-amber-50 border-amber-100" },
  { role: "opposition", title: "Opposition Advisor", provider: "Anthropic", description: "Stress-test why the idea could fail", icon: CircleAlert, accent: "text-rose-600 bg-rose-50 border-rose-100" },
  { role: "chairperson", title: "Chairperson", provider: "OpenAI", description: "Synthesize views and issue the decision", icon: Gavel, accent: "text-indigo-600 bg-indigo-50 border-indigo-100" },
];

const CASE_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" },
  running: { label: "Council reviewing", className: "bg-blue-50 text-blue-700 border-blue-200" },
  awaiting_manus: { label: "Awaiting Manus", className: "bg-sky-50 text-sky-700 border-sky-200" },
  ready_for_decision: { label: "Ready for decision", className: "bg-amber-50 text-amber-700 border-amber-200" },
  finalized: { label: "Finalized", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  failed: { label: "Attention required", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function AiCouncil() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [language, setLanguage] = useState<"en" | "ar" | "both">("en");
  const [financialAssumptions, setFinancialAssumptions] = useState("");

  const casesQuery = trpc.aiCouncil.list.useQuery();
  const workspaceQuery = trpc.aiCouncil.workspace.useQuery(
    { councilCaseId: selectedCaseId ?? 0 },
    { enabled: selectedCaseId !== null }
  );

  const createMutation = trpc.aiCouncil.create.useMutation({
    onSuccess: async (councilCase) => {
      await utils.aiCouncil.list.invalidate();
      setIsCreateOpen(false);
      setTitle("");
      setBrief("");
      setFinancialAssumptions("");
      setLanguage("en");
      if (councilCase?.id) setSelectedCaseId(councilCase.id);
      toast.success("Council case saved as a draft.");
    },
    onError: (error) => toast.error(error.message),
  });

  const refreshCouncilData = async () => {
    await Promise.all([
      utils.aiCouncil.list.invalidate(),
      selectedCaseId ? utils.aiCouncil.workspace.invalidate({ councilCaseId: selectedCaseId }) : Promise.resolve(),
    ]);
  };

  const startReviewsMutation = trpc.aiCouncil.startReviews.useMutation({
    onSuccess: async () => {
      await refreshCouncilData();
      toast.success("The connected council reviews have been started.");
    },
    onError: (error) => toast.error(error.message),
  });

  const syncManusMutation = trpc.aiCouncil.syncManus.useMutation({
    onSuccess: async () => {
      await refreshCouncilData();
      toast.success("Manus task status refreshed.");
    },
    onError: (error) => toast.error(error.message),
  });

  const finalizeMutation = trpc.aiCouncil.finalizeDecision.useMutation({
    onSuccess: async () => {
      await refreshCouncilData();
      toast.success("The Chairperson decision has been finalized and recorded.");
    },
    onError: (error) => toast.error(error.message),
  });

  const selectedCase = workspaceQuery.data?.councilCase;
  const opinionByRole = useMemo(() => {
    const entries = workspaceQuery.data?.opinions ?? [];
    return new Map(entries.map((entry) => [entry.role as CouncilRole, entry]));
  }, [workspaceQuery.data?.opinions]);
  const manuscriptOpinion = opinionByRole.get("research_execution");

  const submitCase = () => {
    createMutation.mutate({
      title,
      brief,
      language,
      financialAssumptions: financialAssumptions || undefined,
    });
  };

  if (selectedCaseId !== null) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => setSelectedCaseId(null)}>
            <ArrowLeft className="h-4 w-4" /> All council cases
          </Button>
          {selectedCase && <StatusBadge status={selectedCase.status} />}
        </div>

        {workspaceQuery.isLoading ? (
          <CouncilWorkspaceSkeleton />
        ) : workspaceQuery.error || !selectedCase ? (
          <Card className="border-rose-200 bg-rose-50/60">
            <CardContent className="p-6 text-sm text-rose-800">The selected council case could not be loaded. Please return to the case list and try again.</CardContent>
          </Card>
        ) : (
          <>
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="bg-[#1A3A5C] px-6 py-7 text-white md:px-8">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div className="max-w-3xl">
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#A1C6CF]"><BrainCircuit className="h-4 w-4" /> Administrative AI Council</p>
                    <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{selectedCase.title}</h1>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">{selectedCase.brief}</p>
                  </div>
                  <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm">
                    <p className="text-xs uppercase tracking-wider text-slate-300">Case language</p>
                    <p className="mt-1 font-semibold">{selectedCase.language === "both" ? "Arabic + English" : selectedCase.language === "ar" ? "Arabic" : "English"}</p>
                  </div>
                </div>
              </div>
              {selectedCase.financialAssumptions && (
                <div className="flex gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 md:px-8">
                  <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-[#5BA3B8]" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Financial assumptions provided</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedCase.financialAssumptions}</p>
                  </div>
                </div>
              )}
            </section>

            {selectedCase.status !== "finalized" && (
              <section className="flex flex-col gap-3 rounded-xl border border-[#5BA3B8]/25 bg-[#F8FCFD] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-[#1A3A5C]">Council controls</p>
                  <p className="mt-1 text-sm text-slate-600">Reviews are initiated only when an authorized team member starts the case. Provider output is retained separately from the final decision.</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {(selectedCase.status === "draft" || selectedCase.status === "failed") && (
                    <Button onClick={() => startReviewsMutation.mutate({ councilCaseId: selectedCase.id })} disabled={startReviewsMutation.isPending} className="bg-[#1A3A5C] hover:bg-[#254f77]">
                      {startReviewsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Start council review
                    </Button>
                  )}
                  {manuscriptOpinion && ["queued", "running", "needs_input"].includes(manuscriptOpinion.status) && (
                    <Button variant="outline" onClick={() => syncManusMutation.mutate({ councilCaseId: selectedCase.id })} disabled={syncManusMutation.isPending}>
                      {syncManusMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Refresh Manus
                    </Button>
                  )}
                  {selectedCase.status === "ready_for_decision" && (
                    <Button onClick={() => finalizeMutation.mutate({ councilCaseId: selectedCase.id })} disabled={finalizeMutation.isPending} className="bg-[#C9A84C] text-[#1A3A5C] hover:bg-[#EBD990]">
                      {finalizeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gavel className="mr-2 h-4 w-4" />}
                      Issue Chairperson decision
                    </Button>
                  )}
                </div>
              </section>
            )}

            <section>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[#1A3A5C]">Council perspectives</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Every specialist view remains attributed to its provider and role.</p>
                </div>
                {selectedCase.status === "draft" && (
                  <Badge variant="outline" className="border-[#5BA3B8]/30 bg-[#5BA3B8]/10 text-[#1A3A5C]">Ready to begin provider reviews</Badge>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {ROLE_CARDS.map((role) => {
                  const opinion = opinionByRole.get(role.role);
                  const Icon = role.icon;
                  return (
                    <Card key={role.role} className="border-slate-200 shadow-sm">
                      <CardHeader className="space-y-2 pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl border", role.accent)}><Icon className="h-5 w-5" /></div>
                          <OpinionState opinion={opinion} />
                        </div>
                        <div>
                          <CardTitle className="text-base text-[#1A3A5C]">{role.title}</CardTitle>
                          <CardDescription className="mt-1">{role.description}</CardDescription>
                        </div>
                      </CardHeader>
                      <CardContent className="border-t border-slate-100 pt-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Provider</p>
                        <p className="mt-1 text-sm font-medium text-slate-700">{role.provider}</p>
                        {opinion?.content ? <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{opinion.content}</p> : <p className="mt-3 text-sm leading-6 text-slate-500">This opinion will appear after the council review begins.</p>}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>

            <Card className="border-[#C9A84C]/30 bg-[#FFFDF7] shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#C9A84C]/15 text-[#876714]"><Gavel className="h-5 w-5" /></div>
                  <div>
                    <CardTitle className="text-[#1A3A5C]">Chairperson decision</CardTitle>
                    <CardDescription>The final decision will remain separate from provider opinions and preserve its audit history.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {workspaceQuery.data?.decision ? (
                  <div className="space-y-2 text-sm text-slate-700">
                    <p className="font-semibold">{workspaceQuery.data.decision.summary}</p>
                    <p className="leading-6">{workspaceQuery.data.decision.rationale}</p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">The Chairperson will synthesize the final decision after the required specialist views are complete or explicitly marked unavailable.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">
      <section className="overflow-hidden rounded-2xl bg-[#1A3A5C] px-6 py-7 text-white shadow-sm md:px-8 md:py-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#A1C6CF]"><UsersRound className="h-4 w-4" /> ELEVAY governance workspace</p>
            <h1 className="text-3xl font-bold tracking-tight">Administrative AI Council</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">Bring strategy, critical review, research, financial analysis, opposition, and a final chairperson decision into one attributable record.</p>
          </div>
          <CreateCouncilDialog
            open={isCreateOpen}
            onOpenChange={setIsCreateOpen}
            title={title}
            brief={brief}
            language={language}
            financialAssumptions={financialAssumptions}
            onTitleChange={setTitle}
            onBriefChange={setBrief}
            onLanguageChange={setLanguage}
            onFinancialAssumptionsChange={setFinancialAssumptions}
            onSubmit={submitCase}
            isSubmitting={createMutation.isPending}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_290px]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-slate-100 pb-4">
            <div>
              <CardTitle className="text-[#1A3A5C]">Council cases</CardTitle>
              <CardDescription className="mt-1">Saved deliberations and final governance decisions.</CardDescription>
            </div>
            <Badge variant="outline" className="border-slate-200 text-slate-600">{casesQuery.data?.length ?? 0} total</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {casesQuery.isLoading ? <CaseListSkeleton /> : casesQuery.error ? (
              <div className="p-8 text-center text-sm text-rose-700">Unable to load council cases. Please refresh this page.</div>
            ) : (casesQuery.data?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#5BA3B8]/10 text-[#1A3A5C]"><BrainCircuit className="h-6 w-6" /></div>
                <h2 className="mt-4 font-semibold text-[#1A3A5C]">No council cases yet</h2>
                <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">Create a case to capture a decision question and send it through the connected council workflow.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {casesQuery.data?.map((councilCase) => (
                  <button key={councilCase.id} onClick={() => setSelectedCaseId(councilCase.id)} className="group flex w-full items-center justify-between gap-5 px-6 py-5 text-left transition-colors hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#1A3A5C] group-hover:text-[#5BA3B8]">{councilCase.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{councilCase.brief}</p>
                    </div>
                    <div className="shrink-0 space-y-2 text-right">
                      <StatusBadge status={councilCase.status} />
                      <p className="text-xs text-slate-400">{formatDate(councilCase.updatedAt)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-[#5BA3B8]/25 bg-[#F8FCFD] shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#5BA3B8]/15 text-[#1A3A5C]"><ShieldCheck className="h-4 w-4" /></div>
            <CardTitle className="mt-3 text-base text-[#1A3A5C]">Connected providers</CardTitle>
            <CardDescription>Provider identities remain visible across every council opinion.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProviderLine title="ChatGPT" provider="OpenAI" />
            <ProviderLine title="Claude" provider="Anthropic" />
            <ProviderLine title="Manus" provider="Manus API" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CreateCouncilDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  brief: string;
  language: "en" | "ar" | "both";
  financialAssumptions: string;
  onTitleChange: (value: string) => void;
  onBriefChange: (value: string) => void;
  onLanguageChange: (value: "en" | "ar" | "both") => void;
  onFinancialAssumptionsChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  const valid = props.title.trim().length >= 3 && props.brief.trim().length >= 20;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogTrigger asChild><Button className="bg-[#C9A84C] text-[#1A3A5C] hover:bg-[#EBD990] shadow-sm"><Plus className="mr-2 h-4 w-4" /> New council case</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl text-[#1A3A5C]">Create a council case</DialogTitle>
          <DialogDescription>State the decision question, relevant context, and any known financial assumptions. The case remains a draft until the review is started.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-3">
          <div className="space-y-2"><Label htmlFor="council-title">Decision title</Label><Input id="council-title" value={props.title} onChange={(event) => props.onTitleChange(event.target.value)} placeholder="Example: Should we launch a new residency program?" maxLength={255} /></div>
          <div className="space-y-2"><Label htmlFor="council-brief">Case brief and context</Label><Textarea id="council-brief" value={props.brief} onChange={(event) => props.onBriefChange(event.target.value)} placeholder="Describe the proposal, the objective, constraints, stakeholders, timing, and the decision required." className="min-h-44 resize-y" maxLength={50_000} /></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2"><Label>Working language</Label><Select value={props.language} onValueChange={(value) => props.onLanguageChange(value as "en" | "ar" | "both")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="ar">Arabic</SelectItem><SelectItem value="both">Arabic + English</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="council-financial">Financial assumptions</Label><Textarea id="council-financial" value={props.financialAssumptions} onChange={(event) => props.onFinancialAssumptionsChange(event.target.value)} placeholder="Budget, expected revenue, costs, timing…" className="min-h-24 resize-y" maxLength={20_000} /></div>
          </div>
          <div className="flex justify-end gap-3 border-t pt-5"><Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>Cancel</Button><Button type="button" disabled={!valid || props.isSubmitting} onClick={props.onSubmit} className="bg-[#1A3A5C] hover:bg-[#254f77]">{props.isSubmitting ? "Saving…" : "Save council draft"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: string }) {
  const item = CASE_STATUS[status] ?? { label: status, className: "bg-slate-100 text-slate-700 border-slate-200" };
  return <Badge variant="outline" className={cn("whitespace-nowrap font-medium", item.className)}>{item.label}</Badge>;
}

function OpinionState({ opinion }: { opinion: { status: string } | undefined }) {
  if (!opinion) return <Badge variant="outline" className="border-slate-200 text-slate-500">Not requested</Badge>;
  const styles: Record<string, string> = { completed: "border-emerald-200 bg-emerald-50 text-emerald-700", running: "border-blue-200 bg-blue-50 text-blue-700", queued: "border-slate-200 bg-slate-50 text-slate-600", failed: "border-rose-200 bg-rose-50 text-rose-700", needs_input: "border-amber-200 bg-amber-50 text-amber-700", unavailable: "border-slate-200 bg-slate-50 text-slate-600" };
  return <Badge variant="outline" className={cn("capitalize", styles[opinion.status] ?? styles.queued)}>{opinion.status.replace("_", " ")}</Badge>;
}

function ProviderLine({ title, provider }: { title: string; provider: string }) {
  return <div className="flex items-center justify-between rounded-lg border border-[#5BA3B8]/15 bg-white px-3 py-2"><span className="text-sm font-medium text-[#1A3A5C]">{title}</span><span className="text-xs text-slate-500">{provider}</span></div>;
}

function CaseListSkeleton() {
  return <div className="space-y-0 divide-y divide-slate-100">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="flex items-center justify-between gap-4 px-6 py-5"><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-5/6" /></div><Skeleton className="h-6 w-24" /></div>)}</div>;
}

function CouncilWorkspaceSkeleton() {
  return <div className="space-y-6"><Skeleton className="h-64 rounded-2xl" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-60 rounded-xl" />)}</div></div>;
}
