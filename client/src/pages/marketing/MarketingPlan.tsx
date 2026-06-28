import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, ChevronDown, ChevronUp, Copy, Check, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Scene { sceneNumber: number; visualDescription: string; manusPrompt: string; }
interface Reel { reelNumber: number; topic: string; concept: string; voiceOverAr: string; backgroundMusicStyle: string; scenes: Scene[]; manusWeekPrompt: string; }
interface Post { postNumber: number; topic: string; angle: string; keyMessageAr: string; captionAr: string; hashtags: string[]; manusPrompt?: string; manusImagePrompt?: string; }
interface Week { weekNumber: number; startDate: string; endDate: string; program: string; pillars?: string[]; posts: Post[]; reels: Reel[]; wordDocPrompt: string; generationError?: string; }
interface Plan { planTitle: string; dateRange: { start: string; end: string }; strategyOverview: string; programAllocation: { program: string; percentage: number; weeks: number[] }[]; weeks: Week[]; }

// ── Program allocation display ─────────────────────────────────────────────────
const PROGRAM_ALLOCATION = [
  { program: "Spain Digital Nomad Visa", percentage: 30, weeks: "1, 4, 7, 10", color: "bg-blue-600" },
  { program: "Malta Permanent Residency", percentage: 20, weeks: "2, 6, 11", color: "bg-amber-600" },
  { program: "Greece Golden Visa", percentage: 20, weeks: "3, 8, 12", color: "bg-cyan-600" },
  { program: "Portugal (D7, D8, Golden Visa)", percentage: 15, weeks: "5, 9", color: "bg-green-600" },
  { program: "Sao Tome Citizenship", percentage: 15, weeks: "4, 10 (shared)", color: "bg-purple-600" },
];

// ── Copy button ────────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="ml-2 text-gray-400 hover:text-white transition-colors shrink-0" title="Copy">
      {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
    </button>
  );
}

// ── Week card ──────────────────────────────────────────────────────────────────
function WeekCard({ week }: { week: Week }) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"posts" | "reels" | "prompts">("posts");

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 bg-gray-800 hover:bg-gray-700 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-bold bg-[#8B1A1A] text-white px-2 py-0.5 rounded shrink-0">Week {week.weekNumber}</span>
          <span className="text-sm font-semibold text-white truncate">{week.program}</span>
          <span className="text-xs text-gray-400 shrink-0">{week.startDate} → {week.endDate}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {week.generationError && <Badge variant="destructive" className="text-xs">Error</Badge>}
          {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="bg-gray-900 p-5">
          {week.generationError ? (
            <p className="text-red-400 text-sm">{week.generationError}</p>
          ) : (
            <>
              <div className="flex gap-2 mb-5 flex-wrap">
                {(["posts", "reels", "prompts"] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${activeTab === tab ? "bg-[#8B1A1A] text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
                    {tab === "posts" ? "5 Static Posts" : tab === "reels" ? "5 Reels" : "Manus Prompts"}
                  </button>
                ))}
              </div>

              {activeTab === "posts" && (
                <div className="space-y-4">
                  {week.posts?.map((post, i) => (
                    <div key={i} className="border border-gray-700 rounded-lg p-4 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">Post {post.postNumber}</span>
                        <span className="text-sm font-semibold text-white">{post.topic}</span>
                      </div>
                      {post.angle && <p className="text-xs text-gray-400"><span className="text-gray-500">Angle:</span> {post.angle}</p>}
                      <div className="bg-gray-800 rounded p-3 text-sm text-right" dir="rtl">
                        {post.keyMessageAr && <p className="text-gray-200 font-medium mb-1">{post.keyMessageAr}</p>}
                        {post.captionAr && <p className="text-gray-400 text-xs">{post.captionAr}</p>}
                        {post.hashtags?.length > 0 && <p className="text-gray-500 text-xs mt-1">{post.hashtags.map(h => `#${h.replace(/^#/, "")}`).join(" ")}</p>}
                      </div>
                      {(post as Post).manusImagePrompt && (
                        <div className="space-y-1">
                          <p className="text-xs text-amber-400 font-semibold">🎨 Static Design Prompt</p>
                          <div className="flex items-start gap-2">
                            <div className="flex-1 bg-gray-800 border border-amber-900/40 rounded p-2 text-xs text-gray-300 font-mono break-all">{(post as Post).manusImagePrompt}</div>
                            <CopyButton text={(post as Post).manusImagePrompt!} />
                          </div>
                        </div>
                      )}
                      {post.manusPrompt && (
                        <div className="flex items-start gap-2">
                          <div className="flex-1 bg-gray-800 rounded p-2 text-xs text-gray-400 font-mono break-all">{post.manusPrompt}</div>
                          <CopyButton text={post.manusPrompt} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "reels" && (
                <div className="space-y-4">
                  {week.reels?.map((reel, i) => (
                    <div key={i} className="border border-gray-700 rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs bg-[#8B1A1A] text-white px-2 py-0.5 rounded">Reel {reel.reelNumber}</span>
                        <span className="text-sm font-semibold text-white">{reel.topic}</span>
                      </div>
                      {reel.concept && <p className="text-xs text-gray-400"><span className="text-gray-500">Concept:</span> {reel.concept}</p>}
                      {reel.backgroundMusicStyle && <p className="text-xs text-gray-400"><span className="text-gray-500">Music:</span> {reel.backgroundMusicStyle}</p>}
                      {reel.voiceOverAr && (
                        <div className="bg-gray-800 rounded p-3 text-sm text-right" dir="rtl">
                          <p className="text-xs text-gray-500 mb-1 text-left" dir="ltr">Voice-Over (Arabic):</p>
                          <p className="text-gray-200">{reel.voiceOverAr}</p>
                        </div>
                      )}
                      {reel.scenes?.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500 font-medium">5 Scenes (5 sec each):</p>
                          {reel.scenes.map((scene, j) => (
                            <div key={j} className="flex items-start gap-2 bg-gray-800 rounded p-2">
                              <span className="text-xs text-gray-500 mt-0.5 shrink-0">Scene {scene.sceneNumber}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-300">{scene.visualDescription}</p>
                                {scene.manusPrompt && (
                                  <div className="flex items-start gap-1 mt-1">
                                    <p className="text-xs text-gray-500 font-mono break-all flex-1">{scene.manusPrompt}</p>
                                    <CopyButton text={scene.manusPrompt} />
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {reel.manusWeekPrompt && (
                        <div className="border border-gray-600 rounded p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-400 font-medium">Combined Reel Manus Prompt:</span>
                            <CopyButton text={reel.manusWeekPrompt} />
                          </div>
                          <p className="text-xs text-gray-400 font-mono break-all">{reel.manusWeekPrompt}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "prompts" && (
                <div className="space-y-4">
                  {week.wordDocPrompt && (
                    <div className="border border-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-white">Word Document Prompt</span>
                        <CopyButton text={week.wordDocPrompt} />
                      </div>
                      <p className="text-xs text-gray-400 mb-2">Use this prompt in a Manus task to generate a Word document with all captions and voice-over scripts for this week.</p>
                      <div className="bg-gray-800 rounded p-3 text-xs text-gray-300 font-mono break-all">{week.wordDocPrompt}</div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-xs text-amber-400 font-semibold">🎨 Static Post Design Prompts (copy each to a Manus image task):</p>
                    {week.posts?.map((post, i) => (post as Post).manusImagePrompt ? (
                      <div key={i} className="bg-gray-800 border border-amber-900/40 rounded p-3 flex items-start gap-2">
                        <span className="text-xs text-gray-500 shrink-0 mt-0.5">Post {post.postNumber}</span>
                        <p className="text-xs text-gray-300 font-mono break-all flex-1">{(post as Post).manusImagePrompt}</p>
                        <CopyButton text={(post as Post).manusImagePrompt!} />
                      </div>
                    ) : null)}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 font-medium">Individual Reel Prompts (copy each to a separate Manus task):</p>
                    {week.reels?.map((reel, i) => reel.manusWeekPrompt ? (
                      <div key={i} className="bg-gray-800 rounded p-3 flex items-start gap-2">
                        <span className="text-xs text-gray-500 shrink-0 mt-0.5">Reel {reel.reelNumber}</span>
                        <p className="text-xs text-gray-400 font-mono break-all flex-1">{reel.manusWeekPrompt}</p>
                        <CopyButton text={reel.manusWeekPrompt} />
                      </div>
                    ) : null)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Plan viewer ────────────────────────────────────────────────────────────────
function PlanViewer({ plan, onBack }: { plan: Plan; onBack: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">← Back to Plans</button>
        <h2 className="text-xl font-bold text-white truncate">{plan.planTitle}</h2>
      </div>
      {plan.strategyOverview && <p className="text-sm text-gray-400">{plan.strategyOverview}</p>}
      {plan.programAllocation?.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {plan.programAllocation.map((p, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-white">{p.percentage}%</p>
              <p className="text-xs text-gray-400 mt-1">{p.program}</p>
              <p className="text-xs text-gray-500 mt-0.5">Weeks {p.weeks?.join(", ")}</p>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-3">
        {plan.weeks?.map((week, i) => <WeekCard key={i} week={week} />)}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function MarketingPlan() {
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [generating, setGenerating] = useState(false);

  const utils = trpc.useUtils();
  const { data: savedPlans, isLoading: plansLoading } = trpc.marketing.listPlans.useQuery();

  const saveMutation = trpc.marketing.savePlan.useMutation({
    onSuccess: () => { utils.marketing.listPlans.invalidate(); },
  });

  const generateMutation = trpc.marketing.generateStrategyPlan.useMutation({
    onSuccess: (data) => {
      setGenerating(false);
      try {
        const parsed: Plan = JSON.parse(data.planJson);
        setActivePlan(parsed);
        // Use DD/MM/YYYY format so superjson does NOT coerce this string to a Date object.
        // The savePlan Zod schema accepts any string for startDate.
        const today = new Date();
        const startDate = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
        saveMutation.mutate({ title: parsed.planTitle, startDate, planJson: data.planJson });
        toast.success("12-week plan generated and saved!");
      } catch {
        toast.error("Plan generated but could not be parsed. Please try again.");
      }
    },
    onError: (err) => {
      setGenerating(false);
      toast.error(`Generation failed: ${err.message}`);
    },
  });

  const deleteMutation = trpc.marketing.deletePlan.useMutation({
    onSuccess: () => { utils.marketing.listPlans.invalidate(); toast.success("Plan deleted."); },
  });

  const handleGenerate = () => {
    setGenerating(true);
    // Use DD/MM/YYYY format so superjson does NOT coerce this to a Date object
    const today = new Date();
    const startDate = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
    generateMutation.mutate({ startDate });
  };

  const handleLoadPlan = (saved: { planJson?: string | null; title: string }) => {
    if (!saved.planJson) { toast.error("Plan data is empty."); return; }
    try { setActivePlan(JSON.parse(saved.planJson)); }
    catch { toast.error("Failed to load plan."); }
  };

  if (activePlan) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <PlanViewer plan={activePlan} onBack={() => setActivePlan(null)} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Marketing Strategy Plan</h1>
        <p className="text-sm text-gray-400 mt-1">Generate a 12-week content strategy with ready-to-use Manus prompts for each week.</p>
      </div>

      {/* Generator card */}
      <div className="border border-gray-700 rounded-xl p-6 bg-gray-900 space-y-6">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-[#8B1A1A]" />
          <h2 className="text-lg font-semibold text-white">Generate 12-Week Strategy Plan</h2>
        </div>

        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Fixed Program Allocation</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PROGRAM_ALLOCATION.map((p, i) => (
              <div key={i} className="bg-gray-800 rounded-lg p-3 flex items-center gap-3">
                <div className={`w-2 h-8 rounded-full shrink-0 ${p.color}`} />
                <div>
                  <p className="text-sm font-medium text-white">{p.program}</p>
                  <p className="text-xs text-gray-400">{p.percentage}% · Weeks {p.weeks}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Plan Start Date (today)</p>
          <p className="text-sm font-medium text-white">{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</p>
          <p className="text-xs text-gray-400 mt-1">12 weeks · Each week: 5 static posts + 5 reels (5 scenes × 5 sec each) + Word doc prompt</p>
        </div>

        <Button onClick={handleGenerate} disabled={generating} className="w-full bg-[#8B1A1A] hover:bg-[#7a1717] text-white font-semibold py-3">
          {generating ? (
            <><Loader2 size={16} className="animate-spin mr-2" />Generating plan… (2–3 minutes, please keep page open)</>
          ) : (
            <><Sparkles size={16} className="mr-2" />Generate 12-Week Strategy Plan</>
          )}
        </Button>
      </div>

      {/* Saved plans */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">
          Saved Plans {savedPlans && savedPlans.length > 0 && <span className="text-gray-500 text-sm font-normal">({savedPlans.length})</span>}
        </h2>
        {plansLoading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 size={14} className="animate-spin" /> Loading…</div>
        ) : !savedPlans || savedPlans.length === 0 ? (
          <p className="text-sm text-gray-500">No saved plans yet. Generate your first plan above.</p>
        ) : (
          <div className="space-y-3">
            {savedPlans.map((plan) => (
              <div key={plan.id} className="border border-gray-700 rounded-lg p-4 flex items-center justify-between bg-gray-900">
                <div>
                  <p className="text-sm font-medium text-white">{plan.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{plan.startDate} · Created {new Date(plan.createdAt).toLocaleDateString("en-GB")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="text-xs border-gray-600 text-gray-300 hover:text-white" onClick={() => handleLoadPlan(plan as any)}>
                    <BookOpen size={13} className="mr-1" /> View
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-900/20" onClick={() => deleteMutation.mutate({ id: plan.id })}>
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
