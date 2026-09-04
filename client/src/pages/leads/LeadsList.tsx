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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Search, Phone, Mail, User, Calendar, Download,
  Filter, X, Trash2, CheckSquare, Square, MinusSquare, RefreshCw, LayoutList,
  ChevronLeft, ChevronRight, Tag, UserCheck, Columns3, Save, BookOpen, AlertTriangle,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

const STAGES = [
  { value: "fresh", label: "Fresh", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "contacted", label: "Contacted", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "qualified", label: "Qualified", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "prospect", label: "Prospect", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  { value: "client", label: "Client", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "dormant", label: "Dormant", color: "bg-gray-100 text-gray-600 border-gray-200" },
  { value: "resubmit", label: "Resubmit", color: "bg-violet-100 text-violet-700 border-violet-200" },
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
  "Monica Sobhy", "Marina Kamel", "Nouran Mamdouh", "Hager Hany", "Eman Ahmed", "Marwa Abdallah", "Basmala Shereef",
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

  // ── Read initial filter values from URL query params ──────────────────────
  // e.g. /leads?campaign=Spain+DNV+May+2026 or /leads?form=Spain+28+April+2026
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialCampaign = urlParams.get("campaign") ?? "";
  const initialForm = urlParams.get("form") ?? "";

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [stageFilter, setStageFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [programFilter, setProgramFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("all");
  // Pre-populate from URL param if provided (from dashboard chart click)
  const [metaFormFilter, setMetaFormFilter] = useState(initialForm || "all");
  const [campaignFilter, setCampaignFilter] = useState(initialCampaign);
  const [metaAdsetFilter, setMetaAdsetFilter] = useState("all");
  const [metaAdFilter, setMetaAdFilter] = useState("all");
  const [metaSyncStatusFilter, setMetaSyncStatusFilter] = useState("all");
  const [metaEventStatusFilter, setMetaEventStatusFilter] = useState("all");
  const [showHistoricalSyncConfirm, setShowHistoricalSyncConfirm] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [lastActivityFrom, setLastActivityFrom] = useState("");
  const [lastActivityTo, setLastActivityTo] = useState("");

  // ── Pagination ────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 300];

  // Reset to page 1 whenever filters change
  const prevFiltersRef = useRef<string>("");

  // ── Bulk selection state ──────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // When true, ALL matching leads across all pages are selected (not just visible ones)
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showBulkStageDialog, setShowBulkStageDialog] = useState(false);
  const [showBulkOwnerDialog, setShowBulkOwnerDialog] = useState(false);
  const [bulkStageValue, setBulkStageValue] = useState("");
  const [bulkOwnerValue, setBulkOwnerValue] = useState("");

  // ── Activity type filter (multi-select) ──────────────────────────────────
  const ACTIVITY_TYPES = [
    { value: "created", label: "Lead Created" },
    { value: "stage_changed", label: "Stage Changed" },
    { value: "assigned", label: "Assigned" },
    { value: "call", label: "Call" },
    { value: "whatsapp", label: "WhatsApp" },
    { value: "email", label: "Email" },
    { value: "meeting", label: "Meeting" },
    { value: "note_added", label: "Note Added" },
    { value: "document_request", label: "Document Request" },
    { value: "status_updated", label: "Status Updated" },
    { value: "other", label: "Other" },
  ];
  const [activityTypeFilter, setActivityTypeFilter] = useState<string[]>([]);
  function toggleActivityType(val: string) {
    setActivityTypeFilter(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  }

  // ── Column visibility (persisted to localStorage) ────────────────────────────
  const ALL_COLUMNS = [
    { key: "contact", label: "Contact" },
    { key: "program", label: "Program" },
    { key: "source", label: "Source" },
    { key: "stage", label: "Stage" },
    { key: "priority", label: "Priority" },
    { key: "assigned", label: "Assigned To" },
    { key: "createdAt", label: "Created Date" },
    { key: "nationality", label: "Nationality" },
    { key: "budget", label: "Budget" },
    { key: "lastActivity", label: "Last Activity Date" },
    { key: "metaCampaign", label: "Meta Campaign" },
    { key: "metaAdset", label: "Meta Ad Set" },
    { key: "metaAd", label: "Meta Ad" },
    { key: "metaForm", label: "Meta Form" },
    { key: "metaSync", label: "Meta Sync Status" },
    { key: "metaLeadCoverage", label: "Meta Lead ID Coverage" },
    { key: "meetingDate", label: "Meeting Date" },
    { key: "contractDate", label: "Contract Signed Date" },
  ];
  const DEFAULT_VISIBLE = ["contact", "program", "source", "stage", "priority", "assigned", "createdAt"];
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("leads_visible_columns");
      return saved ? JSON.parse(saved) : DEFAULT_VISIBLE;
    } catch { return DEFAULT_VISIBLE; }
  });
  function toggleColumn(key: string) {
    setVisibleColumns(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      localStorage.setItem("leads_visible_columns", JSON.stringify(next));
      return next;
    });
  }
  const col = (key: string) => visibleColumns.includes(key);

  // ── Shared filter presets ─────────────────────────────────────────────────────
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const { data: presets = [], refetch: refetchPresets } = trpc.leads.reporting.listPresets.useQuery();
  const savePreset = trpc.leads.reporting.savePreset.useMutation({
    onSuccess: () => { refetchPresets(); setShowSavePreset(false); setPresetName(""); toast.success("Preset saved — visible to all team members."); },
    onError: (e) => toast.error(e.message),
  });
  const deletePreset = trpc.leads.reporting.deletePreset.useMutation({
    onSuccess: () => { refetchPresets(); toast.success("Preset deleted."); },
    onError: (e) => toast.error(e.message),
  });
  function applyPreset(filterJson: string) {
    try {
      const f = JSON.parse(filterJson);
      setStageFilter(f.stage ?? "all");
      setSourceFilter(f.source ?? "all");
      setProgramFilter(f.program ?? "all");
      setAssignedFilter(f.assignedTo ?? "all");
      setCreatedFrom(f.createdFrom ?? "");
      setCreatedTo(f.createdTo ?? "");
      setActivityTypeFilter(f.activityTypes ?? []);
      if (f.activityTypes?.length) setShowAdvancedFilters(true);
      toast.success("Preset applied.");
    } catch { toast.error("Failed to apply preset."); }
  }
  function buildPresetJson() {
    return JSON.stringify({
      stage: stageFilter !== "all" ? stageFilter : undefined,
      source: sourceFilter !== "all" ? sourceFilter : undefined,
      program: programFilter !== "all" ? programFilter : undefined,
      assignedTo: assignedFilter !== "all" ? assignedFilter : undefined,
      createdFrom: createdFrom || undefined,
      createdTo: createdTo || undefined,
      activityTypes: activityTypeFilter.length > 0 ? activityTypeFilter : undefined,
    });
  }

  // ── Dynamic settings ──────────────────────────────────────────────────────
  const { data: dynamicPrograms = [] } = trpc.leadsSettings.listPrograms.useQuery();
  const { data: dynamicSources = [] } = trpc.leadsSettings.listSources.useQuery();

  const allPrograms = useMemo(() => {
    const fromSettings = dynamicPrograms.filter(p => p.isActive).map(p => p.name);
    return Array.from(new Set([...PROGRAMS, ...fromSettings]));
  }, [dynamicPrograms]);

  const allSources = useMemo(() => {
    const fromSettings = dynamicSources.filter(s => s.isActive).map(s => s.name);
    return Array.from(new Set([...SOURCES, ...fromSettings]));
  }, [dynamicSources]);

  // ── Create form ───────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{ id: number; name: string } | null>(null);
  const [form, setForm] = useState({
    fullName: "", phone: "", whatsapp: "", email: "",
    nationality: "", interestedProgram: "", leadSource: "",
    assignedTo: "", priority: "medium" as "low" | "medium" | "high",
    notes: "", budgetRange: "",
  });

  // ── Meta attribution filter options ───────────────────────────────────────
  const { data: metaFilterOptions } = trpc.leads.metaFilterOptions.useQuery();
  const metaForms = metaFilterOptions?.forms ?? [];

  // ── Build query filters ───────────────────────────────────────────────────
  const filters = useMemo(() => ({
    search: debouncedSearch || undefined,
    stage: stageFilter !== "all" ? stageFilter : undefined,
    leadSource: sourceFilter !== "all" ? sourceFilter : undefined,
    interestedProgram: programFilter !== "all" ? programFilter : undefined,
    assignedTo: assignedFilter !== "all" ? assignedFilter : undefined,
    metaFormId: metaFormFilter !== "all" ? metaFormFilter : undefined,
    metaCampaign: campaignFilter || undefined,
    metaAdset: metaAdsetFilter !== "all" ? metaAdsetFilter : undefined,
    metaAd: metaAdFilter !== "all" ? metaAdFilter : undefined,
    metaSyncStatus: metaSyncStatusFilter !== "all" ? metaSyncStatusFilter : undefined,
    metaEventStatus: metaEventStatusFilter !== "all" ? metaEventStatusFilter : undefined,
    dateFrom: createdFrom ? new Date(createdFrom).getTime() : undefined,
    dateTo: createdTo ? new Date(createdTo + "T23:59:59").getTime() : undefined,
    lastActivityFrom: lastActivityFrom ? new Date(lastActivityFrom).getTime() : undefined,
    lastActivityTo: lastActivityTo ? new Date(lastActivityTo + "T23:59:59").getTime() : undefined,
    page,
    pageSize,
  }), [debouncedSearch, stageFilter, sourceFilter, programFilter, assignedFilter, metaFormFilter,
    campaignFilter, metaAdsetFilter, metaAdFilter, metaSyncStatusFilter, metaEventStatusFilter,
    createdFrom, createdTo, lastActivityFrom, lastActivityTo, page, pageSize]);

  // Reset page and selection when non-page filters change
  useEffect(() => {
    const key = JSON.stringify({ debouncedSearch, stageFilter, sourceFilter, programFilter, assignedFilter, metaFormFilter, campaignFilter, metaAdsetFilter, metaAdFilter, metaSyncStatusFilter, metaEventStatusFilter, createdFrom, createdTo, lastActivityFrom, lastActivityTo });
    if (prevFiltersRef.current && prevFiltersRef.current !== key) {
      setPage(1);
      setSelectedIds(new Set());
      setAllPagesSelected(false);
    }
    prevFiltersRef.current = key;
  }, [debouncedSearch, stageFilter, sourceFilter, programFilter, assignedFilter, metaFormFilter, campaignFilter, metaAdsetFilter, metaAdFilter, metaSyncStatusFilter, metaEventStatusFilter, createdFrom, createdTo, lastActivityFrom, lastActivityTo]);

  const hasActiveFilters = stageFilter !== "all" || sourceFilter !== "all" || programFilter !== "all" || assignedFilter !== "all" || metaFormFilter !== "all" || !!campaignFilter || metaAdsetFilter !== "all" || metaAdFilter !== "all" || metaSyncStatusFilter !== "all" || metaEventStatusFilter !== "all" || createdFrom || createdTo || lastActivityFrom || lastActivityTo;

  function clearAllFilters() {
    setStageFilter("all"); setSourceFilter("all"); setProgramFilter("all"); setAssignedFilter("all");
    setMetaFormFilter("all"); setCampaignFilter("");
    setMetaAdsetFilter("all"); setMetaAdFilter("all"); setMetaSyncStatusFilter("all"); setMetaEventStatusFilter("all");
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
      setAllPagesSelected(false);
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
      setAllPagesSelected(false);
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
      setAllPagesSelected(false);
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
  const someSelected = (leads.some(l => selectedIds.has(l.id)) && !allSelected) || (allPagesSelected && selectedIds.size < total);

  const toggleSelectAll = useCallback(() => {
    if (allPagesSelected) {
      // Deselect everything
      setAllPagesSelected(false);
      setSelectedIds(new Set());
    } else if (allSelected) {
      // All on this page selected — deselect this page
      setSelectedIds(prev => {
        const next = new Set(prev);
        leads.forEach(l => next.delete(l.id));
        return next;
      });
    } else {
      // Select all on this page
      setSelectedIds(prev => {
        const next = new Set(prev);
        leads.forEach(l => next.add(l.id));
        return next;
      });
    }
  }, [allSelected, allPagesSelected, leads, total]);

  // ── Create lead ───────────────────────────────────────────────────────────
  const createLead = trpc.leads.create.useMutation({
    onSuccess: () => {
      utils.leads.list.invalidate();
      utils.leads.analytics.overview.invalidate();
      setShowCreate(false);
      setDuplicateInfo(null);
      setForm({ fullName: "", phone: "", whatsapp: "", email: "", nationality: "", interestedProgram: "", leadSource: "", assignedTo: "", priority: "medium", notes: "", budgetRange: "" });
      toast.success("Lead created — new lead added to pipeline.");
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        try {
          const parsed = JSON.parse(err.message);
          setDuplicateInfo({ id: parsed.existingLeadId, name: parsed.existingLeadName });
        } catch {
          toast.error(`Duplicate detected: ${err.message}`);
        }
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

  // When allPagesSelected, the effective count is the total matching leads
  const selectedCount = allPagesSelected ? total : selectedIds.size;
  // The IDs to pass to bulk mutations — undefined means "use server-side filter" when allPagesSelected
  const bulkIds = allPagesSelected ? undefined : Array.from(selectedIds);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {total} lead{total !== 1 ? "s" : ""} total
            {selectedCount > 0 && (
              <span className="ml-2 text-blue-600 font-medium">· {selectedCount} selected{allPagesSelected ? " (all pages)" : ""}</span>
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
                onClick={() => bulkExport.mutate({ ids: allPagesSelected ? [] : Array.from(selectedIds) })}
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
                title={allPagesSelected ? `Delete all ${total} matching leads` : undefined}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete {selectedCount}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => { setSelectedIds(new Set()); setAllPagesSelected(false); }}
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
          {/* Advanced Filters toggle */}
          <Button
            variant={showAdvancedFilters ? "default" : "outline"}
            size="sm"
            onClick={() => setShowAdvancedFilters(v => !v)}
            className="gap-1.5"
          >
            <Filter className="w-3.5 h-3.5" />
            More Filters
            {(createdFrom || createdTo || lastActivityFrom || lastActivityTo || activityTypeFilter.length > 0 || campaignFilter || metaAdsetFilter !== "all" || metaAdFilter !== "all" || metaSyncStatusFilter !== "all" || metaEventStatusFilter !== "all") && (
              <span className="w-2 h-2 rounded-full bg-primary-foreground" />
            )}
          </Button>

          {/* Column visibility */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Columns3 className="w-3.5 h-3.5" />
                Columns
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-3" align="end">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Visible Columns</p>
              <div className="space-y-2">
                {ALL_COLUMNS.map(c => (
                  <label key={c.key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={visibleColumns.includes(c.key)}
                      onCheckedChange={() => toggleColumn(c.key)}
                    />
                    <span className="text-sm">{c.label}</span>
                  </label>
                ))}
              </div>
              <Separator className="my-2" />
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => {
                setVisibleColumns(DEFAULT_VISIBLE);
                localStorage.setItem("leads_visible_columns", JSON.stringify(DEFAULT_VISIBLE));
              }}>Reset to default</Button>
            </PopoverContent>
          </Popover>

          {/* Shared presets */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                Presets {presets.length > 0 && <span className="text-xs text-muted-foreground">({presets.length})</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Saved Filter Presets</p>
              {presets.length === 0 && <p className="text-xs text-muted-foreground py-2">No presets saved yet.</p>}
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {presets.map((p: { id: number; name: string; filterJson: string }) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-muted/50">
                    <button className="text-sm flex-1 text-left truncate" onClick={() => applyPreset(p.filterJson)}>{p.name}</button>
                    <button onClick={() => deletePreset.mutate({ id: p.id })} className="text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <Separator className="my-2" />
              {!showSavePreset ? (
                <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setShowSavePreset(true)}>
                  <Save className="w-3.5 h-3.5" /> Save current filters as preset
                </Button>
              ) : (
                <div className="space-y-2">
                  <Input
                    placeholder="Preset name…"
                    value={presetName}
                    onChange={e => setPresetName(e.target.value)}
                    className="h-8 text-xs"
                    autoFocus
                    onKeyDown={e => { if (e.key === "Enter" && presetName.trim()) savePreset.mutate({ name: presetName.trim(), filterJson: buildPresetJson() }); }}
                  />
                  <div className="flex gap-1.5">
                    <Button size="sm" className="flex-1 text-xs" disabled={!presetName.trim() || savePreset.isPending}
                      onClick={() => savePreset.mutate({ name: presetName.trim(), filterJson: buildPresetJson() })}>
                      {savePreset.isPending ? "Saving…" : "Save"}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setShowSavePreset(false); setPresetName(""); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </PopoverContent>
          </Popover>
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

        {/* Active campaign / form filter chips */}
        {(campaignFilter) && (
          <div className="flex flex-wrap gap-2">
            {campaignFilter && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                🎯 Campaign: {campaignFilter.length > 50 ? campaignFilter.slice(0, 48) + "…" : campaignFilter}
                <button onClick={() => setCampaignFilter("")} className="ml-1 hover:text-blue-600 rounded-full">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div className="p-4 bg-muted/30 rounded-lg border border-border space-y-4">
            {/* Date filters */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Date Range</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Meta Attribution & CRM Events</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                <Select value={campaignFilter || "all"} onValueChange={value => setCampaignFilter(value === "all" ? "" : value)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Campaign" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Campaigns</SelectItem>
                    {(metaFilterOptions?.campaigns ?? []).map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={metaAdsetFilter} onValueChange={setMetaAdsetFilter}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Ad Set" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Ad Sets</SelectItem>
                    {(metaFilterOptions?.adsets ?? []).map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={metaAdFilter} onValueChange={setMetaAdFilter}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Ad" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Ads</SelectItem>
                    {(metaFilterOptions?.ads ?? []).map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={metaSyncStatusFilter} onValueChange={setMetaSyncStatusFilter}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Sync Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sync Statuses</SelectItem>
                    {['pending', 'sent', 'retrying', 'failed', 'manual_review'].map(value => <SelectItem key={value} value={value}>{value.replace('_', ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={metaEventStatusFilter} onValueChange={setMetaEventStatusFilter}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Event Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Event Statuses</SelectItem>
                    {['pending', 'sent', 'retrying', 'failed', 'dead_letter', 'manual_review'].map(value => <SelectItem key={value} value={value}>{value.replace('_', ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Activity type multi-select */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Activity Types {activityTypeFilter.length > 0 && <span className="ml-1 text-primary">({activityTypeFilter.length} selected)</span>}
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {ACTIVITY_TYPES.map(at => (
                  <label key={at.value} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={activityTypeFilter.includes(at.value)}
                      onCheckedChange={() => toggleActivityType(at.value)}
                    />
                    <span className="text-sm">{at.label}</span>
                  </label>
                ))}
              </div>
              {activityTypeFilter.length > 0 && (
                <button className="mt-2 text-xs text-muted-foreground hover:text-foreground underline" onClick={() => setActivityTypeFilter([])}>
                  Clear activity filter
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Select-all-pages banner — shown when all leads on the current page are selected but there are more pages */}
      {allSelected && !allPagesSelected && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
          <span className="text-blue-800 dark:text-blue-200">
            All <strong>{leads.length}</strong> leads on this page are selected.
          </span>
          <button
            className="text-blue-700 dark:text-blue-300 font-semibold underline underline-offset-2 hover:text-blue-900 transition-colors"
            onClick={() => setAllPagesSelected(true)}
          >
            Select all {total} matching leads across all pages
          </button>
        </div>
      )}
      {allPagesSelected && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-blue-100 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-700 rounded-lg text-sm">
          <span className="text-blue-900 dark:text-blue-100 font-medium">
            All <strong>{total}</strong> matching leads are selected (across all pages).
          </span>
          <button
            className="text-blue-700 dark:text-blue-300 font-semibold underline underline-offset-2 hover:text-blue-900 transition-colors"
            onClick={() => { setAllPagesSelected(false); setSelectedIds(new Set()); }}
          >
            Clear selection
          </button>
        </div>
      )}

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
                {col("contact") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact</th>}
                {col("nationality") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nationality</th>}
                {col("program") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Program</th>}
                {col("source") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Source</th>}
                {col("stage") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Stage</th>}
                {col("priority") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Priority</th>}
                {col("assigned") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Assigned</th>}
                {col("createdAt") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>}
                {col("budget") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Budget</th>}
                {col("lastActivity") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Activity</th>}
                {col("metaCampaign") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Meta Campaign</th>}
                {col("metaAdset") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Meta Ad Set</th>}
                {col("metaAd") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Meta Ad</th>}
                {col("metaForm") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Meta Form</th>}
                {col("metaSync") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Meta Sync</th>}
                {col("metaLeadCoverage") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Lead ID</th>}
                {col("meetingDate") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Meeting</th>}
                {col("contractDate") && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Signed</th>}
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
                    <td className="px-4 py-3 w-10" onClick={e => { e.stopPropagation(); toggleSelect(lead.id, e); }}>
                      <button className="text-muted-foreground hover:text-foreground transition-colors flex items-center">
                        {isSelected
                          ? <CheckSquare className="w-4 h-4 text-blue-600" />
                          : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="p-0">
                      <a href={`/leads/${lead.id}`} onClick={(e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); navigate(`/leads/${lead.id}`); } }} className="block px-4 py-3 font-medium text-foreground hover:no-underline">
                        <span className="inline-flex items-center gap-2">
                          {lead.fullName}
                          {lead.isMetaTestLead && <Badge variant="secondary" className="border-amber-300 bg-amber-50 text-amber-900">Meta Test</Badge>}
                        </span>
                      </a>
                    </td>
                    {col("contact") && (
                      <td className="p-0">
                        <a href={`/leads/${lead.id}`} onClick={(e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); navigate(`/leads/${lead.id}`); } }} className="block px-4 py-3 hover:no-underline">
                          <div className="flex flex-col gap-0.5">
                            {lead.phone && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{lead.phone}</span>}
                            {lead.email && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{lead.email}</span>}
                          </div>
                        </a>
                      </td>
                    )}
                    {col("nationality") && <td className="p-0"><a href={`/leads/${lead.id}`} onClick={(e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); navigate(`/leads/${lead.id}`); } }} className="block px-4 py-3 text-sm text-muted-foreground hover:no-underline">{lead.nationality ?? "—"}</a></td>}
                    {col("program") && <td className="p-0"><a href={`/leads/${lead.id}`} onClick={(e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); navigate(`/leads/${lead.id}`); } }} className="block px-4 py-3 text-sm text-muted-foreground hover:no-underline">{lead.interestedProgram ?? "—"}</a></td>}
                    {col("source") && <td className="p-0"><a href={`/leads/${lead.id}`} onClick={(e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); navigate(`/leads/${lead.id}`); } }} className="block px-4 py-3 text-sm text-muted-foreground hover:no-underline">{lead.leadSource ?? "—"}</a></td>}
                    {col("stage") && (
                      <td className="p-0">
                        <a href={`/leads/${lead.id}`} onClick={(e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); navigate(`/leads/${lead.id}`); } }} className="block px-4 py-3 hover:no-underline">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${stage.color}`}>
                            {stage.label}
                          </span>
                        </a>
                      </td>
                    )}
                    {col("priority") && (
                      <td className="p-0">
                        <a href={`/leads/${lead.id}`} onClick={(e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); navigate(`/leads/${lead.id}`); } }} className="block px-4 py-3 hover:no-underline">
                          {lead.priority && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${PRIORITY_COLORS[lead.priority] ?? ""}`}>
                              {lead.priority}
                            </span>
                          )}
                        </a>
                      </td>
                    )}
                    {col("assigned") && (
                      <td className="p-0">
                        <a href={`/leads/${lead.id}`} onClick={(e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); navigate(`/leads/${lead.id}`); } }} className="block px-4 py-3 text-sm text-muted-foreground hover:no-underline">
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {lead.assignedTo ?? "Unassigned"}
                          </div>
                        </a>
                      </td>
                    )}
                    {col("createdAt") && (
                      <td className="p-0">
                        <a href={`/leads/${lead.id}`} onClick={(e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); navigate(`/leads/${lead.id}`); } }} className="block px-4 py-3 text-xs text-muted-foreground hover:no-underline">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(lead.createdAt).toLocaleDateString()}
                          </div>
                        </a>
                      </td>
                    )}
                    {col("budget") && (
                      <td className="p-0">
                        <a href={`/leads/${lead.id}`} onClick={(e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); navigate(`/leads/${lead.id}`); } }} className="block px-4 py-3 text-xs text-muted-foreground hover:no-underline">
                          {(lead as { budgetRange?: string }).budgetRange ?? "—"}
                        </a>
                      </td>
                    )}
                    {col("lastActivity") && (
                      <td className="p-0">
                        <a href={`/leads/${lead.id}`} onClick={(e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); navigate(`/leads/${lead.id}`); } }} className="block px-4 py-3 text-xs text-muted-foreground hover:no-underline">
                          {(lead as { lastActivityAt?: number }).lastActivityAt
                            ? new Date((lead as { lastActivityAt?: number }).lastActivityAt!).toLocaleDateString()
                            : "—"}
                        </a>
                      </td>
                    )}
                    {col("metaCampaign") && <td className="px-4 py-3 text-xs text-muted-foreground min-w-48"><div>{lead.metaCampaign || "—"}</div>{lead.metaCampaignId && <code className="text-[10px]">{lead.metaCampaignId}</code>}</td>}
                    {col("metaAdset") && <td className="px-4 py-3 text-xs text-muted-foreground min-w-44"><div>{lead.metaAdset || "—"}</div>{lead.metaAdsetId && <code className="text-[10px]">{lead.metaAdsetId}</code>}</td>}
                    {col("metaAd") && <td className="px-4 py-3 text-xs text-muted-foreground min-w-44"><div>{lead.metaAd || "—"}</div>{lead.metaAdId && <code className="text-[10px]">{lead.metaAdId}</code>}</td>}
                    {col("metaForm") && <td className="px-4 py-3 text-xs text-muted-foreground min-w-40"><div>{lead.metaFormName || "—"}</div>{lead.metaFormId && <code className="text-[10px]">{lead.metaFormId}</code>}</td>}
                    {col("metaSync") && <td className="px-4 py-3 text-xs"><Badge variant="outline">{lead.metaSyncStatus || "—"}</Badge></td>}
                    {col("metaLeadCoverage") && <td className="px-4 py-3 text-xs"><Badge variant={lead.metaLeadId ? "default" : "secondary"}>{lead.metaLeadId ? "Covered" : "Missing"}</Badge></td>}
                    {col("meetingDate") && <td className="px-4 py-3 text-xs text-muted-foreground">{lead.consultationBookedDate ? new Date(lead.consultationBookedDate).toLocaleDateString() : "—"}</td>}
                    {col("contractDate") && <td className="px-4 py-3 text-xs text-muted-foreground">{lead.contractSignedDate ? new Date(lead.contractSignedDate).toLocaleDateString() : "—"}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination + page-size selector */}
      <div className="flex items-center justify-between pt-1 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {total > 0 ? `Showing ${Math.min((page - 1) * pageSize + 1, total)}–${Math.min(page * pageSize, total)} of ${total} leads` : "No leads"}
          </p>
          {/* Page size selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Per page:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => { setPageSize(Number(v)); setPage(1); setSelectedIds(new Set()); setAllPagesSelected(false); }}
            >
              <SelectTrigger className="h-7 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {totalPages > 1 && (
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
            <span className="text-sm font-medium px-2">Page {page} of {totalPages}</span>
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
        )}
      </div>

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
              onClick={() => bulkDelete.mutate({ ids: allPagesSelected ? [] : Array.from(selectedIds) })}
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
                bulkUpdateStage.mutate({ ids: allPagesSelected ? [] : Array.from(selectedIds), stage: bulkStageValue as any });
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
                bulkUpdateOwner.mutate({ ids: allPagesSelected ? [] : Array.from(selectedIds), assignedTo });
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
            {duplicateInfo && (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-3 text-sm">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-red-700 dark:text-red-400">Duplicate phone number detected</p>
                  <p className="text-red-600 dark:text-red-300 mt-0.5">
                    A lead with this phone already exists:{" "}
                    <button
                      className="font-semibold underline hover:no-underline"
                      onClick={() => { setShowCreate(false); setDuplicateInfo(null); navigate(`/leads/${duplicateInfo.id}`); }}
                    >
                      {duplicateInfo.name} (Lead #{duplicateInfo.id})
                    </button>
                  </p>
                  <p className="text-xs text-red-500 mt-1">Click the name above to open the existing lead, or change the phone number to proceed.</p>
                </div>
                <button onClick={() => setDuplicateInfo(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
              </div>
            )}
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
            <Button variant="outline" onClick={() => { setShowCreate(false); setDuplicateInfo(null); }}>Cancel</Button>
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
