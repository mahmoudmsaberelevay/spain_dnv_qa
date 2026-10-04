import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Eye,
  FileCheck2,
  FilePenLine,
  FileUp,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  PlugZap,
  Save,
  Settings2,
  Sparkles,
  StopCircle,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ItemType = "research_update" | "static_post" | "carousel" | "reel" | "image" | "graphic" | "ad_setup";
type DraftItem = {
  itemType: ItemType;
  title: string;
  programKey: string;
  objective: string;
  creativeDirection: string;
  scriptCopy: string;
  caption: string;
  cta: string;
  hashtags: string;
  onScreenEnglishText: string;
  visualBrief: string;
  plannedDay: string;
  plannedTime: string;
  sourceClaimIds: string;
  isSelected: boolean;
};

const emptyItem = (): DraftItem => ({
  itemType: "static_post",
  title: "",
  programKey: "",
  objective: "",
  creativeDirection: "",
  scriptCopy: "",
  caption: "",
  cta: "",
  hashtags: "",
  onScreenEnglishText: "",
  visualBrief: "",
  plannedDay: "",
  plannedTime: "",
  sourceClaimIds: "",
  isSelected: true,
});

const itemLabels: Record<ItemType, string> = {
  research_update: "Research update",
  static_post: "Static post",
  carousel: "Carousel",
  reel: "Reel",
  image: "Image",
  graphic: "Graphic",
  ad_setup: "Ad setup",
};

const statusStyles: Record<string, string> = {
  draft: "border-slate-500/40 bg-slate-500/10 text-white",
  on_hold: "border-orange-500/40 bg-orange-500/10 text-orange-200",
  draft_prepared: "border-slate-500/40 bg-slate-500/10 text-white",
  pending_individual_review: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  changes_requested: "border-orange-500/40 bg-orange-500/10 text-orange-200",
  approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  rejected: "border-red-500/40 bg-red-500/10 text-red-200",
  stopped: "border-red-500/40 bg-red-500/10 text-red-200",
};

const settingControls = [
  { icon: Sparkles, title: "Brand Studio", text: "35-question Brand Discovery and Brand Book approval.", href: "/marketing/brand-studio" },
  { icon: BookOpenCheck, title: "Knowledge Library", text: "Official sources, evidence and approved claims.", href: "/marketing/knowledge-library" },
  { icon: ClipboardCheck, title: "Work Orders", text: "Controlled research and creative work planning.", href: "/marketing/work-orders" },
  { icon: Target, title: "Meta Strategy", text: "Paid-media objectives, evidence gaps and strategy intake.", href: "/marketing/meta-ads-strategy" },
  { icon: FileCheck2, title: "Strategy Packet", text: "The approved, hash-locked Meta planning packet.", href: "/marketing/meta-ads-strategy-packet" },
  { icon: ClipboardCheck, title: "Pilot Proposal", text: "Future pilot scope, measurement and rollback controls.", href: "/marketing/campaign-pilot-proposal" },
  { icon: BarChart3, title: "Pilot Readiness", text: "Aggregate evidence gates and pilot measurement.", href: "/marketing/pilot-readiness" },
  { icon: FileCheck2, title: "Decision Log", text: "Weekly executive briefs and owner decision history.", href: "/marketing/weekly-executive-briefs" },
  { icon: PlugZap, title: "Provider Connections", text: "Secure provider roles and readiness-only status.", href: "/marketing/provider-connections" },
] as const;

const productionControls = [
  { icon: FilePenLine, title: "Content Studio & Approval Inbox", text: "Prepare detailed content packets, final previews and individual approval decisions.", href: "/marketing/content-studio" },
] as const;

function nextSaturday() {
  const date = new Date();
  const days = (6 - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("Could not read the selected file."));
  reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
  reader.readAsDataURL(file);
});

function asDraft(item: any): DraftItem {
  return {
    itemType: item.itemType as ItemType,
    title: item.title ?? "",
    programKey: item.programKey ?? "",
    objective: item.objective ?? "",
    creativeDirection: item.creativeDirection ?? "",
    scriptCopy: item.scriptCopy ?? "",
    caption: item.caption ?? "",
    cta: item.cta ?? "",
    hashtags: Array.isArray(item.hashtags) ? item.hashtags.join(", ") : "",
    onScreenEnglishText: typeof item.metadata?.onScreenEnglishText === "string" ? item.metadata.onScreenEnglishText : "",
    visualBrief: item.visualBrief ?? "",
    plannedDay: item.plannedDay ?? "",
    plannedTime: item.plannedTime ?? "",
    sourceClaimIds: Array.isArray(item.sourceClaimIds) ? item.sourceClaimIds.join(", ") : "",
    isSelected: Boolean(item.isSelected),
  };
}

function normalizeDraft(item: DraftItem) {
  const claimIds = item.sourceClaimIds.split(",").map(value => Number(value.trim())).filter(value => Number.isInteger(value) && value > 0);
  return {
    itemType: item.itemType,
    title: item.title.trim(),
    ...(item.programKey.trim() ? { programKey: item.programKey.trim() } : {}),
    objective: item.objective.trim(),
    ...(item.creativeDirection.trim() ? { creativeDirection: item.creativeDirection.trim() } : {}),
    ...(item.scriptCopy.trim() ? { scriptCopy: item.scriptCopy.trim() } : {}),
    ...(item.caption.trim() ? { caption: item.caption.trim() } : {}),
    ...(item.cta.trim() ? { cta: item.cta.trim() } : {}),
    hashtags: item.hashtags.split(",").map(value => value.trim()).filter(Boolean),
    metadata: item.onScreenEnglishText.trim() ? { onScreenEnglishText: item.onScreenEnglishText.trim() } : {},
    ...(item.visualBrief.trim() ? { visualBrief: item.visualBrief.trim() } : {}),
    ...(item.plannedDay ? { plannedDay: item.plannedDay as "Sunday" | "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" } : {}),
    ...(item.plannedTime ? { plannedTime: item.plannedTime } : {}),
    sourceClaimIds: claimIds,
    isSelected: item.isSelected,
  };
}

function SectionHeading({ icon: Icon, eyebrow, title, description }: { icon: typeof Settings2; eyebrow: string; title: string; description: string }) {
  return (
    <div className="mb-7 flex gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5BA3B8] to-[#1A3A5C] shadow-lg shadow-cyan-900/30">
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#81c7d8]">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-100">{description}</p>
      </div>
    </div>
  );
}

export default function WeeklyResults() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const workspace = trpc.marketingSystem.getWeeklyResultsWorkspace.useQuery(undefined, {
    // Keeps item-linked Manus status current without relying on a manual page refresh.
    // This is a CRM read only; it does not poll Manus or perform external actions.
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
  const [tab, setTab] = useState<"setup" | "weekly">(() => new URLSearchParams(window.location.search).get("view") === "setup" ? "setup" : "weekly");
  const [settingsDraft, setSettingsDraft] = useState<any>(null);
  const [priorityText, setPriorityText] = useState("");
  const [newPlanTitle, setNewPlanTitle] = useState("Next week controlled content plan");
  const [newPlanWeek, setNewPlanWeek] = useState(nextSaturday());
  const [draftItems, setDraftItems] = useState<DraftItem[]>([emptyItem()]);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editDraft, setEditDraft] = useState<DraftItem>(emptyItem());
  const [expandedPlan, setExpandedPlan] = useState<number | null>(null);
  const [decisionItemId, setDecisionItemId] = useState<number | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [designQcConfirmed, setDesignQcConfirmed] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState("");
  const [performance, setPerformance] = useState({ periodStart: "", spendEgp: "0", impressions: "0", clicks: "0", leadForms: "0", qualifiedLeads: "0", clientStageLeads: "0", notes: "" });

  useEffect(() => {
    if (!workspace.data) return;
    const settings = workspace.data.settings as any;
    setSettingsDraft({ ...settings, contentMix: settings.contentMix ?? {} });
    setPriorityText((settings.programPriorities ?? []).map((priority: any) => `${priority.key}:${priority.priority}${priority.note ? ` (${priority.note})` : ""}`).join("; "));
  }, [workspace.data]);

  const invalidate = () => utils.marketingSystem.getWeeklyResultsWorkspace.invalidate();
  const saveSetup = trpc.marketingSystem.saveWeeklyResultsSetup.useMutation({ onSuccess: async () => { toast.success("Setup saved. The background schedule remains execution-locked."); await invalidate(); }, onError: error => toast.error(error.message) });
  const createPlan = trpc.marketingSystem.createWeeklyResultsPlan.useMutation({ onSuccess: async () => { toast.success("Weekly plan saved as an internal draft."); setDraftItems([emptyItem()]); await invalidate(); }, onError: error => toast.error(error.message) });
  const updateItem = trpc.marketingSystem.updateWeeklyResultsItem.useMutation({ onSuccess: async () => { toast.success("Item updated and returned to draft."); setEditingItem(null); await invalidate(); }, onError: error => toast.error(error.message) });
  const submitReview = trpc.marketingSystem.submitWeeklyResultsItemForIndividualReview.useMutation({ onSuccess: async () => { toast.success("Item is ready for individual copy-and-plan review. Final approval remains locked until its system-generated media preview is ready."); await invalidate(); }, onError: error => toast.error(error.message) });
  const decideItem = trpc.marketingSystem.decideWeeklyResultsItem.useMutation({ onSuccess: async result => { if (result.regeneration?.queued) toast.success("Comment saved. The previous preview was removed and the replacement is now generating."); else if (result.regeneration?.error) toast.warning(`Comment saved. Replacement generation is waiting: ${result.regeneration.error}`); else toast.success("Individual decision recorded."); setDecisionItemId(null); setDecisionNote(""); setFeedbackCategory(""); setDesignQcConfirmed(false); await invalidate(); }, onError: error => toast.error(error.message) });
  const savePerformance = trpc.marketingSystem.saveWeeklyResultsPerformance.useMutation({ onSuccess: async () => { toast.success("Aggregate performance saved for future planning."); await invalidate(); }, onError: error => toast.error(error.message) });
  const uploadDesignSystem = trpc.marketingSystem.uploadDesignSystemAsset.useMutation({ onSuccess: async result => { toast.success(result.assetType === "logo" ? "Official logo stored for future creative briefs." : "Design instructions stored and extracted for review."); await invalidate(); }, onError: error => toast.error(error.message) });
  const archiveDesignSystem = trpc.marketingSystem.archiveDesignSystemAsset.useMutation({ onSuccess: async () => { toast.success("Design System asset archived. It will not be used for future creative packets."); await invalidate(); }, onError: error => toast.error(error.message) });
  const enableAutomation = trpc.marketingSystem.enableWeeklyAutomation.useMutation({ onSuccess: async () => { toast.success("Weekly AI production automation is enabled with the USD 100 monthly cap. It creates review-ready material only."); await invalidate(); }, onError: error => toast.error(error.message) });
  const pauseAutomation = trpc.marketingSystem.pauseWeeklyAutomation.useMutation({ onSuccess: async () => { toast.success("Weekly AI production automation has been paused and the three planning provider profiles are locked."); await invalidate(); }, onError: error => toast.error(error.message) });
  const runAutomationTest = trpc.marketingSystem.runWeeklyAutomationTest.useMutation({ onSuccess: async result => { toast.success(result.reused ? "This week's review-only plan already exists. Review it in the results below." : "The multi-model test is running. OpenAI and Claude are preparing their review, then Manus will return the review-ready weekly pack."); await invalidate(); }, onError: error => toast.error(error.message) });
  const generatePlanMedia = trpc.marketingSystem.generateSystemMediaForWeeklyPlan.useMutation({ onSuccess: async result => { toast.success(result.queued ? `${result.queued} system media job(s) started. Assets will appear here for final approval when Manus finishes.` : "Existing system media jobs are already being processed for this plan."); await invalidate(); }, onError: error => toast.error(error.message) });
  const retryMediaJob = trpc.marketingSystem.retryFailedSystemMediaJob.useMutation({ onSuccess: async result => { toast.success(result.retried ? "One bounded retry was started for this media item." : "A retry is already in progress for this item."); await invalidate(); }, onError: error => toast.error(error.message) });
  const authorizeChannelRelease = trpc.marketingSystem.authorizeSocialChannelRelease.useMutation({ onSuccess: async () => { toast.success("Owner channel authorization recorded. Meta is still not configured to publish."); await invalidate(); }, onError: error => toast.error(error.message) });
  const revokeChannelRelease = trpc.marketingSystem.revokeSocialChannelRelease.useMutation({ onSuccess: async () => { toast.success("Owner channel authorization revoked."); await invalidate(); }, onError: error => toast.error(error.message) });

  const planItems = useMemo(() => workspace.data?.plans.flatMap((plan: any) => plan.items.map((item: any) => ({ ...item, plan }))) ?? [], [workspace.data?.plans]);
  const mediaJobsByItem = useMemo(() => (workspace.data?.mediaProduction?.jobs ?? []).reduce((groups: Record<string, any[]>, job: any) => {
    const key = String(job.weeklyItemId); (groups[key] ??= []).push(job); return groups;
  }, {}), [workspace.data?.mediaProduction?.jobs]);
  const releasesByItem = useMemo(() => (workspace.data?.socialReleaseAuthorizations ?? []).reduce((groups: Record<string, any[]>, release: any) => {
    const key = String(release.weeklyItemId); (groups[key] ??= []).push(release); return groups;
  }, {}), [workspace.data?.socialReleaseAuthorizations]);
  const pendingCount = planItems.filter((item: any) => item.status === "pending_individual_review").length;
  const approvedCount = planItems.filter((item: any) => item.status === "approved").length;

  if (workspace.isLoading || !workspace.data || !settingsDraft) {
    return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#5BA3B8]" /></div>;
  }

  const updateDraftItem = (index: number, patch: Partial<DraftItem>) => setDraftItems(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const parsePriorities = () => priorityText.split(";").map(part => part.trim()).filter(Boolean).map(part => {
    const [, key = "", priority = "5", note = ""] = part.match(/^([a-z0-9_]+)\s*:\s*(\d+)(?:\s*\((.*)\))?$/i) ?? [];
    return { key: key.toLowerCase(), priority: Math.max(1, Math.min(10, Number(priority) || 5)), ...(note.trim() ? { note: note.trim() } : {}) };
  }).filter(priority => priority.key);
  const itemDecision = planItems.find((item: any) => item.id === decisionItemId);
  const uploadDesignAsset = async (assetType: "design_instruction" | "logo", file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error("Design System files must be 10 MB or smaller.");
    const allowed = assetType === "logo"
      ? ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]
      : ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/markdown", "text/plain"];
    if (!allowed.includes(file.type)) return toast.error(assetType === "logo" ? "Use PNG, JPEG, WebP, or SVG for the official logo." : "Use PDF, DOCX, Markdown, or text for Design System instructions.");
    await uploadDesignSystem.mutateAsync({ assetType, title: assetType === "logo" ? "Official ELEVAY logo" : "ELEVAY Design System", fileName: file.name, mimeType: file.type as any, fileBase64: await toBase64(file) });
  };

  return (
    <div className="agentic-readable min-h-full bg-[#0c1320] text-white"><div className="mx-auto max-w-7xl p-4 pb-12 md:p-7">
      <button onClick={() => navigate("/marketing")} className="mb-5 inline-flex items-center gap-2 text-sm text-slate-100 transition hover:text-white"><ArrowLeft className="h-4 w-4" /> Marketing module</button>
      <div className="mb-6 rounded-2xl border border-amber-300/20 bg-gradient-to-r from-amber-400/10 via-[#1A3A5C]/30 to-[#5BA3B8]/10 p-4 text-sm text-amber-100">
        <div className="flex gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-[#e5c16d]" /><div><strong>Controlled planning only.</strong> {workspace.data.policy}</div></div>
      </div>

      <div className="mb-7 grid gap-3 md:grid-cols-2">
        <button onClick={() => setTab("setup")} className={`rounded-2xl border p-5 text-left transition ${tab === "setup" ? "border-[#5BA3B8] bg-[#173a4b] shadow-lg shadow-cyan-950/20" : "border-white/10 bg-[#141d30] hover:border-white/25"}`}>
          <div className="flex items-center justify-between"><Settings2 className="h-6 w-6 text-[#81c7d8]" /><span className="rounded-full bg-white/10 px-2 py-1 text-xs text-white">Configuration</span></div>
          <h2 className="mt-4 text-xl font-bold text-white">1. Setup</h2><p className="mt-1 text-sm leading-6 text-slate-100">Control Saturday timing, 10:00 Cairo delivery target, programmes, content mix, directions, and learning rules.</p>
        </button>
        <button onClick={() => setTab("weekly")} className={`rounded-2xl border p-5 text-left transition ${tab === "weekly" ? "border-[#C9A84C] bg-[#302a1c] shadow-lg shadow-amber-950/20" : "border-white/10 bg-[#141d30] hover:border-white/25"}`}>
          <div className="flex items-center justify-between"><CalendarClock className="h-6 w-6 text-[#e5c16d]" /><span className="rounded-full bg-white/10 px-2 py-1 text-xs text-white">Review queue</span></div>
          <h2 className="mt-4 text-xl font-bold text-white">2. Weekly Results</h2><p className="mt-1 text-sm leading-6 text-slate-100">Review, edit, select, and individually approve every post, carousel, reel, image, or graphic.</p>
        </button>
      </div>

      {tab === "setup" ? (
        <section>
          <SectionHeading icon={Settings2} eyebrow="Marketing / Setup" title="Weekly preparation rules" description="These CRM settings shape future weekly plans. Every Saturday is configured in Cairo time, but automation still waits for the separate execution release." />
          <div className="mb-6 rounded-2xl border border-[#5BA3B8]/25 bg-[#111b2c] p-5 md:p-6">
            <div className="flex items-start gap-3"><BrainCircuit className="mt-0.5 h-5 w-5 shrink-0 text-[#81c7d8]" /><div><h2 className="font-semibold text-white">Settings controls</h2><p className="mt-1 text-sm leading-6 text-slate-100">Brand, strategy, evidence, pilot safeguards, decision records and provider readiness are all configuration controls. Open any item below without leaving Settings.</p></div></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {settingControls.map(control => { const Icon = control.icon; return <button key={control.href} onClick={() => navigate(control.href)} className="rounded-xl border border-white/10 bg-black/10 p-4 text-left transition hover:border-[#5BA3B8]/60 hover:bg-[#142139]"><div className="flex items-start gap-3"><div className="rounded-lg bg-[#5BA3B8]/15 p-2 text-[#a9d6e3]"><Icon className="h-4 w-4" /></div><div><p className="font-semibold text-white">{control.title}</p><p className="mt-1 text-xs leading-5 text-slate-100">{control.text}</p></div></div></button>; })}
            </div>
          </div>
          <div className="mb-6 rounded-2xl border border-[#C9A84C]/30 bg-[#C9A84C]/5 p-5 md:p-6"><div className="flex items-start gap-3"><FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-[#e5c16d]" /><div><h2 className="font-semibold text-white">Creative language policy — enforced</h2><ul className="mt-2 space-y-1 text-sm leading-6 text-slate-100"><li><strong>Arabic required:</strong> campaign copy, post copy, CTAs, reel scripts and voice-over. <strong>Captions may be bilingual Arabic–English.</strong></li><li><strong>English only:</strong> text physically rendered inside a static, carousel, reel, image or graphic. Write <code>NONE</code> when no text appears inside the visual.</li><li><strong>Voice-over exception:</strong> country names may be written in English; every other spoken word must be Arabic.</li></ul><p className="mt-3 text-xs text-amber-100">The CRM blocks a production item from individual review if the language fields do not follow these rules. Final-preview QA verifies the rendered asset too.</p></div></div></div>
          <AutomationControlCard
            automation={workspace.data.automation as any}
            onEnable={() => enableAutomation.mutate({ monthlyBudgetUsd: 100, perRunReserveUsd: 20 })}
            onPause={() => pauseAutomation.mutate({ reason: "Paused from the ELEVAY Agentic Marketing Settings workspace." })}
            onTest={() => runAutomationTest.mutate()}
            isPending={enableAutomation.isPending || pauseAutomation.isPending || runAutomationTest.isPending}
          />
          <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-2xl border border-white/10 bg-[#141d30] p-5 md:p-6">
              <div className="mb-5 flex items-center gap-2"><CalendarClock className="h-5 w-5 text-[#81c7d8]" /><h2 className="font-semibold text-white">Saturday preparation schedule</h2></div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div><Label>Weekly preparation day — Cairo</Label><select className="mt-2 h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={String(settingsDraft.prepareDayOfWeek ?? 6)} onChange={event => setSettingsDraft((value: any) => ({ ...value, prepareDayOfWeek: Number(event.target.value) }))}>{[[0, "Sunday"], [1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"]].map(([value, label]) => <option key={value} value={value} className="bg-slate-900">{label}</option>)}</select></div>
                <div><Label>Preparation start — Cairo</Label><Input className="mt-2" type="time" value={settingsDraft.prepareStartTime ?? "08:00"} onChange={event => setSettingsDraft((value: any) => ({ ...value, prepareStartTime: event.target.value }))} /></div>
                <div><Label>Plan delivery target — Cairo</Label><Input className="mt-2" type="time" value={settingsDraft.deliveryDeadlineTime ?? "10:00"} onChange={event => setSettingsDraft((value: any) => ({ ...value, deliveryDeadlineTime: event.target.value }))} /></div>
              </div>
              <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-black/10 p-3 text-sm text-white"><Checkbox checked={Boolean(settingsDraft.preparationScheduleEnabled)} onCheckedChange={checked => setSettingsDraft((value: any) => ({ ...value, preparationScheduleEnabled: checked === true }))} /> Keep the Saturday CRM background schedule configured</label>
              <p className="mt-3 text-xs leading-5 text-white">Current state: <span className="font-semibold text-amber-300">{settingsDraft.scheduleState}</span>. Saving this does not activate provider work, publishing, Meta, CAPI, campaigns, or spend.</p>

              <div className="mt-6 grid gap-4">
                <div><Label>Weekly goal</Label><Textarea className="mt-2" value={settingsDraft.weeklyGoal ?? ""} onChange={event => setSettingsDraft((value: any) => ({ ...value, weeklyGoal: event.target.value }))} placeholder="Example: grow qualified Spain DNV awareness with Arabic-first educational content." /></div>
                <div><Label>Programme priorities</Label><Input className="mt-2" value={priorityText} onChange={event => setPriorityText(event.target.value)} placeholder="spain_dnv:10; malta_mprp:8" /><p className="mt-1 text-xs text-white">Use programme_key:priority, separated by semicolons. Priority is 1–10.</p></div>
                <div><Label>Updated sources / information instruction</Label><Textarea className="mt-2" value={settingsDraft.updatedSourcesNote ?? ""} onChange={event => setSettingsDraft((value: any) => ({ ...value, updatedSourcesNote: event.target.value }))} placeholder="State what evidence must be checked before a future plan is prepared." /><p className="mt-2 text-xs leading-5 text-[#b3e7f2]">Default rule: use the owner-provided Spain and Malta internal references for review-only planning. Government or other external sources are never used automatically and need your confirmation on the related content first.</p></div>
                <div><Label>Creative direction</Label><Textarea className="mt-2" value={settingsDraft.creativeDirection ?? ""} onChange={event => setSettingsDraft((value: any) => ({ ...value, creativeDirection: event.target.value }))} placeholder="Voice, visual direction, campaign theme, and non-negotiable brand rules." /></div>
              </div>
              <div className="mt-6 rounded-xl border border-[#C9A84C]/25 bg-[#C9A84C]/5 p-4"><div className="flex items-start gap-3"><BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-[#e5c16d]" /><div><h3 className="font-semibold text-white">30-day Marketing Strategy targets</h3><p className="mt-1 text-xs leading-5 text-slate-100">These are planning targets and approved budget limits. They do not create an ad, set a budget in Meta, or authorize spend.</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricInput label="Target likes" value={String(settingsDraft.targetLikes30d ?? 0)} onChange={value => setSettingsDraft((current: any) => ({ ...current, targetLikes30d: Number(value) }))} /><MetricInput label="Target views" value={String(settingsDraft.targetViews30d ?? 0)} onChange={value => setSettingsDraft((current: any) => ({ ...current, targetViews30d: Number(value) }))} /><MetricInput label="Target leads" value={String(settingsDraft.targetLeads30d ?? 0)} onChange={value => setSettingsDraft((current: any) => ({ ...current, targetLeads30d: Number(value) }))} /><MetricInput label="Qualified leads" value={String(settingsDraft.targetQualifiedLeads30d ?? 0)} onChange={value => setSettingsDraft((current: any) => ({ ...current, targetQualifiedLeads30d: Number(value) }))} /><MetricInput label="Signed clients" value={String(settingsDraft.targetSignedClients30d ?? 0)} onChange={value => setSettingsDraft((current: any) => ({ ...current, targetSignedClients30d: Number(value) }))} /><MetricInput label="Target CPL — EGP" value={String(settingsDraft.targetCostPerLeadEgp ?? 0)} onChange={value => setSettingsDraft((current: any) => ({ ...current, targetCostPerLeadEgp: Number(value) }))} /><MetricInput label="Maximum ad spend — EGP" value={String(settingsDraft.targetMaxAdSpend30dEgp ?? 0)} onChange={value => setSettingsDraft((current: any) => ({ ...current, targetMaxAdSpend30dEgp: Number(value) }))} /><MetricInput label="Requested approval-rate target %" value={String(settingsDraft.requestedAutopublishThreshold ?? 90)} onChange={value => setSettingsDraft((current: any) => ({ ...current, requestedAutopublishThreshold: Number(value) }))} /></div><p className="mt-3 text-xs leading-5 text-amber-100/80"><strong>Important:</strong> a 90% approval target is measured as a quality KPI only. It cannot bypass the required individual approval decision, and no publish control exists while the execution release is locked.</p></div>
              <div className="mt-6 flex justify-end"><Button className="gap-2 bg-[#5BA3B8] text-white hover:bg-[#4a90a5]" onClick={() => saveSetup.mutate({ prepareDayOfWeek: Number(settingsDraft.prepareDayOfWeek ?? 6), prepareStartTime: settingsDraft.prepareStartTime, deliveryDeadlineTime: settingsDraft.deliveryDeadlineTime, preparationScheduleEnabled: Boolean(settingsDraft.preparationScheduleEnabled), weeklyGoal: settingsDraft.weeklyGoal || undefined, programPriorities: parsePriorities(), updatedSourcesNote: settingsDraft.updatedSourcesNote || undefined, creativeDirection: settingsDraft.creativeDirection || undefined, contentMix: settingsDraft.contentMix, allocationRules: settingsDraft.allocationRules ?? {}, learningEnabled: Boolean(settingsDraft.learningEnabled), targetLikes30d: Number(settingsDraft.targetLikes30d ?? 0), targetViews30d: Number(settingsDraft.targetViews30d ?? 0), targetLeads30d: Number(settingsDraft.targetLeads30d ?? 0), targetQualifiedLeads30d: Number(settingsDraft.targetQualifiedLeads30d ?? 0), targetSignedClients30d: Number(settingsDraft.targetSignedClients30d ?? 0), targetCostPerLeadEgp: Number(settingsDraft.targetCostPerLeadEgp ?? 0), targetMaxAdSpend30dEgp: Number(settingsDraft.targetMaxAdSpend30dEgp ?? 0), requestedAutopublishThreshold: Math.max(90, Math.min(100, Number(settingsDraft.requestedAutopublishThreshold ?? 90))) })} disabled={saveSetup.isPending}><Save className="h-4 w-4" /> {saveSetup.isPending ? "Saving…" : "Save settings"}</Button></div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#141d30] p-5 md:p-6">
              <h2 className="font-semibold text-white">Content mix and allocation</h2><p className="mt-1 text-sm text-slate-100">Set how many content proposals a future plan should prepare. Nothing is generated until the execution release.</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {(Object.keys(itemLabels) as ItemType[]).map(type => <div key={type}><Label className="text-xs">{itemLabels[type]}</Label><Input className="mt-1" type="number" min="0" max="12" value={settingsDraft.contentMix?.[type] ?? 0} onChange={event => setSettingsDraft((value: any) => ({ ...value, contentMix: { ...value.contentMix, [type]: Number(event.target.value) } }))} /></div>)}
              </div>
              <div className="mt-6"><Label>Rotation rules</Label><Textarea className="mt-2" value={settingsDraft.allocationRules?.rotationNote ?? ""} onChange={event => setSettingsDraft((value: any) => ({ ...value, allocationRules: { ...(value.allocationRules ?? {}), rotationNote: event.target.value } }))} placeholder="How programmes, themes, and formats should rotate." /></div>
              <div className="mt-4"><Label>Platform allocation notes</Label><Textarea className="mt-2" value={settingsDraft.allocationRules?.platformNote ?? ""} onChange={event => setSettingsDraft((value: any) => ({ ...value, allocationRules: { ...(value.allocationRules ?? {}), platformNote: event.target.value } }))} placeholder="Platform-specific constraints or preferred allocation." /></div>
              <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-black/10 p-3 text-sm text-white"><Checkbox checked={Boolean(settingsDraft.learningEnabled)} onCheckedChange={checked => setSettingsDraft((value: any) => ({ ...value, learningEnabled: checked === true }))} /> Use recorded aggregate results and decision feedback as next-week planning inputs</label>
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-[#141d30] p-5 md:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><h2 className="font-semibold text-white">Design System and official logo</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-100">Upload one Design System document (PDF, DOCX, Markdown, or text) and the official logo. The document is extracted server-side into reviewable future-creative rules; the active files are versioned and attached to new creative packets. This does not send a provider task or generate material.</p></div><span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">Creative execution locked</span></div><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="flex cursor-pointer flex-col justify-between rounded-xl border border-dashed border-[#5BA3B8]/40 bg-[#5BA3B8]/5 p-4 transition hover:bg-[#5BA3B8]/10"><div><p className="font-medium text-white">Design instruction document</p><p className="mt-1 text-xs leading-5 text-slate-100">PDF, DOCX, Markdown, or text · maximum 10 MB · rules are extracted with a server-side review step.</p></div><span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#b3e7f2]"><FileUp className="h-4 w-4" /> {uploadDesignSystem.isPending ? "Uploading…" : "Upload instructions"}</span><input className="hidden" type="file" accept=".pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain" onChange={event => uploadDesignAsset("design_instruction", event.target.files?.[0])} /></label><label className="flex cursor-pointer flex-col justify-between rounded-xl border border-dashed border-[#C9A84C]/40 bg-[#C9A84C]/5 p-4 transition hover:bg-[#C9A84C]/10"><div><p className="font-medium text-white">Official ELEVAY logo</p><p className="mt-1 text-xs leading-5 text-slate-100">PNG, JPEG, WebP, or SVG · maximum 10 MB · use an unmodified official file.</p></div><span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#e5c16d]"><FileUp className="h-4 w-4" /> {uploadDesignSystem.isPending ? "Uploading…" : "Upload logo"}</span><input className="hidden" type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" onChange={event => uploadDesignAsset("logo", event.target.files?.[0])} /></label></div><div className="mt-5 grid gap-3 md:grid-cols-2">{workspace.data.designSystem.length === 0 ? <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100 md:col-span-2">No active Design System document or logo yet. Future creative packets stay blocked until both are set.</p> : workspace.data.designSystem.map((asset: any) => <article key={asset.id} className="rounded-xl border border-white/10 bg-black/10 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-white">{asset.assetType === "logo" ? "Logo" : "Design instructions"}: {asset.title}</p><p className="mt-1 text-xs text-white">{asset.originalFileName} · {asset.extractionStatus.replaceAll("_", " ")}</p></div><Button variant="ghost" size="sm" className="text-slate-100 hover:text-rose-200" onClick={() => archiveDesignSystem.mutate({ assetId: asset.id })} disabled={archiveDesignSystem.isPending}>Archive</Button></div><a className="mt-3 inline-block text-sm text-[#b3e7f2] hover:text-white" href={asset.fileUrl} target="_blank" rel="noreferrer">Open stored file</a>{asset.assetType === "design_instruction" && asset.extraction?.summary ? <p className="mt-3 border-t border-white/10 pt-3 text-xs leading-5 text-slate-100">{String(asset.extraction.summary)}</p> : null}</article>)}</div></div>
        </section>
      ) : (
        <section>
          <SectionHeading icon={CalendarClock} eyebrow="Marketing / Weekly Results" title="Review every item individually" description="A weekly plan may contain posts, carousels, reels, images, and graphics. First review the title, programme, objective, copy, caption, creative direction and posting time. ELEVAY then links the system-generated media to that exact item for final-preview approval." />
          <AutomationControlCard
            automation={workspace.data.automation as any}
            onEnable={() => enableAutomation.mutate({ monthlyBudgetUsd: 100, perRunReserveUsd: 20 })}
            onPause={() => pauseAutomation.mutate({ reason: "Paused from the ELEVAY Agentic Marketing Production workspace." })}
            onTest={() => runAutomationTest.mutate()}
            isPending={enableAutomation.isPending || pauseAutomation.isPending || runAutomationTest.isPending}
          />
          <div className="mb-5 rounded-2xl border border-[#C9A84C]/25 bg-[#201c14] p-5 md:p-6">
            <div className="flex items-start gap-3"><CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-[#e5c16d]" /><div><h2 className="font-semibold text-white">Production controls</h2><p className="mt-1 text-sm leading-6 text-slate-100">Weekly research, material preparation, final previews, review decisions, feedback and performance live here.</p></div></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {productionControls.map(control => { const Icon = control.icon; return <button key={control.href} onClick={() => navigate(control.href)} className="rounded-xl border border-[#C9A84C]/25 bg-black/10 p-4 text-left transition hover:border-[#C9A84C]/60 hover:bg-[#302a1c]"><div className="flex items-start gap-3"><div className="rounded-lg bg-[#C9A84C]/15 p-2 text-[#e5c16d]"><Icon className="h-4 w-4" /></div><div><p className="font-semibold text-white">{control.title}</p><p className="mt-1 text-xs leading-5 text-slate-100">{control.text}</p></div></div></button>; })}
            </div>
          </div>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-[#141d30] p-4"><p className="text-xs text-white">Individual review queue</p><p className="mt-1 text-2xl font-bold text-amber-200">{pendingCount}</p></div>
            <div className="rounded-xl border border-white/10 bg-[#141d30] p-4"><p className="text-xs text-white">Individually approved</p><p className="mt-1 text-2xl font-bold text-emerald-200">{approvedCount}</p></div>
            <div className="rounded-xl border border-white/10 bg-[#141d30] p-4"><p className="text-xs text-white">Batch approval</p><p className="mt-1 text-sm font-semibold text-red-200">Not available by design</p></div>
          </div>

          <div className="mb-7 rounded-2xl border border-white/10 bg-[#141d30] p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-white">Create an internal weekly plan</h2><p className="mt-1 text-sm text-slate-100">During the execution lock, plans are created or edited internally. Future scheduled generation will use the same controlled review queue.</p></div><span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs text-amber-200">No provider calls</span></div>
            <div className="mt-5 grid gap-4 md:grid-cols-[0.6fr_1.4fr]"><div><Label>Plan starts Saturday — Cairo</Label><Input className="mt-2" type="date" value={newPlanWeek} onChange={event => setNewPlanWeek(event.target.value)} /></div><div><Label>Plan title</Label><Input className="mt-2" value={newPlanTitle} onChange={event => setNewPlanTitle(event.target.value)} /></div></div>
            <div className="mt-5 space-y-3">{draftItems.map((item, index) => <DraftItemCard key={index} index={index} item={item} canRemove={draftItems.length > 1} onChange={patch => updateDraftItem(index, patch)} onRemove={() => setDraftItems(items => items.filter((_, itemIndex) => itemIndex !== index))} />)}</div>
            <div className="mt-4 flex flex-wrap justify-between gap-3"><Button type="button" variant="outline" className="gap-2" onClick={() => setDraftItems(items => [...items, emptyItem()])}><Plus className="h-4 w-4" /> Add item</Button><Button className="gap-2 bg-[#C9A84C] text-[#172033] hover:bg-[#ddb85f]" disabled={createPlan.isPending} onClick={() => createPlan.mutate({ periodStart: newPlanWeek, title: newPlanTitle, items: draftItems.map(normalizeDraft) })}><Sparkles className="h-4 w-4" /> {createPlan.isPending ? "Saving…" : "Save weekly plan"}</Button></div>
          </div>

          <div className="space-y-4">{workspace.data.plans.length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 bg-[#141d30] p-10 text-center text-slate-100"><CalendarClock className="mx-auto mb-3 h-7 w-7 text-[#81c7d8]" />No weekly plan has been prepared yet.</div> : workspace.data.plans.map((plan: any) => {
            const isOpen = expandedPlan === plan.id || workspace.data.plans.length === 1;
            return <div key={plan.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#141d30]"><div className="flex items-center justify-between gap-4 p-5"><button className="min-w-0 flex-1 text-left" onClick={() => setExpandedPlan(isOpen ? null : plan.id)}><p className="text-xs uppercase tracking-wide text-[#81c7d8]">Week of {plan.periodStart} · v{plan.version}</p><h2 className="mt-1 text-lg font-semibold text-white">{plan.title}</h2><p className="mt-1 text-xs text-white">{plan.items.length} item(s) · hash {String(plan.planHash).slice(0, 12)}…</p></button><div className="flex flex-wrap items-center justify-end gap-2"><Button size="sm" className="bg-[#5BA3B8] text-white hover:bg-[#4a90a5]" disabled={generatePlanMedia.isPending || !workspace.data.mediaProduction?.control?.isEnabled || !workspace.data.mediaProduction?.providerAuthentication?.ready} onClick={() => generatePlanMedia.mutate({ planId: plan.id })}><Sparkles className="mr-1.5 h-3.5 w-3.5" /> {generatePlanMedia.isPending ? "Starting media…" : "Generate system media"}</Button><StatusBadge status={plan.status} /><button aria-label="Expand plan" onClick={() => setExpandedPlan(isOpen ? null : plan.id)}>{isOpen ? <ChevronUp className="h-5 w-5 text-slate-100" /> : <ChevronDown className="h-5 w-5 text-slate-100" />}</button></div></div>{isOpen && <div className="border-t border-white/10 p-4 md:p-5">{!workspace.data.mediaProduction?.providerAuthentication?.ready && <div role="alert" className="mb-4 rounded-lg border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-100">Media generation paused: the deployed server cannot authenticate with Manus. No new media job or budget reservation will be made until the production credential is repaired. Existing previews remain available.</div>}<div className="mb-4 rounded-xl bg-black/15 p-3 text-xs text-slate-100">Previous-week aggregate snapshots: {Array.isArray(plan.previousWeekPerformance) ? plan.previousWeekPerformance.length : 0} · Stored feedback preferences: {Array.isArray(plan.preferenceMemory) ? plan.preferenceMemory.length : 0}</div><div className="space-y-3">{plan.items.map((item: any) => <WeeklyItemCard key={item.id} item={item} mediaJobs={mediaJobsByItem[String(item.id)] ?? []} mediaAuthReady={Boolean(workspace.data.mediaProduction?.providerAuthentication?.ready)} releases={releasesByItem[String(item.id)] ?? []} releaseEligible={Boolean(workspace.data.socialReleaseGovernance?.releaseEligible)} releasePending={authorizeChannelRelease.isPending || revokeChannelRelease.isPending} retryPending={retryMediaJob.isPending} onRetry={jobId => retryMediaJob.mutate({ jobId })} onAuthorize={platform => authorizeChannelRelease.mutate({ itemId: item.id, platform })} onRevoke={authorizationId => revokeChannelRelease.mutate({ authorizationId, reason: "Owner revoked this pending channel release from the Production workspace." })} onEdit={() => { setEditingItem(item); setEditDraft(asDraft(item)); }} onToggle={checked => updateItem.mutate({ itemId: item.id, ...normalizeDraft({ ...asDraft(item), isSelected: checked }) })} onSubmit={() => submitReview.mutate({ itemId: item.id })} onDecision={() => { setDecisionItemId(item.id); setDecisionNote(""); setFeedbackCategory(""); }} />)}</div></div>}</div>;
          })}</div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-[#141d30] p-5 md:p-6"><div className="flex items-start gap-3"><BarChart3 className="mt-0.5 h-5 w-5 text-[#81c7d8]" /><div><h2 className="font-semibold text-white">Previous week performance — aggregate input</h2><p className="mt-1 text-sm text-slate-100">Enter only aggregate results. This has no connection to Meta and does not change campaign data.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricInput label="Week starts Saturday" type="date" value={performance.periodStart} onChange={value => setPerformance(current => ({ ...current, periodStart: value }))} /><MetricInput label="Spend EGP" value={performance.spendEgp} onChange={value => setPerformance(current => ({ ...current, spendEgp: value }))} /><MetricInput label="Impressions" value={performance.impressions} onChange={value => setPerformance(current => ({ ...current, impressions: value }))} /><MetricInput label="Clicks" value={performance.clicks} onChange={value => setPerformance(current => ({ ...current, clicks: value }))} /><MetricInput label="Lead forms" value={performance.leadForms} onChange={value => setPerformance(current => ({ ...current, leadForms: value }))} /><MetricInput label="Qualified leads" value={performance.qualifiedLeads} onChange={value => setPerformance(current => ({ ...current, qualifiedLeads: value }))} /><MetricInput label="Client-stage leads" value={performance.clientStageLeads} onChange={value => setPerformance(current => ({ ...current, clientStageLeads: value }))} /></div><div className="mt-3"><Label>Aggregate learning note</Label><Textarea className="mt-2" value={performance.notes} onChange={event => setPerformance(current => ({ ...current, notes: event.target.value }))} placeholder="What should next week learn? Do not enter client, lead, contact, or individual identity data." /></div><div className="mt-4 flex justify-end"><Button className="gap-2" disabled={savePerformance.isPending || !performance.periodStart} onClick={() => savePerformance.mutate({ periodStart: performance.periodStart, spendEgp: Number(performance.spendEgp), impressions: Number(performance.impressions), clicks: Number(performance.clicks), leadForms: Number(performance.leadForms), qualifiedLeads: Number(performance.qualifiedLeads), clientStageLeads: Number(performance.clientStageLeads), ...(performance.notes.trim() ? { notes: performance.notes.trim() } : {}) })}><BarChart3 className="h-4 w-4" /> Save aggregate results</Button></div></div>
        </section>
      )}

      <Dialog open={Boolean(editingItem)} onOpenChange={open => !open && setEditingItem(null)}><DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Edit weekly content item</DialogTitle><DialogDescription>Edits return the item to draft. A selected item needs its own system-generated final preview before final approval. No claim-reference ID entry is required.</DialogDescription></DialogHeader><DraftItemFields item={editDraft} onChange={patch => setEditDraft(current => ({ ...current, ...patch }))} /><DialogFooter><Button variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button><Button className="gap-2" disabled={updateItem.isPending} onClick={() => editingItem && updateItem.mutate({ itemId: editingItem.id, ...normalizeDraft(editDraft) })}><Save className="h-4 w-4" /> Save item</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(decisionItemId)} onOpenChange={open => !open && setDecisionItemId(null)}><DialogContent><DialogHeader><DialogTitle>Individual content decision</DialogTitle><DialogDescription>{itemDecision ? `${itemLabels[itemDecision.itemType as ItemType]} · ${itemDecision.title}` : ""}. Review the complete item now. When you request changes with a comment, ELEVAY immediately removes the previous preview, learns from your feedback, and generates one replacement version. Final approval remains locked until the new system preview is ready. Review the actual image or video before deciding.</DialogDescription></DialogHeader><div><Label>Feedback category <span className="text-white">(optional)</span></Label><select className="mt-2 h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={feedbackCategory} onChange={event => setFeedbackCategory(event.target.value)}><option value="" className="bg-slate-900">Select category</option>{[["factual_accuracy", "Factual accuracy"], ["brand", "Brand"], ["wording", "Wording"], ["visual_design", "Visual design"], ["voice", "Voice"], ["targeting", "Targeting"], ["budget", "Budget"], ["timing", "Timing"], ["other", "Other"]].map(([value, label]) => <option key={value} value={value} className="bg-slate-900">{label}</option>)}</select></div><Textarea value={decisionNote} onChange={event => setDecisionNote(event.target.value)} placeholder="Describe exactly what should change. ELEVAY learns this preference and generates one replacement preview automatically." /><label className="flex items-start gap-2 rounded-lg border border-[#5BA3B8]/25 bg-[#5BA3B8]/5 p-3 text-xs leading-5 text-slate-800"><Checkbox checked={designQcConfirmed} onCheckedChange={checked => setDesignQcConfirmed(checked === true)} disabled={!itemDecision?.previewHash} /><span>I inspected this exact final preview: official unchanged logo, ELEVAY palette and legibility, no misleading claims or prohibited imagery, and (for video) all shots, clothing, shoes, anatomy, and continuity. This is required for final approval only.</span></label><DialogFooter className="gap-2 sm:justify-between"><Button variant="destructive" className="gap-2" disabled={!decisionNote.trim() || decideItem.isPending} onClick={() => decisionItemId && decideItem.mutate({ itemId: decisionItemId, decision: "stop", note: decisionNote, ...(feedbackCategory ? { feedbackCategory: feedbackCategory as "factual_accuracy" | "brand" | "wording" | "visual_design" | "voice" | "targeting" | "budget" | "timing" | "other" } : {}) })}><StopCircle className="h-4 w-4" /> Stop</Button><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!decisionNote.trim() || decideItem.isPending} onClick={() => decisionItemId && decideItem.mutate({ itemId: decisionItemId, decision: "send_back", note: decisionNote, ...(feedbackCategory ? { feedbackCategory: feedbackCategory as "factual_accuracy" | "brand" | "wording" | "visual_design" | "voice" | "targeting" | "budget" | "timing" | "other" } : {}) })}>{decideItem.isPending ? "Starting replacement…" : "Request changes & regenerate"}</Button><Button variant="outline" className="border-red-400/40 text-red-300" disabled={!decisionNote.trim() || decideItem.isPending} onClick={() => decisionItemId && decideItem.mutate({ itemId: decisionItemId, decision: "reject", note: decisionNote, ...(feedbackCategory ? { feedbackCategory: feedbackCategory as "factual_accuracy" | "brand" | "wording" | "visual_design" | "voice" | "targeting" | "budget" | "timing" | "other" } : {}) })}>Reject</Button><Button className="gap-2 bg-emerald-600 hover:bg-emerald-500" disabled={!decisionNote.trim() || decideItem.isPending || !itemDecision?.previewHash || !designQcConfirmed} onClick={() => decisionItemId && decideItem.mutate({ itemId: decisionItemId, decision: "approve", designQcConfirmed, note: decisionNote, ...(feedbackCategory ? { feedbackCategory: feedbackCategory as "factual_accuracy" | "brand" | "wording" | "visual_design" | "voice" | "targeting" | "budget" | "timing" | "other" } : {}) })}><CheckCircle2 className="h-4 w-4" /> {itemDecision?.previewHash ? "Approve final item" : "Await system media"}</Button></div></DialogFooter></DialogContent></Dialog>
    </div></div>
  );
}

function AutomationControlCard({ automation, onEnable, onPause, onTest, isPending }: { automation: any; onEnable: () => void; onPause: () => void; onTest: () => void; isPending: boolean }) {
  const control = automation?.control ?? { isEnabled: false, state: "disabled", monthlyBudgetUsd: 100, perRunReserveUsd: 20 };
  const blockers = Array.isArray(automation?.blockers) ? automation.blockers : [];
  const readiness = automation?.readiness ?? {};
  const jobs = Array.isArray(automation?.jobs) ? automation.jobs : [];
  const hasCurrentWeekJob = jobs.length > 0;
  return <div className="mb-6 rounded-2xl border border-[#5BA3B8]/30 bg-gradient-to-br from-[#143446] via-[#111b2c] to-[#141d30] p-5 md:p-6">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div className="flex gap-3"><BrainCircuit className="mt-0.5 h-6 w-6 shrink-0 text-[#81c7d8]" /><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-white">Weekly AI Production Engine</h2><StatusBadge status={control.state} /></div><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-100">OpenAI prepares the strategy, Claude independently challenges it, and Manus orchestrates research plus review-ready static/reel material. <strong>Manus native video is the selected source for future reels.</strong> The current planner does not generate video yet; every future reel still requires 9:16, Arabic/brand/wardrobe QA and individual final-preview approval. The engine does not publish, schedule posts, create or change Meta campaigns, spend ad money, send CAPI events, or contact anyone.</p></div></div><div className="flex flex-wrap gap-2">{control.isEnabled ? <><Button variant="outline" className="border-red-300/40 text-red-100 hover:bg-red-500/15" disabled={isPending} onClick={onPause}><StopCircle className="mr-2 h-4 w-4" /> Pause engine</Button><Button className="bg-[#5BA3B8] text-white hover:bg-[#4a90a5]" disabled={isPending || blockers.length > 0} onClick={onTest}><Sparkles className="mr-2 h-4 w-4" /> {hasCurrentWeekJob ? "Open current week" : "Run first test"}</Button></> : <Button className="bg-[#5BA3B8] text-white hover:bg-[#4a90a5]" disabled={isPending || blockers.length > 0} onClick={onEnable}><BrainCircuit className="mr-2 h-4 w-4" /> Enable USD 100 engine</Button>}</div></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><AutomationFact label="Brand Book" value={readiness.brandBook ? "Ready" : "Required"} ready={Boolean(readiness.brandBook)} /><AutomationFact label="Design System + logo" value={readiness.designSystem ? "Ready" : "Required"} ready={Boolean(readiness.designSystem)} /><AutomationFact label="Approved claims" value={String(readiness.approvedClaims ?? 0)} ready={Number(readiness.approvedClaims ?? 0) > 0} /><AutomationFact label="Monthly budget" value={`USD ${Number(readiness.budgetUsedUsd ?? 0).toFixed(2)} / ${Number(control.monthlyBudgetUsd ?? 100).toFixed(2)}`} ready={Number(readiness.budgetUsedUsd ?? 0) < Number(control.monthlyBudgetUsd ?? 100)} /><AutomationFact label="Per-run reserve" value={`USD ${Number(control.perRunReserveUsd ?? 20).toFixed(2)}`} ready /> </div>
    {blockers.length > 0 ? <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4"><p className="font-medium text-amber-100">Complete these before activation</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-5 text-amber-50">{blockers.map((blocker: string) => <li key={blocker}>{blocker}</li>)}</ul></div> : <p className="mt-4 rounded-xl border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm text-emerald-100">All bounded-engine prerequisites are ready. Enable it once, then use <strong>Run first test</strong> to create one review-only job for the current Saturday–Friday period.</p>}
    {jobs.length > 0 ? <div className="mt-5"><p className="mb-2 text-sm font-semibold text-white">Automation jobs</p><div className="space-y-2">{jobs.slice(0, 4).map((job: any) => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/15 p-3 text-sm"><div><p className="font-medium text-white">{job.periodStart} · {job.triggerType.replaceAll("_", " ")}</p><p className="mt-0.5 text-xs text-slate-100">Reserved: USD {Number(job.reservedCostUsd ?? 0).toFixed(2)}{job.errorSummary ? ` · ${job.errorSummary}` : ""}</p></div><div className="flex items-center gap-2"><StatusBadge status={job.state} />{job.manusTaskUrl ? <a className="text-xs text-[#b3e7f2] hover:text-white" href={job.manusTaskUrl} target="_blank" rel="noreferrer">Open Manus task</a> : null}</div></div>)}</div></div> : null}
  </div>;
}

function AutomationFact({ label, value, ready }: { label: string; value: string; ready: boolean }) { return <div className={`rounded-xl border p-3 ${ready ? "border-emerald-300/20 bg-emerald-300/5" : "border-amber-300/25 bg-amber-300/5"}`}><p className="text-xs text-slate-100">{label}</p><p className={`mt-1 text-sm font-semibold ${ready ? "text-emerald-100" : "text-amber-100"}`}>{value}</p></div>; }

function StatusBadge({ status }: { status: string }) { return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyles[status] ?? "border-white/15 bg-white/5 text-white"}`}>{status.replaceAll("_", " ")}</span>; }

function MetricInput({ label, type = "number", value, onChange }: { label: string; type?: string; value: string; onChange: (value: string) => void }) { return <div><Label className="text-xs">{label}</Label><Input className="mt-1" type={type} min={type === "number" ? "0" : undefined} value={value} onChange={event => onChange(event.target.value)} /></div>; }

function DraftItemCard({ index, item, canRemove, onChange, onRemove }: { index: number; item: DraftItem; canRemove: boolean; onChange: (patch: Partial<DraftItem>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(index === 0);
  return <div className="rounded-xl border border-white/10 bg-black/10 p-4"><div className="flex items-center justify-between gap-3"><button className="flex items-center gap-2 text-left font-medium text-white" onClick={() => setOpen(value => !value)}>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} Item {index + 1} {item.title ? `— ${item.title}` : ""}</button>{canRemove && <Button type="button" variant="ghost" size="sm" className="text-red-300 hover:text-red-200" onClick={onRemove}>Remove</Button>}</div>{open && <div className="mt-4"><DraftItemFields item={item} onChange={onChange} compact /></div>}</div>;
}

function DraftItemFields({ item, onChange, compact = false }: { item: DraftItem; onChange: (patch: Partial<DraftItem>) => void; compact?: boolean }) {
  const needsVisualText = ["static_post", "carousel", "reel", "image", "graphic"].includes(item.itemType);
  return <div className="grid gap-4"><div className="grid gap-4 sm:grid-cols-[0.7fr_1.3fr]"><div><Label>Type</Label><select className="mt-2 h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={item.itemType} onChange={event => onChange({ itemType: event.target.value as ItemType })}>{(Object.keys(itemLabels) as ItemType[]).map(type => <option key={type} value={type} className="bg-slate-900">{itemLabels[type]}</option>)}</select></div><div><Label>Title</Label><Input className="mt-2" value={item.title} onChange={event => onChange({ title: event.target.value })} placeholder="Specific content title" /></div></div><div className="grid gap-4 sm:grid-cols-2"><div><Label>Programme key</Label><Input className="mt-2" value={item.programKey} onChange={event => onChange({ programKey: event.target.value })} placeholder="spain_dnv" /></div><div><Label>Objective</Label><Input className="mt-2" value={item.objective} onChange={event => onChange({ objective: event.target.value })} placeholder="Objective for this piece" /></div></div><div className="grid gap-4 sm:grid-cols-2"><div><Label>Planned day</Label><select className="mt-2 h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={item.plannedDay} onChange={event => onChange({ plannedDay: event.target.value })}><option value="" className="bg-slate-900">Not assigned</option>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(day => <option key={day} value={day} className="bg-slate-900">{day}</option>)}</select></div><div><Label>Planned time — Cairo</Label><Input className="mt-2" type="time" value={item.plannedTime} onChange={event => onChange({ plannedTime: event.target.value })} /></div></div><div><Label>Creative direction</Label><Textarea className="mt-2" value={item.creativeDirection} onChange={event => onChange({ creativeDirection: event.target.value })} placeholder="Visual mood, location, people, wardrobe, camera direction, or design requirements." /></div>{!compact && <><div><Label>Arabic script / marketing copy</Label><Textarea dir="rtl" className="mt-2" value={item.scriptCopy} onChange={event => onChange({ scriptCopy: event.target.value })} placeholder="Arabic only for campaign copy and voice-over." /></div><div><Label>Caption — Arabic + optional English</Label><Textarea dir="rtl" className="mt-2" value={item.caption} onChange={event => onChange({ caption: event.target.value })} placeholder="Arabic is required; English may be added below it." /></div></>}<div className="grid gap-4 sm:grid-cols-2"><div><Label>Arabic CTA</Label><Input dir="rtl" className="mt-2" value={item.cta} onChange={event => onChange({ cta: event.target.value })} /></div><div><Label>Hashtags — comma-separated</Label><Input className="mt-2" value={item.hashtags} onChange={event => onChange({ hashtags: event.target.value })} placeholder="#إليفاي, #إسبانيا" /></div></div>{!compact && <><div><Label>English text inside the visual <span className="text-[#81c7d8]">system-generated</span></Label><div className="mt-2 rounded-md border border-[#5BA3B8]/30 bg-[#5BA3B8]/5 p-3 text-sm text-white">{item.onScreenEnglishText.trim() || (item.itemType === "reel" ? "No on-screen text — reels use Arabic narration and a white logo outro." : "ELEVAY will generate concise English-only visual text from this item’s programme and objective before producing the preview.")}</div><p className="mt-1 text-xs text-white">You do not type this field. The system uses English only in the rendered design; campaign copy, voice-over and Arabic-first captions remain governed separately.</p></div><div><Label>Visual brief</Label><Textarea className="mt-2" value={item.visualBrief} onChange={event => onChange({ visualBrief: event.target.value })} /></div><div className="rounded-lg border border-[#5BA3B8]/25 bg-[#5BA3B8]/5 p-3 text-sm text-slate-100"><strong className="text-white">System-generated preview</strong><p className="mt-1">You do not upload an image or video, paste a URL, or enter a technical fingerprint. ELEVAY will create and store the review preview with Manus internally when the separate governed production release is active.</p></div><div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-100"><strong className="text-white">Internal source policy</strong><p className="mt-1">No claim-reference IDs are required. The system uses only Mahmoud-approved internal material and never fetches external or government sources automatically.</p></div></>}<label className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white"><Checkbox checked={item.isSelected} onCheckedChange={checked => onChange({ isSelected: checked === true })} /> Include this item in the weekly plan</label></div>;
}

function mediaProgressStage(job: any, previewReady: boolean) {
  if (previewReady || job?.state === "completed") return { percent: 100, label: "Final preview saved", detail: "Stage 4 of 4 — ready for final review" };
  if (job?.state === "waiting_manus") return { percent: 55, label: "Manus is generating the media", detail: "Stage 2 of 4 — waiting for Manus; 55% is a stage marker, not a vendor percentage" };
  if (job?.state === "waiting_input") return { percent: 55, label: "Manus needs attention", detail: "Provider is waiting for input; no ETA. The CRM will not auto-confirm external actions." };
  if (job?.state === "processing") return { percent: 85, label: "Assembling the final preview", detail: "Stage 3 of 4 — attaching the official logo, Egyptian narration and QA" };
  if (job?.state === "dispatching") return { percent: 20, label: "Preparing the generation request", detail: "Stage 1 of 4 — job queued" };
  if (job?.state === "failed") return { percent: 0, label: "Generation needs attention", detail: "Task stopped before a final preview was saved" };
  return { percent: 0, label: "Awaiting system generation", detail: "No generation task has started" };
}

function WeeklyItemCard({ item, mediaJobs, mediaAuthReady, releases, releaseEligible, releasePending, retryPending, onRetry, onAuthorize, onRevoke, onEdit, onToggle, onSubmit, onDecision }: { item: any; mediaJobs: any[]; mediaAuthReady: boolean; releases: any[]; releaseEligible: boolean; releasePending: boolean; retryPending: boolean; onRetry: (jobId: number) => void; onAuthorize: (platform: "facebook_page" | "instagram") => void; onRevoke: (authorizationId: number) => void; onEdit: () => void; onToggle: (checked: boolean) => void; onSubmit: () => void; onDecision: () => void }) {
  const canSubmit = item.status === "draft" && item.isSelected;
  const isPending = item.status === "pending_individual_review";
  const latestJob = mediaJobs[0];
  const progress = mediaProgressStage(latestJob, Boolean(item.previewHash));
  let spokenScript: string | null = null;
  try { const meta = JSON.parse(item.metadataJson || "{}"); spokenScript = typeof meta.finalNarrationScript === "string" ? meta.finalNarrationScript : null; } catch { /* optional metadata */ }
  const activeReleases = releases.filter(release => release.status === "authorized_pending_channel_setup");
  return <div className="rounded-xl border border-white/10 bg-black/10 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><Checkbox className="mt-1" checked={Boolean(item.isSelected)} disabled={["approved", "stopped"].includes(item.status)} onCheckedChange={checked => onToggle(checked === true)} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-[#5BA3B8]/15 px-2 py-1 text-xs font-semibold text-[#b3e7f2]">{itemLabels[item.itemType as ItemType]}</span><StatusBadge status={item.status} /></div><h3 className="mt-2 text-base font-semibold text-white">{item.title}</h3><p className="mt-1 text-sm text-slate-100">{item.programKey || "No programme"} · {item.objective}</p>{item.blockedReason && <p className="mt-2 rounded-lg border border-orange-400/20 bg-orange-400/10 p-2 text-xs text-orange-200">{item.blockedReason}</p>}</div></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" className="gap-2" onClick={onEdit} disabled={["approved", "stopped"].includes(item.status)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>{canSubmit && <Button size="sm" className="gap-2" onClick={onSubmit}><Eye className="h-3.5 w-3.5" /> Review plan & copy</Button>}{isPending && <Button size="sm" className="gap-2 bg-[#C9A84C] text-[#172033] hover:bg-[#ddb85f]" onClick={onDecision}><FileCheck2 className="h-3.5 w-3.5" /> Decide</Button>}</div></div><div className="mt-3 grid gap-2 text-xs text-white sm:grid-cols-3"><span>Media: {item.previewHash ? "system-generated preview ready" : "awaiting system generation"}</span><span>Source policy: internal only</span><span>Decision history: {item.events?.length ?? 0}</span></div>{item.previewUrl ? <div className="mt-3 overflow-hidden rounded-xl border border-[#5BA3B8]/35 bg-slate-950/50 p-3"><div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-semibold text-[#b3e7f2]">System-generated preview — linked to this exact item</p><a className="text-xs text-white underline-offset-4 hover:underline" href={item.previewUrl} target="_blank" rel="noreferrer">Open full preview</a></div>{item.itemType === "reel" ? <video className="max-h-[520px] w-full rounded-lg bg-black" controls preload="metadata" src={item.previewUrl}>Your browser cannot play this review reel.</video> : <img className="max-h-[620px] w-full rounded-lg object-contain bg-black" src={item.previewUrl} alt={`System-generated preview for ${item.title}`} loading="lazy" />}</div> : null}{item.itemType === "reel" && spokenScript && <div className="mt-3 rounded-lg border border-[#5BA3B8]/25 bg-[#5BA3B8]/5 p-3 text-sm text-white"><strong>Actual Egyptian Arabic narration sent to ElevenLabs</strong><p dir="rtl" className="mt-2 leading-7">{spokenScript}</p></div>}<div className="mt-3 rounded-lg border border-[#5BA3B8]/25 bg-[#5BA3B8]/5 p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium text-white">System media progress: <span className="text-[#b3e7f2]">{progress.label}</span></p><p className="mt-1 text-slate-100">{progress.detail} · {progress.percent}% stage progress</p>{latestJob?.eta?.label && <p className="mt-1 font-medium text-[#b3e7f2]" role="status">Remaining time: {latestJob.eta.label}</p>}</div><span className="text-sm font-semibold text-[#b3e7f2]">{progress.percent}%</span>{latestJob?.state === "failed" && <Button size="sm" variant="outline" disabled={retryPending || !mediaAuthReady} onClick={() => onRetry(latestJob.id)}>{retryPending ? "Retrying…" : "Retry once"}</Button>}</div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-950/70"><div className={`h-full rounded-full transition-all duration-700 ${latestJob?.state === "failed" ? "bg-red-400" : "bg-[#5BA3B8]"}`} style={{ width: `${progress.percent}%` }} /></div><p className="mt-2 text-slate-100">{latestJob ? `Reserved: USD ${Number(latestJob.reservedCostUsd ?? 0).toFixed(2)} · ${String(latestJob.state).replaceAll("_", " ")}` : "No production task has been started for this item yet."}{latestJob?.errorSummary ? ` · ${latestJob.errorSummary}` : ""}</p></div>{item.status === "approved" && <div className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/5 p-3 text-xs"><p className="font-medium text-amber-100">Owner-only Meta channel release</p><p className="mt-1 text-slate-100">This only records an exact-preview authorization. It does not publish anything. Meta Page/Instagram credentials, permissions, app review and read-only validation are still required.</p>{activeReleases.length ? <div className="mt-2 flex flex-wrap gap-2">{activeReleases.map(release => <Button key={release.id} size="sm" variant="outline" disabled={releasePending} onClick={() => onRevoke(release.id)}>Revoke {String(release.platform).replaceAll("_", " ")} release</Button>)}</div> : releaseEligible ? <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={releasePending} onClick={() => onAuthorize("facebook_page")}>Authorize Facebook Page</Button><Button size="sm" variant="outline" disabled={releasePending} onClick={() => onAuthorize("instagram")}>Authorize Instagram</Button></div> : <p className="mt-2 text-amber-100">Unavailable until the individual approval and trailing 30-day 90% governance rule are met.</p>}</div>}</div>;
}
