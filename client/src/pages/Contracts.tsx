import { useState } from "react";
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
  Plus, Download, Search, FileText, Users, Calendar, CheckCircle, XCircle, Clock, ExternalLink,
} from "lucide-react";
import NewContractDialog from "@/components/NewContractDialog";
import { formatCurrency, formatDate, getStatusBadgeClass } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { usePermissions } from "@/contexts/PermissionsContext";

export default function Contracts() {
  const { canEdit } = usePermissions();
  const [showNewContract, setShowNewContract] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [consultantFilter, setConsultantFilter] = useState<string>("all");

  const CONSULTANTS = ["Ziad El Shurafa", "Mahmoud Saber", "Fouad Abdo", "Kirolos Nabil"];
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
    onSuccess: (data, variables) => {
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

  const filtered = contracts?.filter((c) => {
    const matchesSearch =
      c.clientName.toLowerCase().includes(search.toLowerCase()) ||
      c.contractCode.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const matchesConsultant = consultantFilter === "all" || c.consultantName === consultantFilter;
    return matchesSearch && matchesStatus && matchesConsultant;
  });

  const statusOptions = [
    { value: "pending", label: "Pending", icon: Clock, color: "text-yellow-600" },
    { value: "signed", label: "Signed", icon: CheckCircle, color: "text-green-600" },
    { value: "cancelled", label: "Cancelled", icon: XCircle, color: "text-red-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Issued Contracts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage all generated contracts and their statuses
          </p>
        </div>
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

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
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
                {search || statusFilter !== "all" ? "No contracts match your filters." : "No contracts yet. Issue your first contract!"}
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
                          disabled={!canEdit("contracting")}
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
