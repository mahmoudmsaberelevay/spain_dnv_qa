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
  Loader2, Sparkles, Download, Image, Film, FileText,
  ChevronDown, ChevronRight, Calendar, Target, Hash, Zap
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
  Monday: "bg-[#1A3A5C] text-white",
  Wednesday: "bg-[#5BA3B8] text-white",
  Friday: "bg-amber-500 text-white",
  Saturday: "bg-emerald-600 text-white",
};

export default function MarketingPlan() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set([1]));
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [weekMediaResults, setWeekMediaResults] = useState<Record<string, WeekMediaResult>>({});
  const [generatingWeeks, setGeneratingWeeks] = useState<Set<string>>(new Set());

  // Form state
  const [contentRatio, setContentRatio] = useState("40% EU Residency, 40% Caribbean Citizenship, 20% Brand & Trust");
  const [pillarFocus, setPillarFocus] = useState("Investment ROI, Lifestyle & Freedom, Family Security, Global Mobility");
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>(["Spain DNV", "Dominica", "Grenada", "Saint Kitts & Nevis", "Greece Golden Visa"]);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  const generatePlanMutation = trpc.marketing.generateMarketingPlan.useMutation({
    onSuccess: (data) => {
      setPlan(data as Plan);
      setExpandedMonths(new Set([1]));
      toast.success("3-Month Marketing Plan generated!");
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
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A3A5C]">Marketing Plan Generator</h1>
          <p className="text-sm text-gray-500 mt-1">Generate a full 3-month ELEVAY social media strategy with weekly content packages</p>
        </div>
      </div>

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
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedPrograms.includes(p)
                      ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                      : "bg-white text-gray-600 border-gray-300 hover:border-[#5BA3B8]"
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
            className="w-full bg-[#1A3A5C] hover:bg-[#1A3A5C]/90 text-white"
          >
            {generatePlanMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating 3-Month Plan...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" />Generate 3-Month Marketing Plan</>
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
              <CardTitle className="text-base text-[#1A3A5C]">
                {plan.planTitle} — {plan.dateRange.start} to {plan.dateRange.end}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-700 leading-relaxed">{plan.strategy.overview}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {plan.strategy.contentPillars.map((pillar, i) => (
                  <div key={i} className="bg-[#1A3A5C]/5 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-[#1A3A5C]">{pillar.percentage}%</div>
                    <div className="text-xs font-medium text-[#5BA3B8] mt-1">{pillar.name}</div>
                    <div className="text-xs text-gray-500 mt-1">{pillar.description}</div>
                  </div>
                ))}
              </div>
              {/* KPIs */}
              {plan.kpis && plan.kpis.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-[#1A3A5C] mb-2 flex items-center gap-1"><Zap className="w-3 h-3" />KPIs</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {plan.kpis.map((kpi, i) => (
                      <div key={i} className="bg-gray-50 rounded p-2 text-xs">
                        <div className="font-medium text-[#1A3A5C]">{kpi.metric}</div>
                        <div className="text-[#5BA3B8]">{kpi.target}</div>
                        <div className="text-gray-500">{kpi.measurement}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Hashtag Library */}
              {plan.hashtagLibrary && (
                <div>
                  <h4 className="text-sm font-semibold text-[#1A3A5C] mb-2 flex items-center gap-1"><Hash className="w-3 h-3" />Hashtag Library</h4>
                  <div className="flex flex-wrap gap-1">
                    {[...plan.hashtagLibrary.brand, ...plan.hashtagLibrary.residency, ...plan.hashtagLibrary.citizenship, ...plan.hashtagLibrary.arabic].map((tag, i) => (
                      <span key={i} className="text-xs bg-[#5BA3B8]/10 text-[#5BA3B8] px-2 py-0.5 rounded">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Monthly Calendar */}
          {plan.months.map((month) => (
            <Card key={month.monthNumber} className="border-[#5BA3B8]/20">
              <CardHeader
                className="pb-3 cursor-pointer"
                onClick={() => toggleMonth(month.monthNumber)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#1A3A5C] text-white flex items-center justify-center text-sm font-bold">
                      {month.monthNumber}
                    </div>
                    <div>
                      <CardTitle className="text-base text-[#1A3A5C]">{month.monthName}</CardTitle>
                      <p className="text-xs text-[#5BA3B8]">{month.theme} — {month.objective}</p>
                    </div>
                  </div>
                  {expandedMonths.has(month.monthNumber) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </div>
              </CardHeader>

              {expandedMonths.has(month.monthNumber) && (
                <CardContent className="space-y-3 pt-0">
                  {month.weeks.map((week) => {
                    const weekKey = week.weekLabel;
                    const isExpanded = expandedWeeks.has(weekKey);
                    const isGenerating = generatingWeeks.has(weekKey);
                    const mediaResult = weekMediaResults[weekKey];

                    return (
                      <div key={week.weekNumber} className="border border-gray-200 rounded-lg overflow-hidden">
                        {/* Week Header */}
                        <div
                          className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
                          onClick={() => toggleWeek(weekKey)}
                        >
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-[#5BA3B8]" />
                            <span className="text-sm font-medium text-[#1A3A5C]">{week.weekLabel}</span>
                            <Badge variant="outline" className="text-xs text-[#5BA3B8] border-[#5BA3B8]/30">{week.focus}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            {mediaResult && <Badge className="text-xs bg-green-100 text-green-700 border-0">✓ Generated</Badge>}
                            {isExpanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                          </div>
                        </div>

                        {/* Week Content */}
                        {isExpanded && (
                          <div className="p-3 space-y-3">
                            {/* Posts Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {week.posts.map((post, pi) => (
                                <div key={pi} className="bg-white border border-gray-100 rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${DAY_COLORS[post.day] || "bg-gray-100 text-gray-700"}`}>{post.day}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${POST_TYPE_COLORS[post.type] || "bg-gray-100 text-gray-600"}`}>{post.type}</span>
                                  </div>
                                  <p className="text-xs font-medium text-[#1A3A5C] mb-1">{post.topic}</p>
                                  <p className="text-xs text-gray-600 leading-relaxed text-right" dir="rtl">{post.caption}</p>
                                  {post.hashtags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {post.hashtags.slice(0, 4).map((tag, ti) => (
                                        <span key={ti} className="text-xs text-[#5BA3B8]">{tag}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Generate Media Button */}
                            <Button
                              onClick={() => handleGenerateWeekMedia(week)}
                              disabled={isGenerating}
                              className="w-full bg-[#5BA3B8] hover:bg-[#5BA3B8]/90 text-white"
                              size="sm"
                            >
                              {isGenerating ? (
                                <><Loader2 className="w-3 h-3 mr-2 animate-spin" />Generating Media Package (2–4 min)...</>
                              ) : (
                                <><Sparkles className="w-3 h-3 mr-2" />Generate Week Media Package (4 Statics + 20 Keyframes + Word Doc)</>
                              )}
                            </Button>

                            {/* Media Results */}
                            {mediaResult && (
                              <div className="space-y-3 border-t pt-3">
                                <h4 className="text-sm font-semibold text-[#1A3A5C]">Generated Media Package</h4>

                                {/* Static Images */}
                                {mediaResult.staticImages.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1"><Image className="w-3 h-3" />Static Images (1080×1080)</p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                      {mediaResult.staticImages.map((img, i) => (
                                        <div key={i} className="space-y-1">
                                          <img src={img.url} alt={img.topic} className="w-full aspect-square object-cover rounded-lg border" />
                                          <p className="text-xs text-center text-gray-500">{img.day}</p>
                                          <a href={img.url} download className="block">
                                            <Button size="sm" variant="outline" className="w-full h-6 text-xs">
                                              <Download className="w-3 h-3 mr-1" />Download
                                            </Button>
                                          </a>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Reel Keyframes */}
                                {mediaResult.reels.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1"><Film className="w-3 h-3" />Reel Keyframes (5 scenes × 5 sec = 25 sec)</p>
                                    <div className="space-y-3">
                                      {mediaResult.reels.map((reel, ri) => (
                                        <div key={ri} className="border border-purple-100 rounded-lg p-3 bg-purple-50/30">
                                          <p className="text-xs font-semibold text-[#1A3A5C] mb-2">Reel {ri + 1}: {reel.day} — {reel.topic}</p>
                                          {/* Keyframe images */}
                                          <div className="grid grid-cols-5 gap-1 mb-2">
                                            {reel.scenes.map((scene) => (
                                              <div key={scene.sceneNumber} className="space-y-0.5">
                                                {scene.keyframeUrl ? (
                                                  <img src={scene.keyframeUrl} alt={"Scene " + scene.sceneNumber} className="w-full aspect-[9/16] object-cover rounded border" />
                                                ) : (
                                                  <div className="w-full aspect-[9/16] bg-gray-200 rounded border flex items-center justify-center text-xs text-gray-400">—</div>
                                                )}
                                                <p className="text-xs text-center text-gray-400">S{scene.sceneNumber}</p>
                                                {scene.keyframeUrl && (
                                                  <a href={scene.keyframeUrl} download>
                                                    <Button size="sm" variant="outline" className="w-full h-5 text-xs p-0"><Download className="w-2 h-2" /></Button>
                                                  </a>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                          {/* Video prompts */}
                                          <details className="text-xs">
                                            <summary className="cursor-pointer text-[#5BA3B8] font-medium">View Video Prompts & Instructions</summary>
                                            <div className="mt-2 space-y-1 bg-white rounded p-2">
                                              {reel.scenes.map((scene) => (
                                                <div key={scene.sceneNumber} className="border-b border-gray-100 pb-1 last:border-0">
                                                  <span className="font-medium text-[#1A3A5C]">Scene {scene.sceneNumber}: </span>
                                                  <span className="text-gray-600">{scene.videoPrompt}</span>
                                                </div>
                                              ))}
                                              <div className="mt-2 pt-2 border-t">
                                                <p className="font-medium text-[#1A3A5C]">Merge Instructions:</p>
                                                <p className="text-gray-600 whitespace-pre-line">{reel.mergeInstructions}</p>
                                              </div>
                                              <div className="mt-1">
                                                <p className="font-medium text-[#1A3A5C]">Background Music: </p>
                                                <p className="text-gray-600">{reel.backgroundMusicSuggestion}</p>
                                              </div>
                                              <div className="mt-1">
                                                <p className="font-medium text-[#1A3A5C]">Arabic Voice-Over Script:</p>
                                                <p className="text-gray-600 text-right" dir="rtl">{reel.voiceOverScript}</p>
                                              </div>
                                            </div>
                                          </details>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Word Document Download */}
                                <a href={mediaResult.wordDocUrl} download={"ELEVAY-" + mediaResult.weekLabel + "-Content-Package.docx"}>
                                  <Button className="w-full bg-[#1A3A5C] hover:bg-[#1A3A5C]/90 text-white" size="sm">
                                    <FileText className="w-4 h-4 mr-2" />
                                    Download Word Document (Captions + Voice-Over Scripts)
                                  </Button>
                                </a>
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
        </div>
      )}
    </div>
  );
}
