import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Search, Plus, Phone, MapPin, User, TrendingDown, TrendingUp,
  ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, FileDown, PlusCircle, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

const CONSULTANTS = ["Mahmoud", "Ziad", "Kirolos", "Fouad"];
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

type SortField = "clientCode" | "name" | "program" | "consultant" | "contractValueEur" | "paidAmountEur" | "remainingAmountEur" | "signingDate";
type SortDir = "asc" | "desc";

function fmtEur(n: number | string | null | undefined) {
  if (n === null || n === undefined) return "—";
  const num = Number(n);
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
  return sortDir === "asc"
    ? <ArrowUp className="h-3 w-3 ml-1 text-primary" />
    : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
}

export default function FinClients() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [codeFilter, setCodeFilter] = useState("");
  const [debouncedCode, setDebouncedCode] = useState("");
  const [consultant, setConsultant] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("clientCode");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [showAdd, setShowAdd] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [paymentClient, setPaymentClient] = useState<{ id: number; name: string; remaining: number } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [showRateDialog, setShowRateDialog] = useState(false);
  const [rateInput, setRateInput] = useState("");

  // Debounce search
  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(0);
    clearTimeout((window as any)._searchTimer);
    (window as any)._searchTimer = setTimeout(() => setDebouncedSearch(v), 400);
  };

  const handleCodeFilter = (v: string) => {
    setCodeFilter(v);
    setPage(0);
    clearTimeout((window as any)._codeTimer);
    (window as any)._codeTimer = setTimeout(() => setDebouncedCode(v), 400);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(0);
  };

  // Combine search and code filter into a single search string
  const combinedSearch = useMemo(() => {
    if (debouncedCode) return debouncedCode; // code filter takes priority
    return debouncedSearch || undefined;
  }, [debouncedSearch, debouncedCode]);

  const queryParams = useMemo(() => ({
    search: combinedSearch,
    consultant: consultant !== "all" ? consultant : undefined,
    limit: pageSize,
    offset: page * pageSize,
    sortField: sortField,
    sortDir: sortDir,
  }), [combinedSearch, consultant, page, pageSize, sortField, sortDir]);

  const countParams = useMemo(() => ({
    search: combinedSearch,
    consultant: consultant !== "all" ? consultant : undefined,
  }), [combinedSearch, consultant]);

  // Fetch all for export (no limit) — only when exporting
  const { data: allClientsForExport } = trpc.financial.clients.list.useQuery(
    { search: combinedSearch, consultant: consultant !== "all" ? consultant : undefined },
    { enabled: false }
  );

  const { data: clients, isLoading } = trpc.financial.clients.list.useQuery(queryParams);
  const { data: total } = trpc.financial.clients.count.useQuery(countParams);
  const { data: grandTotals } = trpc.financial.clients.totals.useQuery(countParams);
  const utils = trpc.useUtils();
  const { data: rateData } = trpc.financial.settings.getEurEgpRate.useQuery();
  const eurEgpRate = rateData?.rate ?? 55.5;
  const setRateMutation = trpc.financial.settings.setEurEgpRate.useMutation({
    onSuccess: (data) => {
      toast.success(`EUR/EGP rate updated to ${data.rate}`);
      utils.financial.settings.getEurEgpRate.invalidate();
      setShowRateDialog(false);
    },
    onError: (e) => toast.error("Failed to update rate: " + e.message),
  });

  const totalPages = Math.ceil((total ?? 0) / pageSize);

  const setPaidAmountMutation = trpc.financial.clients.setPaidAmount.useMutation({
    onSuccess: (data) => {
      toast.success(`Paid amount updated! Paid EGP: ${Number(data.newPaidEgp).toLocaleString()} | Paid EUR: €${Number(data.newPaidEur).toFixed(2)} | Remaining: €${Number(data.newRemaining).toFixed(2)}`);
      utils.financial.clients.list.invalidate();
      utils.financial.clients.count.invalidate();
      utils.financial.clients.totals.invalidate();
      setPaymentClient(null);
      setPaymentAmount("");
    },
    onError: (err) => toast.error(err.message),
  });

  // Use server-sorted data directly (no client-side sort)
  const sortedClients = clients ?? [];

  // PDF Export
  const handleExport = async () => {
    setExporting(true);
    try {
      // Fetch all matching records
      const allData = await utils.financial.clients.list.fetch({
        search: combinedSearch,
        consultant: consultant !== "all" ? consultant : undefined,
        limit: 10000,
        offset: 0,
        sortField: sortField,
        sortDir: sortDir,
      });

      // Already sorted by server
      const sorted = allData;

      // Build HTML for print
      const filterDesc = [
        consultant !== "all" ? `Consultant: ${consultant}` : "",
        combinedSearch ? `Filter: "${combinedSearch}"` : "",
      ].filter(Boolean).join(" | ") || "All Clients";

      const rows = sorted.map(c => {
        const remaining = Number(c.remainingAmountEur ?? 0);
        const paid = Number(c.paidAmountEur ?? 0);
        const contractVal = Number(c.contractValueEur ?? 0);
        const remainingStr = remaining < 0
          ? `€ ${fmtEur(Math.abs(remaining))} (overpaid)`
          : remaining === 0 ? "Fully Paid"
          : `€ ${fmtEur(remaining)}`;
        const remainingColor = remaining < 0 ? "#16a34a" : remaining === 0 ? "#6b7280" : "#dc2626";
        return `<tr>
          <td style="border:1px solid #e5e7eb;padding:6px 8px;font-family:monospace;font-size:11px">${c.clientCode || "—"}</td>
          <td style="border:1px solid #e5e7eb;padding:6px 8px;font-size:12px;font-weight:500">${c.name}</td>
          <td style="border:1px solid #e5e7eb;padding:6px 8px;font-size:11px">${c.program || "Spain Nomad"}</td>
          <td style="border:1px solid #e5e7eb;padding:6px 8px;font-size:11px">${c.consultant || "—"}</td>
          <td style="border:1px solid #e5e7eb;padding:6px 8px;text-align:right;font-size:11px">${contractVal > 0 ? `€ ${fmtEur(contractVal)}` : "—"}</td>
          <td style="border:1px solid #e5e7eb;padding:6px 8px;text-align:right;font-size:11px;color:#15803d">${paid > 0 ? `€ ${fmtEur(paid)}` : "—"}</td>
          <td style="border:1px solid #e5e7eb;padding:6px 8px;text-align:right;font-size:11px;font-weight:600;color:${remainingColor}">${remainingStr}</td>
          <td style="border:1px solid #e5e7eb;padding:6px 8px;text-align:right;font-size:11px;color:#dc2626">${Number(c.totalDirectCostEgp) > 0 ? 'EGP ' + Number(c.totalDirectCostEgp).toLocaleString('en-US',{maximumFractionDigits:0}) : '\u2014'}</td>
          <td style="border:1px solid #e5e7eb;padding:6px 8px;text-align:right;font-size:11px;font-weight:600;color:${(Number(c.totalDirectIncomeEgp)||0)-(Number(c.totalDirectCostEgp)||0)>=0?'#16a34a':'#dc2626'}">${(() => { const inc=Number(c.totalDirectIncomeEgp)||0; const cst=Number(c.totalDirectCostEgp)||0; if(!inc&&!cst) return '\u2014'; const p=inc-cst; return (p>=0?'+':'-')+'EGP '+Math.abs(p).toLocaleString('en-US',{maximumFractionDigits:0}); })()}</td>
          <td style="border:1px solid #e5e7eb;padding:6px 8px;font-size:10px;color:#6b7280">${c.phone || ""}</td>
        </tr>`;
      }).join("");

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Elevay — Client Database</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; color: #111; }
    h1 { color: #1e293b; font-size: 20px; margin-bottom: 4px; }
    .meta { color: #6b7280; font-size: 12px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #1e293b; color: white; }
    thead th { padding: 8px; font-size: 11px; text-align: left; border: 1px solid #334155; }
    thead th:nth-child(5), thead th:nth-child(6), thead th:nth-child(7) { text-align: right; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    @media print { body { margin: 10px; } }
  </style>
</head>
<body>
  <h1>Elevay — Client Database</h1>
  <div class="meta">
    Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} &nbsp;|&nbsp;
    ${filterDesc} &nbsp;|&nbsp; ${sorted.length} clients
  </div>
  <table>
    <thead>
      <tr>
        <th>Code</th><th>Client Name</th><th>Program</th><th>Consultant</th>
        <th style="text-align:right">Contract Value</th>
        <th style="text-align:right">Paid</th>
        <th style="text-align:right">Remaining Due</th>
        <th style="text-align:right">Direct Cost</th>
        <th style="text-align:right">Profit</th>
        <th>Phone</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); }, 500);
      }
    } catch (e: any) {
      toast.error("Export failed: " + e.message);
    } finally {
      setExporting(false);
    }
  };

  // CSV Export
  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const result = await utils.financial.clients.exportCsv.fetch({
        search: combinedSearch,
        consultant: consultant !== "all" ? consultant : undefined,
      });
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `elevay-clients-${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("CSV exported successfully");
    } catch (e: any) {
      toast.error("CSV export failed: " + e.message);
    } finally {
      setExportingCsv(false);
    }
  };

  // Add client form state
  const [form, setForm] = useState({
    clientCode: "", name: "", phone: "", address: "", program: "Spain Nomad",
    salesPerson: "", consultant: "Mahmoud", contractValueEur: "", paidAmountEur: "",
  });
  const createMutation = trpc.financial.clients.create.useMutation({
    onSuccess: () => {
      toast.success("Client added successfully");
      setShowAdd(false);
      setForm({ clientCode: "", name: "", phone: "", address: "", program: "Spain Nomad", salesPerson: "", consultant: "Mahmoud", contractValueEur: "", paidAmountEur: "" });
      utils.financial.clients.list.invalidate();
      utils.financial.clients.count.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleAdd = () => {
    if (!form.name.trim()) return toast.error("Client name is required");
    const cvEur = parseFloat(form.contractValueEur) || 0;
    const paidEur = parseFloat(form.paidAmountEur) || 0;
    createMutation.mutate({
      clientCode: form.clientCode || undefined,
      name: form.name.trim(),
      phone: form.phone || undefined,
      address: form.address || undefined,
      program: form.program || undefined,
      salesPerson: form.salesPerson || undefined,
      consultant: form.consultant || undefined,
      contractValueEur: cvEur,
      paidAmountEur: paidEur,
      isLegacy: false,
    });
  };

  const thClass = "py-3 px-4 font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Client Database</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total !== undefined ? `${total} clients` : "Loading..."}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => { setRateInput(String(eurEgpRate)); setShowRateDialog(true); }}
            className="text-amber-600 border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 font-mono"
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />
            EUR/EGP: {eurEgpRate.toFixed(2)}
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            <FileDown className="h-4 w-4 mr-1.5" />
            {exporting ? "Preparing..." : "Export PDF"}
          </Button>
          <Button variant="outline" onClick={handleExportCsv} disabled={exportingCsv}>
            <FileDown className="h-4 w-4 mr-1.5" />
            {exportingCsv ? "Exporting..." : "Export CSV"}
          </Button>
          <Button onClick={() => setShowAdd(true)} className="bg-primary">
            <Plus className="h-4 w-4 mr-1.5" /> Add Client
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => { handleSearch(e.target.value); if (e.target.value) { setCodeFilter(""); setDebouncedCode(""); } }}
            className="pl-9"
          />
        </div>
        <div className="relative w-[160px]">
          <Input
            placeholder="Filter by code..."
            value={codeFilter}
            onChange={(e) => { handleCodeFilter(e.target.value); if (e.target.value) { setSearch(""); setDebouncedSearch(""); } }}
          />
        </div>
        <Select value={consultant} onValueChange={(v) => { setConsultant(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Consultants" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Consultants</SelectItem>
            {CONSULTANTS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortField + "_" + sortDir} onValueChange={(v) => {
          const [f, d] = v.split("_") as [SortField, SortDir];
          setSortField(f); setSortDir(d); setPage(0);
        }}>
          <SelectTrigger className="w-[210px]">
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="clientCode_asc">Code: A → Z</SelectItem>
            <SelectItem value="clientCode_desc">Code: Z → A</SelectItem>
            <SelectItem value="name_asc">Name: A → Z</SelectItem>
            <SelectItem value="name_desc">Name: Z → A</SelectItem>
            <SelectItem value="consultant_asc">Consultant: A → Z</SelectItem>
            <SelectItem value="consultant_desc">Consultant: Z → A</SelectItem>
            <SelectItem value="program_asc">Program: A → Z</SelectItem>
            <SelectItem value="signingDate_desc">Signing Date: Newest</SelectItem>
            <SelectItem value="signingDate_asc">Signing Date: Oldest</SelectItem>
            <SelectItem value="contractValueEur_desc">Contract Value: High → Low</SelectItem>
            <SelectItem value="contractValueEur_asc">Contract Value: Low → High</SelectItem>
            <SelectItem value="paidAmountEur_desc">Paid: High → Low</SelectItem>
            <SelectItem value="paidAmountEur_asc">Paid: Low → High</SelectItem>
            <SelectItem value="remainingAmountEur_desc">Remaining: High → Low</SelectItem>
            <SelectItem value="remainingAmountEur_asc">Remaining: Low → High</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !sortedClients || sortedClients.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No clients found</p>
              {(debouncedSearch || debouncedCode) && <p className="text-sm mt-1">Try a different search term</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className={`${thClass} text-left`} onClick={() => handleSort("clientCode")}>
                      <span className="flex items-center">Code <SortIcon field="clientCode" sortField={sortField} sortDir={sortDir} /></span>
                    </th>
                    <th className={`${thClass} text-left`} onClick={() => handleSort("name")}>
                      <span className="flex items-center">Client Name <SortIcon field="name" sortField={sortField} sortDir={sortDir} /></span>
                    </th>
                    <th className={`${thClass} text-left`} onClick={() => handleSort("program")}>
                      <span className="flex items-center">Program <SortIcon field="program" sortField={sortField} sortDir={sortDir} /></span>
                    </th>
                    <th className={`${thClass} text-left`} onClick={() => handleSort("consultant")}>
                      <span className="flex items-center">Consultant <SortIcon field="consultant" sortField={sortField} sortDir={sortDir} /></span>
                    </th>
                    <th className={`${thClass} text-right`} onClick={() => handleSort("contractValueEur")}>
                      <span className="flex items-center justify-end">Contract Value <SortIcon field="contractValueEur" sortField={sortField} sortDir={sortDir} /></span>
                    </th>
                    <th className={`${thClass} text-right`} onClick={() => handleSort("paidAmountEur")}>
                      <span className="flex items-center justify-end">Paid (€) <SortIcon field="paidAmountEur" sortField={sortField} sortDir={sortDir} /></span>
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Paid (EGP)</th>
                    <th className={`${thClass} text-right`} onClick={() => handleSort("remainingAmountEur")}>
                      <span className="flex items-center justify-end">Remaining Due <SortIcon field="remainingAmountEur" sortField={sortField} sortDir={sortDir} /></span>
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Direct Cost</th>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Profit</th>
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Contact</th>
                    <th className="text-center py-3 px-4 font-semibold text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedClients.map((c) => {
                    const remaining = Number(c.remainingAmountEur ?? 0);
                    const paid = Number(c.paidAmountEur ?? 0);
                    const contractVal = Number(c.contractValueEur ?? 0);
                    const isNegative = remaining < 0;
                    return (
                      <tr key={c.id} className="border-b border-muted/40 hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            {c.clientCode || "—"}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium">{c.name}</div>
                          {c.signingDate && (
                            <div className="text-xs text-muted-foreground">
                              {new Date(c.signingDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="outline" className="text-xs font-normal">
                            {c.program || "Spain Nomad"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{c.consultant || "—"}</td>
                        <td className="py-3 px-4 text-right font-medium">
                          {contractVal > 0 ? `€ ${fmtEur(contractVal)}` : "—"}
                        </td>
                        <td className="py-3 px-4 text-right text-green-700 font-medium">
                          {paid > 0 ? `€ ${fmtEur(paid)}` : "—"}
                        </td>
                        <td className="py-3 px-4 text-right text-blue-700 font-medium">
                          {Number(c.paidAmountEgp ?? 0) > 0
                            ? `EGP ${Number(c.paidAmountEgp ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : "—"}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold">
                          <span className={isNegative ? "text-green-600" : remaining === 0 ? "text-muted-foreground" : "text-red-600"}>
                            {isNegative ? (
                              <span className="flex items-center justify-end gap-1">
                                <TrendingUp className="h-3 w-3" /> € {fmtEur(Math.abs(remaining))} overpaid
                              </span>
                            ) : remaining === 0 ? (
                              "Fully Paid"
                            ) : (
                              <span className="flex items-center justify-end gap-1">
                                <TrendingDown className="h-3 w-3" /> € {fmtEur(remaining)}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-red-600 font-medium">
                          {Number(c.totalDirectCostEgp) > 0
                            ? `EGP ${Number(c.totalDirectCostEgp).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                            : "\u2014"}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold">
                          {(() => {
                            const income = Number(c.totalDirectIncomeEgp) || 0;
                            const cost = Number(c.totalDirectCostEgp) || 0;
                            if (income === 0 && cost === 0) return <span className="text-muted-foreground">\u2014</span>;
                            const profit = income - cost;
                            return (
                              <span className={profit >= 0 ? "text-green-600" : "text-red-600"}>
                                {profit >= 0 ? "+" : "-"}EGP {Math.abs(profit).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-0.5">
                            {c.phone && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Phone className="h-3 w-3" /> {c.phone}
                              </span>
                            )}
                            {c.address && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" /> {c.address}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs gap-1 text-blue-700 border-blue-300 hover:bg-blue-50"
                            onClick={() => {
                              setPaymentClient({ id: c.id, name: c.name, remaining: Number(c.remainingAmountEur ?? 0) });
                              setPaymentAmount(String(Number(c.paidAmountEgp ?? 0)));
                            }}
                          >
                            <PlusCircle className="h-3 w-3" /> Edit Paid
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Grand Totals row — all pages */}
                {grandTotals && (
                  <tfoot>
                    <tr className="border-t-2 border-primary/30 bg-primary/5 font-semibold text-sm">
                      <td className="py-3 px-4 text-xs font-bold text-primary" colSpan={4}>GRAND TOTAL — ALL {(total ?? 0).toLocaleString()} CLIENTS</td>
                      <td className="py-3 px-4 text-right">{Number(grandTotals.totalContractValueEur) > 0 ? `€ ${fmtEur(grandTotals.totalContractValueEur)}` : "—"}</td>
                      <td className="py-3 px-4 text-right text-green-700">{Number(grandTotals.totalPaidEur) > 0 ? `€ ${fmtEur(grandTotals.totalPaidEur)}` : "—"}</td>
                      <td className="py-3 px-4 text-right text-blue-700">{Number(grandTotals.totalPaidEgp) > 0 ? `EGP ${Number(grandTotals.totalPaidEgp).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                      <td className="py-3 px-4 text-right text-red-600">{`€ ${fmtEur(grandTotals.totalRemainingEur)}`}</td>
                      <td className="py-3 px-4 text-right text-red-600">{Number(grandTotals.totalDirectCostEgp) > 0 ? `EGP ${Number(grandTotals.totalDirectCostEgp).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : "—"}</td>
                      <td className="py-3 px-4 text-right">
                        {(() => {
                          const income = Number(grandTotals.totalDirectIncomeEgp) || 0;
                          const cost = Number(grandTotals.totalDirectCostEgp) || 0;
                          const profit = income - cost;
                          if (income === 0 && cost === 0) return <span className="text-muted-foreground">—</span>;
                          return <span className={profit >= 0 ? "text-green-600" : "text-red-600"}>{profit >= 0 ? "+" : "-"}EGP {Math.abs(profit).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>;
                        })()}
                      </td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {total ? `Showing ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} of ${total} clients` : ""}
          </p>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Rows per page:</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
              <SelectTrigger className="h-7 w-16 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {totalPages > 1 && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <span className="flex items-center text-sm text-muted-foreground px-2">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Add Client Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Client Code</Label>
                <Input placeholder="e.g. 26027" value={form.clientCode} onChange={e => setForm(f => ({ ...f, clientCode: e.target.value }))} />
              </div>
              <div>
                <Label>Program</Label>
                <Input placeholder="Spain Nomad" value={form.program} onChange={e => setForm(f => ({ ...f, program: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Client Name <span className="text-red-500">*</span></Label>
              <Input placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Consultant</Label>
                <Select value={form.consultant} onValueChange={v => setForm(f => ({ ...f, consultant: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONSULTANTS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sales Person</Label>
                <Input placeholder="Full name" value={form.salesPerson} onChange={e => setForm(f => ({ ...f, salesPerson: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contract Value (€)</Label>
                <Input type="number" placeholder="8000" value={form.contractValueEur} onChange={e => setForm(f => ({ ...f, contractValueEur: e.target.value }))} />
              </div>
              <div>
                <Label>Paid Amount (€)</Label>
                <Input type="number" placeholder="0" value={form.paidAmountEur} onChange={e => setForm(f => ({ ...f, paidAmountEur: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input placeholder="+20..." value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <Label>Address</Label>
                <Input placeholder="Cairo, Egypt" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
            </div>
            {form.contractValueEur && (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded p-3">
                Remaining due: <span className="font-semibold text-foreground">
                  € {fmtEur((parseFloat(form.contractValueEur) || 0) - (parseFloat(form.paidAmountEur) || 0))}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding..." : "Add Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EUR/EGP Exchange Rate Dialog */}
      <Dialog open={showRateDialog} onOpenChange={setShowRateDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-amber-600" />
              Set EUR / EGP Exchange Rate
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
              This rate is used to convert EGP payments to EUR across the entire Client Database.
              Current rate: <strong>1 EUR = {eurEgpRate.toFixed(2)} EGP</strong>
              {rateData?.updatedBy && (
                <p className="mt-1 text-xs opacity-70">Last updated by {rateData.updatedBy}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>New Exchange Rate (EGP per 1 EUR) <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                step="0.01"
                min="1"
                max="1000"
                placeholder="e.g. 55.50"
                value={rateInput}
                onChange={e => setRateInput(e.target.value)}
                autoFocus
              />
            </div>
            {rateInput && Number(rateInput) > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p className="text-muted-foreground">Example: EGP 100,000 &rarr; <strong className="text-foreground">€ {(100000 / Number(rateInput)).toFixed(2)}</strong></p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRateDialog(false)}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!rateInput || Number(rateInput) <= 0 || setRateMutation.isPending}
              onClick={() => {
                const r = parseFloat(rateInput);
                if (!r || r <= 0) return toast.error("Please enter a valid rate");
                setRateMutation.mutate({ rate: r });
              }}
            >
              {setRateMutation.isPending ? "Saving..." : "Update Rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Paid Amount Dialog */}
      <Dialog open={!!paymentClient} onOpenChange={(open) => { if (!open) { setPaymentClient(null); setPaymentAmount(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-blue-600" />
              Edit Paid Amount
            </DialogTitle>
          </DialogHeader>
          {paymentClient && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="font-medium text-foreground">{paymentClient.name}</p>
                <p className="text-muted-foreground mt-1 text-xs">Enter the total paid amount in EGP. This will <strong>replace</strong> the current value and recalculate EUR and remaining balance.</p>
              </div>
              <div className="space-y-1">
                <Label>Total Paid Amount (EGP) <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  placeholder="e.g. 555000"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  autoFocus
                />
              </div>
              {paymentAmount !== "" && Number(paymentAmount) >= 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm space-y-1">
                  <p className="text-blue-800">
                    <span className="font-medium">Paid EUR (new):</span> € {fmtEur(Number(paymentAmount) / 55.5)}
                  </p>
                  <p className="text-blue-800">
                    <span className="font-medium">Remaining (new):</span> € {fmtEur(paymentClient.remaining + (Number(paymentAmount === "" ? 0 : paymentAmount) / 55.5) - (Number(paymentAmount) / 55.5))}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPaymentClient(null); setPaymentAmount(""); }}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={paymentAmount === "" || Number(paymentAmount) < 0 || setPaidAmountMutation.isPending}
              onClick={() => {
                if (!paymentClient || paymentAmount === "") return;
                setPaidAmountMutation.mutate({ clientId: paymentClient.id, paidAmountEgp: Number(paymentAmount) });
              }}
            >
              {setPaidAmountMutation.isPending ? "Saving..." : "Save Paid Amount"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
