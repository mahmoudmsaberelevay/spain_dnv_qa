import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Plus, FileText, Trash2, Edit3, Clock, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const PROGRAMS = [
  { country: "Spain", type: "DIGITAL NOMAD VISA", subtype: "RESIDENCY" },
  { country: "Portugal", type: "D7 VISA", subtype: "RESIDENCY" },
  { country: "Portugal", type: "D8 VISA", subtype: "RESIDENCY" },
  { country: "Portugal", type: "D2 VISA", subtype: "RESIDENCY" },
  { country: "Greece", type: "GOLDEN VISA", subtype: "RESIDENCY" },
  { country: "Malta", type: "PERMANENT RESIDENCY", subtype: "RESIDENCY" },
  { country: "UK", type: "EXPANSION WORKER", subtype: "RESIDENCY" },
  { country: "Canada", type: "SKILLED MIGRATION", subtype: "RESIDENCY" },
  { country: "Caribbean", type: "CITIZENSHIP BY INVESTMENT", subtype: "CITIZENSHIP" },
  { country: "Custom", type: "CUSTOM PROGRAM", subtype: "CUSTOM" },
];

export default function SummaryGenerator() {
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedProgram, setSelectedProgram] = useState("");

  const { data: summaries, isLoading, refetch } = trpc.marketing.listSummaries.useQuery();
  const createMutation = trpc.marketing.createSummary.useMutation({
    onSuccess: (data) => {
      toast.success("Summary created");
      setShowCreate(false);
      setNewTitle("");
      setSelectedProgram("");
      navigate(`/marketing/summary-generator/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.marketing.deleteSummary.useMutation({
    onSuccess: () => { toast.success("Deleted"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const handleCreate = () => {
    if (!newTitle.trim() || !selectedProgram) return;
    const prog = PROGRAMS[parseInt(selectedProgram)];
    createMutation.mutate({
      title: newTitle.trim(),
      country: prog.country,
      programType: prog.type,
      programSubtype: prog.subtype,
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Summary Generator</h1>
          <p className="text-gray-400 text-sm mt-1">Create and manage branded program summary documents</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
          <Plus className="w-4 h-4" /> New Summary
        </Button>
      </div>

      {/* Summaries Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-[#1a2235] rounded-xl h-40 animate-pulse" />
          ))}
        </div>
      ) : !summaries?.length ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <FileText className="w-16 h-16 text-gray-600 mb-4" />
          <h2 className="text-xl font-semibold text-gray-300 mb-2">No summaries yet</h2>
          <p className="text-gray-500 mb-6">Create your first program summary document</p>
          <Button onClick={() => setShowCreate(true)} className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
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
                <div className="w-10 h-10 rounded-lg bg-teal-900/50 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-teal-400" />
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
        <DialogContent className="bg-[#1a2235] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Summary</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-gray-300 mb-1.5 block">Document Title</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Spain DNV Summary — June 2026"
                className="bg-[#0f1623] border-white/10 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-300 mb-1.5 block">Program</Label>
              <Select value={selectedProgram} onValueChange={setSelectedProgram}>
                <SelectTrigger className="bg-[#0f1623] border-white/10 text-white">
                  <SelectValue placeholder="Select a program..." />
                </SelectTrigger>
                <SelectContent className="bg-[#1a2235] border-white/10">
                  {PROGRAMS.map((p, i) => (
                    <SelectItem key={i} value={String(i)} className="text-white hover:bg-white/10">
                      {p.country} — {p.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="border-white/10 text-gray-300">Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!newTitle.trim() || !selectedProgram || createMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
