import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Download, Search, Receipt, Calendar, CheckCircle, Loader2, TrendingDown, Mail, ExternalLink, Trash2, RefreshCw, Pencil,
} from "lucide-react";
import { formatCurrency, formatDate, getStatusBadgeClass } from "@/lib/utils";
import { ClientSearchCombobox } from "@/components/ClientSearchCombobox";
import { ContractSearchCombobox } from "@/components/ContractSearchCombobox";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useAuth } from "@/_core/hooks/useAuth";

function getTodayDateInput(): string {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 10);
}

export default function Invoices() {
  const { canEdit } = usePermissions();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [confirmPaid, setConfirmPaid] = useState<{ id: number; invoiceCode: string; clientName: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; invoiceCode: string; clientName: string } | null>(null);
  const [regenId, setRegenId] = useState<number | null>(null);
  const [receiptDate, setReceiptDate] = useState(getTodayDateInput);
  const [editDateDialog, setEditDateDialog] = useState<{ id: number; invoiceCode: string; clientName: string } | null>(null);
  const [editReceiptDate, setEditReceiptDate] = useState("");

  // Send-by-email dialog state
  const [sendEmailDialog, setSendEmailDialog] = useState<{ id: number; invoiceCode: string; clientName: string } | null>(null);
  const [clientEmail, setClientEmail] = useState("");

  // Fixed list of allowed receipt recipients
  const RECEIPT_RECIPIENTS = [
    "mahmoud.saber@elevay.com",
    "Ziad.elshurafa@elevay.com",
    "Fouad.abdo@elevay.com",
    "kirlos.nabil@elevay.com",
  ];

  // Dialog mode: 'contract' | 'legacy'
  const [receiptMode, setReceiptMode] = useState<"contract" | "legacy">("contract");

  // Form state — contract mode
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [amountEur, setAmountEur] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [discountValue, setDiscountValue] = useState<string>("");
  const [actualPaidEgp, setActualPaidEgp] = useState<string>("");

  // Form state — legacy mode
  const [legacyClientId, setLegacyClientId] = useState<string>("none");
  const [legacyAmountEur, setLegacyAmountEur] = useState<string>("");
  const [legacyAmountEgp, setLegacyAmountEgp] = useState<string>("");
  const [legacyNotes, setLegacyNotes] = useState<string>("");
  const [legacyActualPaidEgp, setLegacyActualPaidEgp] = useState<string>("");

  const { data: invoices, isLoading } = trpc.contracting.invoices.list.useQuery();
  const { data: contracts } = trpc.contracting.contracts.list.useQuery();
  const { data: rateInfo } = trpc.contracting.exchangeRate.current.useQuery();
  const utils = trpc.useUtils();

  // All contracts can have receipts (including legacy/pending)
  const signedContracts = contracts ?? [];

  // Fetch remaining balance for the selected contract and pre-fill the amount
  const { data: paymentSummary } = trpc.contracting.contracts.getPaymentSummary.useQuery(
    { contractId: Number(selectedContractId) },
    { enabled: !!selectedContractId && Number(selectedContractId) > 0 }
  );

  // When a contract is selected, pre-fill the amount with the remaining balance
  const prevContractIdRef = useRef("");
  useEffect(() => {
    if (selectedContractId && selectedContractId !== prevContractIdRef.current && paymentSummary) {
      setAmountEur(String(paymentSummary.remainingBalance > 0 ? paymentSummary.remainingBalance : ""));
      prevContractIdRef.current = selectedContractId;
    }
    if (!selectedContractId) {
      prevContractIdRef.current = "";
    }
  }, [selectedContractId, paymentSummary]);

  const createMutation = trpc.contracting.invoices.create.useMutation({
    onSuccess: () => {
      utils.contracting.invoices.list.invalidate();
      utils.contracting.analytics.stats.invalidate();
      toast.success("Receipt created successfully!");
      setShowCreateDialog(false);
      setSelectedContractId("");
      setAmountEur("");
      setNotes("");
      setDiscountValue("");
      setActualPaidEgp("");
      setReceiptDate(getTodayDateInput());
    },
    onError: (err) => {
      toast.error(`Failed to create receipt: ${err.message}`);
    },
  });

  const createLegacyMutation = trpc.contracting.invoices.createLegacy.useMutation({
    onSuccess: () => {
      utils.contracting.invoices.list.invalidate();
      toast.success("Legacy receipt created successfully!");
      setShowCreateDialog(false);
      setLegacyClientId("none");
      setLegacyAmountEur("");
      setLegacyAmountEgp("");
      setLegacyNotes("");
      setLegacyActualPaidEgp("");
      setReceiptDate(getTodayDateInput());
    },
    onError: (err) => toast.error(`Failed to create legacy receipt: ${err.message}`),
  });

  const handleLegacySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!legacyClientId || legacyClientId === "none" || !legacyAmountEur) return;
    createLegacyMutation.mutate({
      legacyFinClientId: Number(legacyClientId),
      amountEur: Number(legacyAmountEur),
      amountEgp: legacyAmountEgp ? Number(legacyAmountEgp) : undefined,
      notes: legacyNotes.trim() || undefined,
      actualPaidAmountEgp: legacyActualPaidEgp ? Number(legacyActualPaidEgp) : undefined,
      receiptDate,
    });
  };

  const deleteMutation = trpc.contracting.invoices.delete.useMutation({
    onSuccess: () => {
      utils.contracting.invoices.list.invalidate();
      utils.contracting.analytics.stats.invalidate();
      toast.success("Receipt deleted.");
      setConfirmDelete(null);
    },
    onError: (err) => toast.error(`Failed to delete: ${err.message}`),
  });

  const regenMutation = trpc.contracting.invoices.regeneratePdf.useMutation({
    onSuccess: (data) => {
      utils.contracting.invoices.list.invalidate();
      toast.success("PDF regenerated successfully!");
      setRegenId(null);
      if (data.pdfUrl) window.open(data.pdfUrl, "_blank");
    },
    onError: (err) => { toast.error(`Failed to regenerate PDF: ${err.message}`); setRegenId(null); },
  });

  const updateDateMutation = trpc.contracting.invoices.updateDate.useMutation({
    onSuccess: () => {
      utils.contracting.invoices.list.invalidate();
      toast.success("Receipt date and PDF updated successfully!");
      setEditDateDialog(null);
      setEditReceiptDate("");
    },
    onError: (err) => toast.error(`Failed to update receipt date: ${err.message}`),
  });

  const markPaidMutation = trpc.contracting.invoices.markPaid.useMutation({
    onSuccess: () => {
      utils.contracting.invoices.list.invalidate();
      utils.contracting.analytics.stats.invalidate();
      toast.success("Receipt marked as paid!");
      setConfirmPaid(null);
    },
    onError: (err) => {
      toast.error(`Failed to mark as paid: ${err.message}`);
      setConfirmPaid(null);
    },
  });

  const sendEmailMutation = trpc.contracting.invoices.sendReceiptByEmail.useMutation({
    onSuccess: (result) => {
      toast.success(result.message ?? "Receipt sent to client!");
      setSendEmailDialog(null);
      setClientEmail("");
    },
    onError: (err) => {
      toast.error(`Failed to send receipt: ${err.message}`);
    },
  });

  const filtered = invoices?.filter((inv) => {
    const matchesSearch =
      inv.clientName.toLowerCase().includes(search.toLowerCase()) ||
      inv.invoiceCode.toLowerCase().includes(search.toLowerCase()) ||
      (inv.contractCode ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const selectedContract = contracts?.find((c) => c.id === Number(selectedContractId));
  const previewEgp = amountEur && rateInfo ? Number(amountEur) * rateInfo.rate : null;

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContractId || !amountEur || !notes.trim()) return;
    createMutation.mutate({
      contractId: Number(selectedContractId),
      amountEur: Number(amountEur),
      notes: notes.trim(),
      discountValue: discountValue ? Number(discountValue) : undefined,
      actualPaidAmountEgp: actualPaidEgp ? Number(actualPaidEgp) : undefined,
      receiptDate,
    });
  };

  const handleSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendEmailDialog || !clientEmail.trim()) return;
    sendEmailMutation.mutate({
      invoiceId: sendEmailDialog.id,
      clientEmail: clientEmail.trim(),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Receipts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create and manage payment receipts for contracts
          </p>
        </div>
        {canEdit("receipts") && (
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
            size="lg"
          >
            <Plus className="h-4 w-4" />
            Create Receipt
          </Button>
        )}
      </div>

      {/* Exchange Rate */}
      {rateInfo && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm text-blue-800">
            <strong>Live Rate:</strong> 1 EUR = {rateInfo.rate.toFixed(4)} EGP
            <span className="text-blue-600 ml-2">· {rateInfo.source}</span>
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by client, receipt or contract code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-10">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Receipts Table */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Receipts ({filtered?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading receipts...</div>
          ) : !filtered?.length ? (
            <div className="p-8 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                {search || statusFilter !== "all" ? "No receipts match your filters." : "No receipts yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-6 py-3">Receipt Code</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Client</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Contract</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Amount (EUR)</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Due (EGP)</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Paid (EGP)</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Remaining (EGP)</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Date</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Status</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((invoice) => (
                    <tr key={invoice.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm font-medium text-primary">{invoice.invoiceCode}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm font-medium">{invoice.clientName}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono text-xs text-muted-foreground">{invoice.contractCode}</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm font-semibold">{formatCurrency(Number(invoice.amountEur), "EUR")}</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm text-muted-foreground">
                          {invoice.amountEgp ? formatCurrency(Number(invoice.amountEgp), "EGP") : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm text-muted-foreground">
                          {invoice.actualPaidAmountEgp != null ? formatCurrency(Number(invoice.actualPaidAmountEgp), "EGP") : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        {invoice.remainingAmountEgp != null ? (
                          <span className={`text-sm font-semibold ${
                            Number(invoice.remainingAmountEgp) > 0 ? "text-amber-700" : "text-green-700"
                          }`}>
                            {formatCurrency(Number(invoice.remainingAmountEgp), "EGP")}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          <span className="text-xs">{formatDate(invoice.receiptDate ?? invoice.createdAt)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <Badge className={`text-xs ${getStatusBadgeClass(invoice.status)}`}>
                          {invoice.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-1">
                          {invoice.pdfUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => window.open(invoice.pdfUrl!, "_blank")}
                              title="Download PDF"
                            >
                              <Download className="h-3.5 w-3.5" />
                              PDF
                            </Button>
                          )}

                          {invoice.pdfUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 gap-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                              onClick={() => {
                                setSendEmailDialog({ id: invoice.id, invoiceCode: invoice.invoiceCode, clientName: invoice.clientName });
                                setClientEmail("");
                              }}
                              title="Send receipt to client by email"
                            >
                              <Mail className="h-3.5 w-3.5" />
                              Email
                            </Button>
                          )}
                          {canEdit("receipts") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 gap-1 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                              onClick={() => {
                                setEditDateDialog({ id: invoice.id, invoiceCode: invoice.invoiceCode, clientName: invoice.clientName });
                                setEditReceiptDate(new Date(invoice.receiptDate ?? invoice.createdAt).toISOString().slice(0, 10));
                              }}
                              title="Edit receipt date"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Date
                            </Button>
                          )}
                          {invoice.status === "unpaid" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 gap-1 text-xs text-green-700 hover:text-green-800 hover:bg-green-50"
                              onClick={() => setConfirmPaid({ id: invoice.id, invoiceCode: invoice.invoiceCode, clientName: invoice.clientName })}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              Mark Paid
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1 text-xs text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                            onClick={() => { setRegenId(invoice.id); regenMutation.mutate({ id: invoice.id }); }}
                            disabled={regenMutation.isPending && regenId === invoice.id}
                            title="Regenerate PDF with correct values"
                          >
                            {regenMutation.isPending && regenId === invoice.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <RefreshCw className="h-3.5 w-3.5" />}
                            Regen
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 gap-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50"
                              onClick={() => setConfirmDelete({ id: invoice.id, invoiceCode: invoice.invoiceCode, clientName: invoice.clientName })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
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

      {/* Create Receipt Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) { setReceiptMode("contract"); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Create Receipt
            </DialogTitle>
          </DialogHeader>

          {/* Mode tab switcher */}
          <div className="flex rounded-lg border overflow-hidden text-sm font-medium">
            <button
              type="button"
              onClick={() => setReceiptMode("contract")}
              className={`flex-1 py-2 transition-colors ${
                receiptMode === "contract"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              Contract Receipt
            </button>
            <button
              type="button"
              onClick={() => setReceiptMode("legacy")}
              className={`flex-1 py-2 transition-colors ${
                receiptMode === "legacy"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              Legacy Receipt
            </button>
          </div>

          {/* ── CONTRACT MODE ── */}
          {receiptMode === "contract" && (
            <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
              <p className="text-xs text-muted-foreground">Create a payment receipt for any contract.</p>
              <div className="space-y-2">
                <Label>Contract</Label>
                <ContractSearchCombobox
                  value={selectedContractId}
                  onChange={setSelectedContractId}
                  contracts={signedContracts}
                  placeholder="Type client name or contract code..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="receiptDate">Receipt Date <span className="text-red-500">*</span></Label>
                <Input
                  id="receiptDate"
                  type="date"
                  value={receiptDate}
                  onChange={(event) => setReceiptDate(event.target.value)}
                  required
                  className="h-10"
                />
              </div>

              {selectedContract && paymentSummary && (
                <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contract Value</span>
                    <span className="font-medium">{formatCurrency(paymentSummary.contractValue, "EUR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Paid</span>
                    <span className="font-medium text-green-700">{formatCurrency(paymentSummary.totalPaid, "EUR")}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="font-semibold">Remaining Balance</span>
                    <span className="font-bold text-primary">{formatCurrency(paymentSummary.remainingBalance, "EUR")}</span>
                  </div>
                </div>
              )}

              {/* One-time discount field — only shown if no discount has been applied yet */}
              {selectedContract && paymentSummary && Number(selectedContract.discountValue ?? 0) === 0 && (
                <div className="space-y-2">
                  <Label htmlFor="discountValue">
                    Discount (EUR)
                    <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                      One-time only — permanently reduces contract value
                    </span>
                  </Label>
                  <Input
                    id="discountValue"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="e.g. 2000 (optional)"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className="h-10"
                  />
                  {discountValue && Number(discountValue) > 0 && (
                    <p className="text-xs text-amber-700">
                      Contract value will be reduced from {formatCurrency(paymentSummary.contractValue, "EUR")} to {formatCurrency(paymentSummary.contractValue - Number(discountValue), "EUR")}. This cannot be undone.
                    </p>
                  )}
                </div>
              )}
              {selectedContract && Number(selectedContract.discountValue ?? 0) > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm flex justify-between">
                  <span className="text-amber-700">Discount already applied</span>
                  <span className="font-semibold text-amber-800">{formatCurrency(Number(selectedContract.discountValue), "EUR")}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="amountEur">Payment Amount (EUR)</Label>
                <Input
                  id="amountEur"
                  type="number"
                  min={1}
                  step="0.01"
                  placeholder="e.g. 5000"
                  value={amountEur}
                  onChange={(e) => setAmountEur(e.target.value)}
                  required
                  className="h-10"
                />
              </div>

              {previewEgp !== null && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-blue-600" />
                    <span className="text-sm text-blue-800">Due Amount (EGP)</span>
                  </div>
                  <span className="font-bold text-blue-900">{formatCurrency(previewEgp, "EGP")}</span>
                </div>
              )}

              {/* Actual Paid Amount (EGP) — optional partial payment */}
              <div className="space-y-2">
                <Label htmlFor="actualPaidEgp">Actual Paid Amount (EGP) <span className="text-muted-foreground text-xs">(optional — leave blank if full amount paid)</span></Label>
                <Input
                  id="actualPaidEgp"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="e.g. 45000"
                  value={actualPaidEgp}
                  onChange={(e) => setActualPaidEgp(e.target.value)}
                  className="h-10"
                />
              </div>

              {/* Live remaining EGP calculation */}
              {previewEgp !== null && actualPaidEgp && Number(actualPaidEgp) >= 0 && (
                <div className={`border rounded-lg p-3 flex items-center justify-between ${
                  Math.max(0, previewEgp - Number(actualPaidEgp)) > 0
                    ? "bg-amber-50 border-amber-200"
                    : "bg-green-50 border-green-200"
                }`}>
                  <span className="text-sm font-medium">
                    {Math.max(0, previewEgp - Number(actualPaidEgp)) > 0 ? "Remaining (EGP)" : "Fully Paid ✓"}
                  </span>
                  <span className={`font-bold ${
                    Math.max(0, previewEgp - Number(actualPaidEgp)) > 0 ? "text-amber-800" : "text-green-700"
                  }`}>
                    {formatCurrency(Math.max(0, previewEgp - Number(actualPaidEgp)), "EGP")}
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">Notes <span className="text-red-500">*</span></Label>
                <Textarea
                  id="notes"
                  placeholder="e.g. First installment, Second payment..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  required
                  className="min-h-[80px] resize-none"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">Required — describe the payment context. Press Enter for a new line.</p>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)} disabled={createMutation.isPending}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || !selectedContractId || !amountEur || !notes.trim()}
                  className="gap-2"
                >
                  {createMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
                  ) : (
                    <><Receipt className="h-4 w-4" /> Create Receipt</>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}

          {/* ── LEGACY MODE ── */}
          {receiptMode === "legacy" && (
            <form onSubmit={handleLegacySubmit} className="space-y-4 py-2">
              <p className="text-xs text-muted-foreground">
                Create a receipt for an existing Finance client. Does not affect contract balance or create duplicate records.
              </p>

              <div className="space-y-2">
                <Label>Client <span className="text-red-500">*</span></Label>
                <ClientSearchCombobox
                  value={legacyClientId}
                  onChange={setLegacyClientId}
                  placeholder="Search by name or client code..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="legacyReceiptDate">Receipt Date <span className="text-red-500">*</span></Label>
                <Input
                  id="legacyReceiptDate"
                  type="date"
                  value={receiptDate}
                  onChange={(event) => setReceiptDate(event.target.value)}
                  required
                  className="h-10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="legacyAmountEur">Amount (EUR) <span className="text-red-500">*</span></Label>
                  <Input
                    id="legacyAmountEur"
                    type="number"
                    min={1}
                    step="0.01"
                    placeholder="e.g. 3000"
                    value={legacyAmountEur}
                    onChange={(e) => {
                      setLegacyAmountEur(e.target.value);
                      if (rateInfo && e.target.value) {
                        setLegacyAmountEgp(String(Math.round(Number(e.target.value) * rateInfo.rate)));
                      }
                    }}
                    required
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="legacyAmountEgp">Amount (EGP)</Label>
                  <Input
                    id="legacyAmountEgp"
                    type="number"
                    min={1}
                    step="1"
                    placeholder="Auto-calculated"
                    value={legacyAmountEgp}
                    onChange={(e) => setLegacyAmountEgp(e.target.value)}
                    className="h-10"
                  />
                </div>
              </div>

              {rateInfo && legacyAmountEur && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-800">
                  Live rate: 1 EUR = {rateInfo.rate.toFixed(4)} EGP
                  {legacyAmountEgp && <span className="ml-2 font-semibold">Due: {Number(legacyAmountEgp).toLocaleString()} EGP</span>}
                </div>
              )}

              {/* Actual Paid Amount (EGP) — optional partial payment */}
              <div className="space-y-2">
                <Label htmlFor="legacyActualPaidEgp">Actual Paid Amount (EGP) <span className="text-muted-foreground text-xs">(optional — leave blank if full amount paid)</span></Label>
                <Input
                  id="legacyActualPaidEgp"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="e.g. 45000"
                  value={legacyActualPaidEgp}
                  onChange={(e) => setLegacyActualPaidEgp(e.target.value)}
                  className="h-10"
                />
              </div>

              {/* Live remaining EGP calculation for legacy */}
              {legacyAmountEgp && legacyActualPaidEgp && Number(legacyActualPaidEgp) >= 0 && (
                <div className={`border rounded-lg p-3 flex items-center justify-between ${
                  Math.max(0, Number(legacyAmountEgp) - Number(legacyActualPaidEgp)) > 0
                    ? "bg-amber-50 border-amber-200"
                    : "bg-green-50 border-green-200"
                }`}>
                  <span className="text-sm font-medium">
                    {Math.max(0, Number(legacyAmountEgp) - Number(legacyActualPaidEgp)) > 0 ? "Remaining (EGP)" : "Fully Paid ✓"}
                  </span>
                  <span className={`font-bold ${
                    Math.max(0, Number(legacyAmountEgp) - Number(legacyActualPaidEgp)) > 0 ? "text-amber-800" : "text-green-700"
                  }`}>
                    {Math.max(0, Number(legacyAmountEgp) - Number(legacyActualPaidEgp)).toLocaleString()} EGP
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="legacyNotes">Notes</Label>
                <Textarea
                  id="legacyNotes"
                  placeholder="e.g. 2nd installment, balance payment..."
                  value={legacyNotes}
                  onChange={(e) => setLegacyNotes(e.target.value)}
                  className="min-h-[80px] resize-none"
                  rows={3}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)} disabled={createLegacyMutation.isPending}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createLegacyMutation.isPending || !legacyClientId || legacyClientId === "none" || !legacyAmountEur}
                  className="gap-2"
                >
                  {createLegacyMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
                  ) : (
                    <><Receipt className="h-4 w-4" /> Create Legacy Receipt</>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Receipt Date Dialog */}
      <Dialog open={!!editDateDialog} onOpenChange={(open) => {
        if (!open) {
          setEditDateDialog(null);
          setEditReceiptDate("");
        }
      }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Edit Receipt Date
            </DialogTitle>
            <DialogDescription>
              Update <strong>{editDateDialog?.invoiceCode}</strong> for <strong>{editDateDialog?.clientName}</strong>. The receipt PDF will be regenerated automatically. Its payment date and financial amounts will not change.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4 py-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!editDateDialog || !editReceiptDate) return;
              updateDateMutation.mutate({ id: editDateDialog.id, receiptDate: editReceiptDate });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="editReceiptDate">Receipt Date</Label>
              <Input
                id="editReceiptDate"
                type="date"
                value={editReceiptDate}
                onChange={(event) => setEditReceiptDate(event.target.value)}
                required
                className="h-10"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditDateDialog(null);
                  setEditReceiptDate("");
                }}
                disabled={updateDateMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateDateMutation.isPending || !editReceiptDate} className="gap-2">
                {updateDateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                Save Date
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Send Receipt by Email Dialog */}
      <Dialog open={!!sendEmailDialog} onOpenChange={() => { setSendEmailDialog(null); setClientEmail(""); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Send Receipt to Client
            </DialogTitle>
            <DialogDescription>
              Send receipt <strong>{sendEmailDialog?.invoiceCode}</strong> for{" "}
              <strong>{sendEmailDialog?.clientName}</strong> by email.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSendEmail} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="clientEmail">Send To <span className="text-red-500">*</span></Label>
              <Select value={clientEmail} onValueChange={setClientEmail}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select recipient..." />
                </SelectTrigger>
                <SelectContent>
                  {RECEIPT_RECIPIENTS.map((email) => (
                    <SelectItem key={email} value={email}>{email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setSendEmailDialog(null); setClientEmail(""); }} disabled={sendEmailMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={sendEmailMutation.isPending || !clientEmail.trim()} className="gap-2">
                {sendEmailMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                ) : (
                  <><Mail className="h-4 w-4" /> Send Receipt</>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm Mark Paid */}
      <AlertDialog open={!!confirmPaid} onOpenChange={() => setConfirmPaid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Receipt as Paid</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark receipt <strong>{confirmPaid?.invoiceCode}</strong> for{" "}
              <strong>{confirmPaid?.clientName}</strong> as paid? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              onClick={() => {
                if (confirmPaid) markPaidMutation.mutate({ id: confirmPaid.id });
              }}
            >
              {markPaidMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mark as Paid"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Receipt Confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Receipt</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete receipt <strong>{confirmDelete?.invoiceCode}</strong> for{" "}
              <strong>{confirmDelete?.clientName}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (confirmDelete) deleteMutation.mutate({ id: confirmDelete.id });
              }}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete Receipt"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
