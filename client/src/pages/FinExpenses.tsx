import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function FinExpenses() {
  const utils = trpc.useUtils();
  const { data: transactions, isLoading } = trpc.financial.transactions.list.useQuery({ type: "expense" });
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

  const [showCreate, setShowCreate] = useState(false);
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
      employeeId: form.employeeId ? Number(form.employeeId) : undefined,
      transactionDate: new Date(form.transactionDate),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Expenses</h1>
        <Button onClick={() => { setForm({ description: "", accountId: "", categoryId: "", amount: "", note: "", employeeId: "", transactionDate: new Date().toISOString().split("T")[0] }); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Record Expense
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Expense Transactions</CardTitle>
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
                    <tr key={tx.id} className="border-b border-muted/50 hover:bg-muted/30">
                      <td className="py-2">{new Date(tx.transactionDate).toLocaleDateString()}</td>
                      <td className="py-2 font-medium">{tx.description}</td>
                      <td className="py-2 text-muted-foreground">{categoryMap.get(tx.categoryId!) ?? "—"}</td>
                      <td className="py-2 text-muted-foreground">{accountMap.get(tx.accountId!) ?? "—"}</td>
                      <td className="py-2 text-muted-foreground">{tx.employeeId ? employeeMap.get(tx.employeeId) ?? "—" : "—"}</td>
                      <td className="py-2 text-right text-red-600 font-semibold">{fmt(Number(tx.amount))}</td>
                      <td className="py-2 text-right">{tx.balanceAfter ? fmt(Number(tx.balanceAfter)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
