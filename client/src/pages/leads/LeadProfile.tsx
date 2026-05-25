import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Plus, Edit2, PhoneCall, Send, MessageCircle, Zap, ChevronDown,
  ChevronRight, Shield,
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
const TEAM = ["Mahmoud", "Fouad", "Kirolos", "Ziad", "Madonna", "Monica", "Marina", "Nouran"];

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  created: <Plus className="w-3.5 h-3.5" />,
  assigned: <User className="w-3.5 h-3.5" />,
  note_added: <MessageSquare className="w-3.5 h-3.5" />,
  whatsapp_sent: <MessageCircle className="w-3.5 h-3.5" />,
  email_sent: <Mail className="w-3.5 h-3.5" />,
  call_made: <PhoneCall className="w-3.5 h-3.5" />,
  call: <PhoneCall className="w-3.5 h-3.5" />,
  whatsapp: <MessageCircle className="w-3.5 h-3.5" />,
  sms: <MessageSquare className="w-3.5 h-3.5" />,
  email: <Mail className="w-3.5 h-3.5" />,
  stage_changed: <Flag className="w-3.5 h-3.5" />,
  stage_change: <Flag className="w-3.5 h-3.5" />,
  task_created: <CheckSquare className="w-3.5 h-3.5" />,
  task_completed: <CheckSquare className="w-3.5 h-3.5" />,
  status_updated: <Edit2 className="w-3.5 h-3.5" />,
  meeting_scheduled: <Calendar className="w-3.5 h-3.5" />,
  meeting: <Calendar className="w-3.5 h-3.5" />,
};

const ACTIVITY_COLORS: Record<string, string> = {
  call_made: "bg-green-100 text-green-700",
  call: "bg-green-100 text-green-700",
  whatsapp_sent: "bg-emerald-100 text-emerald-700",
  whatsapp: "bg-emerald-100 text-emerald-700",
  email_sent: "bg-blue-100 text-blue-700",
  email: "bg-blue-100 text-blue-700",
  sms: "bg-sky-100 text-sky-700",
  meeting_scheduled: "bg-purple-100 text-purple-700",
  meeting: "bg-purple-100 text-purple-700",
  stage_changed: "bg-amber-100 text-amber-700",
  stage_change: "bg-amber-100 text-amber-700",
  note_added: "bg-gray-100 text-gray-600",
};

function getStageMeta(stage: string) {
  return STAGES.find(s => s.value === stage) ?? { label: stage, color: "bg-gray-100 text-gray-600 border-gray-200" };
}

function ScoreBadge({ score }: { score: number }) {
  if (!score) return null;
  const positive = score > 0;
  return (
    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${positive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
      {positive ? "+" : ""}{score}
    </span>
  );
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
  const { data: presets = [] } = trpc.leadsSettings.listActivityPresets.useQuery();

  const [newNote, setNewNote] = useState("");
  const [noteImportant, setNoteImportant] = useState(false);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [taskForm, setTaskForm] = useState({ taskType: "call" as typeof TASK_TYPES[number], dueDate: "", notes: "", assignedTo: "" });

  // Preset activity
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [presetNote, setPresetNote] = useState("");
  const [showPresetDialog, setShowPresetDialog] = useState(false);

  // Owner change dialog
  const [showOwnerDialog, setShowOwnerDialog] = useState(false);
  const [newOwner, setNewOwner] = useState("");

  const assignLead = trpc.leads.assign.useMutation({
    onSuccess: () => {
      utils.leads.get.invalidate({ id: leadId });
      utils.leads.activities.list.invalidate({ leadId });
      setShowOwnerDialog(false);
      toast.success("Owner updated");
    },
    onError: (e) => toast.error(e.message),
  });

  // Email dialog
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  // Activity expand
  const [expandedActivity, setExpandedActivity] = useState<number | null>(null);

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

  const logPresetActivity = trpc.leads.logPresetActivity.useMutation({
    onSuccess: (data) => {
      utils.leads.activities.list.invalidate({ leadId });
      utils.leads.get.invalidate({ id: leadId });
      setShowPresetDialog(false);
      setPresetNote("");
      setSelectedPreset(null);
      toast.success(`Activity logged! Lead score: ${data.newScore}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const sendEmail = trpc.leads.sendEmail.useMutation({
    onSuccess: () => {
      utils.leads.activities.list.invalidate({ leadId });
      utils.leads.get.invalidate({ id: leadId });
      setShowEmailDialog(false);
      setEmailSubject("");
      setEmailBody("");
      toast.success("Email sent successfully!");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">Loading lead…</div>;
  if (!lead) return <div className="text-center py-20 text-muted-foreground">Lead not found.</div>;

  const stageMeta = getStageMeta(lead.stage);
  const activePresets = presets.filter(p => p.isActive);

  // WhatsApp number: prefer whatsapp field, fallback to phone
  const waNumber = (lead.whatsapp || lead.phone || "").replace(/\D/g, "");
  const waUrl = waNumber ? `https://wa.me/${waNumber}` : null;

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
            {/* Lead Score */}
            {lead.leadScore !== undefined && lead.leadScore !== null && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-yellow-50 text-yellow-700 border-yellow-200">
                <Star className="w-3 h-3" /> Score: {lead.leadScore}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Lead #{lead.id} · Created {new Date(lead.createdAt).toLocaleDateString()}
            {lead.assignedTo && ` · Assigned to ${lead.assignedTo}`}
          </p>
        </div>
        {/* Stage Change + Owner Change */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1.5"
            onClick={() => { setNewOwner(lead.assignedTo ?? ""); setShowOwnerDialog(true); }}
          >
            <User className="w-4 h-4" />
            {lead.assignedTo ? lead.assignedTo : "Assign Owner"}
          </Button>
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
              {lead.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a href={`tel:${lead.phone}`} className="hover:text-primary transition-colors">{lead.phone}</a>
                </div>
              )}
              {lead.whatsapp && (
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>{lead.whatsapp}</span>
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a href={`mailto:${lead.email}`} className="hover:text-primary transition-colors truncate">{lead.email}</a>
                </div>
              )}
              {lead.nationality && <div className="flex items-center gap-2"><Globe className="w-4 h-4 text-muted-foreground" />{lead.nationality}</div>}
              {lead.countryOfResidence && <div className="flex items-center gap-2"><Globe className="w-4 h-4 text-muted-foreground" />Resides in {lead.countryOfResidence}</div>}
              {lead.preferredLanguage && <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-muted-foreground" />Speaks {lead.preferredLanguage}</div>}

              {/* Quick Contact Buttons */}
              <div className="pt-2 flex flex-wrap gap-2">
                {waUrl && (
                  <a href={waUrl} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline" className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50">
                      <MessageCircle className="w-3.5 h-3.5" />
                      WhatsApp
                    </Button>
                  </a>
                )}
                {lead.email && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50" onClick={() => setShowEmailDialog(true)}>
                    <Mail className="w-3.5 h-3.5" />
                    Send Email
                  </Button>
                )}
                {lead.phone && (
                  <a href={`tel:${lead.phone}`}>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Phone className="w-3.5 h-3.5" />
                      Call
                    </Button>
                  </a>
                )}
              </div>
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
              {lead.leadScore !== undefined && lead.leadScore !== null && <InfoRow label="Lead Score" value={String(lead.leadScore)} />}
            </CardContent>
          </Card>

          {/* GDPR & Consent */}
          {(lead.gdprConsent || lead.dataSharingConsent || lead.marketingOptIn || lead.optOutSignal) && (
            <Card className="border-emerald-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  GDPR & Consent
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <InfoRow label="GDPR Consent" value={lead.gdprConsent ? "✓ Given" : "Not given"} />
                <InfoRow label="Data Sharing" value={lead.dataSharingConsent ? "✓ Agreed" : "Not agreed"} />
                <InfoRow label="Marketing Opt-in" value={lead.marketingOptIn ? "✓ Opted in" : "Not opted in"} />
                {lead.optOutSignal && <InfoRow label="Opt-out Signal" value="⚠ Opt-out received" highlight />}
                {lead.dataRegion && <InfoRow label="Data Region" value={lead.dataRegion} />}
              </CardContent>
            </Card>
          )}

          {/* Quick Activity Log — Preset Buttons */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Zap className="w-3.5 h-3.5" />
                Log Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {activePresets.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {activePresets.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => { setSelectedPreset(preset.id); setShowPresetDialog(true); }}
                      className="flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted/50 transition-colors text-left"
                    >
                      <span className="font-medium text-foreground">{preset.label}</span>
                      <ScoreBadge score={preset.score} />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No activity presets configured. Add them in LEADS Settings → Activity Presets.</p>
              )}
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
                          <span className="whitespace-pre-wrap">{note.note}</span>
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
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {activities.map(act => {
                    const iconColor = ACTIVITY_COLORS[act.activityType] ?? "bg-gray-100 text-gray-600";
                    const isExpanded = expandedActivity === act.id;
                    // Show full description — split on ": " to show label vs body
                    const [actLabel, ...bodyParts] = act.description.split(": ");
                    const actBody = bodyParts.join(": ");
                    return (
                      <div key={act.id} className="flex items-start gap-3 text-sm">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${iconColor}`}>
                          {ACTIVITY_ICONS[act.activityType] ?? <Clock className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-foreground font-medium leading-snug">{actLabel}</p>
                              {actBody && (
                                <button
                                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-0.5 transition-colors"
                                  onClick={() => setExpandedActivity(isExpanded ? null : act.id)}
                                >
                                  {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                  {isExpanded ? "Hide details" : "Show details"}
                                </button>
                              )}
                              {isExpanded && actBody && (
                                <div className="mt-1.5 text-sm text-foreground bg-muted/50 rounded p-2 whitespace-pre-wrap border border-border">
                                  {actBody}
                                </div>
                              )}
                            </div>
                            {/* Score badge if present */}
                            {(act as any).score ? <ScoreBadge score={(act as any).score} /> : null}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{new Date(act.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                    );
                  })}
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

      {/* Preset Activity Dialog */}
      <Dialog open={showPresetDialog} onOpenChange={v => { setShowPresetDialog(v); if (!v) { setPresetNote(""); setSelectedPreset(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {selectedPreset ? presets.find(p => p.id === selectedPreset)?.label ?? "Log Activity" : "Log Activity"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedPreset && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                <Zap className="w-4 h-4 shrink-0" />
                <span>This will add <ScoreBadge score={presets.find(p => p.id === selectedPreset)?.score ?? 0} /> to the lead score.</span>
              </div>
            )}
            <div className="space-y-2">
              <Label>Note <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                value={presetNote}
                onChange={e => setPresetNote(e.target.value)}
                placeholder="Add details about this activity…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPresetDialog(false); setPresetNote(""); setSelectedPreset(null); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (!selectedPreset) return;
                logPresetActivity.mutate({ leadId, presetId: selectedPreset, note: presetNote || undefined });
              }}
              disabled={logPresetActivity.isPending || !selectedPreset}
            >
              {logPresetActivity.isPending ? "Logging…" : "Log Activity"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Send Email to {lead.fullName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
              To: <span className="font-medium text-foreground">{lead.email}</span>
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="e.g. Your Spain DNV Application Update" />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={emailBody}
                onChange={e => setEmailBody(e.target.value)}
                placeholder="Write your message here…"
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!emailSubject.trim()) { toast.error("Subject is required."); return; }
                if (!emailBody.trim()) { toast.error("Message body is required."); return; }
                sendEmail.mutate({ leadId, subject: emailSubject.trim(), body: emailBody.trim() });
              }}
              disabled={sendEmail.isPending}
              className="gap-2"
            >
              <Send className="w-4 h-4" />
              {sendEmail.isPending ? "Sending…" : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Owner Dialog */}
      <Dialog open={showOwnerDialog} onOpenChange={setShowOwnerDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-4 h-4" /> Change Lead Owner
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <Label>Select new owner</Label>
            <Select value={newOwner} onValueChange={setNewOwner}>
              <SelectTrigger>
                <SelectValue placeholder="Select team member" />
              </SelectTrigger>
              <SelectContent>
                {TEAM.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOwnerDialog(false)}>Cancel</Button>
            <Button
              disabled={!newOwner || assignLead.isPending}
              onClick={() => assignLead.mutate({ id: leadId, assignedTo: newOwner, origin: window.location.origin })}
            >
              {assignLead.isPending ? "Saving…" : "Save"}
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
