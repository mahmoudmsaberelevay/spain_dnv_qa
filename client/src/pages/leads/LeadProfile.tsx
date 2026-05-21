import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, Phone, Mail, Globe, User, Calendar, Flag, Star,
  MessageSquare, CheckSquare, Clock, Pin, AlertCircle, Trash2,
  Plus, Edit2, PhoneCall, Send,
} from "lucide-react";

const STAGES = [
  { value: "fresh", label: "Fresh", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "contacted", label: "Contacted", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "qualified", label: "Qualified", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "prospect", label: "Prospect", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  { value: "client", label: "Client", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "dormant", label: "Dormant", color: "bg-gray-100 text-gray-600 border-gray-200" },
  { value: "not_qualified_budget", label: "NQ - Budget", color: "bg-red-100 text-red-700 border-red-200" },
  { value: "not_qualified_work", label: "NQ - Work", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "not_qualified_study", label: "NQ - Study", color: "bg-pink-100 text-pink-700 border-pink-200" },
  { value: "not_qualified_criminal", label: "NQ - Criminal", color: "bg-red-200 text-red-800 border-red-300" },
  { value: "not_qualified_other", label: "NQ - Other", color: "bg-gray-200 text-gray-700 border-gray-300" },
] as const;

const TASK_TYPES = ["call", "whatsapp", "email", "meeting", "document_request", "other"] as const;
const TEAM = ["Mahmoud Saber", "Fouad", "Kirolos", "Ziad El Shurafa", "Madonna Adel"];

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  created: <Plus className="w-3.5 h-3.5" />,
  assigned: <User className="w-3.5 h-3.5" />,
  note_added: <MessageSquare className="w-3.5 h-3.5" />,
  whatsapp_sent: <Send className="w-3.5 h-3.5" />,
  email_sent: <Mail className="w-3.5 h-3.5" />,
  call_made: <PhoneCall className="w-3.5 h-3.5" />,
  stage_changed: <Flag className="w-3.5 h-3.5" />,
  task_created: <CheckSquare className="w-3.5 h-3.5" />,
  task_completed: <CheckSquare className="w-3.5 h-3.5" />,
  status_updated: <Edit2 className="w-3.5 h-3.5" />,
};

function getStageMeta(stage: string) {
  return STAGES.find(s => s.value === stage) ?? { label: stage, color: "bg-gray-100 text-gray-600 border-gray-200" };
}

export default function LeadProfile() {
  const { id } = useParams<{ id: string }>();
  const leadId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: lead, isLoading } = trpc.leads.get.useQuery({ id: leadId });
  const { data: activities = [] } = trpc.leads.activities.list.useQuery({ leadId });
  const { data: notes = [] } = trpc.leads.notes.list.useQuery({ leadId });
  const { data: tasks = [] } = trpc.leads.tasks.list.useQuery({ leadId });

  const [newNote, setNewNote] = useState("");
  const [noteImportant, setNoteImportant] = useState(false);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [taskForm, setTaskForm] = useState({ taskType: "call" as typeof TASK_TYPES[number], dueDate: "", notes: "", assignedTo: "" });

  const changeStage = trpc.leads.changeStage.useMutation({
    onSuccess: () => { utils.leads.get.invalidate({ id: leadId }); utils.leads.activities.list.invalidate({ leadId }); },
  });

  const addNote = trpc.leads.notes.add.useMutation({
    onSuccess: () => { utils.leads.notes.list.invalidate({ leadId }); utils.leads.activities.list.invalidate({ leadId }); setNewNote(""); setNoteImportant(false); },
    onError: (e) => toast.error(e.message),
  });

  const deleteNote = trpc.leads.notes.delete.useMutation({
    onSuccess: () => utils.leads.notes.list.invalidate({ leadId }),
    onError: (e) => toast.error(e.message),
  });

  const pinNote = trpc.leads.notes.pin.useMutation({
    onSuccess: () => utils.leads.notes.list.invalidate({ leadId }),
  });

  const createTask = trpc.leads.tasks.create.useMutation({
    onSuccess: () => { utils.leads.tasks.list.invalidate({ leadId }); utils.leads.activities.list.invalidate({ leadId }); setShowTaskDialog(false); setTaskForm({ taskType: "call", dueDate: "", notes: "", assignedTo: "" }); toast.success("Task created"); },
    onError: (e) => toast.error(e.message),
  });

  const completeTask = trpc.leads.tasks.complete.useMutation({
    onSuccess: () => { utils.leads.tasks.list.invalidate({ leadId }); utils.leads.activities.list.invalidate({ leadId }); },
  });

  const deleteTask = trpc.leads.tasks.delete.useMutation({
    onSuccess: () => utils.leads.tasks.list.invalidate({ leadId }),
  });

  const addActivity = trpc.leads.activities.add.useMutation({
    onSuccess: () => utils.leads.activities.list.invalidate({ leadId }),
  });

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">Loading lead…</div>;
  if (!lead) return <div className="text-center py-20 text-muted-foreground">Lead not found.</div>;

  const stageMeta = getStageMeta(lead.stage);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/leads")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">{lead.fullName}</h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${stageMeta.color}`}>
              {stageMeta.label}
            </span>
            {lead.priority && (
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${lead.priority === "high" ? "bg-red-100 text-red-700 border-red-200" : lead.priority === "medium" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-gray-100 text-gray-600 border-gray-200"}`}>
                {lead.priority} priority
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Lead #{lead.id} · Created {new Date(lead.createdAt).toLocaleDateString()}
            {lead.assignedTo && ` · Assigned to ${lead.assignedTo}`}
          </p>
        </div>
        {/* Stage Change */}
        <div className="flex items-center gap-2">
          <Select value={lead.stage} onValueChange={v => changeStage.mutate({ id: leadId, stage: v as any })}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Details */}
        <div className="lg:col-span-1 space-y-4">
          {/* Contact Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {lead.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" />{lead.phone}</div>}
              {lead.whatsapp && <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-muted-foreground" />{lead.whatsapp}</div>}
              {lead.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" />{lead.email}</div>}
              {lead.nationality && <div className="flex items-center gap-2"><Globe className="w-4 h-4 text-muted-foreground" />{lead.nationality}</div>}
              {lead.countryOfResidence && <div className="flex items-center gap-2"><Globe className="w-4 h-4 text-muted-foreground" />Resides in {lead.countryOfResidence}</div>}
              {lead.preferredLanguage && <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-muted-foreground" />Speaks {lead.preferredLanguage}</div>}
            </CardContent>
          </Card>

          {/* Immigration Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Immigration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {lead.interestedProgram && <InfoRow label="Program" value={lead.interestedProgram} />}
              {lead.interestedCountry && <InfoRow label="Country" value={lead.interestedCountry} />}
              {lead.budgetRange && <InfoRow label="Budget" value={lead.budgetRange} />}
              {lead.netWorth && <InfoRow label="Net Worth" value={lead.netWorth} />}
              {lead.occupation && <InfoRow label="Occupation" value={lead.occupation} />}
              {lead.monthlyIncome && <InfoRow label="Monthly Income" value={lead.monthlyIncome} />}
              {lead.educationLevel && <InfoRow label="Education" value={lead.educationLevel} />}
              {lead.sourceOfFunds && <InfoRow label="Source of Funds" value={lead.sourceOfFunds} />}
              {lead.passportStatus && <InfoRow label="Passport" value={lead.passportStatus} />}
              {lead.visaRefusals && <InfoRow label="Visa Refusals" value="Yes" highlight />}
              {lead.criminalRecord && <InfoRow label="Criminal Record" value="Yes" highlight />}
              {lead.familyMembers && lead.familyMembers > 1 && <InfoRow label="Family Members" value={String(lead.familyMembers)} />}
            </CardContent>
          </Card>

          {/* Tracking */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Tracking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {lead.leadSource && <InfoRow label="Source" value={lead.leadSource} />}
              {lead.metaCampaign && <InfoRow label="Campaign" value={lead.metaCampaign} />}
              {lead.metaAdset && <InfoRow label="Ad Set" value={lead.metaAdset} />}
              {lead.metaAd && <InfoRow label="Ad" value={lead.metaAd} />}
              {lead.assignedTo && <InfoRow label="Assigned To" value={lead.assignedTo} />}
              {lead.lastContactAt && <InfoRow label="Last Contact" value={new Date(lead.lastContactAt).toLocaleDateString()} />}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Log Activity</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(["call_made", "whatsapp_sent", "email_sent", "meeting_scheduled"] as const).map(type => (
                <Button
                  key={type}
                  variant="outline"
                  size="sm"
                  onClick={() => addActivity.mutate({ leadId, activityType: type, description: `${type.replace(/_/g, " ")} logged` })}
                >
                  {type === "call_made" ? "📞 Call" : type === "whatsapp_sent" ? "💬 WhatsApp" : type === "email_sent" ? "📧 Email" : "📅 Meeting"}
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right: Notes, Tasks, Activity */}
        <div className="lg:col-span-2 space-y-5">
          {/* Notes */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Notes</CardTitle>
              <span className="text-xs text-muted-foreground">{notes.length} note{notes.length !== 1 ? "s" : ""}</span>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Add note */}
              <div className="space-y-2">
                <textarea
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="Add a note…"
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={noteImportant} onChange={e => setNoteImportant(e.target.checked)} className="rounded" />
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> Mark as important
                  </label>
                  <Button size="sm" onClick={() => { if (newNote.trim()) addNote.mutate({ leadId, note: newNote.trim(), isImportant: noteImportant }); }} disabled={!newNote.trim() || addNote.isPending}>
                    Add Note
                  </Button>
                </div>
              </div>
              {/* Notes list */}
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No notes yet</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {notes.map(note => (
                    <div key={note.id} className={`rounded-lg p-3 text-sm border ${note.isImportant ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20" : "bg-muted/30 border-border"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          {note.isPinned && <Pin className="w-3 h-3 text-blue-500 inline mr-1" />}
                          {note.isImportant && <AlertCircle className="w-3 h-3 text-amber-500 inline mr-1" />}
                          <span>{note.note}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => pinNote.mutate({ id: note.id, isPinned: !note.isPinned })} className="text-muted-foreground hover:text-blue-500 transition-colors">
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteNote.mutate({ id: note.id })} className="text-muted-foreground hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {note.userName ?? "You"} · {new Date(note.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tasks */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Tasks & Follow-ups</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowTaskDialog(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Task
              </Button>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No tasks yet</p>
              ) : (
                <div className="space-y-2">
                  {tasks.map(task => (
                    <div key={task.id} className={`flex items-center gap-3 p-3 rounded-lg border text-sm ${task.completed ? "opacity-50 bg-muted/20" : "bg-background"}`}>
                      <button
                        onClick={() => !task.completed && completeTask.mutate({ id: task.id, leadId })}
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${task.completed ? "bg-emerald-500 border-emerald-500" : "border-muted-foreground hover:border-emerald-500"}`}
                      >
                        {task.completed && <CheckSquare className="w-3 h-3 text-white" />}
                      </button>
                      <div className="flex-1">
                        <span className="font-medium capitalize">{task.taskType.replace(/_/g, " ")}</span>
                        {task.notes && <span className="text-muted-foreground ml-2">— {task.notes}</span>}
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Due {new Date(task.dueDate).toLocaleDateString()}
                          {task.assignedTo && ` · ${task.assignedTo}`}
                        </div>
                      </div>
                      <button onClick={() => deleteTask.mutate({ id: task.id })} className="text-muted-foreground hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {activities.map(act => (
                    <div key={act.id} className="flex items-start gap-3 text-sm">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-muted-foreground mt-0.5">
                        {ACTIVITY_ICONS[act.activityType] ?? <Clock className="w-3.5 h-3.5" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-foreground">{act.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{new Date(act.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Task Dialog */}
      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Task Type</Label>
              <Select value={taskForm.taskType} onValueChange={v => setTaskForm(f => ({ ...f, taskType: v as any }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={taskForm.dueDate} onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Assign To</Label>
              <Select value={taskForm.assignedTo} onValueChange={v => setTaskForm(f => ({ ...f, assignedTo: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {TEAM.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={taskForm.notes} onChange={e => setTaskForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional details…" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTaskDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!taskForm.dueDate) { toast.error("Due date is required."); return; }
                createTask.mutate({ leadId, taskType: taskForm.taskType, dueDate: new Date(taskForm.dueDate).getTime(), assignedTo: taskForm.assignedTo || undefined, notes: taskForm.notes || undefined });
              }}
              disabled={createTask.isPending}
            >
              {createTask.isPending ? "Creating…" : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right font-medium ${highlight ? "text-red-600" : "text-foreground"}`}>{value}</span>
    </div>
  );
}
