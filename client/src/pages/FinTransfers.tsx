import { trpc } from "@/lib/trpc";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, ArrowRight, Trash2, Pencil, FileDown, FileSpreadsheet, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import FinFilterBar, { FinFilters } from "@/components/FinFilterBar";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const PAGE_SIZE_OPTIONS = [60, 120, 240, 0]; // 0 = All

export default function FinTransfers() {
  const utils = trpc.useUtils();
  const [filters, setFilters] = useState<FinFilters>({ sortField: "transactionDate", sortDir: "desc" });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(60);

  const queryParams = useMemo(() => ({
    type: "transfer" as const,
    from: filters.from,
    to: filters.to,
    sortField: filters.sortField,
    sortDir: filters.sortDir,
    limit: pageSize > 0 ? pageSize : undefined,
    offset: pageSize > 0 ? page * pageSize : undefined,
  }), [filters, page, pageSize]);

  const { data: transactions, isLoading } = trpc.financial.transactions.list.useQuery(queryParams);
  const { data: totalCount } = trpc.financial.transactions.count.useQuery({ type: "transfer", from: filters.from, to: filters.to });
  const { data: accounts } = trpc.financial.accounts.list.useQuery();

  const createMut = trpc.financial.transactions.createTransfer.useMutation({
    onSuccess: () => {
      utils.financial.transactions.list.invalidate();
      utils.financial.accounts.list.invalidate();
      utils.financial.dashboard.summary.invalidate();
      toast.success("Transfer completed");
      setShowCreate(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkDeleteMut = trpc.financial.transactions.bulkDelete.useMutation({
    onSuccess: (res) => {
      utils.financial.transactions.list.invalidate();
      utils.financial.accounts.list.invalidate();
      utils.financial.dashboard.summary.invalidate();
      toast.success(`${res.deleted} transfer${res.deleted !== 1 ? "s" : ""} deleted`);
      setSelected(new Set());
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.financial.transactions.updateTransaction.useMutation({
    onSuccess: () => {
      utils.financial.transactions.list.invalidate();
      toast.success("Transfer updated");
      setEditTx(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteOneMut = trpc.financial.transactions.deleteOne.useMutation({
    onSuccess: () => {
      utils.financial.transactions.list.invalidate();
      utils.financial.transactions.count.invalidate();
      utils.financial.accounts.list.invalidate();
      utils.financial.dashboard.summary.invalidate();
      toast.success("Transfer deleted");
      setConfirmDeleteOne(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteOne, setConfirmDeleteOne] = useState<number | null>(null);
  const [editTx, setEditTx] = useState<any>(null);
  const [editForm, setEditForm] = useState({ description: "", note: "", transactionDate: "" });
  const [form, setForm] = useState({
    description: "", fromAccountId: "", toAccountId: "", amount: "", exchangeRate: "1", note: "",
    transactionDate: new Date().toISOString().split("T")[0],
  });

  const accountMap = useMemo(() => {
    const m = new Map<number, { name: string; currency: string }>();
    accounts?.forEach(a => m.set(a.id, { name: a.name, currency: a.currency }));
    return m;
  }, [accounts]);

  const fromAcc = form.fromAccountId ? accountMap.get(Number(form.fromAccountId)) : null;
  const toAcc = form.toAccountId ? accountMap.get(Number(form.toAccountId)) : null;
  const isSameCurrency = fromAcc && toAcc && fromAcc.currency === toAcc.currency;
  const creditedAmount = form.amount && form.exchangeRate
    ? Number(form.amount) * Number(form.exchangeRate)
    : null;

  const handleCreate = () => {
    if (!form.description || !form.fromAccountId || !form.toAccountId || !form.amount) {
      toast.error("Please fill all required fields");
      return;
    }
    if (form.fromAccountId === form.toAccountId) {
      toast.error("From and To accounts must be different");
      return;
    }
    if (!form.exchangeRate) {
      toast.error("Rate is required");
      return;
    }
    createMut.mutate({
      description: form.description,
      fromAccountId: Number(form.fromAccountId),
      toAccountId: Number(form.toAccountId),
      amount: Number(form.amount),
      exchangeRate: Number(form.exchangeRate),
      transactionDate: new Date(form.transactionDate),
    });
  };

  const allIds = transactions?.map(t => t.id) ?? [];
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  const totalPages = pageSize > 0 ? Math.ceil((totalCount ?? 0) / pageSize) : 1;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  };

  const toggleOne = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = () => {
    bulkDeleteMut.mutate({ ids: Array.from(selected) });
    setConfirmDelete(false);
  };

  const getExportData = async () => utils.financial.transactions.list.fetch({
    type: "transfer", from: filters.from, to: filters.to, sortField: filters.sortField, sortDir: filters.sortDir,
  });

  const handleExportExcel = async () => {
    try {
      const data = await getExportData();
      const rows = (data ?? []).map(tx => ({
        Date: new Date(tx.transactionDate).toLocaleDateString(),
        Description: tx.description,
        From: tx.fromAccountId ? (accountMap.get(tx.fromAccountId)?.name ?? "") : "",
        To: tx.toAccountId ? (accountMap.get(tx.toAccountId)?.name ?? "") : "",
        Amount: Number(tx.amount),
        Rate: tx.exchangeRate ? Number(tx.exchangeRate) : 1,
        Converted: tx.convertedAmount ? Number(tx.convertedAmount) : Number(tx.amount),
        Note: tx.note ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Transfers");
      XLSX.writeFile(wb, `transfers_${new Date().toISOString().split("T")[0]}.xlsx`);
    } catch (e: any) { toast.error("Export failed: " + e.message); }
  };

  const handleExportPdf = async () => {
    try {
      const data = await getExportData();
      const rows = (data ?? []).map(tx => `<tr>
        <td>${new Date(tx.transactionDate).toLocaleDateString()}</td>
        <td>${tx.description}</td>
        <td>${tx.fromAccountId ? (accountMap.get(tx.fromAccountId)?.name ?? "") : ""}</td>
        <td>${tx.toAccountId ? (accountMap.get(tx.toAccountId)?.name ?? "") : ""}</td>
        <td style="text-align:right">${fmt(Number(tx.amount))}</td>
        <td style="text-align:right">${tx.exchangeRate ? Number(tx.exchangeRate).toFixed(4) : "1"}</td>
        <td style="text-align:right">${tx.convertedAmount ? fmt(Number(tx.convertedAmount)) : fmt(Number(tx.amount))}</td>
      </tr>`).join("");
      const html = `<html><head><title>Transfers Report</title><style>
        body{font-family:Arial,sans-serif;font-size:11px;padding:20px}h2{margin-bottom:4px}p{margin:2px 0 12px;color:#666}
        table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:5px 8px;text-align:left}
        th{background:#f5f5f5;font-weight:600}@media print{body{padding:0}}</style></head><body>
        <h2>Transfers Report</h2><p>Generated: ${new Date().toLocaleString()}</p>
        <table><thead><tr><th>Date</th><th>Description</th><th>From</th><th>To</th><th>Amount</th><th>Rate</th><th>Converted</th></tr></thead>
        <tbody>${rows}</tbody></table></body></html>`;
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
    } catch (e: any) { toast.error("Export failed: " + e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transfers</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-1.5"><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} className="gap-1.5"><FileDown className="h-4 w-4" /> PDF</Button>
          {selected.size > 0 && (
            <Button variant="destructive" onClick={() => setConfirmDelete(true)} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Delete Selected ({selected.size})
            </Button>
          )}
          <Button onClick={() => { setForm({ description: "", fromAccountId: "", toAccountId: "", amount: "", exchangeRate: "1", note: "", transactionDate: new Date().toISOString().split("T")[0] }); setShowCreate(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Transfer
          </Button>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base mb-3">Transfer History</CardTitle>
          <FinFilterBar
            filters={filters}
            onChange={(f) => { setFilters(f); setPage(0); }}
            show={{ dateRange: true, sort: true }}
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !transactions?.length ? (
            <div className="text-center py-8 text-muted-foreground">No transfers yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 w-10">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                    </th>
                    <th className="text-left py-2 font-medium">Date</th>
                    <th className="text-left py-2 font-medium">Description</th>
                    <th className="text-left py-2 font-medium">From</th>
                    <th className="text-center py-2 font-medium"></th>
                    <th className="text-left py-2 font-medium">To</th>
                    <th className="text-right py-2 font-medium">Amount</th>
                    <th className="text-right py-2 font-medium">Rate</th>
                    <th className="text-right py-2 font-medium">Converted</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const from = tx.fromAccountId ? accountMap.get(tx.fromAccountId) : null;
                    const to = tx.toAccountId ? accountMap.get(tx.toAccountId) : null;
                    return (
                      <tr key={tx.id} className={`border-b border-muted/50 hover:bg-muted/30 ${selected.has(tx.id) ? "bg-red-50/30" : ""}`}>
                        <td className="py-2 pl-1">
                          <Checkbox checked={selected.has(tx.id)} onCheckedChange={() => toggleOne(tx.id)} aria-label={`Select ${tx.description}`} />
                        </td>
                        <td className="py-2">{new Date(tx.transactionDate).toLocaleDateString()}</td>
                        <td className="py-2 font-medium">{tx.description}</td>
                        <td className="py-2 text-red-600">{from?.name ?? "—"}</td>
                        <td className="py-2 text-center"><ArrowRight className="h-3.5 w-3.5 inline text-muted-foreground" /></td>
                        <td className="py-2 text-green-600">{to?.name ?? "—"}</td>
                        <td className="py-2 text-right font-semibold">{from?.currency ?? ""} {fmt(Number(tx.amount))}</td>
                        <td className="py-2 text-right text-muted-foreground">{tx.exchangeRate ? Number(tx.exchangeRate).toFixed(4) : "—"}</td>
                        <td className="py-2 text-right">{tx.convertedAmount ? `${to?.currency ?? ""} ${fmt(Number(tx.convertedAmount))}` : "—"}</td>
                        <td className="py-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => {
                            setEditTx(tx);
                            setEditForm({
                              description: tx.description,
                              note: tx.note ?? "",
                              transactionDate: new Date(tx.transactionDate).toISOString().split("T")[0],
                            });
                          }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setConfirmDeleteOne(tx.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination + Page Size */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
                <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{PAGE_SIZE_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n === 0 ? "All" : n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <span>{pageSize > 0 ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, totalCount ?? 0)} of ${totalCount ?? 0}` : `${totalCount ?? 0} records`}</span>
            {pageSize > 0 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="px-2">Page {page + 1} of {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Confirm Delete One */}
      <Dialog open={confirmDeleteOne !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteOne(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Transfer?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">This will permanently delete this transfer and reverse its effect on both account balances. This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteOne(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDeleteOne !== null && deleteOneMut.mutate({ id: confirmDeleteOne })} disabled={deleteOneMut.isPending}>
              {deleteOneMut.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete {selected.size} Transfer{selected.size !== 1 ? "s" : ""}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">This action cannot be undone. The selected transfers will be permanently deleted.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleteMut.isPending}>
              {bulkDeleteMut.isPending ? "Deleting..." : `Delete ${selected.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Transfer Dialog */}
      <Dialog open={!!editTx} onOpenChange={() => setEditTx(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Transfer</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Date</label>
              <Input type="date" value={editForm.transactionDate} onChange={e => setEditForm(f => ({ ...f, transactionDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Note</label>
              <Textarea value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTx(null)}>Cancel</Button>
            <Button onClick={() => updateMut.mutate({
              id: editTx.id,
              description: editForm.description || undefined,
              note: editForm.note || undefined,
              transactionDate: editForm.transactionDate ? new Date(editForm.transactionDate) : undefined,
            })} disabled={updateMut.isPending}>
              {updateMut.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Transfer Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Transfer</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Description *</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Transfer to USD account" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">From Account *</label>
                <Select value={form.fromAccountId} onValueChange={v => setForm(f => ({ ...f, fromAccountId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts?.filter(a => a.isActive).map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name} ({a.currency})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">To Account *</label>
                <Select value={form.toAccountId} onValueChange={v => setForm(f => ({ ...f, toAccountId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts?.filter(a => a.isActive).map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name} ({a.currency})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Amount * {fromAcc ? `(${fromAcc.currency})` : ""}</label>
                <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label className="text-sm font-medium">Date *</label>
                <Input type="date" value={form.transactionDate} onChange={e => setForm(f => ({ ...f, transactionDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">
                Rate *
                {fromAcc && toAcc && !isSameCurrency && (
                  <span className="text-muted-foreground font-normal ml-1">({fromAcc.currency} → {toAcc.currency})</span>
                )}
                {isSameCurrency && (
                  <span className="text-muted-foreground font-normal ml-1">(same currency — use 1)</span>
                )}
              </label>
              <Input
                type="number"
                step="0.0001"
                min="0.0001"
                value={form.exchangeRate}
                onChange={e => setForm(f => ({ ...f, exchangeRate: e.target.value }))}
                placeholder="1"
              />
              {creditedAmount !== null && fromAcc && toAcc && (
                <p className="text-xs text-emerald-600 font-medium mt-1">
                  Deduct: {fromAcc.currency} {fmt(Number(form.amount))} → Credit: {toAcc.currency} {fmt(creditedAmount)}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Note</label>
              <Textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional note" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMut.isPending}>
              {createMut.isPending ? "Transferring..." : "Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
