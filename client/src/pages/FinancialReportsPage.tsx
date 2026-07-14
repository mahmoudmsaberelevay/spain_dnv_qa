import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Download, ArrowRightLeft, Edit2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";

type DateRange = "today" | "yesterday" | "this_week" | "last_week" | "last_month" | "last_year" | "custom";

function getDateRange(range: DateRange): { from: Date; to: Date } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  switch (range) {
    case "today":
      return { from: today, to: tomorrow };
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: yesterday, to: today };
    }
    case "this_week": {
      const start = new Date(today);
      start.setDate(start.getDate() - start.getDay());
      return { from: start, to: tomorrow };
    }
    case "last_week": {
      const start = new Date(today);
      start.setDate(start.getDate() - start.getDay() - 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { from: start, to: end };
    }
    case "last_month": {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 1);
      start.setDate(1);
      const end = new Date(today);
      end.setDate(1);
      return { from: start, to: end };
    }
    case "last_year": {
      const start = new Date(today);
      start.setFullYear(start.getFullYear() - 1);
      start.setMonth(0);
      start.setDate(1);
      return { from: start, to: tomorrow };
    }
    default:
      return null;
  }
}

export default function FinancialReportsPage() {
  const [dateRange, setDateRange] = useState<DateRange>("last_month");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    summaryDate: new Date().toISOString().split("T")[0],
    totalSalesEgp: "",
    totalIncomeEgp: "",
    totalExpensesEgp: "",
    salariesEgp: "",
    commissionsEgp: "",
    mofaEgp: "",
    embassyEgp: "",
    translationFeesEgp: "",
    lawyerFeesEgp: "",
    officeExpensesEgp: "",
    officeRentEgp: "",
    miscEgp: "",
  });
  const [currencyInput, setCurrencyInput] = useState<"EGP" | "USD" | "EUR">("EGP");

  const range = dateRange === "custom" && customFrom && customTo
    ? { from: new Date(customFrom), to: new Date(customTo) }
    : getDateRange(dateRange);

  // Fetch financial summaries
  const { data: records = [], isLoading, refetch } = trpc.reports.financialMonthlySummary.list.useQuery(
    range ? { dateFrom: range.from, dateTo: range.to } : undefined,
    { enabled: !!range }
  );

  const createMutation = trpc.reports.financialMonthlySummary.create.useMutation({
    onSuccess: () => {
      toast.success("Financial summary created successfully");
      setShowForm(false);
      setEditingId(null);
      setFormData({
        summaryDate: new Date().toISOString().split("T")[0],
        totalSalesEgp: "",
        totalIncomeEgp: "",
        totalExpensesEgp: "",
        salariesEgp: "",
        commissionsEgp: "",
        mofaEgp: "",
        embassyEgp: "",
        translationFeesEgp: "",
        lawyerFeesEgp: "",
        officeExpensesEgp: "",
        officeRentEgp: "",
        miscEgp: "",
      });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create summary");
    },
  });

  const updateMutation = trpc.reports.financialMonthlySummary.update.useMutation({
    onSuccess: () => {
      toast.success("Financial summary updated successfully");
      setShowForm(false);
      setEditingId(null);
      setFormData({
        summaryDate: new Date().toISOString().split("T")[0],
        totalSalesEgp: "",
        totalIncomeEgp: "",
        totalExpensesEgp: "",
        salariesEgp: "",
        commissionsEgp: "",
        mofaEgp: "",
        embassyEgp: "",
        translationFeesEgp: "",
        lawyerFeesEgp: "",
        officeExpensesEgp: "",
        officeRentEgp: "",
        miscEgp: "",
      });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update summary");
    },
  });

  const deleteMutation = trpc.reports.financialMonthlySummary.delete.useMutation({
    onSuccess: () => {
      toast.success("Financial summary deleted successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete summary");
    },
  });

  const convertMutation = trpc.reports.financialMonthlySummary.convert.useQuery(
    { amount: 1, from: currencyInput, to: "USD" },
    { enabled: false }
  );

  const handleSubmit = () => {
    if (!formData.summaryDate) {
      toast.error("Please select a date");
      return;
    }

    const data: any = {
      summaryDate: new Date(formData.summaryDate),
    };

    // Add EGP values
    if (formData.totalSalesEgp) data.totalSalesEgp = parseFloat(formData.totalSalesEgp);
    if (formData.totalIncomeEgp) data.totalIncomeEgp = parseFloat(formData.totalIncomeEgp);
    if (formData.totalExpensesEgp) data.totalExpensesEgp = parseFloat(formData.totalExpensesEgp);
    if (formData.salariesEgp) data.salariesEgp = parseFloat(formData.salariesEgp);
    if (formData.commissionsEgp) data.commissionsEgp = parseFloat(formData.commissionsEgp);
    if (formData.mofaEgp) data.mofaEgp = parseFloat(formData.mofaEgp);
    if (formData.embassyEgp) data.embassyEgp = parseFloat(formData.embassyEgp);
    if (formData.translationFeesEgp) data.translationFeesEgp = parseFloat(formData.translationFeesEgp);
    if (formData.lawyerFeesEgp) data.lawyerFeesEgp = parseFloat(formData.lawyerFeesEgp);
    if (formData.officeExpensesEgp) data.officeExpensesEgp = parseFloat(formData.officeExpensesEgp);
    if (formData.officeRentEgp) data.officeRentEgp = parseFloat(formData.officeRentEgp);
    if (formData.miscEgp) data.miscEgp = parseFloat(formData.miscEgp);

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (record: any) => {
    setEditingId(record.id);
    setFormData({
      summaryDate: new Date(record.summaryDate).toISOString().split("T")[0],
      totalSalesEgp: record.totalSalesEgp?.toString() || "",
      totalIncomeEgp: record.totalIncomeEgp?.toString() || "",
      totalExpensesEgp: record.totalExpensesEgp?.toString() || "",
      salariesEgp: record.salariesEgp?.toString() || "",
      commissionsEgp: record.commissionsEgp?.toString() || "",
      mofaEgp: record.mofaEgp?.toString() || "",
      embassyEgp: record.embassyEgp?.toString() || "",
      translationFeesEgp: record.translationFeesEgp?.toString() || "",
      lawyerFeesEgp: record.lawyerFeesEgp?.toString() || "",
      officeExpensesEgp: record.officeExpensesEgp?.toString() || "",
      officeRentEgp: record.officeRentEgp?.toString() || "",
      miscEgp: record.miscEgp?.toString() || "",
    });
    setShowForm(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this summary?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleExportPdf = () => {
    if (records.length === 0) {
      toast.error("No data to export");
      return;
    }

    try {
      const doc = new jsPDF();
    doc.text("Financial Monthly Summary Report", 14, 10);
    doc.text(`Date Range: ${range?.from?.toLocaleDateString() || ""} - ${range?.to?.toLocaleDateString() || ""}`, 14, 20);

    let y = 30;
    doc.setFontSize(9);

    records.forEach((record: any, index: number) => {
      if (y > 250) {
        doc.addPage();
        y = 20;
      }

      const date = new Date(record.summaryDate).toLocaleDateString();
      doc.text(`=== ${date} ===`, 14, y);
      y += 8;

      const categories = [
        { label: "Total Sales", egp: record.totalSalesEgp, usd: record.totalSalesUsd, eur: record.totalSalesEur },
        { label: "Total Income", egp: record.totalIncomeEgp, usd: record.totalIncomeUsd, eur: record.totalIncomeEur },
        { label: "Total Expenses", egp: record.totalExpensesEgp, usd: record.totalExpensesUsd, eur: record.totalExpensesEur },
        { label: "Salaries", egp: record.salariesEgp, usd: record.salariesUsd, eur: record.salariesEur },
        { label: "Commissions", egp: record.commissionsEgp, usd: record.commissionsUsd, eur: record.commissionsEur },
        { label: "MOFA", egp: record.mofaEgp, usd: record.mofaUsd, eur: record.mofaEur },
        { label: "Embassy", egp: record.embassyEgp, usd: record.embassyUsd, eur: record.embassyEur },
        { label: "Translation Fees", egp: record.translationFeesEgp, usd: record.translationFeesUsd, eur: record.translationFeesEur },
        { label: "Lawyer Fees", egp: record.lawyerFeesEgp, usd: record.lawyerFeesUsd, eur: record.lawyerFeesEur },
        { label: "Office Expenses", egp: record.officeExpensesEgp, usd: record.officeExpensesUsd, eur: record.officeExpensesEur },
        { label: "Office Rent", egp: record.officeRentEgp, usd: record.officeRentUsd, eur: record.officeRentEur },
        { label: "Misc", egp: record.miscEgp, usd: record.miscUsd, eur: record.miscEur },
      ];

      categories.forEach((cat) => {
        doc.text(`${cat.label}:`, 14, y);
        doc.text(`EGP: ${cat.egp || 0}`, 50, y);
        doc.text(`USD: ${cat.usd || 0}`, 100, y);
        doc.text(`EUR: ${cat.eur || 0}`, 150, y);
        y += 6;
      });

      y += 4;
    });

      doc.save("financial-report.pdf");
      toast.success("PDF exported successfully");
    } catch (error) {
      toast.error("Failed to export PDF");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="last_week">Last Week</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="last_year">Last Year</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {dateRange === "custom" && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                placeholder="From"
                className="w-32"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                placeholder="To"
                className="w-32"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingId(null);
              setFormData({
                summaryDate: new Date().toISOString().split("T")[0],
                totalSalesEgp: "",
                totalIncomeEgp: "",
                totalExpensesEgp: "",
                salariesEgp: "",
                commissionsEgp: "",
                mofaEgp: "",
                embassyEgp: "",
                translationFeesEgp: "",
                lawyerFeesEgp: "",
                officeExpensesEgp: "",
                officeRentEgp: "",
                miscEgp: "",
              });
              setShowForm(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Enter New Financial Summary
          </Button>
        </div>
      </div>

      {/* Financial Summaries */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading summaries...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No financial summaries found for the selected date range</div>
        ) : (
          records.map((record: any) => (
            <Card key={record.id}>
              <CardHeader>
                <CardTitle className="text-lg">
                  {new Date(record.summaryDate).toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-semibold">Category</th>
                        <th className="text-right py-2 px-2 font-semibold">EGP</th>
                        <th className="text-right py-2 px-2 font-semibold">USD</th>
                        <th className="text-right py-2 px-2 font-semibold">EUR</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b bg-muted/30">
                        <td className="py-2 px-2 font-semibold">Total Sales</td>
                        <td className="text-right py-2 px-2">{record.totalSalesEgp || 0}</td>
                        <td className="text-right py-2 px-2">{record.totalSalesUsd || 0}</td>
                        <td className="text-right py-2 px-2">{record.totalSalesEur || 0}</td>
                      </tr>
                      <tr className="border-b bg-green-50 dark:bg-green-950/20">
                        <td className="py-2 px-2 font-semibold">Total Income</td>
                        <td className="text-right py-2 px-2 text-green-700 dark:text-green-400">{record.totalIncomeEgp || 0}</td>
                        <td className="text-right py-2 px-2 text-green-700 dark:text-green-400">{record.totalIncomeUsd || 0}</td>
                        <td className="text-right py-2 px-2 text-green-700 dark:text-green-400">{record.totalIncomeEur || 0}</td>
                      </tr>
                      <tr className="border-b bg-red-50 dark:bg-red-950/20">
                        <td className="py-2 px-2 font-semibold">Total Expenses</td>
                        <td className="text-right py-2 px-2 text-red-700 dark:text-red-400">{record.totalExpensesEgp || 0}</td>
                        <td className="text-right py-2 px-2 text-red-700 dark:text-red-400">{record.totalExpensesUsd || 0}</td>
                        <td className="text-right py-2 px-2 text-red-700 dark:text-red-400">{record.totalExpensesEur || 0}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-2">Salaries</td>
                        <td className="text-right py-2 px-2">{record.salariesEgp || 0}</td>
                        <td className="text-right py-2 px-2">{record.salariesUsd || 0}</td>
                        <td className="text-right py-2 px-2">{record.salariesEur || 0}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-2">Commissions</td>
                        <td className="text-right py-2 px-2">{record.commissionsEgp || 0}</td>
                        <td className="text-right py-2 px-2">{record.commissionsUsd || 0}</td>
                        <td className="text-right py-2 px-2">{record.commissionsEur || 0}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-2">MOFA Attestation</td>
                        <td className="text-right py-2 px-2">{record.mofaEgp || 0}</td>
                        <td className="text-right py-2 px-2">{record.mofaUsd || 0}</td>
                        <td className="text-right py-2 px-2">{record.mofaEur || 0}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-2">Embassy Attestation</td>
                        <td className="text-right py-2 px-2">{record.embassyEgp || 0}</td>
                        <td className="text-right py-2 px-2">{record.embassyUsd || 0}</td>
                        <td className="text-right py-2 px-2">{record.embassyEur || 0}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-2">Translation Fees</td>
                        <td className="text-right py-2 px-2">{record.translationFeesEgp || 0}</td>
                        <td className="text-right py-2 px-2">{record.translationFeesUsd || 0}</td>
                        <td className="text-right py-2 px-2">{record.translationFeesEur || 0}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-2">Lawyer Fees</td>
                        <td className="text-right py-2 px-2">{record.lawyerFeesEgp || 0}</td>
                        <td className="text-right py-2 px-2">{record.lawyerFeesUsd || 0}</td>
                        <td className="text-right py-2 px-2">{record.lawyerFeesEur || 0}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-2">Office Expenses</td>
                        <td className="text-right py-2 px-2">{record.officeExpensesEgp || 0}</td>
                        <td className="text-right py-2 px-2">{record.officeExpensesUsd || 0}</td>
                        <td className="text-right py-2 px-2">{record.officeExpensesEur || 0}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-2">Office Rent</td>
                        <td className="text-right py-2 px-2">{record.officeRentEgp || 0}</td>
                        <td className="text-right py-2 px-2">{record.officeRentUsd || 0}</td>
                        <td className="text-right py-2 px-2">{record.officeRentEur || 0}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-2">Miscellaneous</td>
                        <td className="text-right py-2 px-2">{record.miscEgp || 0}</td>
                        <td className="text-right py-2 px-2">{record.miscUsd || 0}</td>
                        <td className="text-right py-2 px-2">{record.miscEur || 0}</td>
                      </tr>
                      <tr className="border-b bg-gray-50 dark:bg-gray-900/20">
                        <td className="py-2 px-2"></td>
                        <td className="py-2 px-2"></td>
                        <td className="py-2 px-2"></td>
                        <td className="py-2 px-2"></td>
                        <td className="py-2 px-2">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(record)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(record.id)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Financial Summary" : "Enter New Financial Summary"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="summaryDate">Summary Date</Label>
              <Input
                id="summaryDate"
                type="date"
                value={formData.summaryDate}
                onChange={(e) => setFormData({ ...formData, summaryDate: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="totalSalesEgp">Total Sales (EGP)</Label>
                <Input
                  id="totalSalesEgp"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.totalSalesEgp}
                  onChange={(e) => setFormData({ ...formData, totalSalesEgp: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="totalIncomeEgp">Total Income (EGP)</Label>
                <Input
                  id="totalIncomeEgp"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.totalIncomeEgp}
                  onChange={(e) => setFormData({ ...formData, totalIncomeEgp: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="totalExpensesEgp">Total Expenses (EGP)</Label>
                <Input
                  id="totalExpensesEgp"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.totalExpensesEgp}
                  onChange={(e) => setFormData({ ...formData, totalExpensesEgp: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="salariesEgp">Salaries (EGP)</Label>
                <Input
                  id="salariesEgp"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.salariesEgp}
                  onChange={(e) => setFormData({ ...formData, salariesEgp: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="commissionsEgp">Commissions (EGP)</Label>
                <Input
                  id="commissionsEgp"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.commissionsEgp}
                  onChange={(e) => setFormData({ ...formData, commissionsEgp: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="mofaEgp">MOFA Attestation (EGP)</Label>
                <Input
                  id="mofaEgp"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.mofaEgp}
                  onChange={(e) => setFormData({ ...formData, mofaEgp: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="embassyEgp">Embassy Attestation (EGP)</Label>
                <Input
                  id="embassyEgp"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.embassyEgp}
                  onChange={(e) => setFormData({ ...formData, embassyEgp: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="translationFeesEgp">Translation Fees (EGP)</Label>
                <Input
                  id="translationFeesEgp"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.translationFeesEgp}
                  onChange={(e) => setFormData({ ...formData, translationFeesEgp: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="lawyerFeesEgp">Lawyer Fees (EGP)</Label>
                <Input
                  id="lawyerFeesEgp"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.lawyerFeesEgp}
                  onChange={(e) => setFormData({ ...formData, lawyerFeesEgp: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="officeExpensesEgp">Office Expenses (EGP)</Label>
                <Input
                  id="officeExpensesEgp"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.officeExpensesEgp}
                  onChange={(e) => setFormData({ ...formData, officeExpensesEgp: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="officeRentEgp">Office Rent (EGP)</Label>
                <Input
                  id="officeRentEgp"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.officeRentEgp}
                  onChange={(e) => setFormData({ ...formData, officeRentEgp: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="miscEgp">Miscellaneous (EGP)</Label>
                <Input
                  id="miscEgp"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.miscEgp}
                  onChange={(e) => setFormData({ ...formData, miscEgp: e.target.value })}
                />
              </div>
            </div>

            <div className="p-3 bg-muted rounded text-sm">
              <p className="text-muted-foreground">
                Note: All values are entered in EGP. Currency conversion to USD and EUR will be calculated automatically using current exchange rates.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingId ? "Update Summary" : "Create Summary"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
