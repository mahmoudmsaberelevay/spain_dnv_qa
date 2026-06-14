import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  CheckSquare, Clock, AlertTriangle, Calendar, ChevronDown, ChevronRight,
  Phone, MessageCircle, Mail, Users, FileText, MoreHorizontal, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const TEAM = [
  "Mahmoud Saber", "Fouad Abdo", "Kirolos", "Ziad El Shurafa", "Madonna Adel",
  "Monica Sobhy", "Marina Kamel", "Nouran Mamdouh", "Hager Hany", "Eman Ahmed", "Marwa Abdallah", "Basmala Shereef",
];

const TASK_TYPE_ICONS: Record<string, React.ReactNode> = {
  call: <Phone className="w-3.5 h-3.5" />,
  whatsapp: <MessageCircle className="w-3.5 h-3.5" />,
  email: <Mail className="w-3.5 h-3.5" />,
  meeting: <Users className="w-3.5 h-3.5" />,
  document_request: <FileText className="w-3.5 h-3.5" />,
  other: <MoreHorizontal className="w-3.5 h-3.5" />,
};

const TASK_TYPE_COLORS: Record<string, string> = {
  call: "bg-green-100 text-green-700 border-green-200",
  whatsapp: "bg-emerald-100 text-emerald-700 border-emerald-200",
  email: "bg-blue-100 text-blue-700 border-blue-200",
  meeting: "bg-purple-100 text-purple-700 border-purple-200",
  document_request: "bg-amber-100 text-amber-700 border-amber-200",
  other: "bg-gray-100 text-gray-600 border-gray-200",
};

const STAGE_COLORS: Record<string, string> = {
  fresh: "bg-blue-100 text-blue-700",
  contacted: "bg-amber-100 text-amber-700",
  qualified: "bg-purple-100 text-purple-700",
  prospect: "bg-cyan-100 text-cyan-700",
  client: "bg-emerald-100 text-emerald-700",
  dormant: "bg-gray-100 text-gray-600",
};

function formatDueDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function getStartOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getEndOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

type Task = {
  id: number;
  leadId: number;
  assignedTo: string | null;
  taskType: string;
  dueDate: number;
  completed: boolean;
  completedAt: number | null;
  notes: string | null;
  createdAt: number;
  leadName: string;
  leadStage: string;
  leadPhone: string | null;
};

function TaskCard({ task, onComplete }: { task: Task; onComplete: (id: number, leadId: number) => void }) {
  const typeColor = TASK_TYPE_COLORS[task.taskType] ?? "bg-gray-100 text-gray-600 border-gray-200";
  const stageColor = STAGE_COLORS[task.leadStage] ?? "bg-gray-100 text-gray-600";
  const leadUrl = `/leads/${task.leadId}`;

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors group">
      {/* Complete button */}
      <button
        onClick={() => onComplete(task.id, task.leadId)}
        className="mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 border-muted-foreground/40 hover:border-emerald-500 hover:bg-emerald-50 transition-colors flex items-center justify-center"
        title="Mark as done"
      >
        <CheckSquare className="w-3 h-3 text-transparent group-hover:text-emerald-500 transition-colors" />
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Task type badge */}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${typeColor}`}>
            {TASK_TYPE_ICONS[task.taskType]}
            {task.taskType.replace("_", " ")}
          </span>
          {/* Lead stage */}
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stageColor}`}>
            {task.leadStage}
          </span>
          {/* Assigned to */}
          {task.assignedTo && (
            <span className="text-xs text-muted-foreground">
              → {task.assignedTo}
            </span>
          )}
        </div>

        {/* Lead name — clickable */}
        <a
          href={leadUrl}
          onClick={(e) => {
            if (!e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              window.location.href = leadUrl;
            }
          }}
          className="mt-1 block font-medium text-sm text-foreground hover:text-primary hover:underline truncate"
        >
          {task.leadName}
          <ExternalLink className="inline w-3 h-3 ml-1 opacity-0 group-hover:opacity-60 transition-opacity" />
        </a>

        {/* Notes */}
        {task.notes && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{task.notes}</p>
        )}
      </div>

      {/* Due date */}
      <div className="flex-shrink-0 text-right">
        <p className="text-xs font-medium text-muted-foreground">{formatDueDate(task.dueDate)}</p>
        {task.leadPhone && (
          <p className="text-xs text-muted-foreground mt-0.5">{task.leadPhone}</p>
        )}
      </div>
    </div>
  );
}

function Section({
  title, icon, tasks, color, defaultOpen = true, onComplete,
}: {
  title: string;
  icon: React.ReactNode;
  tasks: Task[];
  color: string;
  defaultOpen?: boolean;
  onComplete: (id: number, leadId: number) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Section header */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-3 ${color} hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold text-sm">{title}</span>
          <Badge variant="secondary" className="text-xs px-2 py-0">{tasks.length}</Badge>
        </div>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {/* Task list */}
      {open && (
        <div className="p-3 space-y-2 bg-background">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No tasks in this section</p>
          ) : (
            tasks.map(task => (
              <TaskCard key={task.id} task={task} onComplete={onComplete} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function TasksPage() {
  const [ownerFilter, setOwnerFilter] = useState("all");
  const utils = trpc.useUtils();

  const queryInput = ownerFilter !== "all" ? { createdBy: ownerFilter } : { createdBy: undefined };
  const { data: tasks = [], isLoading } = trpc.leads.getAllTasks.useQuery(
    queryInput,
    { refetchOnMount: true },
  );

  const completeTask = trpc.leads.tasks.complete.useMutation({
    onSuccess: () => {
      utils.leads.getAllTasks.invalidate();
      toast.success("Task marked as done");
    },
    onError: (e) => toast.error(e.message),
  });

   const { overdue, dueToday, future } = useMemo(() => {
    const todayStart = getStartOfDay(new Date());
    const todayEnd = getEndOfDay(new Date());
    const overdue: Task[] = [];
    const dueToday: Task[] = [];
    const future: Task[] = [];
    for (const t of tasks) {
      const due = Number(t.dueDate);
      if (due < todayStart) overdue.push(t);
      else if (due <= todayEnd) dueToday.push(t);
      else future.push(t);
    }
    return { overdue, dueToday, future };
  }, [tasks]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All pending tasks across all leads
          </p>
        </div>

        {/* Owner filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter by owner:</span>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All owners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              {TEAM.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground">Loading tasks…</div>
      ) : (
        <div className="space-y-4">
          <Section
            title="Overdue"
            icon={<AlertTriangle className="w-4 h-4 text-red-600" />}
            tasks={overdue}
            color="bg-red-50 text-red-800 border-b border-red-200"
            defaultOpen={true}
            onComplete={(id, leadId) => completeTask.mutate({ id, leadId })}
          />
          <Section
            title="Due Today"
            icon={<Clock className="w-4 h-4 text-amber-600" />}
            tasks={dueToday}
            color="bg-amber-50 text-amber-800 border-b border-amber-200"
            defaultOpen={true}
            onComplete={(id, leadId) => completeTask.mutate({ id, leadId })}
          />
          <Section
            title="Upcoming"
            icon={<Calendar className="w-4 h-4 text-blue-600" />}
            tasks={future}
            color="bg-blue-50 text-blue-800 border-b border-blue-200"
            defaultOpen={true}
            onComplete={(id, leadId) => completeTask.mutate({ id, leadId })}
          />
        </div>
      )}
    </div>
  );
}
