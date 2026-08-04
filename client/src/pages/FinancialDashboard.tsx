import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, DollarSign, Wallet, ArrowUpRight, ArrowDownRight, Plus, Minus, ArrowLeftRight, Users, Globe } from "lucide-react";
import { useMemo } from "react";
import { useLocation } from "wouter";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const CONSULTANTS = ["Mahmoud", "Ziad", "Kirolos", "Fouad"];
const CONSULTANT_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  Mahmoud: { bg: "bg-blue-50", text: "text-blue-700", icon: "bg-blue-100" },
  Ziad: { bg: "bg-purple-50", text: "text-purple-700", icon: "bg-purple-100" },
  Kirolos: { bg: "bg-amber-50", text: "text-amber-700", icon: "bg-amber-100" },
  Fouad: { bg: "bg-emerald-50", text: "text-emerald-700", icon: "bg-emerald-100" },
};

export default function FinancialDashboard() {
  const [, navigate] = useLocation();
  const { data: summary, isLoading } = trpc.financial.dashboard.summary.useQuery({ year: new Date().getFullYear() });
  const { data: accounts } = trpc.financial.accounts.list.useQuery();
  const { data: categories } = trpc.financial.categories.list.useQuery();
  const { data: roleData } = trpc.financial.dashboard.myRole.useQuery();

  const accountMap = useMemo(() => {
    const m = new Map<number, string>();
    accounts?.forEach(a => m.set(a.id, a.name));
    return m;
  }, [accounts]);

  const categoryMap = useMemo(() => {
    const m = new Map<number, string>();
    categories?.forEach(c => m.set(c.id, c.name));
    return m;
  }, [categories]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Financial Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (!summary) return <div className="p-8 text-center text-muted-foreground">No data available</div>;

  // All balance totals now come from server (only AIB + AAIB + CIB + Cash per currency)
  const kpis = [
    { label: "Yearly Income", value: summary.yearlyIncome, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50", prefix: "EGP " },
    { label: "Yearly Expense", value: summary.yearlyExpense, icon: TrendingDown, color: "text-red-600", bg: "bg-red-50", prefix: "EGP " },
    { label: "Yearly Profit", value: summary.yearlyProfit, icon: DollarSign, color: summary.yearlyProfit >= 0 ? "text-green-600" : "text-red-600", bg: summary.yearlyProfit >= 0 ? "bg-green-50" : "bg-red-50", prefix: "EGP " },
    { label: "Total EGP Balance", value: summary.totalEgpBalance, icon: Wallet, color: "text-blue-600", bg: "bg-blue-50", prefix: "EGP " },
    { label: "Total USD Balance", value: summary.totalUsdBalance, icon: Wallet, color: "text-green-700", bg: "bg-green-50", prefix: "USD " },
    { label: "Total EUR Balance", value: summary.totalEurBalance, icon: Wallet, color: "text-amber-600", bg: "bg-amber-50", prefix: "EUR " },
  ];

  const monthlyKpis = [
    { label: "Monthly Income", value: summary.monthlyIncome, icon: ArrowUpRight, color: "text-green-600", bg: "bg-green-50" },
    { label: "Monthly Expense", value: summary.monthlyExpense, icon: ArrowDownRight, color: "text-red-600", bg: "bg-red-50" },
    { label: "Monthly Profit", value: summary.monthlyProfit, icon: DollarSign, color: summary.monthlyProfit >= 0 ? "text-green-600" : "text-red-600", bg: summary.monthlyProfit >= 0 ? "bg-green-50" : "bg-red-50" },
  ];

  // Top expense categories
  const topExpenses = [...summary.expenseByCategory]
    .sort((a, b) => Number(b.total) - Number(a.total))
    .slice(0, 8);

  // Account balances
  const egpAccounts = accounts?.filter(a => a.currency === "EGP" && Number(a.balance) !== 0) ?? [];
  const usdAccounts = accounts?.filter(a => a.currency === "USD" && Number(a.balance) !== 0) ?? [];
  const eurAccounts = accounts?.filter(a => a.currency === "EUR" && Number(a.balance) !== 0) ?? [];

  // Consultant signing map — aggregate by first name to handle both short ("Mahmoud") and full ("Mahmoud Saber") entries
  const signingMap = new Map<string, number>();
  summary.consultantSigning?.forEach(s => {
    const firstName = s.consultant.split(" ")[0];
    signingMap.set(firstName, (signingMap.get(firstName) ?? 0) + s.count);
  });
  const totalSignings = CONSULTANTS.reduce((sum, c) => sum + (signingMap.get(c) ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Financial Dashboard</h1>
        <div className="flex items-center gap-2">
          {roleData && (
            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium capitalize">
              {roleData.role} Access
            </span>
          )}
        </div>
      </div>

      {/* Quick Transaction Buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          onClick={() => navigate("/finance/income")}
          className="bg-green-600 hover:bg-green-700 text-white shadow-sm"
        >
          <Plus className="h-4 w-4 mr-1.5" /> Income
        </Button>
        <Button
          onClick={() => navigate("/finance/expenses")}
          variant="destructive"
          className="shadow-sm"
        >
          <Minus className="h-4 w-4 mr-1.5" /> Expense
        </Button>
        <Button
          onClick={() => navigate("/finance/transfers")}
          variant="outline"
          className="border-blue-300 text-blue-700 hover:bg-blue-50 shadow-sm"
        >
          <ArrowLeftRight className="h-4 w-4 mr-1.5" /> Transfer
        </Button>
      </div>

      {/* Yearly KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</p>
                  <p className={`text-xl font-bold mt-1 ${kpi.color}`}>
                    {kpi.prefix}{fmt(kpi.value)}
                  </p>
                </div>
                <div className={`h-10 w-10 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {monthlyKpis.map((kpi) => (
          <Card key={kpi.label} className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</p>
                  <p className={`text-lg font-bold mt-1 ${kpi.color}`}>EGP {fmt(kpi.value)}</p>
                </div>
                <div className={`h-9 w-9 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Net Worth Card */}
      <Card className="border-0 shadow-sm bg-gradient-to-r from-indigo-50 to-purple-50">
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Net Worth (EGP Equivalent)</p>
              <p className={`text-2xl font-bold mt-1 ${summary.netWorthEgp >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>
                EGP {fmt(summary.netWorthEgp)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Rates used: 1 USD = {summary.usdEgpRate.toFixed(2)} EGP &nbsp;|&nbsp; 1 EUR = {summary.eurEgpRate.toFixed(2)} EGP
              </p>
            </div>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                EGP {fmt(summary.totalEgpBalance)} (direct)
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                USD {fmt(summary.totalUsdBalance)} &rarr; EGP {fmt(summary.totalUsdBalance * summary.usdEgpRate)}
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
                EUR {fmt(summary.totalEurBalance)} &rarr; EGP {fmt(summary.totalEurBalance * summary.eurEgpRate)}
              </span>
            </div>
            <div className="h-12 w-12 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Globe className="h-6 w-6 text-indigo-700" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Consultant Yearly Signing */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Consultant Yearly Signing ({new Date().getFullYear()})</CardTitle>
            <span className="text-sm font-medium text-muted-foreground">Total: {totalSignings}</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {CONSULTANTS.map((name) => {
              const count = signingMap.get(name) ?? 0;
              const colors = CONSULTANT_COLORS[name];
              return (
                <div key={name} className={`rounded-xl p-4 ${colors.bg} transition-all hover:scale-[1.02]`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full ${colors.icon} flex items-center justify-center`}>
                      <Users className={`h-5 w-5 ${colors.text}`} />
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${colors.text}`}>{name}</p>
                      <p className={`text-2xl font-bold ${colors.text}`}>{count}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Expense Categories */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Top Expense Categories ({new Date().getFullYear()})</CardTitle>
          </CardHeader>
          <CardContent>
            {topExpenses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expenses recorded yet</p>
            ) : (
              <div className="space-y-3">
                {topExpenses.map((cat) => {
                  const maxVal = Number(topExpenses[0].total);
                  const pct = maxVal > 0 ? (Number(cat.total) / maxVal) * 100 : 0;
                  return (
                    <div key={cat.categoryId} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{categoryMap.get(cat.categoryId!) ?? `Category #${cat.categoryId}`}</span>
                        <span className="text-muted-foreground">EGP {fmt(Number(cat.total))}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Balances */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Account Balances</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "EGP Accounts", accounts: egpAccounts, currency: "EGP" },
              { label: "USD Accounts", accounts: usdAccounts, currency: "USD" },
              { label: "EUR Accounts", accounts: eurAccounts, currency: "EUR" },
            ].map((group) => (
              group.accounts.length > 0 && (
                <div key={group.label}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{group.label}</p>
                  <div className="space-y-1.5">
                    {group.accounts.map((acc) => (
                      <div key={acc.id} className="flex justify-between text-sm py-1 px-2 rounded hover:bg-muted/50">
                        <span>{acc.name}</span>
                        <span className={`font-medium ${Number(acc.balance) < 0 ? "text-red-600" : "text-foreground"}`}>
                          {group.currency} {fmt(Number(acc.balance))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))}
            {egpAccounts.length === 0 && usdAccounts.length === 0 && eurAccounts.length === 0 && (
              <p className="text-sm text-muted-foreground">No account balances yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Profit Breakdown */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Monthly Breakdown ({new Date().getFullYear()})</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.monthlyProfitBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Month</th>
                    <th className="text-right py-2 font-medium text-green-600">Income</th>
                    <th className="text-right py-2 font-medium text-red-600">Expense</th>
                    <th className="text-right py-2 font-medium">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = i + 1;
                    const monthName = new Date(2026, i).toLocaleString("en", { month: "short" });
                    const inc = summary.monthlyProfitBreakdown.find(r => Number(r.month) === month && r.type === "income");
                    const exp = summary.monthlyProfitBreakdown.find(r => Number(r.month) === month && r.type === "expense");
                    const incVal = inc ? Number(inc.total) : 0;
                    const expVal = exp ? Number(exp.total) : 0;
                    const profit = incVal - expVal;
                    if (incVal === 0 && expVal === 0) return null;
                    return (
                      <tr key={month} className="border-b border-muted/50">
                        <td className="py-2 font-medium">{monthName}</td>
                        <td className="py-2 text-right text-green-600">{fmt(incVal)}</td>
                        <td className="py-2 text-right text-red-600">{fmt(expVal)}</td>
                        <td className={`py-2 text-right font-semibold ${profit >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(profit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
