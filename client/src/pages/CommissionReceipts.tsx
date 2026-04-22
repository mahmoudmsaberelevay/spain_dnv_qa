import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Download, CheckCircle, Pencil, X } from "lucide-react";

const COMMISSION_FOR_OPTIONS = [
  "Paralegal First", "Paralegal Second", "Paralegal Third",
  "Consultant First", "Consultant Second", "Consultant Third",
  "Qualifier", "Qualifier TL", "Operation Manager", "Operation TL", "Country Manager",
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getCurrentMonth() {
  const d = new Date();
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

interface CommissionItem {
  clientId: number;
  clientName: string;
  commissionFor: string;
  amountEur: number;
}

interface ReceiptWithItems {
  id: number;
  employeeId: number;
  employeeName: string;
  forMonth: string;
  eurToEgpRate: string;
  totalAmountEur: string;
  totalAmountEgp: string;
  receiptDate: Date | string;
  status: "draft" | "paid";
  items: {
    id: number;
    receiptId: number;
    clientId: number;
    clientName: string;
    clientCode: string;
    commissionFor: string;
    amountEur: string;
    amountEgp: string;
    linkedTransactionId: number | null;
  }[];
}

export default function CommissionReceipts() {
  const { data: receipts = [], refetch } = trpc.financial.commissionReceipts.list.useQuery();
  const { data: employees = [] } = trpc.financial.employees.list.useQuery();
  const { data: clients = [] } = trpc.financial.clients.list.useQuery();

  const createMutation = trpc.financial.commissionReceipts.create.useMutation({
    onSuccess: () => { toast.success("Receipt created"); refetch(); setShowCreate(false); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.financial.commissionReceipts.update.useMutation({
    onSuccess: () => { toast.success("Receipt updated"); refetch(); setEditReceipt(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.financial.commissionReceipts.delete.useMutation({
    onSuccess: () => { toast.success("Receipt deleted"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const markPaidMutation = trpc.financial.commissionReceipts.markAsPaid.useMutation({
    onSuccess: () => { toast.success("Marked as paid — expense entries created"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [editReceipt, setEditReceipt] = useState<ReceiptWithItems | null>(null);
  const [pdfReceipt, setPdfReceipt] = useState<ReceiptWithItems | null>(null);

  // Form state
  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [forMonth, setForMonth] = useState(getCurrentMonth());
  const [eurToEgpRate, setEurToEgpRate] = useState<number | "">("");
  const [items, setItems] = useState<CommissionItem[]>([{ clientId: 0, clientName: "", commissionFor: "", amountEur: 0 }]);
  const [clientSearch, setClientSearch] = useState<string[]>([""]);

  function resetForm() {
    setEmployeeId("");
    setForMonth(getCurrentMonth());
    setEurToEgpRate("");
    setItems([{ clientId: 0, clientName: "", commissionFor: "", amountEur: 0 }]);
    setClientSearch([""]);
  }

  function addItem() {
    setItems(prev => [...prev, { clientId: 0, clientName: "", commissionFor: "", amountEur: 0 }]);
    setClientSearch(prev => [...prev, ""]);
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setClientSearch(prev => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof CommissionItem, value: string | number) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  const totalEur = useMemo(() => items.reduce((s, i) => s + (Number(i.amountEur) || 0), 0), [items]);
  const totalEgp = useMemo(() => totalEur * (Number(eurToEgpRate) || 0), [totalEur, eurToEgpRate]);

  function handleCreate() {
    if (!employeeId) return toast.error("Select an employee");
    if (!eurToEgpRate || Number(eurToEgpRate) <= 0) return toast.error("Enter EUR to EGP rate");
    const validItems = items.filter(i => i.clientId && i.commissionFor && i.amountEur > 0);
    if (validItems.length === 0) return toast.error("Add at least one valid client item");
    createMutation.mutate({
      employeeId: Number(employeeId),
      forMonth,
      eurToEgpRate: Number(eurToEgpRate),
      items: validItems,
    });
  }

  function openEdit(r: ReceiptWithItems) {
    setEditReceipt(r);
    setEmployeeId(r.employeeId);
    setForMonth(r.forMonth);
    setEurToEgpRate(Number(r.eurToEgpRate));
    setItems(r.items.map(i => ({
      clientId: i.clientId,
      clientName: i.clientName,
      commissionFor: i.commissionFor,
      amountEur: Number(i.amountEur),
    })));
    setClientSearch(r.items.map(i => `${i.clientCode ? i.clientCode + ' — ' : ''}${i.clientName}`));
  }

  function handleUpdate() {
    if (!editReceipt) return;
    if (!eurToEgpRate || Number(eurToEgpRate) <= 0) return toast.error("Enter EUR to EGP rate");
    const validItems = items.filter(i => i.clientId && i.commissionFor && i.amountEur > 0);
    if (validItems.length === 0) return toast.error("Add at least one valid client item");
    updateMutation.mutate({
      id: editReceipt.id,
      employeeId: Number(employeeId) || undefined,
      forMonth,
      eurToEgpRate: Number(eurToEgpRate),
      items: validItems,
    });
  }

  // PDF generation
  function generatePdf(r: ReceiptWithItems) {
    const rate = Number(r.eurToEgpRate);
    const rows = r.items.map(item => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;"><span style="font-family:monospace;font-size:11px;color:#6b7280;margin-right:6px;">${(item as any).clientCode || ''}</span>${item.clientName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${item.commissionFor}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">€${Number(item.amountEur).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">EGP ${Number(item.amountEgp).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Commission Receipt</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; color: #1a1a2e; }
    .header { background: #1a1a6e; color: white; padding: 28px 40px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { margin: 0; font-size: 28px; letter-spacing: 2px; }
    .header .meta { text-align: right; font-size: 13px; }
    .body { padding: 32px 40px; }
    .for-block { margin-bottom: 24px; }
    .for-block .label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; }
    .for-block .value { font-size: 20px; font-weight: bold; color: #1a1a6e; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    thead tr { background: #1a1a6e; color: white; }
    thead th { padding: 10px 12px; text-align: left; font-size: 13px; }
    thead th:nth-child(3), thead th:nth-child(4) { text-align: right; }
    tbody tr:nth-child(even) { background: #f8f9ff; }
    .total-row td { font-weight: bold; background: #1a1a6e; color: white; padding: 10px 12px; }
    .total-row td:nth-child(3), .total-row td:nth-child(4) { text-align: right; }
    .footer { margin-top: 40px; font-size: 11px; color: #9ca3af; text-align: center; }
    .rate-note { margin-top: 12px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="header">
    <h1>ELEVAY</h1>
    <div class="meta">
      <div>Commission Receipt</div>
      <div style="margin-top:4px;">Date: ${new Date().toLocaleDateString("en-GB")}</div>
    </div>
  </div>
  <div class="body">
    <div class="for-block">
      <div class="label">Commission Receipt For</div>
      <div class="value">${r.employeeName}</div>
      <div style="margin-top:4px;color:#6b7280;font-size:13px;">Month: ${r.forMonth}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Client Name</th>
          <th>Commission For</th>
          <th>Amount (EUR)</th>
          <th>Amount (EGP)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="total-row">
          <td colspan="2">TOTAL</td>
          <td>€${Number(r.totalAmountEur).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
          <td>EGP ${Number(r.totalAmountEgp).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
        </tr>
      </tbody>
    </table>
    <div class="rate-note">Exchange Rate: 1 EUR = ${rate.toFixed(2)} EGP</div>
    <div class="footer">ELEVAY — Citizenship & Residency Consultation</div>
  </div>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) return toast.error("Pop-up blocked. Please allow pop-ups.");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  const isFormOpen = showCreate || !!editReceipt;
  const formTitle = editReceipt ? "Edit Commission Receipt" : "New Commission Receipt";

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Commission Receipts</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and manage employee commission receipts</p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreate(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> New Receipt
        </Button>
      </div>

      {/* Receipts Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium">Employee</th>
              <th className="text-left px-4 py-3 font-medium">Month</th>
              <th className="text-left px-4 py-3 font-medium">Clients</th>
              <th className="text-right px-4 py-3 font-medium">Total EUR</th>
              <th className="text-right px-4 py-3 font-medium">Total EGP</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(receipts as ReceiptWithItems[]).length === 0 && (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No commission receipts yet</td></tr>
            )}
            {(receipts as ReceiptWithItems[]).map(r => (
              <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{r.employeeName}</td>
                <td className="px-4 py-3">{r.forMonth}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.items.length} client{r.items.length !== 1 ? "s" : ""}</td>
                <td className="px-4 py-3 text-right">€{Number(r.totalAmountEur).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right">EGP {Number(r.totalAmountEgp).toLocaleString("en-US", { minimumFractionDigits: 0 })}</td>
                <td className="px-4 py-3">
                  <Badge variant={r.status === "paid" ? "default" : "secondary"} className={r.status === "paid" ? "bg-green-600 text-white" : ""}>
                    {r.status === "paid" ? "Paid" : "Draft"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => generatePdf(r)} title="Download PDF">
                      <Download className="w-4 h-4" />
                    </Button>
                    <>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)} title="Edit">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {r.status === "draft" && (
                          <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-700"
                            onClick={() => { if (confirm("Mark as paid? This will create expense entries for each client.")) markPaidMutation.mutate({ id: r.id }); }}
                            title="Mark as Paid">
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600"
                          onClick={() => { if (confirm("Delete this receipt?")) deleteMutation.mutate({ id: r.id }); }}
                          title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) { setShowCreate(false); setEditReceipt(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formTitle}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Employee + Month */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Employee</Label>
                <Select value={String(employeeId)} onValueChange={v => setEmployeeId(Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Select employee..." /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e: any) => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Month</Label>
                <Input value={forMonth} onChange={e => setForMonth(e.target.value)} placeholder="e.g. April 2026" />
              </div>
            </div>

            {/* EUR to EGP Rate */}
            <div className="space-y-1">
              <Label>EUR to EGP Exchange Rate</Label>
              <Input
                type="number"
                value={eurToEgpRate}
                onChange={e => setEurToEgpRate(e.target.value ? Number(e.target.value) : "")}
                placeholder="e.g. 63.00"
                className="max-w-xs"
              />
            </div>

            {/* Client Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Client Commissions</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem} className="gap-1">
                  <Plus className="w-3 h-3" /> Add Client
                </Button>
              </div>

              {/* Header */}
              <div className="grid grid-cols-[2fr_2fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground px-1">
                <span>Client Name</span>
                <span>Commission For</span>
                <span>Amount (EUR)</span>
                <span></span>
              </div>

              {items.map((item, idx) => {
                const filteredClients = (clients as any[]).filter(c =>
                  !clientSearch[idx] || c.name?.toLowerCase().includes(clientSearch[idx].toLowerCase()) ||
                  c.clientCode?.toLowerCase().includes(clientSearch[idx].toLowerCase())
                ).slice(0, 20);

                return (
                  <div key={idx} className="grid grid-cols-[2fr_2fr_1fr_auto] gap-2 items-start">
                    {/* Client search */}
                    <div className="relative">
                      <Input
                        value={clientSearch[idx]}
                        onChange={e => {
                          const val = e.target.value;
                          setClientSearch(prev => prev.map((s, i) => i === idx ? val : s));
                          if (!val) updateItem(idx, "clientId", 0);
                        }}
                        placeholder="Search client..."
                      />
                      {clientSearch[idx] && item.clientId === 0 && filteredClients.length > 0 && (
                        <div className="absolute z-50 top-full left-0 right-0 bg-popover border rounded-md shadow-lg max-h-40 overflow-y-auto">
                          {filteredClients.map((c: any) => (
                            <button
                              key={c.id}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                              onClick={() => {
                                updateItem(idx, "clientId", c.id);
                                updateItem(idx, "clientName", c.name);
                                setClientSearch(prev => prev.map((s, i) => i === idx ? `${c.clientCode ? c.clientCode + ' — ' : ''}${c.name}` : s));
                              }}
                            >
                              <span className="font-mono text-xs text-muted-foreground mr-2">{c.clientCode}</span>
                              {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Commission For */}
                    <Select value={item.commissionFor} onValueChange={v => updateItem(idx, "commissionFor", v)}>
                      <SelectTrigger><SelectValue placeholder="Select role..." /></SelectTrigger>
                      <SelectContent>
                        {COMMISSION_FOR_OPTIONS.map(opt => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Amount EUR */}
                    <Input
                      type="number"
                      value={item.amountEur || ""}
                      onChange={e => updateItem(idx, "amountEur", Number(e.target.value))}
                      placeholder="0.00"
                    />

                    {/* Remove */}
                    <Button type="button" size="sm" variant="ghost" className="text-red-500 mt-0.5"
                      onClick={() => removeItem(idx)} disabled={items.length === 1}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Totals preview */}
            {eurToEgpRate && totalEur > 0 && (
              <div className="rounded-lg bg-muted/50 border p-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Total EUR</div>
                  <div className="text-lg font-bold text-foreground">€{totalEur.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total EGP (@ {eurToEgpRate})</div>
                  <div className="text-lg font-bold text-foreground">EGP {totalEgp.toLocaleString("en-US", { minimumFractionDigits: 0 })}</div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowCreate(false); setEditReceipt(null); }}>Cancel</Button>
              <Button
                onClick={editReceipt ? handleUpdate : handleCreate}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editReceipt ? "Save Changes" : "Create Receipt"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
