import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, CreditCard, ExternalLink, Link2, Pencil, Plus, ReceiptText, Trash2 } from "lucide-react";

type PaymentForm = {
  paymentName: string;
  amountEur: string;
  dueDate: string;
  receiptName: string;
  receiptDriveLink: string;
  notes: string;
};

const EMPTY_PAYMENT: PaymentForm = {
  paymentName: "",
  amountEur: "",
  dueDate: "",
  receiptName: "",
  receiptDriveLink: "",
  notes: "",
};

function formatEur(value: number) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(value);
}

function cairoToday() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function statusClasses(status: string) {
  if (status === "paid") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "overdue") return "bg-red-50 text-red-700 border-red-200";
  if (status === "due_today") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

function statusLabel(status: string) {
  if (status === "paid") return "Paid";
  if (status === "overdue") return "Overdue";
  if (status === "due_today") return "Due today";
  return "Upcoming";
}

export function ClientDocumentationPayments({
  clientCaseId,
  contractDriveLink,
  finClientId,
}: {
  clientCaseId: number;
  contractDriveLink?: string | null;
  finClientId?: number | null;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.clientDocs.paymentSchedule.useQuery({ clientCaseId });
  const [showContractDialog, setShowContractDialog] = useState(false);
  const [contractLinkInput, setContractLinkInput] = useState(contractDriveLink ?? "");
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(EMPTY_PAYMENT);
  const [paidPaymentId, setPaidPaymentId] = useState<number | null>(null);
  const [paidForm, setPaidForm] = useState({ paidDate: cairoToday(), receiptName: "", receiptDriveLink: "" });
  const [archivePaymentId, setArchivePaymentId] = useState<number | null>(null);

  const refresh = async () => {
    await utils.clientDocs.paymentSchedule.invalidate({ clientCaseId });
    await utils.clientDocs.get.invalidate({ id: clientCaseId });
  };

  const contractMutation = trpc.clientDocs.setContractDriveLink.useMutation({
    onSuccess: async () => {
      toast.success("Contract Drive link saved");
      setShowContractDialog(false);
      await refresh();
    },
    onError: error => toast.error(error.message),
  });

  const addMutation = trpc.clientDocs.addPayment.useMutation({
    onSuccess: async () => {
      toast.success("Payment added");
      closePaymentDialog();
      await refresh();
    },
    onError: error => toast.error(error.message),
  });

  const updateMutation = trpc.clientDocs.updatePayment.useMutation({
    onSuccess: async () => {
      toast.success("Payment updated");
      closePaymentDialog();
      await refresh();
    },
    onError: error => toast.error(error.message),
  });

  const paidMutation = trpc.clientDocs.markPaymentPaid.useMutation({
    onSuccess: async () => {
      toast.success("Payment marked as paid");
      setPaidPaymentId(null);
      await refresh();
    },
    onError: error => toast.error(error.message),
  });

  const archiveMutation = trpc.clientDocs.archivePayment.useMutation({
    onSuccess: async () => {
      toast.success("Unpaid payment removed from the active schedule");
      setArchivePaymentId(null);
      await refresh();
    },
    onError: error => toast.error(error.message),
  });

  function closePaymentDialog() {
    setShowPaymentDialog(false);
    setEditingPaymentId(null);
    setPaymentForm(EMPTY_PAYMENT);
  }

  function openAddPayment() {
    setEditingPaymentId(null);
    setPaymentForm(EMPTY_PAYMENT);
    setShowPaymentDialog(true);
  }

  function openEditPayment(payment: NonNullable<typeof data>["payments"][number]) {
    setEditingPaymentId(payment.id);
    setPaymentForm({
      paymentName: payment.paymentName,
      amountEur: String(payment.amountEur),
      dueDate: payment.dueDate,
      receiptName: payment.receiptName ?? "",
      receiptDriveLink: payment.receiptDriveLink ?? "",
      notes: payment.notes ?? "",
    });
    setShowPaymentDialog(true);
  }

  function submitPayment() {
    const amountEur = Number(paymentForm.amountEur);
    if (!paymentForm.paymentName.trim() || !paymentForm.dueDate || !Number.isFinite(amountEur) || amountEur <= 0) {
      toast.error("Payment name, positive EUR amount, and due date are required");
      return;
    }
    const input = {
      clientCaseId,
      paymentName: paymentForm.paymentName.trim(),
      amountEur,
      dueDate: paymentForm.dueDate,
      receiptName: paymentForm.receiptName.trim() || null,
      receiptDriveLink: paymentForm.receiptDriveLink.trim() || null,
      notes: paymentForm.notes.trim() || null,
    };
    if (editingPaymentId) updateMutation.mutate({ ...input, id: editingPaymentId });
    else addMutation.mutate(input);
  }

  const summary = data?.summary;
  const payments = data?.payments ?? [];

  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 pt-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#1e3a5f]" />
            <h2 className="text-base font-semibold text-gray-900">Contract & Payments</h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">Documentation schedule in EUR. Official accounting remains in the Financial module.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {contractDriveLink && (
            <a href={contractDriveLink} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5 border-[#1e3a5f]/30 text-[#1e3a5f]">
                <ExternalLink className="w-3.5 h-3.5" /> Open Contract
              </Button>
            </a>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-gray-300 text-gray-700"
            onClick={() => {
              setContractLinkInput(contractDriveLink ?? "");
              setShowContractDialog(true);
            }}
          >
            <Link2 className="w-3.5 h-3.5" /> {contractDriveLink ? "Edit Contract Link" : "Add Contract Link"}
          </Button>
          <Button size="sm" className="gap-1.5 bg-[#1e3a5f] hover:bg-[#16304f] text-white" onClick={openAddPayment}>
            <Plus className="w-3.5 h-3.5" /> Add Payment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 px-4 pt-4">
        {[
          { label: "Contract Value", value: formatEur(summary?.contractValueEur ?? 0), tone: "text-[#1e3a5f]" },
          { label: "Paid", value: formatEur(summary?.paidTotalEur ?? 0), tone: "text-emerald-700" },
          { label: "Remaining", value: formatEur(summary?.remainingBalanceEur ?? 0), tone: "text-gray-900" },
          { label: "Due / Overdue", value: formatEur(summary?.dueTotalEur ?? 0), tone: (summary?.dueTotalEur ?? 0) > 0 ? "text-red-700" : "text-gray-900" },
          { label: "Next Payment", value: summary?.nextPayment ? `${summary.nextPayment.paymentName} · ${summary.nextPayment.dueDate}` : "None", tone: "text-gray-900" },
        ].map(item => (
          <div key={item.label} className="bg-gray-50 border border-gray-100 rounded-lg p-3 min-w-0">
            <p className="text-xs text-gray-500">{item.label}</p>
            <p className={`text-sm font-semibold mt-1 truncate ${item.tone}`} title={item.value}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="px-4 pt-4 pb-4">
        {isLoading ? (
          <div className="h-24 bg-gray-50 animate-pulse rounded-lg" />
        ) : payments.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center">
            <ReceiptText className="w-8 h-8 text-gray-300 mx-auto" />
            <p className="text-sm font-medium text-gray-700 mt-2">No payment schedule yet</p>
            <p className="text-xs text-gray-500 mt-1">Legacy clients remain unchanged. Add the first installment when ready.</p>
            <Button size="sm" className="mt-3 bg-[#1e3a5f] hover:bg-[#16304f] text-white" onClick={openAddPayment}>Add Payment</Button>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left font-medium px-3 py-2.5">Payment</th>
                  <th className="text-right font-medium px-3 py-2.5">Amount</th>
                  <th className="text-left font-medium px-3 py-2.5">Due Date</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                  <th className="text-left font-medium px-3 py-2.5">Receipt</th>
                  <th className="text-right font-medium px-3 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(payment => (
                  <tr key={payment.id} className="border-t border-gray-100">
                    <td className="px-3 py-3">
                      <p className="font-medium text-gray-900">{payment.paymentName}</p>
                      {payment.notes && <p className="text-xs text-gray-400 mt-0.5 max-w-[240px] truncate" title={payment.notes}>{payment.notes}</p>}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-gray-900">{formatEur(payment.amountEur)}</td>
                    <td className="px-3 py-3 text-gray-700">
                      <span className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-gray-400" /> {payment.dueDate}</span>
                      {payment.paidDate && <span className="text-xs text-emerald-600">Paid {payment.paidDate}</span>}
                    </td>
                    <td className="px-3 py-3"><span className={`text-xs px-2 py-1 rounded-full border font-medium ${statusClasses(payment.status)}`}>{statusLabel(payment.status)}</span></td>
                    <td className="px-3 py-3">
                      {payment.receiptDriveLink ? (
                        <a href={payment.receiptDriveLink} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1e3a5f] underline flex items-center gap-1 max-w-[180px]">
                          <ReceiptText className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{payment.receiptName || "Open Receipt"}</span>
                        </a>
                      ) : <span className="text-xs text-gray-400">No receipt link</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {!payment.paidDate && (
                          <Button variant="outline" size="sm" className="h-8 text-xs border-emerald-200 text-emerald-700" onClick={() => {
                            setPaidPaymentId(payment.id);
                            setPaidForm({ paidDate: cairoToday(), receiptName: payment.receiptName ?? payment.paymentName, receiptDriveLink: payment.receiptDriveLink ?? "" });
                          }}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Paid
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-600" onClick={() => openEditPayment(payment)} aria-label={`Edit ${payment.paymentName}`}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 disabled:text-gray-300"
                          disabled={Boolean(payment.paidDate || payment.receiptDriveLink)}
                          onClick={() => setArchivePaymentId(payment.id)}
                          aria-label={`Remove ${payment.paymentName}`}
                          title={payment.paidDate || payment.receiptDriveLink ? "Paid or receipt-linked history cannot be removed" : "Remove unpaid payment"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showContractDialog} onOpenChange={setShowContractDialog}>
        <DialogContent className="bg-white text-gray-900 border-gray-200 max-w-lg">
          <DialogHeader><DialogTitle>Contract Google Drive Link</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5"><Label>Contract Link</Label><Input type="url" placeholder="https://drive.google.com/..." value={contractLinkInput} onChange={event => setContractLinkInput(event.target.value)} /></div>
            <Button className="w-full bg-[#1e3a5f] hover:bg-[#16304f] text-white" disabled={!contractLinkInput.trim() || contractMutation.isPending} onClick={() => contractMutation.mutate({ id: clientCaseId, contractDriveLink: contractLinkInput.trim(), finClientId: finClientId ?? null })}>{contractMutation.isPending ? "Saving..." : "Save Contract Link"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPaymentDialog} onOpenChange={open => open ? setShowPaymentDialog(true) : closePaymentDialog()}>
        <DialogContent className="bg-white text-gray-900 border-gray-200 max-w-xl">
          <DialogHeader><DialogTitle>{editingPaymentId ? "Edit Payment" : "Add Payment"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5 md:col-span-2"><Label>Payment Name</Label><Input value={paymentForm.paymentName} onChange={event => setPaymentForm(current => ({ ...current, paymentName: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Amount (EUR)</Label><Input type="number" min="0.01" step="0.01" value={paymentForm.amountEur} onChange={event => setPaymentForm(current => ({ ...current, amountEur: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" value={paymentForm.dueDate} onChange={event => setPaymentForm(current => ({ ...current, dueDate: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Receipt Name (Optional)</Label><Input value={paymentForm.receiptName} onChange={event => setPaymentForm(current => ({ ...current, receiptName: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Receipt Drive Link (Optional)</Label><Input type="url" placeholder="https://drive.google.com/..." value={paymentForm.receiptDriveLink} onChange={event => setPaymentForm(current => ({ ...current, receiptDriveLink: event.target.value }))} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Notes (Optional)</Label><Textarea value={paymentForm.notes} onChange={event => setPaymentForm(current => ({ ...current, notes: event.target.value }))} /></div>
            </div>
            <Button className="w-full bg-[#1e3a5f] hover:bg-[#16304f] text-white" disabled={addMutation.isPending || updateMutation.isPending} onClick={submitPayment}>{addMutation.isPending || updateMutation.isPending ? "Saving..." : editingPaymentId ? "Save Changes" : "Add Payment"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={paidPaymentId !== null} onOpenChange={open => !open && setPaidPaymentId(null)}>
        <DialogContent className="bg-white text-gray-900 border-gray-200 max-w-lg">
          <DialogHeader><DialogTitle>Mark Payment as Paid</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5"><Label>Paid Date</Label><Input type="date" value={paidForm.paidDate} onChange={event => setPaidForm(current => ({ ...current, paidDate: event.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Receipt Name (Optional)</Label><Input value={paidForm.receiptName} onChange={event => setPaidForm(current => ({ ...current, receiptName: event.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Receipt Drive Link (Optional)</Label><Input type="url" placeholder="https://drive.google.com/..." value={paidForm.receiptDriveLink} onChange={event => setPaidForm(current => ({ ...current, receiptDriveLink: event.target.value }))} /></div>
            <p className="text-xs text-gray-500">Paid history is protected from removal. This schedule does not create a Financial-module transaction.</p>
            <Button className="w-full bg-emerald-700 hover:bg-emerald-800 text-white" disabled={!paidForm.paidDate || paidMutation.isPending} onClick={() => paidPaymentId && paidMutation.mutate({ id: paidPaymentId, clientCaseId, paidDate: paidForm.paidDate, receiptName: paidForm.receiptName.trim() || null, receiptDriveLink: paidForm.receiptDriveLink.trim() || null })}>{paidMutation.isPending ? "Saving..." : "Confirm Paid"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={archivePaymentId !== null} onOpenChange={open => !open && setArchivePaymentId(null)}>
        <DialogContent className="bg-white text-gray-900 border-gray-200 max-w-md">
          <DialogHeader><DialogTitle>Remove Payment?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">This unpaid planning item will be archived. Paid or receipt-linked history cannot be removed.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setArchivePaymentId(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={archiveMutation.isPending} onClick={() => archivePaymentId && archiveMutation.mutate({ id: archivePaymentId, clientCaseId })}>{archiveMutation.isPending ? "Removing..." : "Remove"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
