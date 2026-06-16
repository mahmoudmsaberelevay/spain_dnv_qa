import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Loader2, Sparkles, Download, Image, Film, FileText,
  ChevronDown, ChevronRight, Calendar, Target, Hash, Zap,
  FolderOpen, Trash2, Save
} from "lucide-react";

const PROGRAMS = [
  "Spain DNV", "Portugal D7", "Portugal D8", "Portugal D2",
  "Greece Golden Visa", "Malta PR", "UK Expansion Worker", "Canada Skilled Migration",
  "Dominica", "Grenada", "Saint Kitts & Nevis", "Saint Lucia",
  "Antigua & Barbuda", "Vanuatu", "Nauru", "Sao Tome", "Egypt", "Turkey"
];

type Post = { day: string; type: string; topic: string; caption: string; hashtags: string[] };
type Week = { weekNumber: number; weekLabel: string; focus: string; posts: Post[] };
type Month = { monthNumber: number; monthName: string; theme: string; objective: string; weeks: Week[] };
type Plan = {
  planTitle: string;
  dateRange: { start: string; end: string };
  strategy: { overview: string; contentPillars: Array<{ name: string; percentage: number; description: string }>; targetAudience: string; tone: string };
  months: Month[];
  hashtagLibrary: { brand: string[]; residency: string[]; citizenship: string[]; arabic: string[] };
  engagementStrategy: { bestPostingTimes: string; communityManagement: string; paidAmplification: string };
  kpis: Array<{ metric: string; target: string; measurement: string }>;
};

type WeekMediaResult = {
  weekLabel: string;
  weekFocus: string;
  generatedAt: string;
  staticImages: Array<{ day: string; topic: string; url: string }>;
  reels: Array<{
    day: string; topic: string; mergeInstructions: string; voiceOverScript: string; backgroundMusicSuggestion: string;
    scenes: Array<{ sceneNumber: number; duration: string; videoPrompt: string; keyframeUrl: string }>;
  }>;
  wordDocUrl: string;
};

const POST_TYPE_COLORS: Record<string, string> = {
  "Static Design": "bg-blue-100 text-blue-800",
  "Reel": "bg-purple-100 text-purple-800",
  "Story": "bg-orange-100 text-orange-800",
  "Carousel": "bg-green-100 text-green-800",
};

const DAY_COLORS: Record<string, string> = {
  Sunday: "bg-[#1A3A5C] text-white",
  Monday: "bg-[#5BA3B8] text-white",
  Tuesday: "bg-violet-600 text-white",
  Wednesday: "bg-amber-500 text-white",
  Thursday: "bg-emerald-600 text-white",
  Friday: "bg-pink-600 text-white",
  Saturday: "bg-orange-500 text-white",
};
const WEEK_DAYS_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];

export default function MarketingPlan() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set([1]));
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [weekMediaResults, setWeekMediaResults] = useState<Record<string, WeekMediaResult>>({});
  const [generatingWeeks, setGeneratingWeeks] = useState<Set<string>>(new Set());
  const [savedPlanId, setSavedPlanId] = useState<number | null>(null);
  const [showSavedPlans, setShowSavedPlans] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [contentRatio, setContentRatio] = useState("40% EU Residency, 40% Caribbean Citizenship, 20% Brand & Trust");
  const [pillarFocus, setPillarFocus] = useState("Investment ROI, Lifestyle & Freedom, Family Security, Global Mobility");
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>(["Spain DNV", "Dominica", "Grenada", "Saint Kitts & Nevis", "Greece Golden Visa"]);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Persistence
  const utils = trpc.useUtils();
  const { data: savedPlans } = trpc.marketing.listPlans.useQuery();
  const savePlanMutation = trpc.marketing.savePlan.useMutation({
    onSuccess: (data) => {
      setSavedPlanId(data.id);
      setIsSaving(false);
      utils.marketing.listPlans.invalidate();
    },
    onError: () => setIsSaving(false),
  });
  const deletePlanMutation = trpc.marketing.deletePlan.useMutation({
    onSuccess: () => utils.marketing.listPlans.invalidate(),
  });

  // Auto-save whenever plan changes
  useEffect(() => {
    if (!plan) return;
    setIsSaving(true);
    const title = plan.planTitle || ("Marketing Plan " + startDate);
    savePlanMutation.mutate({
      id: savedPlanId ?? undefined,
      title,
      startDate,
      contentRatio,
      pillarFocus,
      featuredPrograms: selectedPrograms.join(", "),
      planJson: JSON.stringify(plan),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const generatePlanMutation = trpc.marketing.generateMarketingPlan.useMutation({
    onSuccess: (data) => {
      setPlan(data as Plan);
      setExpandedMonths(new Set([1]));
      toast.success("3-Month Marketing Plan generated and saved!");
    },
    onError: (err) => toast.error("Failed to generate plan: " + err.message),
  });

  const generateWeekMediaMutation = trpc.marketing.generateWeekMedia.useMutation({
    onSuccess: (data, variables) => {
      const key = variables.weekLabel;
      setWeekMediaResults(prev => ({ ...prev, [key]: data as WeekMediaResult }));
      setGeneratingWeeks(prev => { const s = new Set(prev); s.delete(key); return s; });
      toast.success("Week media package generated for " + variables.weekLabel + "!");
    },
    onError: (err, variables) => {
      setGeneratingWeeks(prev => { const s = new Set(prev); s.delete(variables.weekLabel); return s; });
      toast.error("Failed to generate media: " + err.message);
    },
  });

  const toggleProgram = (p: string) => {
    setSelectedPrograms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const toggleMonth = (n: number) => {
    setExpandedMonths(prev => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s; });
  };

  const toggleWeek = (key: string) => {
    setExpandedWeeks(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  };

  const handleGeneratePlan = () => {
    generatePlanMutation.mutate({
      contentRatio,
      pillarFocus,
      featuredPrograms: selectedPrograms,
      startDate,
    });
  };

  const handleGenerateWeekMedia = (week: Week) => {
    const key = week.weekLabel;
    setGeneratingWeeks(prev => { const s = new Set(prev); s.add(key); return s; });
    generateWeekMediaMutation.mutate({
      weekLabel: week.weekLabel,
      weekFocus: week.focus,
      posts: week.posts,
      planId: savedPlanId ?? undefined,
    });
  };

  const handleLoadPlan = async (row: { id: number; title: string; startDate: string; planJson?: string | null }) => {
    if (row.planJson) {
      try {
        setPlan(JSON.parse(row.planJson) as Plan);
        setSavedPlanId(row.id);
        setExpandedMonths(new Set([1]));
        setWeekMediaResults({});
        setShowSavedPlans(false);
        toast.success("Plan loaded: " + row.title);
        // Fetch previously generated week media for this plan
        const weekMediaData = await utils.marketing.getWeekMedia.fetch({ planId: row.id });
        if (weekMediaData && weekMediaData.length > 0) {
          const restored: Record<string, WeekMediaResult> = {};
          for (const wm of weekMediaData) {
            if (wm.result && wm.weekLabel) {
              restored[wm.weekLabel] = wm.result as WeekMediaResult;
            }
          }
          setWeekMediaResults(restored);
          toast.success(`Restored ${weekMediaData.length} generated week package${weekMediaData.length > 1 ? 's' : ''}`);
        }
      } catch { toast.error("Failed to parse saved plan"); }
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A3A5C]">Marketing Plan Generator</h1>
          <p className="text-sm text-gray-500 mt-1">Generate a full 3-month ELEVAY social media strategy with weekly content packages</p>
        </div>
        <div className="flex items-center gap-2">
          {isSaving && <span className="text-xs text-gray-400 flex items-center gap-1"><Save className="w-3 h-3" /> Saving...</span>}
          {savedPlanId && !isSaving && <span className="text-xs text-emerald-600 flex items-center gap-1"><Save className="w-3 h-3" /> Saved</span>}
          <Button variant="outline" size="sm" onClick={() => setShowSavedPlans(!showSavedPlans)} className="gap-2">
            <FolderOpen className="w-4 h-4" />
            Saved Plans {savedPlans && savedPlans.length > 0 && <Badge variant="secondary" className="ml-1">{savedPlans.length}</Badge>}
          </Button>
        </div>
      </div>

      {/* Saved Plans Panel */}
      {showSavedPlans && (
        <Card className="border-[#5BA3B8]/30 bg-[#f0f8fb]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-[#1A3A5C]">Saved Plans</CardTitle>
          </CardHeader>
          <CardContent>
            {!savedPlans || savedPlans.length === 0 ? (
              <p className="text-sm text-gray-400">No saved plans yet. Generate a plan to save it automatically.</p>
            ) : (
              <div className="space-y-2">
                {savedPlans.map((row) => (
                  <div key={row.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-[#5BA3B8]/20">
                    <div>
                      <p className="text-sm font-medium text-[#1A3A5C]">{row.title}</p>
                      <p className="text-xs text-gray-400">Start: {row.startDate} · Saved: {new Date(Number(row.createdAt)).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleLoadPlan(row as { id: number; title: string; startDate: string; planJson?: string | null })}>Load</Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => deletePlanMutation.mutate({ id: row.id })}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Configuration Card */}
      <Card className="border-[#5BA3B8]/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-[#1A3A5C] flex items-center gap-2">
            <Target className="w-4 h-4 text-[#5BA3B8]" />
            Plan Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-600">Start Date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-600">Content Ratio</Label>
              <Input value={contentRatio} onChange={e => setContentRatio(e.target.value)} placeholder="e.g. 40% EU, 40% Caribbean, 20% Brand" className="h-9" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-600">Messaging Pillars</Label>
            <Textarea value={pillarFocus} onChange={e => setPillarFocus(e.target.value)} rows={2} placeholder="e.g. Investment ROI, Lifestyle & Freedom, Family Security" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-gray-600">Featured Programs ({selectedPrograms.length} selected)</Label>
            <div className="flex flex-wrap gap-2">
              {PROGRAMS.map(p => (
                <button
                  key={p}
                  onClick={() => toggleProgram(p)}
                  className={`px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedPrograms.includes(p)
                      ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                      : "bg-white text-gray-600 border-gray-200 hover:border-[#5BA3B8]"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <Button
            onClick={handleGeneratePlan}
            disabled={generatePlanMutation.isPending}
            className="w-full bg-[#1A3A5C] hover:bg-[#1A3A5C]/90 text-white gap-2"
          >
            {generatePlanMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating 3-Month Plan (1-2 min)...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generate 3-Month Marketing Plan</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Plan Display */}
      {plan && (
        <div className="space-y-4">
          {/* Strategy Overview */}
          <Card className="border-[#5BA3B8]/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-[#1A3A5C] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#5BA3B8]" />
                {plan.planTitle}
                <span className="text-xs font-normal text-gray-400 ml-2">{plan.dateRange?.start} → {plan.dateRange?.end}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-gray-600">{plan.strategy?.overview}</p>
              <div className="flex flex-wrap gap-2">
                {plan.strategy?.contentPillars?.map((p, i) => (
                  <div key={i} className="bg-[#f0f8fb] border border-[#5BA3B8]/30 rounded-lg px-3 py-1 text-xs">
                    <span className="font-semibold text-[#1A3A5C]">{p.name}</span>
                    <span className="text-[#5BA3B8] ml-1">({p.percentage}%)</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Monthly Calendar */}
          {plan.months?.map((month) => (
            <Card key={month.monthNumber} className="border-[#5BA3B8]/30">
              <CardHeader
                className="pb-3 cursor-pointer select-none"
                onClick={() => toggleMonth(month.monthNumber)}
              >
                <CardTitle className="text-base text-[#1A3A5C] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#5BA3B8]" />
                    Month {month.monthNumber}: {month.monthName}
                    <Badge className="bg-[#5BA3B8]/20 text-[#1A3A5C] text-xs font-normal">{month.theme}</Badge>
                  </div>
                  {expandedMonths.has(month.monthNumber) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </CardTitle>
                <p className="text-xs text-gray-500 mt-1">{month.objective}</p>
              </CardHeader>

              {expandedMonths.has(month.monthNumber) && (
                <CardContent className="space-y-3">
                  {month.weeks?.map((week) => {
                    const weekKey = week.weekLabel;
                    const isExpanded = expandedWeeks.has(weekKey);
                    const isGenerating = generatingWeeks.has(weekKey);
                    const mediaResult = weekMediaResults[weekKey];

                    return (
                      <div key={week.weekNumber} className="border border-gray-100 rounded-lg overflow-hidden">
                        {/* Week Header */}
                        <div
                          className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer"
                          onClick={() => toggleWeek(weekKey)}
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                            <span className="text-sm font-semibold text-[#1A3A5C]">{week.weekLabel}</span>
                            <span className="text-xs text-gray-500">— {week.focus}</span>
                          </div>
                          <Button
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleGenerateWeekMedia(week); }}
                            disabled={isGenerating}
                            className="bg-[#5BA3B8] hover:bg-[#5BA3B8]/90 text-white text-xs h-7 gap-1"
                          >
                            {isGenerating ? (
                              <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</>
                            ) : (
                              <><Zap className="w-3 h-3" /> Generate Media Package</>
                            )}
                          </Button>
                        </div>

                        {/* Week Content */}
                        {isExpanded && (
                          <div className="p-4 space-y-3">
                            {/* 5-Day Posts Grid — grouped by day */}
                            <div className="space-y-3">
                              {WEEK_DAYS_ORDER.map((dayName) => {
                                const dayPosts = week.posts?.filter(p => p.day === dayName) || [];
                                if (dayPosts.length === 0) return null;
                                const staticPost = dayPosts.find(p => p.type === "Static Design");
                                const reelPost = dayPosts.find(p => p.type === "Reel");
                                return (
                                  <div key={dayName} className="border border-gray-100 rounded-lg overflow-hidden">
                                    {/* Day Header */}
                                    <div className={`px-3 py-2 flex items-center gap-2 ${DAY_COLORS[dayName] || "bg-gray-100 text-gray-700"}`}>
                                      <span className="text-sm font-bold">{dayName}</span>
                                      {staticPost && <span className="text-xs opacity-80 truncate">{staticPost.topic}</span>}
                                    </div>
                                    {/* Static + Reel side by side */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                                      {/* Static Design */}
                                      {staticPost && (
                                        <div className="p-3 space-y-1.5">
                                          <div className="flex items-center gap-1.5">
                                            <Image className="w-3 h-3 text-blue-500" />
                                            <span className="text-xs font-semibold text-blue-700">Static Design (1:1)</span>
                                          </div>
                                          <p className="text-xs font-medium text-[#1A3A5C]">{staticPost.topic}</p>
                                          <p className="text-xs text-gray-500 line-clamp-3">{staticPost.caption}</p>
                                          <div className="flex flex-wrap gap-1">
                                            {staticPost.hashtags?.slice(0, 4).map((h, hi) => (
                                              <span key={hi} className="text-xs text-[#5BA3B8]">#{h}</span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {/* Reel */}
                                      {reelPost && (
                                        <div className="p-3 space-y-1.5">
                                          <div className="flex items-center gap-1.5">
                                            <Film className="w-3 h-3 text-purple-500" />
                                            <span className="text-xs font-semibold text-purple-700">Reel (9:16) — 5 Keyframes</span>
                                          </div>
                                          <p className="text-xs font-medium text-[#1A3A5C]">{reelPost.topic}</p>
                                          <p className="text-xs text-gray-500 line-clamp-3">{reelPost.caption}</p>
                                          <div className="flex flex-wrap gap-1">
                                            {reelPost.hashtags?.slice(0, 4).map((h, hi) => (
                                              <span key={hi} className="text-xs text-[#5BA3B8]">#{h}</span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Media Results */}
                            {mediaResult && (
                              <div className="mt-4 space-y-4 border-t pt-4">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-sm font-semibold text-[#1A3A5C]">Generated Media Package</h4>
                                  <a href={mediaResult.wordDocUrl} download target="_blank" rel="noreferrer">
                                    <Button size="sm" variant="outline" className="gap-1 text-xs h-7">
                                      <FileText className="w-3 h-3" /> Download Word Doc
                                    </Button>
                                  </a>
                                </div>

                                {/* Static Images — 5 days, 1:1 */}
                                <div>
                                  <h5 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                                    <Image className="w-3 h-3" /> Static Designs (1:1) — {mediaResult.staticImages?.length || 0} images
                                  </h5>
                                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                    {WEEK_DAYS_ORDER.map((dayName) => {
                                      const img = mediaResult.staticImages?.find(i => i.day === dayName);
                                      if (!img) return null;
                                      return (
                                        <div key={dayName} className="space-y-1">
                                          <div className={`text-xs px-2 py-0.5 rounded text-center font-medium ${DAY_COLORS[dayName] || "bg-gray-100 text-gray-700"}`}>{dayName}</div>
                                          <img src={img.url} alt={img.topic} className="w-full aspect-square object-cover rounded-lg border" />
                                          <p className="text-xs text-gray-500 text-center line-clamp-1">{img.topic}</p>
                                          <a href={img.url} download target="_blank" rel="noreferrer" className="block">
                                            <Button size="sm" variant="outline" className="w-full text-xs h-6 gap-1">
                                              <Download className="w-2 h-2" /> Download
                                            </Button>
                                          </a>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Reels — 5 days, 9:16, 5 keyframes each */}
                                <div>
                                  <h5 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                                    <Film className="w-3 h-3" /> Reels (9:16) — {mediaResult.reels?.length || 0} reels × 5 Keyframes
                                  </h5>
                                  <div className="space-y-4">
                                    {mediaResult.reels?.map((reel, ri) => (
                                      <div key={ri} className="border border-purple-100 rounded-lg p-3 space-y-3">
                                        <div className="flex items-center gap-2">
                                          <Badge className="bg-purple-100 text-purple-800 text-xs">Reel {ri + 1}</Badge>
                                          <span className="text-xs font-medium text-[#1A3A5C]">{reel.day} — {reel.topic}</span>
                                        </div>

                                        {/* Keyframes — 9:16 vertical aspect ratio */}
                                        <div className="grid grid-cols-5 gap-1">
                                          {reel.scenes?.map((scene, si) => (
                                            <div key={si} className="space-y-1">
                                              <div className="relative w-full" style={{ paddingBottom: "177.78%" }}>
                                                <img
                                                  src={scene.keyframeUrl}
                                                  alt={"Scene " + scene.sceneNumber}
                                                  className="absolute inset-0 w-full h-full object-cover rounded border"
                                                />
                                              </div>
                                              <p className="text-xs text-center text-gray-400">Scene {scene.sceneNumber}</p>
                                              <p className="text-xs text-center text-gray-300 line-clamp-1">{scene.duration}</p>
                                            </div>
                                          ))}
                                        </div>

                                        {/* Video Prompts */}
                                        <div className="space-y-1">
                                          <p className="text-xs font-semibold text-gray-600">Video Prompts:</p>
                                          {reel.scenes?.map((scene, si) => (
                                            <div key={si} className="bg-gray-50 rounded p-2 text-xs text-gray-600">
                                              <span className="font-medium text-purple-700">Scene {scene.sceneNumber} ({scene.duration}):</span> {scene.videoPrompt}
                                            </div>
                                          ))}
                                        </div>

                                        {/* Merge Instructions */}
                                        <div className="bg-amber-50 border border-amber-200 rounded p-2">
                                          <p className="text-xs font-semibold text-amber-700">Merge & Music Instructions:</p>
                                          <p className="text-xs text-amber-600 mt-1">{reel.mergeInstructions}</p>
                                          <p className="text-xs text-amber-600 mt-1"><span className="font-medium">Music:</span> {reel.backgroundMusicSuggestion}</p>
                                        </div>

                                        {/* Voice-Over */}
                                        <div className="bg-blue-50 border border-blue-200 rounded p-2" dir="rtl">
                                          <p className="text-xs font-semibold text-blue-700" dir="ltr">Arabic Voice-Over Script:</p>
                                          <p className="text-xs text-blue-600 mt-1 leading-relaxed">{reel.voiceOverScript}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              )}
            </Card>
          ))}

          {/* Hashtag Library */}
          {plan.hashtagLibrary && (
            <Card className="border-[#5BA3B8]/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-[#1A3A5C] flex items-center gap-2">
                  <Hash className="w-4 h-4 text-[#5BA3B8]" />
                  Hashtag Library
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(plan.hashtagLibrary).map(([cat, tags]) => (
                  <div key={cat} className="flex flex-wrap gap-1 items-center">
                    <span className="text-xs font-semibold text-gray-500 capitalize w-20">{cat}:</span>
                    {(tags as string[]).map((tag, i) => (
                      <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">#{tag}</span>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
