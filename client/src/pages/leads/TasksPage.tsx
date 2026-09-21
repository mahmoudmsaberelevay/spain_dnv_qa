import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  ListChecks,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Search,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  classifyLeadTaskLifecycle,
  type LeadTaskLifecycle,
  type LeadTaskLifecycleCounts,
} from "../../../../shared/leadTaskLifecycle";

const TEAM = [
  "Mahmoud", "Fouad", "Kirolos", "Ziad", "Madonna",
  "Monica", "Marina", "Nouran", "Hager", "Eman", "Marwa", "Basmala",
];

const TASK_TYPES = ["call", "whatsapp", "email", "meeting", "document_request", "other"] as const;
const MAX_SELECTED_LEADS = 300;

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

const LIFECYCLE_OPTIONS: Array<{
  value: LeadTaskLifecycle;
  label: string;
  description: string;
  icon: React.ReactNode;
  activeClass: string;
}> = [
  {
    value: "all",
    label: "All Tasks",
    description: "Every lifecycle status",
    icon: <ListChecks className="w-4 h-4" />,
    activeClass: "border-slate-700 bg-slate-900 text-white",
  },
  {
    value: "completed",
    label: "Completed",
    description: "Marked as done",
    icon: <CheckCircle2 className="w-4 h-4" />,
    activeClass: "border-emerald-600 bg-emerald-600 text-white",
  },
  {
    value: "pending",
    label: "Pending",
    description: "Due today",
    icon: <Clock className="w-4 h-4" />,
    activeClass: "border-amber-500 bg-amber-500 text-white",
  },
  {
    value: "coming",
    label: "Coming",
    description: "Due after today",
    icon: <Calendar className="w-4 h-4" />,
    activeClass: "border-blue-600 bg-blue-600 text-white",
  },
  {
    value: "overdue",
    label: "Overdue",
    description: "Past due and open",
    icon: <AlertTriangle className="w-4 h-4" />,
    activeClass: "border-red-600 bg-red-600 text-white",
  },
];

const EMPTY_COUNTS: LeadTaskLifecycleCounts = {
  all: 0,
  completed: 0,
  pending: 0,
  coming: 0,
  overdue: 0,
};

function taskTypeLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

type Task = {
  id: number;
  leadId: number;
  assignedTo: string | null;
  taskType: string;
  dueDate: number;
  completed: boolean | null;
  completedAt: number | null;
  notes: string | null;
  createdAt: number;
  leadName: string;
  leadStage: string;
  leadPhone: string | null;
};

function TaskCard({
  task,
  onComplete,
  isCompleting,
}: {
  task: Task;
  onComplete: (id: number, leadId: number) => void;
  isCompleting: boolean;
}) {
  const typeColor = TASK_TYPE_COLORS[task.taskType] ?? "bg-gray-100 text-gray-600 border-gray-200";
  const stageColor = STAGE_COLORS[task.leadStage] ?? "bg-gray-100 text-gray-600";
  const leadUrl = `/leads/${task.leadId}`;
  const lifecycle = classifyLeadTaskLifecycle({
    completed: Boolean(task.completed),
    dueDate: Number(task.dueDate),
  });
  const lifecycleMeta = LIFECYCLE_OPTIONS.find(option => option.value === lifecycle)!;

  return (
    <div className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {task.completed ? (
          <span
            className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
            title="Completed"
          >
            <CheckSquare className="h-4 w-4" />
          </span>
        ) : (
          <button
            onClick={() => onComplete(task.id, task.leadId)}
            disabled={isCompleting}
            className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border-2 border-muted-foreground/40 transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-50"
            title="Mark as completed"
            aria-label={`Mark ${taskTypeLabel(task.taskType)} task for ${task.leadName} as completed`}
          >
            <CheckSquare className="h-3.5 w-3.5 text-transparent transition-colors hover:text-emerald-500" />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${typeColor}`}>
              {TASK_TYPE_ICONS[task.taskType]}
              {taskTypeLabel(task.taskType)}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${stageColor}`}>
              {task.leadStage}
            </span>
            <Badge variant="outline" className="text-xs">
              {lifecycleMeta.label}
            </Badge>
            {task.assignedTo && (
              <span className="text-xs text-muted-foreground">→ {task.assignedTo}</span>
            )}
          </div>

          <a
            href={leadUrl}
            onClick={(event) => {
              if (!event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                window.location.href = leadUrl;
              }
            }}
            className="mt-2 block truncate text-sm font-semibold text-foreground hover:text-primary hover:underline"
          >
            {task.leadName}
            <span className="ml-1 text-xs font-normal text-muted-foreground">Lead #{task.leadId}</span>
            <ExternalLink className="ml-1 inline h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
          </a>

          {task.notes && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.notes}</p>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center justify-between gap-4 border-t border-border pt-3 text-left sm:block sm:border-0 sm:pt-0 sm:text-right">
        <div>
          <p className="text-xs text-muted-foreground">Due</p>
          <p className="text-xs font-medium text-foreground">{formatDate(Number(task.dueDate))}</p>
        </div>
        {task.completed && task.completedAt ? (
          <div className="sm:mt-2">
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-xs font-medium text-emerald-700">{formatDate(Number(task.completedAt))}</p>
          </div>
        ) : task.leadPhone ? (
          <p className="text-xs text-muted-foreground sm:mt-2">{task.leadPhone}</p>
        ) : null}
      </div>
    </div>
  );
}

export default function TasksPage() {
  const utils = trpc.useUtils();
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [taskTypeFilter, setTaskTypeFilter] = useState("all");
  const [lifecycleFilter, setLifecycleFilter] = useState<LeadTaskLifecycle>("all");
  const [leadScope, setLeadScope] = useState<"all" | "selected">("all");
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());
  const [leadSearch, setLeadSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  const debouncedTaskSearch = useDebouncedValue(taskSearch, 300);
  const selectedLeadIdList = useMemo(
    () => Array.from(selectedLeadIds).sort((a, b) => a - b),
    [selectedLeadIds],
  );

  const { data: filterOptions, isLoading: areOptionsLoading } = trpc.leads.getTaskFilterOptions.useQuery();
  const leadOptions = filterOptions?.leads ?? [];
  const taskTypeCounts = useMemo(
    () => new Map((filterOptions?.taskTypes ?? []).map(option => [option.taskType, option.taskCount])),
    [filterOptions?.taskTypes],
  );

  const filteredLeadOptions = useMemo(() => {
    const search = leadSearch.trim().toLowerCase();
    const matching = search
      ? leadOptions.filter(lead =>
          lead.fullName.toLowerCase().includes(search) || String(lead.id).includes(search),
        )
      : leadOptions;
    return matching.slice(0, 150);
  }, [leadOptions, leadSearch]);

  const selectedLeadNames = useMemo(() => {
    const names = new Map(leadOptions.map(lead => [lead.id, lead.fullName]));
    return selectedLeadIdList.map(id => ({ id, name: names.get(id) ?? `Lead #${id}` }));
  }, [leadOptions, selectedLeadIdList]);

  const queryInput = useMemo(() => ({
    assignedTo: ownerFilter !== "all" ? ownerFilter : undefined,
    taskType: taskTypeFilter !== "all"
      ? taskTypeFilter as typeof TASK_TYPES[number]
      : undefined,
    search: debouncedTaskSearch.trim() || undefined,
    leadIds: leadScope === "selected" ? selectedLeadIdList : undefined,
    lifecycle: lifecycleFilter,
    page,
    pageSize,
  }), [
    ownerFilter,
    taskTypeFilter,
    debouncedTaskSearch,
    leadScope,
    selectedLeadIdList,
    lifecycleFilter,
    page,
    pageSize,
  ]);

  const { data, isLoading, isFetching } = trpc.leads.getAllTasks.useQuery(queryInput, {
    refetchOnMount: true,
  });

  const tasks = data?.tasks ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const lifecycleCounts = data?.lifecycleCounts ?? EMPTY_COUNTS;

  const filterSignature = JSON.stringify({
    ownerFilter,
    taskTypeFilter,
    debouncedTaskSearch,
    leadScope,
    selectedLeadIdList,
    lifecycleFilter,
  });
  useEffect(() => {
    setPage(1);
  }, [filterSignature]);

  const completeTask = trpc.leads.tasks.complete.useMutation({
    onSuccess: () => {
      utils.leads.getAllTasks.invalidate();
      toast.success("Task marked as completed");
    },
    onError: error => toast.error(error.message),
  });

  function toggleLead(leadId: number) {
    setSelectedLeadIds(current => {
      const next = new Set(current);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else if (next.size >= MAX_SELECTED_LEADS) {
        toast.error(`You can select up to ${MAX_SELECTED_LEADS} Leads. Use All Leads for the complete database.`);
      } else {
        next.add(leadId);
      }
      return next;
    });
  }

  function clearFilters() {
    setOwnerFilter("all");
    setTaskTypeFilter("all");
    setLifecycleFilter("all");
    setLeadScope("all");
    setSelectedLeadIds(new Set());
    setLeadSearch("");
    setTaskSearch("");
    setPage(1);
  }

  const hasActiveFilters = ownerFilter !== "all"
    || taskTypeFilter !== "all"
    || lifecycleFilter !== "all"
    || leadScope !== "all"
    || taskSearch.trim().length > 0;

  const activeLifecycle = LIFECYCLE_OPTIONS.find(option => option.value === lifecycleFilter)!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Filter a specific task across all leads or only the leads you select.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {LIFECYCLE_OPTIONS.map(option => {
          const isActive = lifecycleFilter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setLifecycleFilter(option.value)}
              aria-pressed={isActive}
              className={`rounded-xl border p-3 text-left transition-colors ${
                isActive
                  ? option.activeClass
                  : "border-border bg-card text-foreground hover:bg-accent/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {option.icon}
                  {option.label}
                </span>
                <span className={`text-lg font-bold ${isFetching ? "opacity-60" : ""}`}>
                  {lifecycleCounts[option.value]}
                </span>
              </div>
              <p className={`mt-1 text-xs ${isActive ? "text-white/80" : "text-muted-foreground"}`}>
                {option.description}
              </p>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={taskSearch}
              onChange={event => setTaskSearch(event.target.value)}
              placeholder="Search task notes or lead…"
              aria-label="Search task notes or lead"
              className="pl-9"
            />
          </div>

          <Select value={taskTypeFilter} onValueChange={setTaskTypeFilter}>
            <SelectTrigger aria-label="Task type filter">
              <SelectValue placeholder="All Task Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Task Types</SelectItem>
              {TASK_TYPES.map(taskType => (
                <SelectItem key={taskType} value={taskType}>
                  {taskTypeLabel(taskType)} ({taskTypeCounts.get(taskType) ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={leadScope}
            onValueChange={value => setLeadScope(value as "all" | "selected")}
          >
            <SelectTrigger aria-label="Lead scope filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leads</SelectItem>
              <SelectItem value="selected">Selected Leads</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={leadScope !== "selected"}
                className="justify-between font-normal"
              >
                <span className="truncate">
                  {selectedLeadIds.size === 0
                    ? "Choose Leads"
                    : `${selectedLeadIds.size} Lead${selectedLeadIds.size === 1 ? "" : "s"} Selected`}
                </span>
                <Users className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(92vw,24rem)] p-0">
              <div className="border-b p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={leadSearch}
                    onChange={event => setLeadSearch(event.target.value)}
                    placeholder="Search lead name or ID…"
                    aria-label="Search leads for task filter"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto p-2">
                {areOptionsLoading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Loading leads…</p>
                ) : filteredLeadOptions.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No leads found</p>
                ) : (
                  filteredLeadOptions.map(lead => (
                    <label
                      key={lead.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent"
                    >
                      <Checkbox
                        checked={selectedLeadIds.has(lead.id)}
                        onCheckedChange={() => toggleLead(lead.id)}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{lead.fullName}</span>
                      <span className="text-xs text-muted-foreground">#{lead.id}</span>
                    </label>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between gap-2 border-t p-3">
                <span className="text-xs text-muted-foreground">
                  {leadSearch.trim() || leadOptions.length <= 150
                    ? `${filteredLeadOptions.length} shown`
                    : "First 150 shown — search for more"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedLeadIds(new Set())}
                  disabled={selectedLeadIds.size === 0}
                >
                  Clear selected
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger aria-label="Task owner filter">
              <SelectValue placeholder="All Owners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              {TEAM.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{activeLifecycle.label}</span>
            <span>·</span>
            <span>{total} matching task{total === 1 ? "" : "s"}</span>
            {leadScope === "selected" && (
              <>
                <span>·</span>
                <span>{selectedLeadIds.size} selected lead{selectedLeadIds.size === 1 ? "" : "s"}</span>
              </>
            )}
            {isFetching && <span className="text-primary">Refreshing…</span>}
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={value => setPageSize(Number(value))}>
              <SelectTrigger className="w-28" aria-label="Tasks per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50 per page</SelectItem>
                <SelectItem value="100">100 per page</SelectItem>
                <SelectItem value="200">200 per page</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-1 h-4 w-4" />
                Clear Filters
              </Button>
            )}
          </div>
        </div>

        {leadScope === "selected" && selectedLeadNames.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedLeadNames.slice(0, 12).map(lead => (
              <Badge key={lead.id} variant="secondary" className="gap-1 pr-1">
                <span className="max-w-44 truncate">{lead.name} #{lead.id}</span>
                <button
                  type="button"
                  onClick={() => toggleLead(lead.id)}
                  className="rounded-sm p-0.5 hover:bg-muted"
                  aria-label={`Remove ${lead.name} from selected leads`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {selectedLeadNames.length > 12 && (
              <Badge variant="outline">+{selectedLeadNames.length - 12} more</Badge>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-muted-foreground">Loading tasks…</div>
      ) : leadScope === "selected" && selectedLeadIds.size === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Users className="mx-auto h-9 w-9 text-muted-foreground" />
          <h2 className="mt-3 font-semibold text-foreground">Choose one or more leads</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Open Choose Leads to limit the task view to specific leads.
          </p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <CheckSquare className="mx-auto h-9 w-9 text-muted-foreground" />
          <h2 className="mt-3 font-semibold text-foreground">No matching tasks</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Change the task, lead, owner, search, or lifecycle filters to see more results.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={(id, leadId) => completeTask.mutate({ id, leadId })}
              isCompleting={completeTask.isPending && completeTask.variables?.id === task.id}
            />
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {total} task{total === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage(current => Math.max(1, current - 1))}
              disabled={page <= 1 || isFetching}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage(current => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages || isFetching}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
