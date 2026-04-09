import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ArrowRight } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function FinTransfers() {
  const utils = trpc.useUtils();
  const { data: transactions, isLoading } = trpc.financial.transactions.list.useQuery({ type: "transfer" });
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

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    description: "", fromAccountId: "", toAccountId: "", amount: "", exchangeRate: "", note: "",
    transactionDate: new Date().toISOString().split("T")[0],
  });

  const accountMap = useMemo(() => {
    const m = new Map<number, { name: string; currency: string }>();
    accounts?.forEach(a => m.set(a.id, { name: a.name, currency: a.currency }));
    return m;
  }, [accounts]);

  const fromAcc = form.fromAccountId ? accountMap.get(Number(form.fromAccountId)) : null;
  const toAcc = form.toAccountId ? accountMap.get(Number(form.toAccountId)) : null;
  const needsExchange = fromAcc && toAcc && fromAcc.currency !== toAcc.currency;

  const handleCreate = () => {
    if (!form.description || !form.fromAccountId || !form.toAccountId || !form.amount) {
      toast.error("Please fill all required fields");
      return;
    }
    if (form.fromAccountId === form.toAccountId) {
      toast.error("From and To accounts must be different");
      return;
    }
    if (needsExchange && !form.exchangeRate) {
      toast.error("Exchange rate is required for cross-currency transfers");
      return;
    }
    createMut.mutate({
      description: form.description,
      fromAccountId: Number(form.fromAccountId),
      toAccountId: Number(form.toAccountId),
      amount: Number(form.amount),
      exchangeRate: form.exchangeRate ? Number(form.exchangeRate) : undefined,
      transactionDate: new Date(form.transactionDate),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transfers</h1>
        <Button onClick={() => { setForm({ description: "", fromAccountId: "", toAccountId: "", amount: "", exchangeRate: "", note: "", transactionDate: new Date().toISOString().split("T")[0] }); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-1" /> New Transfer
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Transfer History</CardTitle>
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
                    <th className="text-left py-2 font-medium">Date</th>
                    <th className="text-left py-2 font-medium">Description</th>
                    <th className="text-left py-2 font-medium">From</th>
                    <th className="text-center py-2 font-medium"></th>
                    <th className="text-left py-2 font-medium">To</th>
                    <th className="text-right py-2 font-medium">Amount</th>
                    <th className="text-right py-2 font-medium">Rate</th>
                    <th className="text-right py-2 font-medium">Converted</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const from = tx.fromAccountId ? accountMap.get(tx.fromAccountId) : null;
                    const to = tx.toAccountId ? accountMap.get(tx.toAccountId) : null;
                    return (
                      <tr key={tx.id} className="border-b border-muted/50 hover:bg-muted/30">
                        <td className="py-2">{new Date(tx.transactionDate).toLocaleDateString()}</td>
                        <td className="py-2 font-medium">{tx.description}</td>
                        <td className="py-2 text-red-600">{from?.name ?? "—"}</td>
                        <td className="py-2 text-center"><ArrowRight className="h-3.5 w-3.5 inline text-muted-foreground" /></td>
                        <td className="py-2 text-green-600">{to?.name ?? "—"}</td>
                        <td className="py-2 text-right font-semibold">{from?.currency ?? ""} {fmt(Number(tx.amount))}</td>
                        <td className="py-2 text-right text-muted-foreground">{tx.exchangeRate ? Number(tx.exchangeRate).toFixed(4) : "—"}</td>
                        <td className="py-2 text-right">{tx.convertedAmount ? `${to?.currency ?? ""} ${fmt(Number(tx.convertedAmount))}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
            {needsExchange && (
              <div>
                <label className="text-sm font-medium">Exchange Rate * ({fromAcc?.currency} → {toAcc?.currency})</label>
                <Input type="number" step="0.0001" value={form.exchangeRate} onChange={e => setForm(f => ({ ...f, exchangeRate: e.target.value }))} placeholder="e.g. 62.14" />
                {form.amount && form.exchangeRate && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {fromAcc?.currency} {fmt(Number(form.amount))} × {form.exchangeRate} = {toAcc?.currency} {fmt(Number(form.amount) * Number(form.exchangeRate))}
                  </p>
                )}
              </div>
            )}
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
