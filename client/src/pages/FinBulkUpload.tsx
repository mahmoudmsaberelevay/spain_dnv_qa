import { useState, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Download, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";

type ParsedRow = {
  type: "income" | "expense" | "transfer";
  description: string;
  accountId?: number;
  fromAccountId?: number;
  toAccountId?: number;
  categoryId?: number;
  employeeId?: number;
  finClientId?: number;
  amount: number;
  exchangeRate?: number;
  note?: string;
  transactionDate: Date;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function FinBulkUpload() {
  const { data: accounts } = trpc.financial.accounts.list.useQuery();
  const { data: categories } = trpc.financial.categories.list.useQuery();
  const { data: employees } = trpc.financial.employees.list.useQuery();

  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);

  const upload = trpc.financial.bulk.upload.useMutation({
    onSuccess: (data) => {
      setResult(data);
      if (data.created > 0) {
        // success handled by result state
      }
    },
    onError: (err) => {
      setErrors(prev => [...prev, `Upload failed: ${err.message}`]);
    },
  });

  const accountMap = useMemo(() => {
    const m = new Map<string, number>();
    accounts?.forEach(a => { m.set(a.name.toLowerCase(), a.id); m.set(String(a.id), a.id); });
    return m;
  }, [accounts]);

  const categoryMap = useMemo(() => {
    const m = new Map<string, number>();
    categories?.forEach(c => { m.set(c.name.toLowerCase(), c.id); m.set(String(c.id), c.id); });
    return m;
  }, [categories]);

  const employeeMap = useMemo(() => {
    const m = new Map<string, number>();
    employees?.forEach(e => { m.set(e.name.toLowerCase(), e.id); m.set(String(e.id), e.id); });
    return m;
  }, [employees]);

  const resolveId = (map: Map<string, number>, val: any): number | undefined => {
    if (val == null || val === "") return undefined;
    const str = String(val).trim().toLowerCase();
    return map.get(str) ?? (isNaN(Number(val)) ? undefined : Number(val));
  };

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const parsedRows: ParsedRow[] = [];
        const parseErrors: string[] = [];

        rows.forEach((row, idx) => {
          const rowNum = idx + 2; // +2 for header row + 0-index
          const type = String(row.type || row.Type || "").toLowerCase().trim();
          if (!["income", "expense", "transfer"].includes(type)) {
            parseErrors.push(`Row ${rowNum}: Invalid type "${type}"`);
            return;
          }
          const amount = Number(row.amount || row.Amount || 0);
          if (!amount || amount <= 0) {
            parseErrors.push(`Row ${rowNum}: Invalid amount`);
            return;
          }
          const dateVal = row.date || row.Date || row.transactionDate || row.transaction_date;
          let txDate: Date;
          if (dateVal instanceof Date) {
            txDate = dateVal;
          } else {
            txDate = new Date(dateVal);
            if (isNaN(txDate.getTime())) {
              parseErrors.push(`Row ${rowNum}: Invalid date "${dateVal}"`);
              return;
            }
          }
          const description = String(row.description || row.Description || "").trim();
          if (!description) {
            parseErrors.push(`Row ${rowNum}: Missing description`);
            return;
          }

          const parsed: ParsedRow = {
            type: type as any,
            description,
            amount,
            transactionDate: txDate,
            note: row.note || row.Note || undefined,
          };

          if (type === "transfer") {
            parsed.fromAccountId = resolveId(accountMap, row.from_account || row.fromAccount || row.account || row.Account);
            parsed.toAccountId = resolveId(accountMap, row.to_account || row.toAccount);
            parsed.exchangeRate = row.exchange_rate || row.exchangeRate ? Number(row.exchange_rate || row.exchangeRate) : undefined;
            if (!parsed.fromAccountId) parseErrors.push(`Row ${rowNum}: Cannot resolve from account`);
            if (!parsed.toAccountId) parseErrors.push(`Row ${rowNum}: Cannot resolve to account`);
          } else {
            parsed.accountId = resolveId(accountMap, row.account || row.Account || row.accountId);
            parsed.categoryId = resolveId(categoryMap, row.category || row.Category || row.categoryId);
            if (!parsed.accountId) parseErrors.push(`Row ${rowNum}: Cannot resolve account`);
            if (type === "expense") {
              parsed.employeeId = resolveId(employeeMap, row.employee || row.Employee || row.employeeId);
            }
          }

          parsedRows.push(parsed);
        });

        setParsed(parsedRows);
        setErrors(parseErrors);
      } catch (err: any) {
        setErrors([`Failed to parse file: ${err.message}`]);
        setParsed([]);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [accountMap, categoryMap, employeeMap]);

  const handleUpload = () => {
    if (parsed.length === 0) return;
    upload.mutate({ transactions: parsed });
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["type", "description", "account", "category", "employee", "from_account", "to_account", "amount", "exchange_rate", "note", "date"],
      ["income", "Client Payment - John", "Elevay EGP", "Consulting Fees", "", "", "", 50000, "", "First payment", "2026-04-01"],
      ["expense", "Office Rent April", "Elevay EGP", "Office Rent", "Mohamed Abdelfatah", "", "", 15000, "", "", "2026-04-01"],
      ["transfer", "EUR to EGP conversion", "", "", "", "Elevay EUR", "Elevay EGP", 1000, 62.14, "", "2026-04-01"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, "elevay_bulk_upload_template.xlsx");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bulk Upload</h1>
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="h-4 w-4 mr-2" /> Download Template
        </Button>
      </div>

      {/* Upload area */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 cursor-pointer hover:border-primary/50 transition-colors">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">{fileName || "Click to upload Excel file (.xlsx, .xls)"}</p>
            <p className="text-xs text-muted-foreground mt-1">Columns: type, description, account, category, employee, from_account, to_account, amount, exchange_rate, note, date</p>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          </label>
        </CardContent>
      </Card>

      {/* Parse errors */}
      {errors.length > 0 && (
        <Card className="border-0 shadow-sm border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-600 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> {errors.length} Parse Warning{errors.length > 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {errors.map((err, i) => (
                <p key={i} className="text-xs text-muted-foreground">{err}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {parsed.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{parsed.length} Transactions Ready</CardTitle>
              <Button size="sm" onClick={handleUpload} disabled={upload.isPending}>
                {upload.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Import All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">#</th>
                    <th className="text-left py-2 font-medium">Type</th>
                    <th className="text-left py-2 font-medium">Description</th>
                    <th className="text-right py-2 font-medium">Amount</th>
                    <th className="text-left py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 50).map((tx, i) => (
                    <tr key={i} className="border-b border-muted/50">
                      <td className="py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5 capitalize">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tx.type === "income" ? "bg-green-100 text-green-700" : tx.type === "expense" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-1.5 font-medium max-w-[200px] truncate">{tx.description}</td>
                      <td className="py-1.5 text-right">{fmt(tx.amount)}</td>
                      <td className="py-1.5 text-muted-foreground">{tx.transactionDate.toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 50 && <p className="text-xs text-muted-foreground mt-2 text-center">Showing first 50 of {parsed.length} rows</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && (
        <Card className="border-0 shadow-sm border-l-4 border-l-green-500">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <div>
                <p className="font-semibold">{result.created} transactions imported successfully</p>
                {result.errors.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {result.errors.map((err, i) => (
                      <p key={i} className="text-xs text-red-600">{err}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">How to use Bulk Upload</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p>1. Download the template using the button above.</p>
          <p>2. Fill in your transactions — each row is one transaction.</p>
          <p>3. <strong>type</strong>: "income", "expense", or "transfer".</p>
          <p>4. <strong>account</strong>: Account name (e.g., "Elevay EGP") or ID. For transfers, use <strong>from_account</strong> and <strong>to_account</strong>.</p>
          <p>5. <strong>category</strong>: Category name or ID (for income/expense only).</p>
          <p>6. <strong>employee</strong>: Employee name or ID (for expenses only, optional).</p>
          <p>7. <strong>exchange_rate</strong>: Required for cross-currency transfers.</p>
          <p>8. <strong>date</strong>: Date in YYYY-MM-DD format.</p>
          <p>9. Upload the file and review the preview, then click "Import All".</p>
        </CardContent>
      </Card>
    </div>
  );
}
