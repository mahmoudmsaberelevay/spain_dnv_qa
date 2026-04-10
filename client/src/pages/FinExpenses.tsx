import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import FinFilterBar, { FinFilters } from "@/components/FinFilterBar";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function FinExpenses() {
  const utils = trpc.useUtils();
  const [filters, setFilters] = useState<FinFilters>({ sortField: "transactionDate", sortDir: "desc" });
  const { data: transactions, isLoading } = trpc.financial.transactions.list.useQuery({
    type: "expense",
    from: filters.from,
    to: filters.to,
    categoryId: filters.categoryId,
    employeeId: filters.employeeId,
    finClientId: filters.finClientId,
    sortField: filters.sortField,
    sortDir: filters.sortDir,
  });
  const { data: accounts } = trpc.financial.accounts.list.useQuery();
  const { data: categories } = trpc.financial.categories.list.useQuery({ type: "expense" });
  const { data: employees } = trpc.financial.employees.list.useQuery();

  const createMut = trpc.financial.transactions.createExpense.useMutation({
    onSuccess: () => {
      utils.financial.transactions.list.invalidate();
      utils.financial.accounts.list.invalidate();
      utils.financial.dashboard.summary.invalidate();
      toast.success("Expense recorded");
      setShowCreate(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkDeleteMut = trpc.financial.transactions.bulkDelete.useMutation({
    onSuccess: (res) => {
      utils.financial.transactions.list.invalidate();
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
      toast.success("Transaction updated");
      setEditTx(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editTx, setEditTx] = useState<any>(null);
  const [editForm, setEditForm] = useState({ description: "", note: "", transactionDate: "", categoryId: "", employeeId: "" });
  const [form, setForm] = useState({
    description: "", accountId: "", categoryId: "", amount: "", note: "", employeeId: "",
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

  const employeeMap = useMemo(() => {
    const m = new Map<number, string>();
    employees?.forEach(e => m.set(e.id, e.name));
    return m;
  }, [employees]);

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
      employeeId: form.employeeId && form.employeeId !== "none" ? Number(form.employeeId) : undefined,
      transactionDate: new Date(form.transactionDate),
    });
  };

  const allIds = transactions?.map(t => t.id) ?? [];
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Expenses</h1>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button variant="destructive" onClick={() => setConfirmDelete(true)} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Delete Selected ({selected.size})
            </Button>
          )}
          <Button onClick={() => { setForm({ description: "", accountId: "", categoryId: "", amount: "", note: "", employeeId: "", transactionDate: new Date().toISOString().split("T")[0] }); setShowCreate(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Record Expense
          </Button>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base mb-3">Expense Transactions</CardTitle>
          <FinFilterBar
            filters={filters}
            onChange={setFilters}
            show={{ dateRange: true, category: true, employee: true, client: true, sort: true }}
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !transactions?.length ? (
            <div className="text-center py-8 text-muted-foreground">No expenses recorded yet</div>
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
                    <th className="text-left py-2 font-medium">Category</th>
                    <th className="text-left py-2 font-medium">Account</th>
                    <th className="text-left py-2 font-medium">Employee</th>
                    <th className="text-right py-2 font-medium">Amount</th>
                    <th className="text-right py-2 font-medium">Balance After</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className={`border-b border-muted/50 hover:bg-muted/30 ${selected.has(tx.id) ? "bg-red-50/30" : ""}`}>
                      <td className="py-2 pl-1">
                        <Checkbox checked={selected.has(tx.id)} onCheckedChange={() => toggleOne(tx.id)} aria-label={`Select ${tx.description}`} />
                      </td>
                      <td className="py-2">{new Date(tx.transactionDate).toLocaleDateString()}</td>
                      <td className="py-2 font-medium">{tx.description}</td>
                      <td className="py-2 text-muted-foreground">{categoryMap.get(tx.categoryId!) ?? "—"}</td>
                      <td className="py-2 text-muted-foreground">{accountMap.get(tx.accountId!) ?? "—"}</td>
                      <td className="py-2 text-muted-foreground">{tx.employeeId ? employeeMap.get(tx.employeeId) ?? "—" : "—"}</td>
                      <td className="py-2 text-right text-red-600 font-semibold">{fmt(Number(tx.amount))}</td>
                      <td className="py-2 text-right">{tx.balanceAfter ? fmt(Number(tx.balanceAfter)) : "—"}</td>
                      <td className="py-2 text-right">
                        <Button variant="ghost" size="sm" onClick={() => {
                          setEditTx(tx);
                          setEditForm({
                            description: tx.description,
                            note: tx.note ?? "",
                            transactionDate: new Date(tx.transactionDate).toISOString().split("T")[0],
                            categoryId: tx.categoryId ? String(tx.categoryId) : "",
                            employeeId: tx.employeeId ? String(tx.employeeId) : "none",
                          });
                        }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm Delete Dialog */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete {selected.size} Transaction{selected.size !== 1 ? "s" : ""}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">This action cannot be undone. The selected expense transactions will be permanently deleted.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleteMut.isPending}>
              {bulkDeleteMut.isPending ? "Deleting..." : `Delete ${selected.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Transaction Dialog */}
      <Dialog open={!!editTx} onOpenChange={() => setEditTx(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Expense Transaction</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Category</label>
                <Select value={editForm.categoryId} onValueChange={v => setEditForm(f => ({ ...f, categoryId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Date</label>
                <Input type="date" value={editForm.transactionDate} onChange={e => setEditForm(f => ({ ...f, transactionDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Employee</label>
              <Select value={editForm.employeeId} onValueChange={v => setEditForm(f => ({ ...f, employeeId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {employees?.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
              categoryId: editForm.categoryId ? Number(editForm.categoryId) : undefined,
              employeeId: editForm.employeeId && editForm.employeeId !== "none" ? Number(editForm.employeeId) : null,
            })} disabled={updateMut.isPending}>
              {updateMut.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Expense Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Description *</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Office supplies" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Account *</label>
                <Select value={form.accountId} onValueChange={v => setForm(f => ({ ...f, accountId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts?.filter(a => a.isActive).map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name} ({a.currency})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Category *</label>
                <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories?.filter(c => c.isActive).map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
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
              <label className="text-sm font-medium">Employee (optional)</label>
              <Select value={form.employeeId} onValueChange={v => setForm(f => ({ ...f, employeeId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {employees?.filter(e => e.isActive).map(e => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Note</label>
              <Textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional note" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMut.isPending}>
              {createMut.isPending ? "Recording..." : "Record Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
