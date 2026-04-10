import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function FinAccounts() {
  const utils = trpc.useUtils();
  const { data: accounts, isLoading } = trpc.financial.accounts.list.useQuery();
  const createMut = trpc.financial.accounts.create.useMutation({
    onSuccess: () => { utils.financial.accounts.list.invalidate(); toast.success("Account created"); setShowCreate(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.financial.accounts.update.useMutation({
    onSuccess: () => { utils.financial.accounts.list.invalidate(); toast.success("Account updated"); setEditAccount(null); },
    onError: (e) => toast.error(e.message),
  });
  const setBalanceMut = trpc.financial.accounts.setBalance.useMutation({
    onSuccess: () => {
      utils.financial.accounts.list.invalidate();
      utils.financial.dashboard.summary.invalidate();
      toast.success("Balance updated");
      setBalanceAccount(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCurrency, setNewCurrency] = useState("EGP");
  const [editAccount, setEditAccount] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [balanceAccount, setBalanceAccount] = useState<any>(null);
  const [editBalance, setEditBalance] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("all");

  const filtered = accounts?.filter(a => filterCurrency === "all" || a.currency === filterCurrency) ?? [];

  // Group by currency
  const grouped = new Map<string, typeof filtered>();
  filtered.forEach(a => {
    const arr = grouped.get(a.currency) ?? [];
    arr.push(a);
    grouped.set(a.currency, arr);
  });

  // Currency totals (EGP excludes Imprest Account and Rent Credit)
  const EGP_EXCLUDED = ['Imprest Account', 'Rent Credit'];
  const totals = new Map<string, number>();
  accounts?.forEach(a => {
    if (a.currency === 'EGP' && EGP_EXCLUDED.includes(a.name)) return;
    totals.set(a.currency, (totals.get(a.currency) ?? 0) + Number(a.balance));
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <div className="flex items-center gap-3">
          <Select value={filterCurrency} onValueChange={setFilterCurrency}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Currencies</SelectItem>
              <SelectItem value="EGP">EGP</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="AED">AED</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => { setNewName(""); setNewCurrency("EGP"); setShowCreate(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Account
          </Button>
        </div>
      </div>

      {/* Currency totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from(totals.entries()).map(([cur, total]) => (
          <Card key={cur} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase font-medium">Total {cur}</p>
              <p className={`text-lg font-bold mt-1 ${total < 0 ? "text-red-600" : "text-foreground"}`}>
                {cur} {fmt(total)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Account list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading accounts...</div>
      ) : (
        Array.from(grouped.entries()).map(([currency, accs]) => (
          <Card key={currency} className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{currency} Accounts ({accs.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium">Account Name</th>
                      <th className="text-right py-2 font-medium">Balance</th>
                      <th className="text-center py-2 font-medium">Status</th>
                      <th className="text-right py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accs.map((acc) => (
                      <tr key={acc.id} className="border-b border-muted/50 hover:bg-muted/30">
                        <td className="py-2.5 font-medium">{acc.name}</td>
                        <td className={`py-2.5 text-right font-semibold ${Number(acc.balance) < 0 ? "text-red-600" : ""}`}>
                          {currency} {fmt(Number(acc.balance))}
                        </td>
                        <td className="py-2.5 text-center">
                          <Badge variant={acc.isActive ? "default" : "secondary"} className="text-xs">
                            {acc.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost" size="sm"
                              title="Edit name"
                              onClick={() => { setEditAccount(acc); setEditName(acc.name); }}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              title="Set opening / current balance"
                              onClick={() => { setBalanceAccount(acc); setEditBalance(String(Number(acc.openingBalance ?? 0))); }}
                              className="text-blue-600 hover:text-blue-700"
                            >
                              <span className="text-xs font-bold">₯</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Account</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Account Name</label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Cash EGP" />
            </div>
            <div>
              <label className="text-sm font-medium">Currency</label>
              <Select value={newCurrency} onValueChange={setNewCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EGP">EGP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="AED">AED</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate({ name: newName, currency: newCurrency })} disabled={!newName.trim() || createMut.isPending}>
              {createMut.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit name dialog */}
      <Dialog open={!!editAccount} onOpenChange={() => setEditAccount(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Account</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Account Name</label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAccount(null)}>Cancel</Button>
            <Button onClick={() => updateMut.mutate({ id: editAccount.id, name: editName })} disabled={!editName.trim() || updateMut.isPending}>
              {updateMut.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit opening balance dialog */}
      <Dialog open={!!balanceAccount} onOpenChange={() => setBalanceAccount(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Opening Balance — {balanceAccount?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Set the <strong>opening balance</strong> for this account. The current balance will be automatically recalculated as:
              <br /><code className="text-xs bg-muted px-1 py-0.5 rounded mt-1 block">Opening Balance + Income − Expenses ± Transfers</code>
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-muted/50 rounded p-2">
                <div className="text-muted-foreground text-xs">Current Opening Balance</div>
                <div className="font-semibold">{balanceAccount?.currency} {fmt(Number(balanceAccount?.openingBalance ?? 0))}</div>
              </div>
              <div className="bg-muted/50 rounded p-2">
                <div className="text-muted-foreground text-xs">Current Balance</div>
                <div className="font-semibold">{balanceAccount?.currency} {fmt(Number(balanceAccount?.balance ?? 0))}</div>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">New Opening Balance ({balanceAccount?.currency})</label>
              <Input
                type="number"
                step="0.01"
                value={editBalance}
                onChange={e => setEditBalance(e.target.value)}
                placeholder="e.g. 50000.00"
                className="mt-1"
              />
            </div>
            {balanceAccount && editBalance !== "" && (
              <p className="text-xs text-muted-foreground">
                Opening: {balanceAccount.currency} {fmt(Number(balanceAccount.openingBalance ?? 0))} → {balanceAccount.currency} {fmt(Number(editBalance))}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBalanceAccount(null)}>Cancel</Button>
            <Button
              onClick={() => setBalanceMut.mutate({ id: balanceAccount.id, openingBalance: Number(editBalance) })}
              disabled={editBalance === "" || setBalanceMut.isPending}
            >
              {setBalanceMut.isPending ? "Saving..." : "Update Opening Balance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
