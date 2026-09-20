import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import FinFilterBar, { FinFilters } from "@/components/FinFilterBar";
import { FileDown, FileSpreadsheet, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { calendarDateToDateOnly } from "@shared/financialDateRange";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

type EntityType = "all" | "client" | "category" | "employee";

export default function FinReport() {
  const [entityType, setEntityType] = useState<EntityType>("all");
  const [entityId, setEntityId] = useState<string>("");
  const [txType, setTxType] = useState<"all" | "income" | "expense">("all");
  const [filters, setFilters] = useState<FinFilters>({ sortField: "transactionDate", sortDir: "desc" });
  const [clientSearch, setClientSearch] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  const { data: categories } = trpc.financial.categories.list.useQuery();
  const { data: employees } = trpc.financial.employees.list.useQuery();
  const { data: clientsData } = trpc.financial.clients.list.useQuery({ limit: 500 });
  const { data: accounts } = trpc.financial.accounts.list.useQuery();

  const allClients = Array.isArray(clientsData) ? clientsData : [];
  const filteredClients = allClients.filter((c: { id: number; name: string; clientCode?: string | null }) =>
    !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()) || (c.clientCode ?? "").toLowerCase().includes(clientSearch.toLowerCase())
  );

  // Build query params
  const queryParams = useMemo(() => ({
    type: txType === "all" ? undefined : txType as "income" | "expense",
    from: calendarDateToDateOnly(filters.from),
    to: calendarDateToDateOnly(filters.to),
    categoryId: entityType === "category" && entityId ? Number(entityId) : filters.categoryId,
    employeeId: entityType === "employee" && entityId ? Number(entityId) : filters.employeeId,
    finClientId: entityType === "client" && entityId ? Number(entityId) : filters.finClientId,
    sortField: filters.sortField,
    sortDir: filters.sortDir,
  }), [entityType, entityId, txType, filters]);

  const { data: transactions, isLoading } = trpc.financial.transactions.list.useQuery(queryParams);

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

  const clientMap = useMemo(() => {
    const m = new Map<number, string>();
    allClients.forEach((c: { id: number; name: string; clientCode?: string | null }) =>
      m.set(c.id, c.clientCode ? `${c.clientCode} — ${c.name}` : c.name)
    );
    return m;
  }, [allClients]);

  const totals = useMemo(() => {
    if (!transactions) return { income: 0, expense: 0, net: 0, count: 0 };
    let income = 0, expense = 0;
    for (const tx of transactions) {
      if (tx.type === "income") income += Number(tx.amount);
      else if (tx.type === "expense") expense += Number(tx.amount);
    }
    return { income, expense, net: income - expense, count: transactions.length };
  }, [transactions]);

  // Entity label for display
  const entityLabel = useMemo(() => {
    if (!entityId) return "";
    if (entityType === "client") return clientMap.get(Number(entityId)) ?? "";
    if (entityType === "category") return categories?.find(c => c.id === Number(entityId))?.name ?? "";
    if (entityType === "employee") return employees?.find(e => e.id === Number(entityId))?.name ?? "";
    return "";
  }, [entityType, entityId, clientMap, categories, employees]);

  const reportTitle = entityLabel
    ? `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} Report — ${entityLabel}`
    : "Full Transaction Report";

  // ─── Excel Export ────────────────────────────────────────────────────────────
  const exportExcel = () => {
    if (!transactions?.length) return;
    const rows = transactions.map(tx => ({
      Date: new Date(tx.transactionDate).toLocaleDateString(),
      Type: tx.type,
      Description: tx.description,
      Category: tx.categoryId ? categoryMap.get(tx.categoryId) ?? "" : "",
      Account: tx.accountId ? accountMap.get(tx.accountId) ?? "" : "",
      Employee: tx.employeeId ? employeeMap.get(tx.employeeId) ?? "" : "",
      Client: tx.finClientId ? clientMap.get(tx.finClientId) ?? "" : "",
      Amount: Number(tx.amount),
      Note: tx.note ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `elevay-report-${Date.now()}.xlsx`);
  };

  // ─── PDF Export (print) ───────────────────────────────────────────────────────
  const exportPDF = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>${reportTitle}</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 24px; }
            h1 { font-size: 18px; margin-bottom: 4px; }
            .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
            .summary { display: flex; gap: 24px; margin-bottom: 20px; }
            .summary-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 16px; min-width: 120px; }
            .summary-card .label { font-size: 10px; color: #666; text-transform: uppercase; }
            .summary-card .value { font-size: 16px; font-weight: bold; }
            .income { color: #16a34a; }
            .expense { color: #dc2626; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { background: #f3f4f6; text-align: left; padding: 6px 8px; border-bottom: 2px solid #e5e7eb; }
            td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
            tr:nth-child(even) { background: #fafafa; }
            .text-right { text-align: right; }
            .footer { margin-top: 20px; font-size: 10px; color: #999; text-align: center; }
          </style>
        </head>
        <body>
          <h1>Elevay — ${reportTitle}</h1>
          <div class="meta">Generated: ${new Date().toLocaleString()}</div>
          <div class="summary">
            <div class="summary-card"><div class="label">Total Income</div><div class="value income">${fmt(totals.income)}</div></div>
            <div class="summary-card"><div class="label">Total Expenses</div><div class="value expense">${fmt(totals.expense)}</div></div>
            <div class="summary-card"><div class="label">Net</div><div class="value" style="color:${totals.net >= 0 ? '#16a34a' : '#dc2626'}">${fmt(totals.net)}</div></div>
            <div class="summary-card"><div class="label">Transactions</div><div class="value">${totals.count}</div></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Category</th>
                <th>Account</th>
                <th>Employee</th>
                <th>Client</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${(transactions ?? []).map(tx => `
                <tr>
                  <td>${new Date(tx.transactionDate).toLocaleDateString()}</td>
                  <td>${tx.type}</td>
                  <td>${tx.description}</td>
                  <td>${tx.categoryId ? categoryMap.get(tx.categoryId) ?? "" : ""}</td>
                  <td>${tx.accountId ? accountMap.get(tx.accountId) ?? "" : ""}</td>
                  <td>${tx.employeeId ? employeeMap.get(tx.employeeId) ?? "" : ""}</td>
                  <td>${tx.finClientId ? clientMap.get(tx.finClientId) ?? "" : ""}</td>
                  <td class="text-right ${tx.type === 'income' ? 'income' : tx.type === 'expense' ? 'expense' : ''}">${fmt(Number(tx.amount))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <div class="footer">Elevay Financial System — Confidential</div>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-6" ref={printRef}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Financial Report</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportExcel} disabled={!transactions?.length}>
            <FileSpreadsheet className="h-4 w-4" /> Export Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportPDF} disabled={!transactions?.length}>
            <FileDown className="h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Report Selector */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base mb-3">Report Filters</CardTitle>
          <div className="space-y-3">
            {/* Row 1: Entity type + Transaction type */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">View by:</span>
                <Select value={entityType} onValueChange={v => { setEntityType(v as EntityType); setEntityId(""); }}>
                  <SelectTrigger className="h-8 text-xs w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Transactions</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="category">Category</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Entity selector */}
              {entityType === "client" && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Search client..."
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    className="h-8 text-xs w-48"
                  />
                  <Select value={entityId} onValueChange={setEntityId}>
                    <SelectTrigger className="h-8 text-xs w-56">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredClients.slice(0, 100).map((c: { id: number; name: string; clientCode?: string | null }) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.clientCode && <span className="text-muted-foreground mr-1">{c.clientCode}</span>}
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {entityType === "category" && (
                <Select value={entityId} onValueChange={setEntityId}>
                  <SelectTrigger className="h-8 text-xs w-48">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {entityType === "employee" && (
                <Select value={entityId} onValueChange={setEntityId}>
                  <SelectTrigger className="h-8 text-xs w-48">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees?.map(e => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Transaction type */}
              <Select value={txType} onValueChange={v => setTxType(v as typeof txType)}>
                <SelectTrigger className="h-8 text-xs w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="income">Income Only</SelectItem>
                  <SelectItem value="expense">Expenses Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Row 2: Date range + sort */}
            <FinFilterBar
              filters={filters}
              onChange={setFilters}
              show={{ dateRange: true, sort: true }}
            />
          </div>
        </CardHeader>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Transactions</p>
            <p className="text-2xl font-bold mt-1">{totals.count}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Income</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{fmt(totals.income)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Expenses</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{fmt(totals.expense)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Net</p>
            <p className={`text-2xl font-bold mt-1 ${totals.net >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(totals.net)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{reportTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !transactions?.length ? (
            <div className="text-center py-8 text-muted-foreground">No transactions match the selected filters</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Date</th>
                    <th className="text-left py-2 font-medium">Type</th>
                    <th className="text-left py-2 font-medium">Description</th>
                    <th className="text-left py-2 font-medium">Category</th>
                    <th className="text-left py-2 font-medium">Account</th>
                    <th className="text-left py-2 font-medium">Employee</th>
                    <th className="text-left py-2 font-medium">Client</th>
                    <th className="text-right py-2 font-medium">Amount</th>
                    <th className="text-left py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(tx => (
                    <tr key={tx.id} className="border-b border-muted/50 hover:bg-muted/30">
                      <td className="py-2 text-xs">{new Date(tx.transactionDate).toLocaleDateString()}</td>
                      <td className="py-2">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          tx.type === "income" ? "bg-green-100 text-green-700" :
                          tx.type === "expense" ? "bg-red-100 text-red-700" :
                          "bg-blue-100 text-blue-700"
                        }`}>{tx.type}</span>
                      </td>
                      <td className="py-2 font-medium max-w-[200px] truncate">{tx.description}</td>
                      <td className="py-2 text-muted-foreground text-xs">{tx.categoryId ? categoryMap.get(tx.categoryId) ?? "—" : "—"}</td>
                      <td className="py-2 text-muted-foreground text-xs">{tx.accountId ? accountMap.get(tx.accountId) ?? "—" : "—"}</td>
                      <td className="py-2 text-muted-foreground text-xs">{tx.employeeId ? employeeMap.get(tx.employeeId) ?? "—" : "—"}</td>
                      <td className="py-2 text-muted-foreground text-xs max-w-[140px] truncate">{tx.finClientId ? clientMap.get(tx.finClientId) ?? "—" : "—"}</td>
                      <td className={`py-2 text-right font-semibold ${
                        tx.type === "income" ? "text-green-600" : tx.type === "expense" ? "text-red-600" : ""
                      }`}>{fmt(Number(tx.amount))}</td>
                      <td className="py-2 text-muted-foreground text-xs max-w-[120px] truncate">{tx.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/30">
                    <td colSpan={7} className="py-2 font-semibold text-sm pl-2">Totals ({totals.count} transactions)</td>
                    <td className="py-2 text-right font-bold text-sm">
                      {txType === "income" ? <span className="text-green-600">{fmt(totals.income)}</span>
                        : txType === "expense" ? <span className="text-red-600">{fmt(totals.expense)}</span>
                        : <span className={totals.net >= 0 ? "text-green-600" : "text-red-600"}>{fmt(totals.net)}</span>}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
