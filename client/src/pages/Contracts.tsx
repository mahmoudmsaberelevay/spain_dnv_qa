import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Download, Search, FileText, Users, Calendar, CheckCircle, XCircle, Clock, Filter,
} from "lucide-react";
import NewContractDialog from "@/components/NewContractDialog";
import { formatCurrency, formatDate, getStatusBadgeClass } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { usePermissions } from "@/contexts/PermissionsContext";

const CONSULTANTS = ["Ziad El Shurafa", "Mahmoud Saber", "Fouad Abdo", "Kirolos Nabil"];

type DateRangePreset = "all" | "this_month" | "last_month" | "this_quarter" | "this_year";

const DATE_RANGE_LABELS: Record<DateRangePreset, string> = {
  all: "All Time",
  this_month: "This Month",
  last_month: "Last Month",
  this_quarter: "This Quarter",
  this_year: "This Year",
};

function computeDateRange(preset: DateRangePreset): { dateFrom?: Date; dateTo?: Date } {
  const now = new Date();
  if (preset === "all") return {};
  if (preset === "this_month") {
    return {
      dateFrom: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      dateTo: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }
  if (preset === "last_month") {
    return {
      dateFrom: new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0),
      dateTo: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
    };
  }
  if (preset === "this_quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return {
      dateFrom: new Date(now.getFullYear(), q * 3, 1, 0, 0, 0, 0),
      dateTo: new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999),
    };
  }
  if (preset === "this_year") {
    return {
      dateFrom: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
      dateTo: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  }
  return {};
}

function exportToCSV(rows: any[], filename: string) {
  const headers = [
    "Contract Code", "Client Name", "Family Members", "Contract Value (EUR)",
    "Discount (EUR)", "Consultant", "Status", "Date",
  ];
  const csvRows = [
    headers.join(","),
    ...rows.map((c) =>
      [
        c.contractCode,
        `"${c.clientName}"`,
        c.familyMembers,
        Number(c.contractValue).toFixed(2),
        Number(c.discountValue ?? 0).toFixed(2),
        `"${c.consultantName ?? ""}"`,
        c.status,
        c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "",
      ].join(",")
    ),
  ];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Contracts() {
  const { canEdit, canAccess } = usePermissions();
  const [showNewContract, setShowNewContract] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [consultantFilter, setConsultantFilter] = useState<string>("all");
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>("all");

  const { dateFrom, dateTo } = useMemo(() => computeDateRange(dateRangePreset), [dateRangePreset]);

  const [confirmStatus, setConfirmStatus] = useState<{
    contractId: number;
    contractCode: string;
    clientName: string;
    newStatus: "signed" | "cancelled" | "pending";
  } | null>(null);

  const { data: contracts, isLoading } = trpc.contracting.contracts.list.useQuery();
  const utils = trpc.useUtils();

  const [redownloadingId, setRedownloadingId] = useState<number | null>(null);

  const regenerateDocMutation = trpc.contracting.contracts.regenerateDoc.useMutation({
    onSuccess: (data) => {
      utils.contracting.contracts.list.invalidate();
      window.open(data.docUrl, "_blank");
      toast.success("Contract document ready — downloading now.");
      setRedownloadingId(null);
    },
    onError: (err) => {
      toast.error(`Failed to regenerate document: ${err.message}`);
      setRedownloadingId(null);
    },
  });

  const updateStatusMutation = trpc.contracting.contracts.updateStatus.useMutation({
    onSuccess: (updated) => {
      utils.contracting.contracts.list.invalidate();
      utils.contracting.analytics.stats.invalidate();
      utils.contracting.analytics.recentContracts.invalidate();
      toast.success(`Contract status updated to ${updated?.status}`);
      setConfirmStatus(null);
    },
    onError: (err) => {
      toast.error(`Failed to update status: ${err.message}`);
      setConfirmStatus(null);
    },
  });

  const filtered = useMemo(() => {
    if (!contracts) return [];
    return contracts.filter((c) => {
      const matchesSearch =
        c.clientName.toLowerCase().includes(search.toLowerCase()) ||
        c.contractCode.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      const matchesConsultant = consultantFilter === "all" || c.consultantName === consultantFilter;
      let matchesDate = true;
      if (dateFrom && c.createdAt) matchesDate = matchesDate && new Date(c.createdAt) >= dateFrom;
      if (dateTo && c.createdAt) matchesDate = matchesDate && new Date(c.createdAt) <= dateTo;
      return matchesSearch && matchesStatus && matchesConsultant && matchesDate;
    });
  }, [contracts, search, statusFilter, consultantFilter, dateFrom, dateTo]);

  const handleExportCSV = useCallback(() => {
    if (!filtered.length) {
      toast.error("No contracts to export.");
      return;
    }
    const preset = dateRangePreset !== "all" ? `_${DATE_RANGE_LABELS[dateRangePreset].replace(/\s+/g, "_")}` : "";
    const consultant = consultantFilter !== "all" ? `_${consultantFilter.replace(/\s+/g, "_")}` : "";
    exportToCSV(filtered, `contracts${preset}${consultant}.csv`);
    toast.success(`Exported ${filtered.length} contracts to CSV.`);
  }, [filtered, dateRangePreset, consultantFilter]);

  const statusOptions = [
    { value: "pending", label: "Pending", icon: Clock, color: "text-yellow-600" },
    { value: "signed", label: "Signed", icon: CheckCircle, color: "text-green-600" },
    { value: "cancelled", label: "Cancelled", icon: XCircle, color: "text-red-600" },
  ];

  const hasActiveFilters = dateRangePreset !== "all" || consultantFilter !== "all" || statusFilter !== "all" || search.trim() !== "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Issued Contracts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage all generated contracts and their statuses
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-9"
            onClick={handleExportCSV}
            disabled={!filtered.length}
          >
            <Download className="h-4 w-4" />
            Export CSV
            {filtered.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{filtered.length}</Badge>
            )}
          </Button>
          {canEdit("contracting") && (
            <Button
              onClick={() => setShowNewContract(true)}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
              size="lg"
            >
              <Plus className="h-4 w-4" />
              Issue New Contract
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>

        {/* Date Range */}
        <div className="flex items-center gap-1.5">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={dateRangePreset} onValueChange={(v) => setDateRangePreset(v as DateRangePreset)}>
            <SelectTrigger className="w-40 h-10">
              <SelectValue placeholder="All Time" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DATE_RANGE_LABELS) as DateRangePreset[]).map((p) => (
                <SelectItem key={p} value={p}>{DATE_RANGE_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-10">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="signed">Signed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        {/* Consultant */}
        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={consultantFilter} onValueChange={setConsultantFilter}>
            <SelectTrigger className="w-44 h-10">
              <SelectValue placeholder="All consultants" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Consultants</SelectItem>
              {CONSULTANTS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Active filter badges */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          {dateRangePreset !== "all" && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Calendar className="h-3 w-3" />
              {DATE_RANGE_LABELS[dateRangePreset]}
              <button onClick={() => setDateRangePreset("all")} className="ml-1 hover:text-destructive">×</button>
            </Badge>
          )}
          {consultantFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 text-xs">
              {consultantFilter}
              <button onClick={() => setConsultantFilter("all")} className="ml-1 hover:text-destructive">×</button>
            </Badge>
          )}
          {statusFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 text-xs capitalize">
              {statusFilter}
              <button onClick={() => setStatusFilter("all")} className="ml-1 hover:text-destructive">×</button>
            </Badge>
          )}
          {search.trim() !== "" && (
            <Badge variant="secondary" className="gap-1 text-xs">
              "{search}"
              <button onClick={() => setSearch("")} className="ml-1 hover:text-destructive">×</button>
            </Badge>
          )}
        </div>
      )}

      {/* Contracts Table */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Contracts ({filtered?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading contracts...</div>
          ) : !filtered?.length ? (
            <div className="p-8 text-center">
              <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                {hasActiveFilters ? "No contracts match your filters." : "No contracts yet. Issue your first contract!"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-6 py-3">Contract Code</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Client Name</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Family</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Value</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Discount</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Consultant</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Date</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Status</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((contract) => (
                    <tr key={contract.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm font-medium text-primary">{contract.contractCode}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                            {contract.clientName.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium">{contract.clientName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{contract.familyMembers}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm font-semibold">{formatCurrency(Number(contract.contractValue), "EUR")}</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        {Number((contract as any).discountValue ?? 0) > 0 ? (
                          <span className="inline-flex items-center text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                            -{formatCurrency(Number((contract as any).discountValue), "EUR")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs text-muted-foreground">{(contract as any).consultantName ?? "—"}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          <span className="text-xs">{formatDate(contract.createdAt)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <Select
                          value={contract.status}
                          disabled={!canAccess("contracts")}
                          onValueChange={(val) => {
                            setConfirmStatus({
                              contractId: contract.id,
                              contractCode: contract.contractCode,
                              clientName: contract.clientName,
                              newStatus: val as "signed" | "cancelled" | "pending",
                            });
                          }}
                        >
                          <SelectTrigger className={`w-32 h-7 text-xs border-0 ${getStatusBadgeClass(contract.status)} rounded-full px-3`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <div className="flex items-center gap-2">
                                  <opt.icon className={`h-3.5 w-3.5 ${opt.color}`} />
                                  {opt.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {contract.docUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => window.open(contract.docUrl!, "_blank")}
                              title="Download existing Word document"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Word
                            </Button>
                          )}
                          {canEdit("contracting") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 gap-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                              disabled={redownloadingId === contract.id}
                              onClick={() => {
                                setRedownloadingId(contract.id);
                                regenerateDocMutation.mutate({ id: contract.id });
                              }}
                              title="Re-generate and download a fresh Word document"
                            >
                              {redownloadingId === contract.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                              Re-download
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <NewContractDialog open={showNewContract} onClose={() => setShowNewContract(false)} />

      {/* Status Change Confirmation */}
      <AlertDialog open={!!confirmStatus} onOpenChange={() => setConfirmStatus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change the status of contract{" "}
              <strong>{confirmStatus?.contractCode}</strong> for{" "}
              <strong>{confirmStatus?.clientName}</strong> to{" "}
              <strong className="capitalize">{confirmStatus?.newStatus}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmStatus) {
                  updateStatusMutation.mutate({
                    id: confirmStatus.contractId,
                    status: confirmStatus.newStatus,
                  });
                }
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
