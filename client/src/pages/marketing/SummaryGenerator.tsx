import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Plus, FileText, Trash2, Edit3, Clock, Globe, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MarketingSummaryTabs } from "./MarketingSummaryTabs";

// ─── Program Definitions ───────────────────────────────────────────────────────
const RESIDENCY_PROGRAMS = [
  { country: "Spain",                programType: "Digital Nomad Visa",           programSubtype: "RESIDENCY" },
  { country: "Portugal",             programType: "D7 Passive Income Visa",        programSubtype: "RESIDENCY" },
  { country: "Portugal",             programType: "D8 Digital Nomad Visa",         programSubtype: "RESIDENCY" },
  { country: "Portugal",             programType: "D2 Entrepreneur Visa",          programSubtype: "RESIDENCY" },
  { country: "Greece",               programType: "Golden Visa",                   programSubtype: "RESIDENCY" },
  { country: "Malta",                programType: "Permanent Residency Programme", programSubtype: "RESIDENCY" },
  { country: "United Kingdom",       programType: "Expansion Worker Visa",         programSubtype: "RESIDENCY" },
  { country: "Canada",               programType: "Skilled Worker Migration",      programSubtype: "RESIDENCY" },
  { country: "Australia",            programType: "Skilled Independent Visa",      programSubtype: "RESIDENCY" },
  { country: "Latvia",               programType: "Residency by Investment",       programSubtype: "RESIDENCY" },
  { country: "Hungary",              programType: "Guest Investor Visa",           programSubtype: "RESIDENCY" },
  { country: "United States",        programType: "EB-5 Investor Visa",            programSubtype: "RESIDENCY" },
  { country: "United Arab Emirates", programType: "Golden Visa",                   programSubtype: "RESIDENCY" },
  { country: "Bulgaria",             programType: "Residency by Investment",       programSubtype: "RESIDENCY" },
];

const CITIZENSHIP_PROGRAMS = [
  { country: "Turkey",                  programType: "Citizenship by Investment", programSubtype: "CITIZENSHIP" },
  { country: "Dominica",               programType: "Citizenship by Investment", programSubtype: "CITIZENSHIP" },
  { country: "Saint Lucia",            programType: "Citizenship by Investment", programSubtype: "CITIZENSHIP" },
  { country: "Saint Kitts and Nevis",  programType: "Citizenship by Investment", programSubtype: "CITIZENSHIP" },
  { country: "Grenada",                programType: "Citizenship by Investment", programSubtype: "CITIZENSHIP" },
  { country: "Antigua and Barbuda",    programType: "Citizenship by Investment", programSubtype: "CITIZENSHIP" },
  { country: "Vanuatu",                programType: "Citizenship by Investment", programSubtype: "CITIZENSHIP" },
  { country: "Nauru",                  programType: "Citizenship by Investment", programSubtype: "CITIZENSHIP" },
  { country: "São Tomé and Príncipe",  programType: "Citizenship by Investment", programSubtype: "CITIZENSHIP" },
  { country: "Egypt",                  programType: "Citizenship by Investment", programSubtype: "CITIZENSHIP" },
];

// Flag emoji map
const FLAG: Record<string, string> = {
  "Spain": "🇪🇸", "Portugal": "🇵🇹", "Greece": "🇬🇷", "Malta": "🇲🇹",
  "United Kingdom": "🇬🇧", "Canada": "🇨🇦", "Australia": "🇦🇺", "Latvia": "🇱🇻",
  "Hungary": "🇭🇺", "United States": "🇺🇸", "United Arab Emirates": "🇦🇪", "Bulgaria": "🇧🇬",
  "Turkey": "🇹🇷", "Dominica": "🇩🇲", "Saint Lucia": "🇱🇨", "Saint Kitts and Nevis": "🇰🇳",
  "Grenada": "🇬🇩", "Antigua and Barbuda": "🇦🇬", "Vanuatu": "🇻🇺", "Nauru": "🇳🇷",
  "São Tomé and Príncipe": "🇸🇹", "Egypt": "🇪🇬",
};

type ProgramEntry = { country: string; programType: string; programSubtype: string };

export default function SummaryGenerator() {
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedProgram, setSelectedProgram] = useState<ProgramEntry | null>(null);
  const [activeTab, setActiveTab] = useState<"residency" | "citizenship">("residency");

  const { data: summaries, isLoading, refetch } = trpc.marketing.listSummaries.useQuery();

  const createMutation = trpc.marketing.createSummary.useMutation({
    onSuccess: (data) => {
      toast.success("Summary created");
      setShowCreate(false);
      setNewTitle("");
      setSelectedProgram(null);
      navigate(`/marketing/summary-generator/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.marketing.deleteSummary.useMutation({
    onSuccess: () => { toast.success("Deleted"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const handleCreate = () => {
    if (!selectedProgram) return;
    const title = newTitle.trim() || `${selectedProgram.country} — ${selectedProgram.programType}`;
    createMutation.mutate({
      title,
      country: selectedProgram.country,
      programType: selectedProgram.programType,
      programSubtype: selectedProgram.programSubtype,
    });
  };

  const handleOpen = () => {
    setNewTitle("");
    setSelectedProgram(null);
    setActiveTab("residency");
    setShowCreate(true);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <MarketingSummaryTabs />
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Summary Generator</h1>
          <p className="text-gray-400 text-sm mt-1">Create branded program summary documents with country photos and rich text</p>
        </div>
        <Button onClick={handleOpen} className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
          <Plus className="w-4 h-4" /> New Summary
        </Button>
      </div>

      {/* Summaries Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="bg-[#1a2235] rounded-xl h-40 animate-pulse" />)}
        </div>
      ) : !summaries?.length ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <FileText className="w-16 h-16 text-gray-600 mb-4" />
          <h2 className="text-xl font-semibold text-gray-300 mb-2">No summaries yet</h2>
          <p className="text-gray-500 mb-6">Create your first program summary document</p>
          <Button onClick={handleOpen} className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
            <Plus className="w-4 h-4" /> Create Summary
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {summaries.map((s) => (
            <div
              key={s.id}
              className="bg-[#1a2235] border border-white/10 rounded-xl p-5 flex flex-col gap-3 hover:border-teal-500/40 transition-all cursor-pointer group"
              onClick={() => navigate(`/marketing/summary-generator/${s.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-teal-900/50 flex items-center justify-center text-xl">
                  {FLAG[s.country] ?? "🌍"}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/marketing/summary-generator/${s.id}`); }}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm("Delete this summary?")) deleteMutation.mutate({ id: s.id }); }}
                    className="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-400 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm leading-tight mb-1">{s.title}</h3>
                <div className="flex items-center gap-1 text-xs text-teal-400">
                  <Globe className="w-3 h-3" />
                  {s.country} — {s.programType}
                </div>
                <div className="mt-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    s.programSubtype === "CITIZENSHIP"
                      ? "bg-amber-900/40 text-amber-300"
                      : "bg-teal-900/40 text-teal-300"
                  }`}>
                    {s.programSubtype}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-auto">
                <Clock className="w-3 h-3" />
                {new Date(s.updatedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-[#1a2235] border-white/10 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-lg">Create New Summary</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Optional custom title */}
            <div>
              <Label className="text-gray-300 mb-1.5 block text-sm">Document Title <span className="text-gray-500">(optional — auto-generated if empty)</span></Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={selectedProgram ? `${selectedProgram.country} — ${selectedProgram.programType}` : "e.g. Spain DNV Summary — June 2026"}
                className="bg-[#0f1623] border-white/10 text-white placeholder:text-gray-600"
              />
            </div>

            {/* Program tabs */}
            <div>
              <Label className="text-gray-300 mb-2 block text-sm">Select Program</Label>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setActiveTab("residency")}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === "residency"
                      ? "bg-teal-600 text-white"
                      : "bg-white/5 text-gray-400 hover:bg-white/10"
                  }`}
                >
                  🏠 Residency Programs (14)
                </button>
                <button
                  onClick={() => setActiveTab("citizenship")}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === "citizenship"
                      ? "bg-amber-600 text-white"
                      : "bg-white/5 text-gray-400 hover:bg-white/10"
                  }`}
                >
                  🌟 Citizenship Programs (10)
                </button>
              </div>

              {/* Residency list */}
              {activeTab === "residency" && (
                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                  {RESIDENCY_PROGRAMS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedProgram(p)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                        selectedProgram?.country === p.country && selectedProgram?.programType === p.programType
                          ? "bg-teal-600/30 border border-teal-500/50 text-white"
                          : "bg-white/5 border border-transparent hover:bg-white/10 text-gray-300"
                      }`}
                    >
                      <span className="text-xl w-8 text-center">{FLAG[p.country] ?? "🌍"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{p.country}</div>
                        <div className="text-xs text-gray-500">{p.programType}</div>
                      </div>
                      <span className="text-[10px] bg-teal-900/40 text-teal-300 px-2 py-0.5 rounded-full shrink-0">
                        #{i + 1}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Citizenship list */}
              {activeTab === "citizenship" && (
                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                  {CITIZENSHIP_PROGRAMS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedProgram(p)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                        selectedProgram?.country === p.country
                          ? "bg-amber-600/30 border border-amber-500/50 text-white"
                          : "bg-white/5 border border-transparent hover:bg-white/10 text-gray-300"
                      }`}
                    >
                      <span className="text-xl w-8 text-center">{FLAG[p.country] ?? "🌍"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{p.country}</div>
                        <div className="text-xs text-gray-500">{p.programType}</div>
                      </div>
                      <span className="text-[10px] bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded-full shrink-0">
                        #{i + 1}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected summary */}
            {selectedProgram && (
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
                <span className="text-2xl">{FLAG[selectedProgram.country] ?? "🌍"}</span>
                <div>
                  <div className="text-sm font-semibold text-white">{selectedProgram.country}</div>
                  <div className="text-xs text-gray-400">{selectedProgram.programType}</div>
                </div>
                <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  selectedProgram.programSubtype === "CITIZENSHIP"
                    ? "bg-amber-900/40 text-amber-300"
                    : "bg-teal-900/40 text-teal-300"
                }`}>
                  {selectedProgram.programSubtype}
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="border-white/10 text-gray-300">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!selectedProgram || createMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {createMutation.isPending ? "Creating..." : "Create Summary"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
