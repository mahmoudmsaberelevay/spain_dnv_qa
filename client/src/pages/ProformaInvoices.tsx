import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Plus, Download, Search, Receipt, FileText, Calendar, CheckCircle, Loader2, TrendingDown, Mail, ExternalLink,
} from "lucide-react";
import { formatCurrency, formatDate, getStatusBadgeClass } from "@/lib/utils";
import { ClientSearchCombobox } from "@/components/ClientSearchCombobox";
import { usePermissions } from "@/contexts/PermissionsContext";

export default function ProformaInvoices() {
  const { canEdit } = usePermissions();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [confirmPaid, setConfirmPaid] = useState<{ id: number; proformaCode: string; clientName: string } | null>(null);

  // Send-by-email dialog state
  const [sendEmailDialog, setSendEmailDialog] = useState<{ id: number; proformaCode: string; clientName: string } | null>(null);
  const [clientEmail, setClientEmail] = useState("");

  // Fixed list of allowed proforma invoice recipients
  const PROFORMA_INVOICE_RECIPIENTS = [
    "mahmoud.saber@elevay.com",
    "Ziad.elshurafa@elevay.com",
    "Fouad.abdo@elevay.com",
    "kirlos.nabil@elevay.com",
  ];

  // Dialog mode: 'contract' | 'legacy'
  const [proformaMode, setProformaMode] = useState<"contract" | "legacy">("contract");

  // Form state — contract mode
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [amountEur, setAmountEur] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Form state — legacy mode
  const [legacyClientId, setLegacyClientId] = useState<string>("none");
  const [legacyAmountEur, setLegacyAmountEur] = useState<string>("");
  const [legacyAmountEgp, setLegacyAmountEgp] = useState<string>("");
  const [legacyNotes, setLegacyNotes] = useState<string>("");

  const { data: invoices, isLoading } = trpc.contracting.proformaInvoices.list.useQuery();
  const { data: contracts } = trpc.contracting.contracts.list.useQuery();
  const { data: rateInfo } = trpc.contracting.exchangeRate.current.useQuery();
  const utils = trpc.useUtils();

  // Only signed contracts can have proforma invoices
  const signedContracts = contracts?.filter((c) => c.status === "signed") ?? [];

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

  const createMutation = trpc.contracting.proformaInvoices.create.useMutation({
    onSuccess: () => {
      utils.contracting.proformaInvoices.list.invalidate();
      utils.contracting.analytics.stats.invalidate();
      toast.success("Proforma Invoice created successfully!");
      setShowCreateDialog(false);
      setSelectedContractId("");
      setAmountEur("");
      setNotes("");
    },
    onError: (err) => {
      toast.error(`Failed to create proforma invoice: ${err.message}`);
    },
  });

  const createLegacyMutation = trpc.contracting.proformaInvoices.create.useMutation({
    onSuccess: () => {
      utils.contracting.proformaInvoices.list.invalidate();
      toast.success("Legacy proforma invoice created successfully!");
      setShowCreateDialog(false);
      setLegacyClientId("none");
      setLegacyAmountEur("");
      setLegacyAmountEgp("");
      setLegacyNotes("");
    },
    onError: (err) => toast.error(`Failed to create legacy proforma invoice: ${err.message}`),
  });

  const handleLegacySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!legacyClientId || legacyClientId === "none" || !legacyAmountEur) return;
    createLegacyMutation.mutate({
      legacyFinClientId: Number(legacyClientId),
      amountEur: Number(legacyAmountEur),
      legacyAmountEgp: legacyAmountEgp ? Number(legacyAmountEgp) : undefined,
      notes: legacyNotes.trim() || "",
    });
  };

  const markPaidMutation = trpc.contracting.proformaInvoices.markPaid.useMutation({
    onSuccess: () => {
      utils.contracting.proformaInvoices.list.invalidate();
      utils.contracting.analytics.stats.invalidate();
      toast.success("Proforma Invoice marked as paid!");
      setConfirmPaid(null);
    },
    onError: (err) => {
      toast.error(`Failed to mark as paid: ${err.message}`);
      setConfirmPaid(null);
    },
  });

  const sendEmailMutation = trpc.contracting.proformaInvoices.sendByEmail.useMutation({
    onSuccess: (result) => {
      toast.success(result.message ?? "Proforma Invoice sent to client!");
      setSendEmailDialog(null);
      setClientEmail("");
    },
    onError: (err) => {
      toast.error(`Failed to send proforma invoice: ${err.message}`);
    },
  });

  const filtered = invoices?.filter((inv) => {
    const matchesSearch =
      inv.clientName.toLowerCase().includes(search.toLowerCase()) ||
      inv.proformaCode.toLowerCase().includes(search.toLowerCase()) ||
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
      notes: notes.trim(), // required field
    });
  };

  const handleSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendEmailDialog || !clientEmail.trim()) return;
    sendEmailMutation.mutate({
      id: sendEmailDialog.id,
      clientEmail: clientEmail.trim(),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Proforma Invoices</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create and manage payment proforma invoices for signed contracts
          </p>
        </div>
        {canEdit("receipts") && (
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
            size="lg"
            disabled={signedContracts.length === 0}
          >
            <Plus className="h-4 w-4" />
            Create Proforma Invoice
          </Button>
        )}
      </div>

      {signedContracts.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <strong>Note:</strong> Proforma Invoices can only be created for signed contracts. Mark a contract as "Signed" first.
        </div>
      )}

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
            placeholder="Search by client, proforma invoice or contract code..."
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
            <SelectItem value="pending">Unpaid</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Proforma Invoices Table */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Proforma Invoices ({filtered?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading proforma invoices...</div>
          ) : !filtered?.length ? (
            <div className="p-8 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                {search || statusFilter !== "all" ? "No proforma invoices match your filters." : "No proforma invoices yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-6 py-3">Proforma Invoice Code</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Client</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Contract</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Amount (EUR)</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Amount (EGP)</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Date</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Status</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((proforma) => (
                    <tr key={proforma.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm font-medium text-primary">{proforma.proformaCode}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm font-medium">{proforma.clientName}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono text-xs text-muted-foreground">{proforma.contractCode}</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm font-semibold">{formatCurrency(Number(proforma.amountEur), "EUR")}</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm text-muted-foreground">
                          {proforma.amountEgp ? formatCurrency(Number(proforma.amountEgp), "EGP") : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          <span className="text-xs">{formatDate(proforma.createdAt)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <Badge className={`text-xs ${getStatusBadgeClass(proforma.status)}`}>
                          {proforma.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-1">
                          {proforma.pdfUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => window.open(proforma.pdfUrl!, "_blank")}
                              title="Download PDF"
                            >
                              <Download className="h-3.5 w-3.5" />
                              PDF
                            </Button>
                          )}

                          {proforma.pdfUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 gap-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                              onClick={() => {
                                setSendEmailDialog({ id: proforma.id, proformaCode: proforma.proformaCode, clientName: proforma.clientName });
                                setClientEmail("");
                              }}
                              title="Send proforma invoice to client by email"
                            >
                              <Mail className="h-3.5 w-3.5" />
                              Email
                            </Button>
                          )}
                          {proforma.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 gap-1 text-xs text-green-700 hover:text-green-800 hover:bg-green-50"
                              onClick={() => setConfirmPaid({ id: proforma.id, proformaCode: proforma.proformaCode, clientName: proforma.clientName })}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              Mark Paid
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

      {/* Create Proforma Invoice Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) { setProformaMode("contract"); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Create Proforma Invoice
            </DialogTitle>
          </DialogHeader>

          {/* Mode tab switcher */}
          <div className="flex rounded-lg border overflow-hidden text-sm font-medium">
            <button
              type="button"
              onClick={() => setProformaMode("contract")}
              className={`flex-1 py-2 transition-colors ${
                proformaMode === "contract"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              Contract Proforma Invoice
            </button>
            <button
              type="button"
              onClick={() => setProformaMode("legacy")}
              className={`flex-1 py-2 transition-colors ${
                proformaMode === "legacy"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              Legacy Proforma Invoice
            </button>
          </div>

          {/* ── CONTRACT MODE ── */}
          {proformaMode === "contract" && (
            <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
              <p className="text-xs text-muted-foreground">Create a payment proforma invoice for a signed contract.</p>
              <div className="space-y-2">
                <Label>Contract</Label>
                <Select value={selectedContractId} onValueChange={setSelectedContractId} required>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select a signed contract..." />
                  </SelectTrigger>
                  <SelectContent>
                    {signedContracts.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        <span className="font-mono text-xs mr-2">{c.contractCode}</span>
                        {c.clientName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    <span className="text-sm text-blue-800">Equivalent in EGP</span>
                  </div>
                  <span className="font-bold text-blue-900">{formatCurrency(previewEgp, "EGP")}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">Notes <span className="text-red-500">*</span></Label>
                <Input
                  id="notes"
                  placeholder="e.g. First installment, Second payment..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  required
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground">Required — describe the payment context (e.g. "1st installment")</p>
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
                    <><FileText className="h-4 w-4" /> Create Proforma Invoice</>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}

          {/* ── LEGACY MODE ── */}
          {proformaMode === "legacy" && (
            <form onSubmit={handleLegacySubmit} className="space-y-4 py-2">
              <p className="text-xs text-muted-foreground">
                Create a proforma invoice for an existing Finance client. Does not affect contract balance or create duplicate records.
              </p>

              <div className="space-y-2">
                <Label>Client <span className="text-red-500">*</span></Label>
                <ClientSearchCombobox
                  value={legacyClientId}
                  onChange={setLegacyClientId}
                  placeholder="Search by name or client code..."
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
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="legacyNotes">Notes</Label>
                <Input
                  id="legacyNotes"
                  placeholder="e.g. 2nd installment, balance payment..."
                  value={legacyNotes}
                  onChange={(e) => setLegacyNotes(e.target.value)}
                  className="h-10"
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
                    <><Receipt className="h-4 w-4" /> Create Legacy Proforma Invoice</>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Send Proforma Invoice by Email Dialog */}
      <Dialog open={!!sendEmailDialog} onOpenChange={() => { setSendEmailDialog(null); setClientEmail(""); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Send Proforma Invoice to Client
            </DialogTitle>
            <DialogDescription>
              Send proforma invoice <strong>{sendEmailDialog?.proformaCode}</strong> for{" "}
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
                  {PROFORMA_INVOICE_RECIPIENTS.map((email) => (
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
                  <><Mail className="h-4 w-4" /> Send Proforma Invoice</>
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
            <AlertDialogTitle>Mark Proforma Invoice as Paid</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark proforma invoice <strong>{confirmPaid?.proformaCode}</strong> for{" "}
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
    </div>
  );
}
// last updated: 2026-04-15T10:43:58Z
