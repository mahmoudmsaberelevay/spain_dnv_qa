import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Loader2, Sparkles, Save, Trash2, FolderOpen, ChevronDown, ChevronRight,
  Copy, Calendar, Target, FileText, Film, Image, BookOpen, Pencil, Check, X,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Types ─────────────────────────────────────────────────────────────────────
type Scene = { sceneNumber: number; visualDescription: string; manusPrompt: string };
type Reel = {
  reelNumber: number; topic: string; concept: string; voiceOverAr: string;
  backgroundMusicStyle: string; scenes: Scene[]; manusWeekPrompt: string;
};
type Post = {
  postNumber: number; topic: string; angle: string;
  keyMessageAr: string; captionAr: string; hashtags: string[];
};
type ContentPillar = { pillar: string; description: string };
type Week = {
  weekNumber: number; startDate: string; endDate: string;
  program: string; theme: string; weeklyStrategy: string;
  contentPillars: ContentPillar[]; posts: Post[]; reels: Reel[];
  wordDocPrompt: string;
};
type ProgramAllocation = { program: string; percentage: number; weeks: number[] };
type StrategyPlan = {
  planTitle: string;
  dateRange: { start: string; end: string };
  strategyOverview: string;
  programAllocation: ProgramAllocation[];
  weeks: Week[];
};

// ── Program badge colours ─────────────────────────────────────────────────────
const PROGRAM_COLORS: Record<string, string> = {
  "spain": "bg-orange-100 text-orange-800 border-orange-200",
  "malta": "bg-blue-100 text-blue-800 border-blue-200",
  "greece": "bg-sky-100 text-sky-800 border-sky-200",
  "portugal": "bg-green-100 text-green-800 border-green-200",
  "sao": "bg-purple-100 text-purple-800 border-purple-200",
};
function programColor(program: string) {
  const lower = program.toLowerCase();
  for (const [key, cls] of Object.entries(PROGRAM_COLORS)) {
    if (lower.includes(key)) return cls;
  }
  return "bg-gray-100 text-gray-800 border-gray-200";
}

// ── Copy-to-clipboard helper ──────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ── Manus Prompt Box ─────────────────────────────────────────────────────────
function ManusPromptBox({ label, prompt }: { label: string; prompt: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-dashed border-primary/40 rounded-lg bg-primary/5 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />
          {label}
        </span>
        <div className="flex items-center gap-1">
          <CopyButton text={prompt} />
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground hover:text-foreground px-1"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      <p className={`text-xs text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap ${expanded ? "" : "line-clamp-3"}`}>
        {prompt}
      </p>
    </div>
  );
}

// ── Week Card ─────────────────────────────────────────────────────────────────
function WeekCard({ week, onEdit }: { week: Week; onEdit: (w: Week) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"strategy" | "posts" | "reels" | "doc">("strategy");

  return (
    <Card className="border shadow-sm">
      <CardHeader
        className="pb-3 cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
              {week.weekNumber}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">
                  Week {week.weekNumber}: {week.theme}
                </span>
                <Badge variant="outline" className={`text-xs ${programColor(week.program)}`}>
                  {week.program}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {week.startDate} – {week.endDate}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(week); }}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Edit this week"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="pt-0">
          {/* Tab bar */}
          <div className="flex gap-1 border-b mb-4">
            {(["strategy", "posts", "reels", "doc"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  tab === t
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "strategy" && <><Target className="h-3 w-3 inline mr-1" />Strategy</>}
                {t === "posts" && <><Image className="h-3 w-3 inline mr-1" />5 Static Posts</>}
                {t === "reels" && <><Film className="h-3 w-3 inline mr-1" />5 Reels</>}
                {t === "doc" && <><FileText className="h-3 w-3 inline mr-1" />Word Doc</>}
              </button>
            ))}
          </div>

          {/* Strategy tab */}
          {tab === "strategy" && (
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Weekly Strategy</h4>
                <p className="text-sm leading-relaxed">{week.weeklyStrategy}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Content Pillars</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {week.contentPillars?.map((cp, i) => (
                    <div key={i} className="bg-muted/30 rounded-lg p-3">
                      <p className="text-xs font-semibold text-foreground mb-1">
                        {i + 1}. {cp.pillar}
                      </p>
                      <p className="text-xs text-muted-foreground">{cp.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Posts tab */}
          {tab === "posts" && (
            <div className="space-y-3">
              {week.posts?.map((post) => (
                <div key={post.postNumber} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                      Post {post.postNumber}
                    </Badge>
                    <span className="text-sm font-medium">{post.topic}</span>
                    <span className="text-xs text-muted-foreground">· {post.angle}</span>
                  </div>
                  <div className="bg-muted/20 rounded p-2">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Key Message (Arabic)</p>
                    <p className="text-sm font-medium text-right" dir="rtl">{post.keyMessageAr}</p>
                  </div>
                  <div className="bg-muted/20 rounded p-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-muted-foreground">Caption (Arabic)</p>
                      <CopyButton text={post.captionAr} />
                    </div>
                    <p className="text-sm text-right leading-relaxed" dir="rtl">{post.captionAr}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {post.hashtags?.map((h, i) => (
                      <span key={i} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                        #{h.replace(/^#/, "")}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reels tab */}
          {tab === "reels" && (
            <div className="space-y-4">
              {week.reels?.map((reel) => (
                <div key={reel.reelNumber} className="border rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                      Reel {reel.reelNumber}
                    </Badge>
                    <span className="text-sm font-medium">{reel.topic}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{reel.concept}</p>

                  <div className="bg-muted/20 rounded p-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-muted-foreground">Voice-Over Script (Arabic)</p>
                      <CopyButton text={reel.voiceOverAr} />
                    </div>
                    <p className="text-sm text-right leading-relaxed" dir="rtl">{reel.voiceOverAr}</p>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    🎵 Music: <span className="font-medium">{reel.backgroundMusicStyle}</span>
                  </p>

                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">5 Scenes (5 sec each)</p>
                    <div className="space-y-2">
                      {reel.scenes?.map((scene) => (
                        <div key={scene.sceneNumber} className="border-l-2 border-primary/30 pl-3 space-y-1">
                          <p className="text-xs font-semibold">Scene {scene.sceneNumber}</p>
                          <p className="text-xs text-muted-foreground">{scene.visualDescription}</p>
                          <ManusPromptBox
                            label={`Manus Prompt — Scene ${scene.sceneNumber}`}
                            prompt={scene.manusPrompt}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <ManusPromptBox
                    label={`Manus Prompt — Full Reel ${reel.reelNumber} (all 5 clips + music)`}
                    prompt={reel.manusWeekPrompt}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Word Doc tab */}
          {tab === "doc" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Use this Manus prompt to generate a Word document containing all captions and voice-over scripts for Week {week.weekNumber}.
              </p>
              <ManusPromptBox
                label="Manus Prompt — Word Document"
                prompt={week.wordDocPrompt}
              />
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Week Editor Dialog ────────────────────────────────────────────────────────
function WeekEditorDialog({
  week, open, onClose, onSave,
}: { week: Week | null; open: boolean; onClose: () => void; onSave: (w: Week) => void }) {
  const [edited, setEdited] = useState<Week | null>(null);

  if (week && (!edited || edited.weekNumber !== week.weekNumber)) {
    setEdited(JSON.parse(JSON.stringify(week)));
  }

  if (!edited) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function setPath(obj: any, parts: string[], value: string): any {
    if (parts.length === 0) return value;
    const key = parts[0];
    const idx = parseInt(key);
    const clone = Array.isArray(obj) ? [...obj] : { ...obj };
    const k = isNaN(idx) ? key : idx;
    clone[k] = setPath(clone[k], parts.slice(1), value);
    return clone;
  }

  function updateField(path: string, value: string) {
    setEdited((prev) => {
      if (!prev) return prev;
      return setPath(prev, path.split("."), value) as Week;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Week {edited.weekNumber}: {edited.theme}</DialogTitle>
          <DialogDescription>
            {edited.startDate} – {edited.endDate} · {edited.program}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Theme</Label>
            <Input value={edited.theme} onChange={(e) => updateField("theme", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Weekly Strategy</Label>
            <Textarea rows={3} value={edited.weeklyStrategy} onChange={(e) => updateField("weeklyStrategy", e.target.value)} />
          </div>

          <div>
            <Label className="text-xs font-semibold">Content Pillars</Label>
            {edited.contentPillars?.map((cp, i) => (
              <div key={i} className="mt-2 border rounded p-2 space-y-1">
                <Input
                  placeholder="Pillar name"
                  value={cp.pillar}
                  onChange={(e) => updateField(`contentPillars.${i}.pillar`, e.target.value)}
                />
                <Textarea
                  rows={2}
                  placeholder="Description"
                  value={cp.description}
                  onChange={(e) => updateField(`contentPillars.${i}.description`, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div>
            <Label className="text-xs font-semibold">Static Posts (captions)</Label>
            {edited.posts?.map((post, i) => (
              <div key={i} className="mt-2 border rounded p-2 space-y-1">
                <p className="text-xs font-medium">Post {post.postNumber}: {post.topic}</p>
                <Textarea
                  rows={3}
                  placeholder="Arabic caption"
                  value={post.captionAr}
                  onChange={(e) => updateField(`posts.${i}.captionAr`, e.target.value)}
                  dir="rtl"
                />
              </div>
            ))}
          </div>

          <div>
            <Label className="text-xs font-semibold">Reels (voice-overs)</Label>
            {edited.reels?.map((reel, i) => (
              <div key={i} className="mt-2 border rounded p-2 space-y-1">
                <p className="text-xs font-medium">Reel {reel.reelNumber}: {reel.topic}</p>
                <Textarea
                  rows={4}
                  placeholder="Arabic voice-over script"
                  value={reel.voiceOverAr}
                  onChange={(e) => updateField(`reels.${i}.voiceOverAr`, e.target.value)}
                  dir="rtl"
                />
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Word Doc Manus Prompt</Label>
            <Textarea rows={4} value={edited.wordDocPrompt} onChange={(e) => updateField("wordDocPrompt", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave(edited); onClose(); }}>
            <Check className="h-4 w-4 mr-1" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MarketingPlan() {
  const [plan, setPlan] = useState<StrategyPlan | null>(null);
  const [savedPlanId, setSavedPlanId] = useState<number | null>(null);
  const [planTitle, setPlanTitle] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showSavedPlans, setShowSavedPlans] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [editingWeek, setEditingWeek] = useState<Week | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const utils = trpc.useUtils();

  const generateMutation = trpc.marketing.generateStrategyPlan.useMutation({
    onSuccess: (data) => {
      const p = data as unknown as StrategyPlan;
      setPlan(p);
      setSavedPlanId(null);
      setPlanTitle(p.planTitle || "");
      toast.success("12-week strategy plan generated!");
    },
    onError: (err) => toast.error(`Generation failed: ${err.message}`),
  });

  const saveMutation = trpc.marketing.savePlan.useMutation({
    onSuccess: (data) => {
      setSavedPlanId(data.id);
      utils.marketing.listPlans.invalidate();
      toast.success("Plan saved successfully!");
      setIsSaving(false);
    },
    onError: (err) => { toast.error(`Save failed: ${err.message}`); setIsSaving(false); },
  });

  const deleteMutation = trpc.marketing.deletePlan.useMutation({
    onSuccess: () => {
      utils.marketing.listPlans.invalidate();
      toast.success("Plan deleted.");
      setConfirmDeleteId(null);
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  const { data: savedPlans, isLoading: plansLoading } = trpc.marketing.listPlans.useQuery();

  function handleSave() {
    if (!plan) return;
    setIsSaving(true);
    saveMutation.mutate({
      id: savedPlanId ?? undefined,
      title: planTitle || plan.planTitle,
      startDate: plan.dateRange?.start || startDate,
      planJson: JSON.stringify(plan),
    });
  }

  function handleLoadPlan(row: { id: number; title: string; planJson: string | null }) {
    if (!row.planJson) { toast.error("No plan data."); return; }
    try {
      const p = JSON.parse(row.planJson) as StrategyPlan;
      setPlan(p);
      setSavedPlanId(row.id);
      setPlanTitle(row.title);
      setShowSavedPlans(false);
      toast.success("Plan loaded.");
    } catch {
      toast.error("Failed to load plan.");
    }
  }

  function handleWeekSave(updatedWeek: Week) {
    if (!plan) return;
    const newWeeks = plan.weeks.map((w) =>
      w.weekNumber === updatedWeek.weekNumber ? updatedWeek : w
    );
    const updatedPlan = { ...plan, weeks: newWeeks };
    setPlan(updatedPlan);
    if (savedPlanId) {
      saveMutation.mutate({
        id: savedPlanId,
        title: planTitle || plan.planTitle,
        startDate: plan.dateRange?.start || startDate,
        planJson: JSON.stringify(updatedPlan),
      });
    }
    toast.success(`Week ${updatedWeek.weekNumber} updated.`);
  }

  const isGenerating = generateMutation.isPending;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Marketing Strategy Plan</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Generate a 12-week content strategy with ready-to-use Manus prompts for each week
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSavedPlans(!showSavedPlans)}
            className="gap-2"
          >
            <FolderOpen className="h-4 w-4" />
            Saved Plans {savedPlans?.length ? `(${savedPlans.length})` : ""}
          </Button>
          {plan && (
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {savedPlanId ? "Update Plan" : "Save Plan"}
            </Button>
          )}
        </div>
      </div>

      {/* Saved Plans Panel */}
      {showSavedPlans && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Saved Plans
            </CardTitle>
          </CardHeader>
          <CardContent>
            {plansLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : !savedPlans?.length ? (
              <div className="text-sm text-muted-foreground">No saved plans yet.</div>
            ) : (
              <div className="space-y-2">
                {savedPlans.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium">{row.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Start: {row.startDate} · Saved: {new Date(row.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleLoadPlan(row as { id: number; title: string; planJson: string | null })}>
                        Load
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmDeleteId(row.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Generator Form */}
      {!plan && (
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Generate 12-Week Strategy Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/30 rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold">Fixed Program Allocation</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  { name: "Spain Digital Nomad Visa", pct: "30%", weeks: "1, 4, 7, 10" },
                  { name: "Malta Permanent Residency", pct: "20%", weeks: "2, 6, 11" },
                  { name: "Greece Golden Visa", pct: "20%", weeks: "3, 8, 12" },
                  { name: "Portugal (D7, D8, Golden Visa)", pct: "15%", weeks: "5, 9" },
                  { name: "Sao Tome Citizenship", pct: "15%", weeks: "4, 10 (shared)" },
                ].map((p) => (
                  <div key={p.name} className="bg-background border rounded p-2">
                    <p className="text-xs font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.pct} · Weeks {p.weeks}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                Plan covers 12 weeks ({startDate} to{" "}
                {(() => {
                  const d = new Date(startDate);
                  d.setDate(d.getDate() + 83);
                  return d.toISOString().slice(0, 10);
                })()})
              </p>
            </div>

            <Button
              onClick={() => generateMutation.mutate({ startDate })}
              disabled={isGenerating}
              className="gap-2"
              size="lg"
            >
              {isGenerating ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Generating Strategy... (may take 30–60 sec)</>
              ) : (
                <><Sparkles className="h-4 w-4" />Generate 12-Week Strategy Plan</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Plan View */}
      {plan && (
        <div className="space-y-4">
          {/* Plan Header */}
          <Card className="border shadow-sm bg-gradient-to-r from-primary/5 to-transparent">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <Input
                    value={planTitle}
                    onChange={(e) => setPlanTitle(e.target.value)}
                    className="text-lg font-bold border-0 bg-transparent p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
                    placeholder="Plan title..."
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {plan.dateRange?.start} – {plan.dateRange?.end} · 12 weeks · 5 programs
                  </p>
                  {plan.strategyOverview && (
                    <p className="text-sm mt-2 leading-relaxed text-muted-foreground">{plan.strategyOverview}</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPlan(null); setSavedPlanId(null); }}
                  className="shrink-0"
                >
                  <X className="h-4 w-4 mr-1" />
                  New Plan
                </Button>
              </div>

              {plan.programAllocation && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {plan.programAllocation.map((pa) => (
                    <Badge key={pa.program} variant="outline" className={`text-xs ${programColor(pa.program)}`}>
                      {pa.program} — {pa.percentage}%
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Week-by-week */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              12-Week Plan
            </h2>
            <p className="text-xs text-muted-foreground">Click any week to expand · Click ✏️ to edit</p>
          </div>

          <div className="space-y-3">
            {plan.weeks?.map((week) => (
              <WeekCard key={week.weekNumber} week={week} onEdit={setEditingWeek} />
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {savedPlanId ? "Update Saved Plan" : "Save Plan"}
            </Button>
          </div>
        </div>
      )}

      {/* Week Editor Dialog */}
      <WeekEditorDialog
        week={editingWeek}
        open={!!editingWeek}
        onClose={() => setEditingWeek(null)}
        onSave={handleWeekSave}
      />

      {/* Delete Confirm */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this plan?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDeleteId && deleteMutation.mutate({ id: confirmDeleteId })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
