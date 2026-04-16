import { trpc } from "@/lib/trpc";
import AccountSelect from "@/components/AccountSelect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Pencil, FileDown, FileSpreadsheet, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import FinFilterBar, { FinFilters } from "@/components/FinFilterBar";
import { ClientSearchCombobox } from "@/components/ClientSearchCombobox";
import * as XLSX from "xlsx";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const PAGE_SIZE_OPTIONS = [60, 120, 240, 0]; // 0 = All

export default function FinIncome() {
  const utils = trpc.useUtils();
  const [filters, setFilters] = useState<FinFilters>({ sortField: "transactionDate", sortDir: "desc" });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(60);

  const queryParams = useMemo(() => ({
    type: "income" as const,
    from: filters.from,
    to: filters.to,
    categoryId: filters.categoryId,
    finClientId: filters.finClientId,
    descriptionSearch: filters.descriptionSearch,
    sortField: filters.sortField,
    sortDir: filters.sortDir,
    limit: pageSize > 0 ? pageSize : undefined,
    offset: pageSize > 0 ? page * pageSize : undefined,
  }), [filters, page, pageSize]);

  const { data: transactions, isLoading } = trpc.financial.transactions.list.useQuery(queryParams);
  const { data: totalCount } = trpc.financial.transactions.count.useQuery({
    type: "income",
    from: filters.from,
    to: filters.to,
    categoryId: filters.categoryId,
    finClientId: filters.finClientId,
    descriptionSearch: filters.descriptionSearch,
  });
  // For export: fetch all without pagination
  const { data: allTransactions } = trpc.financial.transactions.list.useQuery({
    type: "income",
    from: filters.from,
    to: filters.to,
    categoryId: filters.categoryId,
    finClientId: filters.finClientId,
    descriptionSearch: filters.descriptionSearch,
    sortField: filters.sortField,
    sortDir: filters.sortDir,
  }, { enabled: false, staleTime: Infinity });

  const { data: accounts } = trpc.financial.accounts.list.useQuery();
  const { data: categories } = trpc.financial.categories.list.useQuery({ type: "income" });
  const { data: finClients } = trpc.financial.clients.list.useQuery();

  const createMut = trpc.financial.transactions.createIncome.useMutation({
    onSuccess: () => {
      utils.financial.transactions.list.invalidate();
      utils.financial.transactions.count.invalidate();
      utils.financial.accounts.list.invalidate();
      utils.financial.dashboard.summary.invalidate();
      toast.success("Income recorded");
      setShowCreate(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkDeleteMut = trpc.financial.transactions.bulkDelete.useMutation({
    onSuccess: (res) => {
      utils.financial.transactions.list.invalidate();
      utils.financial.transactions.count.invalidate();
      utils.financial.accounts.list.invalidate();
      utils.financial.dashboard.summary.invalidate();
      toast.success(`${res.deleted} transaction${res.deleted !== 1 ? "s" : ""} deleted`);
      setSelected(new Set());
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.financial.transactions.updateTransaction.useMutation({
    onSuccess: () => {
      utils.financial.transactions.list.invalidate();
      utils.financial.transactions.count.invalidate();
      utils.financial.accounts.list.invalidate();
      utils.financial.dashboard.summary.invalidate();
      toast.success("Transaction updated");
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
      toast.success("Transaction deleted");
      setConfirmDeleteOne(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteOne, setConfirmDeleteOne] = useState<number | null>(null);
  const [editTx, setEditTx] = useState<any>(null);
  const [editForm, setEditForm] = useState({ description: "", note: "", transactionDate: "", categoryId: "", finClientId: "", amount: "" });
  const [form, setForm] = useState({
    description: "", accountId: "", categoryId: "", amount: "", note: "", finClientId: "",
    transactionDate: new Date().toISOString().split("T")[0],
  });

  const accountMap = useMemo(() => {
    const m = new Map<number, string>();
    accounts?.forEach(a => m.set(a.id, `${a.name} (${a.currency})`));
    return m;
  }, [accounts]);

  const categoryMap = useMemo(() => {
    const m = new Map<number, string>();
    categories?.forEach(c => m.set(c.id, c.name));
    return m;
  }, [categories]);

  const clientMap = useMemo(() => {
    const m = new Map<number, string>();
    finClients?.map((c: any) => m.set(c.id, c.name));
    return m;
  }, [finClients]);

  const handleCreate = () => {
    if (!form.description || !form.accountId || !form.categoryId || !form.amount) {
      toast.error("Please fill all required fields");
      return;
    }
    createMut.mutate({
      description: form.description,
      accountId: Number(form.accountId),
      categoryId: Number(form.categoryId),
      amount: Number(form.amount),
      note: form.note || undefined,
      finClientId: form.finClientId && form.finClientId !== "none" ? Number(form.finClientId) : undefined,
      transactionDate: new Date(form.transactionDate),
    });
  };

  const allIds = transactions?.map(t => t.id) ?? [];
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  const toggleAll = () => { if (allSelected) setSelected(new Set()); else setSelected(new Set(allIds)); };
  const toggleOne = (id: number) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const handleBulkDelete = () => { bulkDeleteMut.mutate({ ids: Array.from(selected) }); setConfirmDelete(false); };

  const totalPages = pageSize > 0 ? Math.ceil((totalCount ?? 0) / pageSize) : 1;
  const pageTotal = transactions?.reduce((s, t) => s + Number(t.amount), 0) ?? 0;

  const getExportData = async () => {
    // Fetch all for export
    const all = await utils.financial.transactions.list.fetch({
      type: "income",
      from: filters.from,
      to: filters.to,
      categoryId: filters.categoryId,
      finClientId: filters.finClientId,
      descriptionSearch: filters.descriptionSearch,
      sortField: filters.sortField,
      sortDir: filters.sortDir,
    });
    return all ?? [];
  };

  const handleExportExcel = async () => {
    try {
      const data = await getExportData();
      const rows = data.map(tx => ({
        Date: new Date(tx.transactionDate).toLocaleDateString(),
        Description: tx.description,
        Category: categoryMap.get(tx.categoryId!) ?? "",
        Account: accountMap.get(tx.accountId!) ?? "",
        Client: tx.finClientId ? (clientMap.get(tx.finClientId) ?? "") : "",
        Amount: Number(tx.amount),
        Note: tx.note ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Income");
      XLSX.writeFile(wb, `income_${new Date().toISOString().split("T")[0]}.xlsx`);
    } catch (e: any) { toast.error("Export failed: " + e.message); }
  };

  const handleExportPdf = async () => {
    try {
      const data = await getExportData();
      const total = data.reduce((s, t) => s + Number(t.amount), 0);
      const rows = data.map(tx => `
        <tr>
          <td>${new Date(tx.transactionDate).toLocaleDateString()}</td>
          <td>${tx.description}</td>
          <td>${categoryMap.get(tx.categoryId!) ?? ""}</td>
          <td>${accountMap.get(tx.accountId!) ?? ""}</td>
          <td>${tx.finClientId ? (clientMap.get(tx.finClientId) ?? "") : ""}</td>
          <td style="text-align:right">${fmt(Number(tx.amount))}</td>
        </tr>`).join("");
      const html = `<html><head><title>Income Report</title><style>
        body{font-family:Arial,sans-serif;font-size:11px;padding:20px}
        h2{margin-bottom:4px}p{margin:2px 0 12px;color:#666}
        table{width:100%;border-collapse:collapse}
        th,td{border:1px solid #ddd;padding:5px 8px;text-align:left}
        th{background:#f5f5f5;font-weight:600}
        tfoot td{font-weight:700;background:#f9f9f9}
        @media print{body{padding:0}}
      </style></head><body>
        <h2>Income Report</h2>
        <p>Generated: ${new Date().toLocaleString()}</p>
        <table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th>Client</th><th>Amount</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="5" style="text-align:right">Total</td><td style="text-align:right">${fmt(total)}</td></tr></tfoot>
        </table></body></html>`;
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
    } catch (e: any) { toast.error("Export failed: " + e.message); }
  };

  return (
    <div className="space-y-6">
      {/* Page header — title left, exports right */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Income</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-1.5">
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} className="gap-1.5">
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          {selected.size > 0 && (
            <Button variant="destructive" onClick={() => setConfirmDelete(true)} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Delete ({selected.size})
            </Button>
          )}
        </div>
      </div>

      {/* Record Income button — centered */}
      <div className="flex justify-center">
        <Button
          size="lg"
          className="gap-2 px-8"
          onClick={() => { setForm({ description: "", accountId: "", categoryId: "", amount: "", note: "", finClientId: "", transactionDate: new Date().toISOString().split("T")[0] }); setShowCreate(true); }}
        >
          <Plus className="h-5 w-5" /> Record Income
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base mb-3">Income Transactions</CardTitle>
          <FinFilterBar
            filters={filters}
            onChange={(f) => { setFilters(f); setPage(0); }}
            show={{ dateRange: true, category: true, client: true, sort: true, descriptionSearch: true }}
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !transactions?.length ? (
            <div className="text-center py-8 text-muted-foreground">No income recorded yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" /></th>
                    <th className="text-left py-2 font-medium">Date</th>
                    <th className="text-left py-2 font-medium">Description</th>
                    <th className="text-left py-2 font-medium">Category</th>
                    <th className="text-left py-2 font-medium">Account</th>
                    <th className="text-left py-2 font-medium">Client</th>
                    <th className="text-right py-2 font-medium">Amount</th>
                    <th className="text-right py-2 font-medium">Balance After</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className={`border-b border-muted/50 hover:bg-muted/30 ${selected.has(tx.id) ? "bg-green-50/30" : ""}`}>
                      <td className="py-2 pl-1"><Checkbox checked={selected.has(tx.id)} onCheckedChange={() => toggleOne(tx.id)} /></td>
                      <td className="py-2">{new Date(tx.transactionDate).toLocaleDateString()}</td>
                      <td className="py-2 font-medium">{tx.description}</td>
                      <td className="py-2 text-muted-foreground">{categoryMap.get(tx.categoryId!) ?? "—"}</td>
                      <td className="py-2 text-muted-foreground">{accountMap.get(tx.accountId!) ?? "—"}</td>
                      <td className="py-2 text-muted-foreground text-xs">{tx.finClientId ? (clientMap.get(tx.finClientId) ?? "—") : "—"}</td>
                      <td className="py-2 text-right text-green-600 font-semibold">{fmt(Number(tx.amount))}</td>
                      <td className="py-2 text-right">{tx.balanceAfter ? fmt(Number(tx.balanceAfter)) : "—"}</td>
                      <td className="py-2 text-right">
                        <Button variant="ghost" size="sm" onClick={() => { setEditTx(tx); setEditForm({ description: tx.description, note: tx.note ?? "", transactionDate: new Date(tx.transactionDate).toISOString().split("T")[0], categoryId: tx.categoryId ? String(tx.categoryId) : "", finClientId: tx.finClientId ? String(tx.finClientId) : "none", amount: String(Number(tx.amount)) }); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setConfirmDeleteOne(tx.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/20 font-semibold">
                    <td colSpan={6} className="py-2 pl-2 text-right text-sm">Page Total</td>
                    <td className="py-2 text-right text-green-600">{fmt(pageTotal)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Pagination + Page Size */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
                <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n === 0 ? "All" : n}</SelectItem>)}
                </SelectContent>
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
          <DialogHeader><DialogTitle>Delete Transaction?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">This will permanently delete this income entry and reverse its effect on the account balance. This action cannot be undone.</p>
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
          <DialogHeader><DialogTitle>Delete {selected.size} Transaction{selected.size !== 1 ? "s" : ""}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleteMut.isPending}>{bulkDeleteMut.isPending ? "Deleting..." : `Delete ${selected.size}`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Transaction Dialog */}
      <Dialog open={!!editTx} onOpenChange={() => setEditTx(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Income Transaction</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Description</label>
                <Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">Amount</label>
                <Input type="number" step="0.01" min="0.01" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Date</label>
                <Input type="date" value={editForm.transactionDate} onChange={e => setEditForm(f => ({ ...f, transactionDate: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">Category</label>
                <Select value={editForm.categoryId} onValueChange={v => setEditForm(f => ({ ...f, categoryId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{categories?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Client</label>
              <ClientSearchCombobox
                value={editForm.finClientId || "none"}
                onChange={v => setEditForm(f => ({ ...f, finClientId: v }))}
                placeholder="Search by name or code..."
              />
            </div>
            <div>
              <label className="text-sm font-medium">Note</label>
              <Textarea value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTx(null)}>Cancel</Button>
            <Button onClick={() => updateMut.mutate({ id: editTx.id, description: editForm.description || undefined, note: editForm.note || undefined, transactionDate: editForm.transactionDate ? new Date(editForm.transactionDate) : undefined, categoryId: editForm.categoryId ? Number(editForm.categoryId) : undefined, finClientId: editForm.finClientId && editForm.finClientId !== "none" ? Number(editForm.finClientId) : null, amount: editForm.amount ? Number(editForm.amount) : undefined })} disabled={updateMut.isPending}>
              {updateMut.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Income Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Record Income</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Description *</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Client payment received" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Account *</label>
                <AccountSelect accounts={accounts} value={form.accountId} onValueChange={v => setForm(f => ({ ...f, accountId: v }))} activeOnly />
              </div>
              <div>
                <label className="text-sm font-medium">Category *</label>
                <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{categories?.filter(c => c.isActive).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Amount *</label>
                <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label className="text-sm font-medium">Date *</label>
                <Input type="date" value={form.transactionDate} onChange={e => setForm(f => ({ ...f, transactionDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Client (optional)</label>
              <ClientSearchCombobox
                value={form.finClientId || "none"}
                onChange={v => setForm(f => ({ ...f, finClientId: v }))}
                placeholder="Search by name or code..."
              />
            </div>
            <div>
              <label className="text-sm font-medium">Note</label>
              <Textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional note" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMut.isPending}>{createMut.isPending ? "Recording..." : "Record Income"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
