import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, FileText } from "lucide-react";
import { useState, useMemo } from "react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function dateStr(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function FinReports() {
  const [tab, setTab] = useState("expenses");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [accountId, setAccountId] = useState("");

  const { data: accounts } = trpc.financial.accounts.list.useQuery();
  const { data: categories } = trpc.financial.categories.list.useQuery();

  const categoryMap = useMemo(() => {
    const m = new Map<number, string>();
    categories?.forEach(c => m.set(c.id, c.name));
    return m;
  }, [categories]);

  const accountMap = useMemo(() => {
    const m = new Map<number, { name: string; currency: string }>();
    accounts?.forEach(a => m.set(a.id, { name: a.name, currency: a.currency }));
    return m;
  }, [accounts]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Financial Reports</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="expenses">All Expenses</TabsTrigger>
          <TabsTrigger value="income">All Income</TabsTrigger>
          <TabsTrigger value="statement">Account Statement</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses">
          <ExpenseReport categoryMap={categoryMap} accountMap={accountMap} dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
        </TabsContent>
        <TabsContent value="income">
          <IncomeReport categoryMap={categoryMap} accountMap={accountMap} dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
        </TabsContent>
        <TabsContent value="statement">
          <AccountStatement accounts={accounts ?? []} accountId={accountId} setAccountId={setAccountId} dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} accountMap={accountMap} categoryMap={categoryMap} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DateFilters({ dateFrom, dateTo, setDateFrom, setDateTo }: { dateFrom: string; dateTo: string; setDateFrom: (v: string) => void; setDateTo: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div>
        <label className="text-xs font-medium text-muted-foreground">From</label>
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-[160px]" />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">To</label>
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-[160px]" />
      </div>
      {(dateFrom || dateTo) && (
        <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }} className="mt-4">
          Clear
        </Button>
      )}
    </div>
  );
}

function ExpenseReport({ categoryMap, accountMap, dateFrom, dateTo, setDateFrom, setDateTo }: any) {
  const { data: transactions, isLoading } = trpc.financial.transactions.list.useQuery({ type: "expense" });

  const filtered = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(tx => {
      const d = new Date(tx.transactionDate);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [transactions, dateFrom, dateTo]);

  const total = filtered.reduce((s, tx) => s + Number(tx.amount), 0);

  // Group by category
  const byCategory = new Map<number, number>();
  filtered.forEach(tx => {
    if (tx.categoryId) byCategory.set(tx.categoryId, (byCategory.get(tx.categoryId) ?? 0) + Number(tx.amount));
  });

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <DateFilters dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total Expenses</p>
          <p className="text-xl font-bold text-red-600">EGP {fmt(total)}</p>
        </div>
      </div>

      {/* Category breakdown */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm">By Category</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from(byCategory.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([catId, amount]) => (
                <div key={catId} className="flex justify-between text-sm py-1">
                  <span>{categoryMap.get(catId) ?? `#${catId}`}</span>
                  <span className="font-medium text-red-600">{fmt(amount)}</span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Transaction list */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Transactions ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-muted-foreground">Loading...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Date</th>
                    <th className="text-left py-2 font-medium">Description</th>
                    <th className="text-left py-2 font-medium">Category</th>
                    <th className="text-left py-2 font-medium">Account</th>
                    <th className="text-right py-2 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(tx => (
                    <tr key={tx.id} className="border-b border-muted/50">
                      <td className="py-2">{dateStr(tx.transactionDate)}</td>
                      <td className="py-2 font-medium">{tx.description}</td>
                      <td className="py-2 text-muted-foreground">{categoryMap.get(tx.categoryId!) ?? "—"}</td>
                      <td className="py-2 text-muted-foreground">{accountMap.get(tx.accountId!)?.name ?? "—"}</td>
                      <td className="py-2 text-right text-red-600 font-semibold">{fmt(Number(tx.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function IncomeReport({ categoryMap, accountMap, dateFrom, dateTo, setDateFrom, setDateTo }: any) {
  const { data: transactions, isLoading } = trpc.financial.transactions.list.useQuery({ type: "income" });

  const filtered = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(tx => {
      const d = new Date(tx.transactionDate);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [transactions, dateFrom, dateTo]);

  const total = filtered.reduce((s, tx) => s + Number(tx.amount), 0);

  const byCategory = new Map<number, number>();
  filtered.forEach(tx => {
    if (tx.categoryId) byCategory.set(tx.categoryId, (byCategory.get(tx.categoryId) ?? 0) + Number(tx.amount));
  });

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <DateFilters dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total Income</p>
          <p className="text-xl font-bold text-green-600">EGP {fmt(total)}</p>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm">By Category</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from(byCategory.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([catId, amount]) => (
                <div key={catId} className="flex justify-between text-sm py-1">
                  <span>{categoryMap.get(catId) ?? `#${catId}`}</span>
                  <span className="font-medium text-green-600">{fmt(amount)}</span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Transactions ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-muted-foreground">Loading...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Date</th>
                    <th className="text-left py-2 font-medium">Description</th>
                    <th className="text-left py-2 font-medium">Category</th>
                    <th className="text-left py-2 font-medium">Account</th>
                    <th className="text-right py-2 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(tx => (
                    <tr key={tx.id} className="border-b border-muted/50">
                      <td className="py-2">{dateStr(tx.transactionDate)}</td>
                      <td className="py-2 font-medium">{tx.description}</td>
                      <td className="py-2 text-muted-foreground">{categoryMap.get(tx.categoryId!) ?? "—"}</td>
                      <td className="py-2 text-muted-foreground">{accountMap.get(tx.accountId!)?.name ?? "—"}</td>
                      <td className="py-2 text-right text-green-600 font-semibold">{fmt(Number(tx.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AccountStatement({ accounts, accountId, setAccountId, dateFrom, dateTo, setDateFrom, setDateTo, accountMap, categoryMap }: any) {
  const { data: statement, isLoading } = trpc.financial.reports.accountStatement.useQuery(
    { accountId: Number(accountId), dateFrom: dateFrom || undefined, dateTo: dateTo || undefined },
    { enabled: !!accountId }
  );

  const acc = accountId ? accountMap.get(Number(accountId)) : null;
  const [exporting, setExporting] = useState(false);

  function handleExportPdf() {
    if (!statement || !acc) return;
    setExporting(true);
    const dateRange = [dateFrom, dateTo].filter(Boolean).join(" → ") || "All Dates";
    const rows = (statement.transactions ?? []).map((tx: any) => {
      const isIn = (tx.type === "income" && tx.accountId === Number(accountId)) ||
        (tx.type === "transfer" && tx.toAccountId === Number(accountId));
      const isOut = (tx.type === "expense" && tx.accountId === Number(accountId)) ||
        (tx.type === "transfer" && tx.fromAccountId === Number(accountId));
      const amount = Number(tx.amount);
      const converted = tx.convertedAmount ? Number(tx.convertedAmount) : null;
      const inAmt = isIn ? (tx.type === "transfer" && tx.toAccountId === Number(accountId) && converted ? converted : amount) : 0;
      const outAmt = isOut ? amount : 0;
      const bal = tx.balanceAfter ? Number(tx.balanceAfter) : null;
      return `<tr>
        <td>${new Date(tx.transactionDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</td>
        <td>${tx.description ?? ""}</td>
        <td style="text-transform:capitalize">${tx.type}</td>
        <td style="text-align:right;color:#16a34a">${inAmt > 0 ? fmt(inAmt) : ""}</td>
        <td style="text-align:right;color:#dc2626">${outAmt > 0 ? fmt(outAmt) : ""}</td>
        <td style="text-align:right;font-weight:600">${bal !== null ? fmt(bal) : "—"}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Account Statement — ${acc.name}</title>
<style>
  body { font-family: Arial, sans-serif; color: #111; margin: 0; padding: 32px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #8b0000; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 26px; font-weight: 800; color: #8b0000; letter-spacing: 1px; }
  .meta { font-size: 12px; color: #555; text-align: right; }
  .summary { display: flex; gap: 24px; margin-bottom: 24px; }
  .summary-box { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; }
  .summary-box .label { font-size: 11px; color: #6b7280; margin-bottom: 4px; }
  .summary-box .value { font-size: 18px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #8b0000; color: #fff; padding: 8px 10px; text-align: left; }
  th:nth-child(4), th:nth-child(5), th:nth-child(6) { text-align: right; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; }
  tr:nth-child(even) td { background: #fafafa; }
  .footer { margin-top: 32px; font-size: 11px; color: #9ca3af; text-align: center; }
</style></head><body>
<div class="header">
  <div><div class="brand">ELEVAY</div><div style="font-size:13px;color:#555;margin-top:4px">Account Statement</div></div>
  <div class="meta">
    <div><strong>Account:</strong> ${acc.name} (${acc.currency})</div>
    <div><strong>Period:</strong> ${dateRange}</div>
    <div><strong>Generated:</strong> ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
  </div>
</div>
<div class="summary">
  <div class="summary-box"><div class="label">Current Balance</div><div class="value">${acc.currency} ${fmt(Number(statement.currentBalance ?? 0))}</div></div>
  <div class="summary-box"><div class="label">Total In</div><div class="value" style="color:#16a34a">${fmt(Number(statement.totalIn ?? 0))}</div></div>
  <div class="summary-box"><div class="label">Total Out</div><div class="value" style="color:#dc2626">${fmt(Number(statement.totalOut ?? 0))}</div></div>
  <div class="summary-box"><div class="label">Transactions</div><div class="value">${statement.transactions?.length ?? 0}</div></div>
</div>
<table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th style="text-align:right">In</th><th style="text-align:right">Out</th><th style="text-align:right">Balance</th></tr></thead><tbody>${rows}</tbody></table>
<div class="footer">Elevay — Confidential &nbsp;|&nbsp; Generated on ${new Date().toISOString()}</div>
</body></html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); setExporting(false); }, 500);
    } else {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Account</label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="w-[250px]"><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a: any) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name} ({a.currency})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DateFilters dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
        </div>
        {accountId && statement && (
          <Button onClick={handleExportPdf} disabled={exporting} className="bg-[#8b0000] hover:bg-[#6b0000] text-white gap-2">
            <FileText className="w-4 h-4" />
            {exporting ? "Generating..." : "Export PDF"}
          </Button>
        )}
      </div>

      {!accountId ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center text-muted-foreground">
            Select an account to view its statement
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center text-muted-foreground">Loading...</CardContent>
        </Card>
      ) : (
        <>
          {/* Balance summary */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Current Balance</p>
                <p className="text-lg font-bold">{acc?.currency} {fmt(Number(statement?.currentBalance ?? 0))}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total In</p>
                <p className="text-lg font-bold text-green-600">{fmt(Number(statement?.totalIn ?? 0))}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Out</p>
                <p className="text-lg font-bold text-red-600">{fmt(Number(statement?.totalOut ?? 0))}</p>
              </CardContent>
            </Card>
          </div>

          {/* Transaction list */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Statement ({statement?.transactions?.length ?? 0} transactions)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium">Date</th>
                      <th className="text-left py-2 font-medium">Description</th>
                      <th className="text-left py-2 font-medium">Type</th>
                      <th className="text-right py-2 font-medium">In</th>
                      <th className="text-right py-2 font-medium">Out</th>
                      <th className="text-right py-2 font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement?.transactions?.map((tx: any) => {
                      const isIn = (tx.type === "income" && tx.accountId === Number(accountId)) ||
                        (tx.type === "transfer" && tx.toAccountId === Number(accountId));
                      const isOut = (tx.type === "expense" && tx.accountId === Number(accountId)) ||
                        (tx.type === "transfer" && tx.fromAccountId === Number(accountId));
                      const amount = Number(tx.amount);
                      const converted = tx.convertedAmount ? Number(tx.convertedAmount) : null;
                      const inAmt = isIn ? (tx.type === "transfer" && tx.toAccountId === Number(accountId) && converted ? converted : amount) : 0;
                      const outAmt = isOut ? amount : 0;
                      const bal = isIn ? tx.balanceAfter : (tx.type === "transfer" && tx.fromAccountId === Number(accountId) ? tx.balanceAfter : tx.balanceAfter);
                      return (
                        <tr key={tx.id} className="border-b border-muted/50">
                          <td className="py-2">{dateStr(tx.transactionDate)}</td>
                          <td className="py-2 font-medium">{tx.description}</td>
                          <td className="py-2 capitalize text-muted-foreground">{tx.type}</td>
                          <td className="py-2 text-right text-green-600">{inAmt > 0 ? fmt(inAmt) : ""}</td>
                          <td className="py-2 text-right text-red-600">{outAmt > 0 ? fmt(outAmt) : ""}</td>
                          <td className="py-2 text-right font-medium">{bal ? fmt(Number(bal)) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
