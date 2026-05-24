import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Search, Phone, Mail, User, Calendar, Download,
  Filter, X, Trash2, CheckSquare, Square, MinusSquare, RefreshCw, LayoutList,
  ChevronLeft, ChevronRight, Tag, UserCheck,
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
];

const PROGRAMS = [
  "Spain DNV", "Portugal D7", "Portugal D8", "Portugal D2",
  "Greece Golden Visa", "Malta Permanent Residency", "UK Expansion Worker",
  "Canada Skilled Migration", "Caribbean Citizenship",
];

const SOURCES = [
  "Meta Ads", "Google Ads", "Referral", "Website", "WhatsApp", "Walk-in",
  "Instagram", "LinkedIn", "TikTok", "YouTube", "Email Campaign", "Other",
];

const TEAM = [
  "Mahmoud Saber", "Fouad", "Kirolos", "Ziad El Shurafa", "Madonna Adel",
];

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

function getStageMeta(stage: string) {
  return STAGES.find(s => s.value === stage) ?? { label: stage, color: "bg-gray-100 text-gray-600 border-gray-200" };
}

/** Debounce a value by `delay` ms */
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function LeadsList() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [stageFilter, setStageFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [programFilter, setProgramFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [metaFormFilter, setMetaFormFilter] = useState("all");
  const [showHistoricalSyncConfirm, setShowHistoricalSyncConfirm] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [lastActivityFrom, setLastActivityFrom] = useState("");
  const [lastActivityTo, setLastActivityTo] = useState("");

  // ── Pagination ────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;

  // Reset to page 1 whenever filters change
  const prevFiltersRef = useRef<string>("");

  // ── Bulk selection state ──────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showBulkStageDialog, setShowBulkStageDialog] = useState(false);
  const [showBulkOwnerDialog, setShowBulkOwnerDialog] = useState(false);
  const [bulkStageValue, setBulkStageValue] = useState("");
  const [bulkOwnerValue, setBulkOwnerValue] = useState("");

  // ── Dynamic settings ──────────────────────────────────────────────────────
  const { data: dynamicPrograms = [] } = trpc.leadsSettings.listPrograms.useQuery();
  const { data: dynamicSources = [] } = trpc.leadsSettings.listSources.useQuery();

  const allPrograms = useMemo(() => {
    const fromSettings = dynamicPrograms.filter(p => p.isActive).map(p => p.name);
    return [...new Set([...PROGRAMS, ...fromSettings])];
  }, [dynamicPrograms]);

  const allSources = useMemo(() => {
    const fromSettings = dynamicSources.filter(s => s.isActive).map(s => s.name);
    return [...new Set([...SOURCES, ...fromSettings])];
  }, [dynamicSources]);

  // ── Create form ───────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    fullName: "", phone: "", whatsapp: "", email: "",
    nationality: "", interestedProgram: "", leadSource: "",
    assignedTo: "", priority: "medium" as "low" | "medium" | "high",
    notes: "", budgetRange: "",
  });

  // ── Meta forms for filter dropdown ────────────────────────────────────────
  const { data: metaFormsData } = trpc.leadsSettings.listMetaForms.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const metaForms = metaFormsData?.forms ?? [];

  // ── Build query filters ───────────────────────────────────────────────────
  const filters = useMemo(() => ({
    search: debouncedSearch || undefined,
    stage: stageFilter !== "all" ? stageFilter : undefined,
    leadSource: sourceFilter !== "all" ? sourceFilter : undefined,
    interestedProgram: programFilter !== "all" ? programFilter : undefined,
    assignedTo: assignedFilter !== "all" ? assignedFilter : undefined,
    metaFormId: metaFormFilter !== "all" ? metaFormFilter : undefined,
    dateFrom: createdFrom ? new Date(createdFrom).getTime() : undefined,
    dateTo: createdTo ? new Date(createdTo + "T23:59:59").getTime() : undefined,
    lastActivityFrom: lastActivityFrom ? new Date(lastActivityFrom).getTime() : undefined,
    lastActivityTo: lastActivityTo ? new Date(lastActivityTo + "T23:59:59").getTime() : undefined,
    page,
    pageSize: PAGE_SIZE,
  }), [debouncedSearch, stageFilter, sourceFilter, programFilter, assignedFilter, metaFormFilter,
    createdFrom, createdTo, lastActivityFrom, lastActivityTo, page]);

  // Reset page when non-page filters change
  useEffect(() => {
    const key = JSON.stringify({ debouncedSearch, stageFilter, sourceFilter, programFilter, assignedFilter, metaFormFilter, createdFrom, createdTo, lastActivityFrom, lastActivityTo });
    if (prevFiltersRef.current && prevFiltersRef.current !== key) {
      setPage(1);
      setSelectedIds(new Set());
    }
    prevFiltersRef.current = key;
  }, [debouncedSearch, stageFilter, sourceFilter, programFilter, assignedFilter, metaFormFilter, createdFrom, createdTo, lastActivityFrom, lastActivityTo]);

  const hasActiveFilters = stageFilter !== "all" || sourceFilter !== "all" || programFilter !== "all" || assignedFilter !== "all" || metaFormFilter !== "all" || createdFrom || createdTo || lastActivityFrom || lastActivityTo;

  function clearAllFilters() {
    setStageFilter("all"); setSourceFilter("all"); setProgramFilter("all"); setAssignedFilter("all");
    setMetaFormFilter("all");
    setCreatedFrom(""); setCreatedTo(""); setLastActivityFrom(""); setLastActivityTo("");
  }

  // ── Data query ────────────────────────────────────────────────────────────
  const { data: leadsData, isLoading } = trpc.leads.list.useQuery(filters);
  const leads = leadsData?.leads ?? [];
  const total = leadsData?.total ?? 0;
  const totalPages = leadsData?.totalPages ?? 1;

  // ── Mutations ─────────────────────────────────────────────────────────────
  const historicalSync = trpc.leads.historicalSync.useMutation({
    onSuccess: (data) => {
      utils.leads.list.invalidate();
      utils.leads.analytics.overview.invalidate();
      setShowHistoricalSyncConfirm(false);
      toast.success(
        `Historical sync complete — ${data.totalNew} new lead${data.totalNew !== 1 ? "s" : ""} added, ${data.totalSkipped} duplicate${data.totalSkipped !== 1 ? "s" : ""} skipped.`
      );
    },
    onError: (err) => {
      setShowHistoricalSyncConfirm(false);
      toast.error(`Sync failed: ${err.message}`);
    },
  });

  const bulkDelete = trpc.leads.bulkDelete.useMutation({
    onSuccess: (data) => {
      utils.leads.list.invalidate();
      utils.leads.analytics.overview.invalidate();
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
      toast.success(`${data.deleted} lead${data.deleted !== 1 ? "s" : ""} deleted.`);
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkExport = trpc.leads.bulkExport.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `elevay-leads-selected-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${data.count} lead${data.count !== 1 ? "s" : ""} exported.`);
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkUpdateStage = trpc.leads.bulkUpdateStage.useMutation({
    onSuccess: (data) => {
      utils.leads.list.invalidate();
      utils.leads.analytics.overview.invalidate();
      setSelectedIds(new Set());
      setShowBulkStageDialog(false);
      setBulkStageValue("");
      toast.success(`${data.updated} lead${data.updated !== 1 ? "s" : ""} moved to ${getStageMeta(bulkStageValue).label}.`);
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkUpdateOwner = trpc.leads.bulkUpdateOwner.useMutation({
    onSuccess: (data) => {
      utils.leads.list.invalidate();
      setSelectedIds(new Set());
      setShowBulkOwnerDialog(false);
      setBulkOwnerValue("");
      const ownerLabel = bulkOwnerValue === "__unassign__" ? "Unassigned" : bulkOwnerValue;
      toast.success(`${data.updated} lead${data.updated !== 1 ? "s" : ""} assigned to ${ownerLabel}.`);
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const allSelected = leads.length > 0 && leads.every(l => selectedIds.has(l.id));
  const someSelected = leads.some(l => selectedIds.has(l.id)) && !allSelected;

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        leads.forEach(l => next.delete(l.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        leads.forEach(l => next.add(l.id));
        return next;
      });
    }
  }, [allSelected, leads]);

  // ── Create lead ───────────────────────────────────────────────────────────
  const createLead = trpc.leads.create.useMutation({
    onSuccess: () => {
      utils.leads.list.invalidate();
      utils.leads.analytics.overview.invalidate();
      setShowCreate(false);
      setForm({ fullName: "", phone: "", whatsapp: "", email: "", nationality: "", interestedProgram: "", leadSource: "", assignedTo: "", priority: "medium", notes: "", budgetRange: "" });
      toast.success("Lead created — new lead added to pipeline.");
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.error(`Duplicate detected: ${err.message}`);
      } else {
        toast.error(err.message);
      }
    },
  });

  function handleCreate() {
    if (!form.fullName.trim()) {
      toast.error("Full name is required.");
      return;
    }
    createLead.mutate(form);
  }

  function exportAllCSV() {
    const headers = ["ID", "Name", "Phone", "WhatsApp", "Email", "Nationality", "Program", "Source", "Stage", "Priority", "Assigned To", "Created"];
    const rows = leads.map(l => [
      l.id, l.fullName, l.phone ?? "", l.whatsapp ?? "", l.email ?? "",
      l.nationality ?? "", l.interestedProgram ?? "", l.leadSource ?? "",
      l.stage, l.priority ?? "", l.assignedTo ?? "",
      new Date(l.createdAt).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `elevay-leads-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {total} lead{total !== 1 ? "s" : ""} total
            {selectedCount > 0 && (
              <span className="ml-2 text-blue-600 font-medium">· {selectedCount} selected</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {selectedCount > 0 && (
            <>
              {/* Bulk Stage Change */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setBulkStageValue(""); setShowBulkStageDialog(true); }}
                className="gap-1.5"
              >
                <Tag className="w-4 h-4" />
                Change Stage ({selectedCount})
              </Button>
              {/* Bulk Owner Change */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setBulkOwnerValue(""); setShowBulkOwnerDialog(true); }}
                className="gap-1.5"
              >
                <UserCheck className="w-4 h-4" />
                Assign Owner ({selectedCount})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => bulkExport.mutate({ ids: Array.from(selectedIds) })}
                disabled={bulkExport.isPending}
              >
                <Download className="w-4 h-4 mr-1" />
                {bulkExport.isPending ? "Exporting…" : `Export ${selectedCount}`}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 hover:bg-red-50"
                onClick={() => setShowBulkDeleteConfirm(true)}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete {selectedCount}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setSelectedIds(new Set())}
              >
                <X className="w-4 h-4 mr-1" /> Clear
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistoricalSyncConfirm(true)}
            disabled={historicalSync.isPending}
            title="Fetch all leads from Meta forms starting April 1, 2026"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${historicalSync.isPending ? "animate-spin" : ""}`} />
            {historicalSync.isPending ? "Syncing…" : "Lead Sync"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportAllCSV}>
            <Download className="w-4 h-4 mr-1" /> Export Page
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> New Lead
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Stage" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={programFilter} onValueChange={setProgramFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Program" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Programs</SelectItem>
              {allPrograms.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {allSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={assignedFilter} onValueChange={setAssignedFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Assigned To" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Team</SelectItem>
              {TEAM.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant={showAdvancedFilters ? "default" : "outline"}
            size="sm"
            onClick={() => setShowAdvancedFilters(v => !v)}
            className="gap-1.5"
          >
            <Filter className="w-3.5 h-3.5" />
            Date Filters
            {(createdFrom || createdTo || lastActivityFrom || lastActivityTo) && (
              <span className="w-2 h-2 rounded-full bg-primary-foreground" />
            )}
          </Button>
          {metaForms.length > 0 && (
            <Select value={metaFormFilter} onValueChange={setMetaFormFilter}>
              <SelectTrigger className="w-48">
                <LayoutList className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="All Forms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Meta Forms</SelectItem>
                {metaForms.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="gap-1.5 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" /> Clear All
            </Button>
          )}
        </div>

        {/* Advanced Date Filters */}
        {showAdvancedFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-muted/30 rounded-lg border border-border">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Created From</Label>
              <Input type="date" value={createdFrom} onChange={e => setCreatedFrom(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Created To</Label>
              <Input type="date" value={createdTo} onChange={e => setCreatedTo(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Last Activity From</Label>
              <Input type="date" value={lastActivityFrom} onChange={e => setLastActivityFrom(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Last Activity To</Label>
              <Input type="date" value={lastActivityTo} onChange={e => setLastActivityTo(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 opacity-40" />
          Loading leads…
        </div>
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <UsersIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No leads found</p>
            <p className="text-sm mt-1">Try adjusting your filters or create a new lead.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 w-10">
                  <button
                    onClick={toggleSelectAll}
                    className="text-muted-foreground hover:text-foreground transition-colors flex items-center"
                    title={allSelected ? "Deselect all on page" : "Select all on page"}
                  >
                    {allSelected
                      ? <CheckSquare className="w-4 h-4 text-blue-600" />
                      : someSelected
                        ? <MinusSquare className="w-4 h-4 text-blue-500" />
                        : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Program</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Source</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Stage</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Priority</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Assigned</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leads.map(lead => {
                const stage = getStageMeta(lead.stage);
                const isSelected = selectedIds.has(lead.id);
                return (
                  <tr
                    key={lead.id}
                    className={`hover:bg-muted/30 transition-colors ${isSelected ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}
                  >
                    <td className="px-4 py-3 w-10" onClick={e => toggleSelect(lead.id, e)}>
                      <button className="text-muted-foreground hover:text-foreground transition-colors flex items-center">
                        {isSelected
                          ? <CheckSquare className="w-4 h-4 text-blue-600" />
                          : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                      <div className="font-medium text-foreground">{lead.fullName}</div>
                      {lead.nationality && <div className="text-xs text-muted-foreground">{lead.nationality}</div>}
                    </td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                      <div className="flex flex-col gap-0.5">
                        {lead.phone && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{lead.phone}</span>}
                        {lead.email && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{lead.email}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>{lead.interestedProgram ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>{lead.leadSource ?? "—"}</td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${stage.color}`}>
                        {stage.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                      {lead.priority && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${PRIORITY_COLORS[lead.priority] ?? ""}`}>
                          {lead.priority}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {lead.assignedTo ?? "Unassigned"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {total} leads total
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </Button>
            <span className="text-sm font-medium px-2">{page}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Historical Sync Confirmation Dialog */}
      <Dialog open={showHistoricalSyncConfirm} onOpenChange={setShowHistoricalSyncConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Lead Sync from April 1, 2026</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will fetch all leads from every connected Meta form starting from <strong>April 1, 2026</strong> and add any new leads to the system. Duplicates (matched by phone or email) will be skipped automatically.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistoricalSyncConfirm(false)}>Cancel</Button>
            <Button
              onClick={() => historicalSync.mutate({})}
              disabled={historicalSync.isPending}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${historicalSync.isPending ? "animate-spin" : ""}`} />
              {historicalSync.isPending ? "Syncing…" : "Start Sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {selectedCount} Lead{selectedCount !== 1 ? "s" : ""}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will permanently delete {selectedCount} lead{selectedCount !== 1 ? "s" : ""} and all their activities, notes, and documents. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDeleteConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => bulkDelete.mutate({ ids: Array.from(selectedIds) })}
              disabled={bulkDelete.isPending}
            >
              {bulkDelete.isPending ? "Deleting…" : `Delete ${selectedCount} Lead${selectedCount !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Stage Change Dialog */}
      <Dialog open={showBulkStageDialog} onOpenChange={setShowBulkStageDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Stage for {selectedCount} Lead{selectedCount !== 1 ? "s" : ""}</DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-2">
            <Label>New Stage</Label>
            <Select value={bulkStageValue} onValueChange={setBulkStageValue}>
              <SelectTrigger>
                <SelectValue placeholder="Select a stage…" />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map(s => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border mr-2 ${s.color}`}>{s.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkStageDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!bulkStageValue) { toast.error("Please select a stage."); return; }
                bulkUpdateStage.mutate({ ids: Array.from(selectedIds), stage: bulkStageValue as any });
              }}
              disabled={bulkUpdateStage.isPending || !bulkStageValue}
            >
              {bulkUpdateStage.isPending ? "Updating…" : `Update ${selectedCount} Lead${selectedCount !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Owner Change Dialog */}
      <Dialog open={showBulkOwnerDialog} onOpenChange={setShowBulkOwnerDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign Owner for {selectedCount} Lead{selectedCount !== 1 ? "s" : ""}</DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-2">
            <Label>Assign To</Label>
            <Select value={bulkOwnerValue} onValueChange={setBulkOwnerValue}>
              <SelectTrigger>
                <SelectValue placeholder="Select a team member…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassign__">— Unassign —</SelectItem>
                {TEAM.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkOwnerDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!bulkOwnerValue) { toast.error("Please select a team member."); return; }
                const assignedTo = bulkOwnerValue === "__unassign__" ? null : bulkOwnerValue;
                bulkUpdateOwner.mutate({ ids: Array.from(selectedIds), assignedTo });
              }}
              disabled={bulkUpdateOwner.isPending || !bulkOwnerValue}
            >
              {bulkUpdateOwner.isPending ? "Assigning…" : `Assign ${selectedCount} Lead${selectedCount !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Lead Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Full Name <span className="text-red-500">*</span></Label>
              <Input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="e.g. Ahmed Mohamed" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+20 10..." className="mt-1" />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="+20 10..." className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" className="mt-1" />
            </div>
            <div>
              <Label>Nationality</Label>
              <Input value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} placeholder="e.g. Egyptian" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Interested Program</Label>
                <Select value={form.interestedProgram} onValueChange={v => setForm(f => ({ ...f, interestedProgram: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {allPrograms.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Lead Source</Label>
                <Select value={form.leadSource} onValueChange={v => setForm(f => ({ ...f, leadSource: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {allSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Assigned To</Label>
                <Select value={form.assignedTo} onValueChange={v => setForm(f => ({ ...f, assignedTo: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {TEAM.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as "low" | "medium" | "high" }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Budget Range</Label>
              <Input value={form.budgetRange} onChange={e => setForm(f => ({ ...f, budgetRange: e.target.value }))} placeholder="e.g. €50,000 - €100,000" className="mt-1" />
            </div>
            <div>
              <Label>Notes</Label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Initial notes about this lead…"
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createLead.isPending}>
              {createLead.isPending ? "Creating…" : "Create Lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}
