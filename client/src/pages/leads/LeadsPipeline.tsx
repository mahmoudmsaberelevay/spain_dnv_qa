import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Phone, Mail, User, MoreVertical } from "lucide-react";

const PIPELINE_STAGES = [
  { value: "fresh", label: "Fresh", color: "border-t-blue-500", headerBg: "bg-blue-50 dark:bg-blue-950/30", badge: "bg-blue-100 text-blue-700" },
  { value: "contacted", label: "Contacted", color: "border-t-amber-500", headerBg: "bg-amber-50 dark:bg-amber-950/30", badge: "bg-amber-100 text-amber-700" },
  { value: "qualified", label: "Qualified", color: "border-t-purple-500", headerBg: "bg-purple-50 dark:bg-purple-950/30", badge: "bg-purple-100 text-purple-700" },
  { value: "prospect", label: "Prospect", color: "border-t-cyan-500", headerBg: "bg-cyan-50 dark:bg-cyan-950/30", badge: "bg-cyan-100 text-cyan-700" },
  { value: "client", label: "Client", color: "border-t-emerald-500", headerBg: "bg-emerald-50 dark:bg-emerald-950/30", badge: "bg-emerald-100 text-emerald-700" },
  { value: "dormant", label: "Dormant", color: "border-t-gray-400", headerBg: "bg-gray-50 dark:bg-gray-900/30", badge: "bg-gray-100 text-gray-600" },
];

const NOT_QUALIFIED_STAGES = [
  { value: "not_qualified_budget", label: "NQ - Budget" },
  { value: "not_qualified_work", label: "NQ - Work" },
  { value: "not_qualified_study", label: "NQ - Study" },
  { value: "not_qualified_criminal", label: "NQ - Criminal" },
  { value: "not_qualified_other", label: "NQ - Other" },
];

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-gray-400",
};

export default function LeadsPipeline() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const dragLeadRef = useRef<{ id: number; fromStage: string } | null>(null);

  // Fetch all leads for the board (no pagination — board needs all stages visible at once)
  // Use a large page size to get all leads in one request
  const { data: leadsData, isLoading } = trpc.leads.list.useQuery({ page: 1, pageSize: 5000 });
  const allLeads = leadsData?.leads ?? [];

  const changeStage = trpc.leads.changeStage.useMutation({
    onSuccess: () => {
      utils.leads.list.invalidate();
      utils.leads.analytics.overview.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const leadsByStage = PIPELINE_STAGES.reduce((acc, s) => {
    acc[s.value] = allLeads.filter(l => l.stage === s.value);
    return acc;
  }, {} as Record<string, typeof allLeads>);

  function handleDragStart(e: React.DragEvent, leadId: number, fromStage: string) {
    setDraggingId(leadId);
    dragLeadRef.current = { id: leadId, fromStage };
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, stage: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  }

  function handleDrop(e: React.DragEvent, toStage: string) {
    e.preventDefault();
    const ref = dragLeadRef.current;
    if (!ref || ref.fromStage === toStage) {
      setDraggingId(null);
      setDragOverStage(null);
      dragLeadRef.current = null;
      return;
    }
    changeStage.mutate({ id: ref.id, stage: toStage as any });
    setDraggingId(null);
    setDragOverStage(null);
    dragLeadRef.current = null;
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverStage(null);
    dragLeadRef.current = null;
  }

  if (isLoading) {
    return <div className="text-center py-20 text-muted-foreground">Loading pipeline…</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pipeline</h1>
        <p className="text-muted-foreground text-sm mt-1">Drag and drop leads between stages</p>
      </div>

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {PIPELINE_STAGES.map(stage => {
            const stageLeads = leadsByStage[stage.value] ?? [];
            const isOver = dragOverStage === stage.value;
            return (
              <div
                key={stage.value}
                className={`w-64 flex flex-col rounded-lg border border-t-4 ${stage.color} bg-card transition-all ${isOver ? "ring-2 ring-primary ring-offset-1" : ""}`}
                onDragOver={e => handleDragOver(e, stage.value)}
                onDrop={e => handleDrop(e, stage.value)}
                onDragLeave={() => setDragOverStage(null)}
              >
                {/* Column Header */}
                <div className={`px-3 py-2.5 rounded-t-md ${stage.headerBg} flex items-center justify-between`}>
                  <span className="font-semibold text-sm text-foreground">{stage.label}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${stage.badge}`}>
                    {stageLeads.length}
                  </span>
                </div>

                {/* Cards */}
                <div className={`flex-1 p-2 space-y-2 min-h-32 transition-colors ${isOver ? "bg-muted/30" : ""}`}>
                  {stageLeads.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-6 opacity-50">
                      Drop leads here
                    </div>
                  )}
                  {stageLeads.map(lead => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={e => handleDragStart(e, lead.id, stage.value)}
                      onDragEnd={handleDragEnd}
                      onClick={() => navigate(`/leads/${lead.id}`)}
                      className={`bg-background border rounded-md p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all text-sm select-none ${draggingId === lead.id ? "opacity-40 scale-95" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="font-medium text-foreground leading-tight">{lead.fullName}</div>
                        {lead.priority && (
                          <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${PRIORITY_DOT[lead.priority] ?? "bg-gray-400"}`} title={`${lead.priority} priority`} />
                        )}
                      </div>
                      {lead.interestedProgram && (
                        <div className="text-xs text-muted-foreground mt-1">{lead.interestedProgram}</div>
                      )}
                      <div className="mt-2 flex flex-col gap-0.5">
                        {lead.phone && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="w-3 h-3" />{lead.phone}
                          </div>
                        )}
                        {lead.email && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="w-3 h-3" />{lead.email}
                          </div>
                        )}
                      </div>
                      {(lead.assignedTo || lead.leadSource) && (
                        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground border-t pt-1.5">
                          {lead.assignedTo && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />{lead.assignedTo.split(" ")[0]}
                            </span>
                          )}
                          {lead.leadSource && <span className="truncate max-w-20">{lead.leadSource}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Not Qualified Column (collapsed summary) */}
          <div className="w-64 flex flex-col rounded-lg border border-t-4 border-t-red-400 bg-card">
            <div className="px-3 py-2.5 rounded-t-md bg-red-50 dark:bg-red-950/30 flex items-center justify-between">
              <span className="font-semibold text-sm text-foreground">Not Qualified</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                {allLeads.filter(l => l.stage.startsWith("not_qualified")).length}
              </span>
            </div>
            <div
              className={`flex-1 p-2 space-y-2 min-h-32 transition-colors ${dragOverStage?.startsWith("not_qualified") ? "bg-muted/30" : ""}`}
              onDragOver={e => handleDragOver(e, "not_qualified_other")}
              onDrop={e => handleDrop(e, "not_qualified_other")}
              onDragLeave={() => setDragOverStage(null)}
            >
              {NOT_QUALIFIED_STAGES.map(nq => {
                const nqLeads = allLeads.filter(l => l.stage === nq.value);
                if (nqLeads.length === 0) return null;
                return (
                  <div key={nq.value}
                    className={`transition-colors ${dragOverStage === nq.value ? "bg-muted/30 rounded" : ""}`}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverStage(nq.value); }}
                    onDrop={e => { e.stopPropagation(); handleDrop(e, nq.value); }}
                  >
                    <div className="text-xs font-medium text-muted-foreground px-1 mb-1">{nq.label}</div>
                    {nqLeads.map(lead => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={e => handleDragStart(e, lead.id, lead.stage)}
                        onDragEnd={handleDragEnd}
                        onClick={() => navigate(`/leads/${lead.id}`)}
                        className={`bg-background border rounded-md p-2.5 cursor-grab active:cursor-grabbing hover:shadow-md transition-all text-sm select-none mb-1.5 ${draggingId === lead.id ? "opacity-40 scale-95" : ""}`}
                      >
                        <div className="font-medium text-foreground text-xs leading-tight">{lead.fullName}</div>
                        {lead.phone && <div className="text-xs text-muted-foreground mt-0.5">{lead.phone}</div>}
                      </div>
                    ))}
                  </div>
                );
              })}
              {allLeads.filter(l => l.stage.startsWith("not_qualified")).length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-6 opacity-50">No disqualified leads</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
