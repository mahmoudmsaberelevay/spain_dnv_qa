/**
 * FinSettlement — After Settlement Payment (Dubai Afterlanding Services)
 *
 * Tracks post-settlement payments in AED.
 * EUR = AED / 4 (fixed formula per business rule).
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ClientSearchCombobox } from "@/components/ClientSearchCombobox";
import { format, parseISO } from "date-fns";
import { CalendarIcon, Plus, Trash2, Download, Upload, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Seed data from Notion (14 records, client names unknown) ────────────────
const NOTION_SEED = [
  { amountAed: 4300.00,  serviceDate: "2025-12-15" },
  { amountAed: 4300.00,  serviceDate: "2026-01-13" },
  { amountAed: 4337.00,  serviceDate: "2026-02-05" },
  { amountAed: 4374.00,  serviceDate: "2026-02-10" },
  { amountAed: 6106.00,  serviceDate: "2026-02-10" },
  { amountAed: 7200.00,  serviceDate: "2026-02-11" },
  { amountAed: 6530.00,  serviceDate: "2026-02-16" },
  { amountAed: 5190.00,  serviceDate: "2026-02-22" },
  { amountAed: 6058.00,  serviceDate: "2026-02-22" },
  { amountAed: 5190.00,  serviceDate: "2026-02-24" },
  { amountAed: 4330.00,  serviceDate: "2026-03-03" },
  { amountAed: 5917.00,  serviceDate: "2026-03-17" },
  { amountAed: 6007.00,  serviceDate: "2026-04-01" },
  { amountAed: 5005.00,  serviceDate: "2026-04-09" },
];

// ─── Row type (minimal) ───────────────────────────────────────────────────────
type SettlementRow = {
  id: number;
  clientName: string | null;
  finClientId: number | null;
  amountAed: string;
  amountEur: string;
  serviceDate: Date | string;
  notes: string | null;
};

// ─── Shared form state type ───────────────────────────────────────────────────
type FormState = {
  selectedClientId: string;
  manualClientName: string;
  amountAed: string;
  serviceDate: Date | undefined;
  notes: string;
  calOpen: boolean;
};

const emptyForm = (): FormState => ({
  selectedClientId: "",
  manualClientName: "",
  amountAed: "",
  serviceDate: new Date(),
  notes: "",
  calOpen: false,
});

// ─── Sub-component: Payment Form (shared by Add and Edit dialogs) ─────────────
function PaymentForm({
  form,
  setForm,
  amountEur,
  onSubmit,
  onCancel,
  isPending,
  submitLabel,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  amountEur: string;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  return (
    <div className="space-y-4 pt-2">
      {/* Client */}
      <div className="space-y-1.5">
        <Label>Client Name</Label>
        <ClientSearchCombobox
          value={form.selectedClientId}
          onChange={(val) => {
            setForm(f => ({ ...f, selectedClientId: val, manualClientName: val ? "" : f.manualClientName }));
          }}
          placeholder="Search Finance client DB..."
        />
        {!form.selectedClientId && (
          <Input
            placeholder="Or type name manually..."
            value={form.manualClientName}
            onChange={e => setForm(f => ({ ...f, manualClientName: e.target.value }))}
            className="mt-1"
          />
        )}
      </div>

      {/* Amount AED */}
      <div className="space-y-1.5">
        <Label>Amount AED <span className="text-destructive">*</span></Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder="e.g. 5190.00"
          value={form.amountAed}
          onChange={e => setForm(f => ({ ...f, amountAed: e.target.value }))}
        />
      </div>

      {/* Amount EUR (auto) */}
      <div className="space-y-1.5">
        <Label>Amount EUR <span className="text-muted-foreground text-xs">(AED ÷ 4, auto)</span></Label>
        <Input
          readOnly
          value={amountEur ? `€${amountEur}` : ""}
          placeholder="Auto-calculated"
          className="cursor-not-allowed text-emerald-600 dark:text-emerald-400"
        />
      </div>

      {/* Service Date */}
      <div className="space-y-1.5">
        <Label>Service Date <span className="text-destructive">*</span></Label>
        <Popover open={form.calOpen} onOpenChange={open => setForm(f => ({ ...f, calOpen: open }))}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !form.serviceDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {form.serviceDate ? format(form.serviceDate, "dd MMM yyyy") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={form.serviceDate}
              onSelect={d => setForm(f => ({ ...f, serviceDate: d, calOpen: false }))}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Input
          placeholder="Optional notes..."
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={onSubmit} disabled={isPending}>
          {isPending ? "Saving..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FinSettlement() {
  const { canEdit } = usePermissions();
  const canWrite = canEdit("fin_settlement");

  const [search, setSearch] = useState("");
  const [importDone, setImportDone] = useState(false);

  // Add dialog
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(emptyForm());

  // Edit dialog
  const [editRow, setEditRow] = useState<SettlementRow | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm());

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data, refetch, isLoading } = trpc.settlement.list.useQuery({
    search: search || undefined,
    limit: 500,
    offset: 0,
  });

  const rows: SettlementRow[] = data?.rows ?? [];
  const totalAed = data?.totalAed ?? 0;
  const totalEur = data?.totalEur ?? 0;

  // ── Mutations ────────────────────────────────────────────────────────────
  const createMut = trpc.settlement.create.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setAddForm(emptyForm()); toast.success("Payment added"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.settlement.update.useMutation({
    onSuccess: () => { refetch(); setEditRow(null); toast.success("Payment updated"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.settlement.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Payment deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const bulkImportMut = trpc.settlement.bulkImport.useMutation({
    onSuccess: (res) => { refetch(); setImportDone(true); toast.success(`Imported ${res.imported} records from Notion`); },
    onError: (e) => toast.error(e.message),
  });

  // ── Computed EUR values ──────────────────────────────────────────────────
  const addAmountEur = useMemo(() => {
    const n = parseFloat(addForm.amountAed);
    return isNaN(n) || n <= 0 ? "" : (Math.round((n / 4) * 100) / 100).toFixed(2);
  }, [addForm.amountAed]);

  const editAmountEur = useMemo(() => {
    const n = parseFloat(editForm.amountAed);
    return isNaN(n) || n <= 0 ? "" : (Math.round((n / 4) * 100) / 100).toFixed(2);
  }, [editForm.amountAed]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleAddSubmit() {
    const n = parseFloat(addForm.amountAed);
    if (isNaN(n) || n <= 0) { toast.error("Enter a valid AED amount"); return; }
    if (!addForm.serviceDate) { toast.error("Select a date"); return; }
    createMut.mutate({
      clientName: addForm.manualClientName.trim() || undefined,
      finClientId: addForm.selectedClientId ? parseInt(addForm.selectedClientId) : undefined,
      amountAed: n,
      serviceDate: format(addForm.serviceDate, "yyyy-MM-dd"),
      notes: addForm.notes.trim() || undefined,
    });
  }

  function openEdit(row: SettlementRow) {
    const rawDate = row.serviceDate instanceof Date ? row.serviceDate : new Date(String(row.serviceDate));
    setEditForm({
      selectedClientId: row.finClientId ? String(row.finClientId) : "",
      manualClientName: row.clientName ?? "",
      amountAed: Number(row.amountAed).toString(),
      serviceDate: rawDate,
      notes: row.notes ?? "",
      calOpen: false,
    });
    setEditRow(row);
  }

  function handleEditSubmit() {
    if (!editRow) return;
    const n = parseFloat(editForm.amountAed);
    if (isNaN(n) || n <= 0) { toast.error("Enter a valid AED amount"); return; }
    if (!editForm.serviceDate) { toast.error("Select a date"); return; }
    updateMut.mutate({
      id: editRow.id,
      clientName: editForm.manualClientName.trim() || undefined,
      finClientId: editForm.selectedClientId ? parseInt(editForm.selectedClientId) : null,
      amountAed: n,
      serviceDate: format(editForm.serviceDate, "yyyy-MM-dd"),
      notes: editForm.notes.trim() || undefined,
    });
  }

  function handleExportPdf() {
    const rows2 = rows;
    const filterDesc = search ? `Filter: "${search}"` : "All Records";
    const tableRows = rows2.map((r, i) => {
      const dateStr = r.serviceDate instanceof Date
        ? format(r.serviceDate, "dd MMM yyyy")
        : String(r.serviceDate);
      return `<tr>
        <td style="border:1px solid #e5e7eb;padding:6px 8px">${i + 1}</td>
        <td style="border:1px solid #e5e7eb;padding:6px 8px;font-weight:500">${r.clientName ?? "—"}</td>
        <td style="border:1px solid #e5e7eb;padding:6px 8px;text-align:right;color:#d97706">${Number(r.amountAed).toLocaleString("en-US", { minimumFractionDigits: 2 })} AED</td>
        <td style="border:1px solid #e5e7eb;padding:6px 8px;text-align:right;color:#16a34a">€${Number(r.amountEur).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
        <td style="border:1px solid #e5e7eb;padding:6px 8px">${dateStr}</td>
        <td style="border:1px solid #e5e7eb;padding:6px 8px;color:#6b7280">${r.notes ?? ""}</td>
      </tr>`;
    }).join("");
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Elevay — After Settlement Payments</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; color: #111; }
    h1 { color: #1e293b; font-size: 20px; margin-bottom: 4px; }
    .meta { color: #6b7280; font-size: 12px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #1e293b; color: white; }
    thead th { padding: 8px; font-size: 11px; text-align: left; border: 1px solid #334155; }
    thead th:nth-child(3), thead th:nth-child(4) { text-align: right; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tfoot td { border-top: 2px solid #1e293b; font-weight: bold; padding: 8px; font-size: 12px; }
    @media print { body { margin: 10px; } }
  </style>
</head>
<body>
  <h1>Elevay — After Settlement Payments</h1>
  <div class="meta">
    Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} &nbsp;|&nbsp;
    ${filterDesc} &nbsp;|&nbsp; ${rows2.length} records
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Client Name</th>
        <th style="text-align:right">Amount AED</th>
        <th style="text-align:right">Amount EUR</th>
        <th>Service Date</th><th>Notes</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2">Total (${rows2.length} records)</td>
        <td style="text-align:right">${totalAed.toLocaleString("en-US", { minimumFractionDigits: 2 })} AED</td>
        <td style="text-align:right">€${totalEur.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
        <td colspan="2"></td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => { win.print(); }, 500);
    }
  }

  function handleExportCsv() {
    const header = ["#", "Client Name", "Amount AED", "Amount EUR", "Service Date", "Notes"];
    const csvRows = rows.map((r, i) => [
      i + 1,
      r.clientName ?? "",
      Number(r.amountAed).toFixed(2),
      Number(r.amountEur).toFixed(2),
      r.serviceDate instanceof Date ? format(r.serviceDate, "yyyy-MM-dd") : String(r.serviceDate),
      r.notes ?? "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `settlement-payments-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">After Settlement Payment</h1>
        <p className="text-muted-foreground text-sm mt-1">Dubai Afterlanding Services — AED payments (EUR = AED ÷ 4)</p>
      </div>

      {/* Action bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Center: Add button */}
        <div className="flex-1 flex justify-center">
          {canWrite && (
            <Button onClick={() => setShowAdd(true)} className="gap-2 px-6">
              <Plus className="h-4 w-4" />
              Add Payment
            </Button>
          )}
        </div>

        {/* Right: Search + Export + Import */}
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search client..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-52"
          />
          <Button variant="outline" size="sm" onClick={handleExportPdf} className="gap-1">
            <Download className="h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1">
            <Download className="h-4 w-4" />
            CSV
          </Button>
          {canWrite && !importDone && rows.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkImportMut.mutate(NOTION_SEED)}
              disabled={bulkImportMut.isPending}
              className="gap-1"
            >
              <Upload className="h-4 w-4" />
              Import Notion
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Settlement Payments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No records yet.{canWrite ? ' Click "Add Payment" to get started.' : ""}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client Name</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount AED</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount EUR</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Service Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Notes</th>
                  {canWrite && <th className="px-4 py-3 text-center font-medium text-muted-foreground">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const dateStr = row.serviceDate instanceof Date
                    ? format(row.serviceDate, "dd MMM yyyy")
                    : String(row.serviceDate);
                  return (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium">
                        {row.clientName ?? <span className="text-muted-foreground italic">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-amber-600 dark:text-amber-400">
                        AED {Number(row.amountAed).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                        €{Number(row.amountEur).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{dateStr}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{row.notes ?? "—"}</td>
                      {canWrite && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(row)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm("Delete this payment?")) deleteMut.mutate({ id: row.id });
                              }}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td colSpan={2} className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Totals</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-amber-600 dark:text-amber-400">
                    AED {totalAed.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    €{totalEur.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td colSpan={canWrite ? 3 : 2} className="px-4 py-3 text-muted-foreground text-sm">
                    {data?.count ?? rows.length} records
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      {/* ── Add Payment Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Settlement Payment</DialogTitle>
          </DialogHeader>
          <PaymentForm
            form={addForm}
            setForm={setAddForm}
            amountEur={addAmountEur}
            onSubmit={handleAddSubmit}
            onCancel={() => setShowAdd(false)}
            isPending={createMut.isPending}
            submitLabel="Add Payment"
          />
        </DialogContent>
      </Dialog>

      {/* ── Edit Payment Dialog ────────────────────────────────────────────── */}
      <Dialog open={!!editRow} onOpenChange={open => { if (!open) setEditRow(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Settlement Payment</DialogTitle>
          </DialogHeader>
          <PaymentForm
            form={editForm}
            setForm={setEditForm}
            amountEur={editAmountEur}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditRow(null)}
            isPending={updateMut.isPending}
            submitLabel="Save Changes"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
