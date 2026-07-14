import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Download, Calendar } from "lucide-react";
import { toast } from "sonner";

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

export default function QualificationsReports() {
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    reportDate: new Date().toISOString().split("T")[0],
    totalLeads: "",
    totalQualified: "",
    notQualified: "",
    noAnswer: "",
  });

  const range = dateRange === "custom" && customFrom && customTo
    ? { from: new Date(customFrom), to: new Date(customTo) }
    : getDateRange(dateRange);

  const { data: reports = [], isLoading, refetch } = trpc.reports.qualifications.list.useQuery(
    range ? { dateFrom: range.from, dateTo: range.to } : undefined,
    { enabled: !!range }
  );

  const createMutation = trpc.reports.qualifications.create.useMutation({
    onSuccess: () => {
      toast.success("Daily report created successfully");
      setShowForm(false);
      setFormData({
        reportDate: new Date().toISOString().split("T")[0],
        totalLeads: "",
        totalQualified: "",
        notQualified: "",
        noAnswer: "",
      });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create report");
    },
  });

  const handleSubmit = () => {
    if (!formData.reportDate || !formData.totalLeads || !formData.totalQualified || !formData.notQualified || !formData.noAnswer) {
      toast.error("Please fill in all fields");
      return;
    }

    createMutation.mutate({
      reportDate: new Date(formData.reportDate),
      totalLeads: parseInt(formData.totalLeads),
      totalQualified: parseInt(formData.totalQualified),
      notQualified: parseInt(formData.notQualified),
      noAnswer: parseInt(formData.noAnswer),
    });
  };

  const handleExportPdf = () => {
    if (reports.length === 0) {
      toast.error("No data to export");
      return;
    }

    // Simple PDF generation using browser API
    const jsPDFLib = (window as any).jsPDF;
    if (!jsPDFLib) {
      toast.error("PDF export not available");
      return;
    }
    const doc = new jsPDFLib.jsPDF();

    doc.text("Qualifications Daily Reports", 14, 10);
    doc.text(`Date Range: ${range?.from?.toLocaleDateString() || ""} - ${range?.to?.toLocaleDateString() || ""}`, 14, 20);

    let y = 30;
    doc.setFontSize(10);
    doc.text("Date", 14, y);
    doc.text("Total Leads", 50, y);
    doc.text("Qualified", 90, y);
    doc.text("Not Qualified", 130, y);
    doc.text("No Answer", 170, y);
    y += 10;

    reports.forEach((report) => {
      const date = new Date(report.reportDate).toLocaleDateString();
      doc.text(date, 14, y);
      doc.text(report.totalLeads.toString(), 50, y);
      doc.text(report.totalQualified.toString(), 90, y);
      doc.text(report.notQualified.toString(), 130, y);
      doc.text(report.noAnswer.toString(), 170, y);
      y += 10;
    });

    try {
      doc.save("qualifications-report.pdf");
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
            onClick={() => setShowForm(true)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Enter new Daily Report
          </Button>
        </div>
      </div>

      {/* Reports Table */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Qualification Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading reports...</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No reports found for the selected date range</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold">Date</th>
                    <th className="text-right py-3 px-4 font-semibold">Total Leads</th>
                    <th className="text-right py-3 px-4 font-semibold">Total Qualified</th>
                    <th className="text-right py-3 px-4 font-semibold">Not Qualified</th>
                    <th className="text-right py-3 px-4 font-semibold">No Answer</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={report.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4">
                        {new Date(report.reportDate).toLocaleDateString("en-US", {
                          weekday: "short",
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="text-right py-3 px-4">{report.totalLeads}</td>
                      <td className="text-right py-3 px-4 text-green-600 font-medium">{report.totalQualified}</td>
                      <td className="text-right py-3 px-4 text-red-600 font-medium">{report.notQualified}</td>
                      <td className="text-right py-3 px-4 text-amber-600 font-medium">{report.noAnswer}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enter New Daily Report</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="reportDate">Report Date</Label>
              <Input
                id="reportDate"
                type="date"
                value={formData.reportDate}
                onChange={(e) => setFormData({ ...formData, reportDate: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="totalLeads">Total Number of Leads</Label>
              <Input
                id="totalLeads"
                type="number"
                min="0"
                placeholder="0"
                value={formData.totalLeads}
                onChange={(e) => setFormData({ ...formData, totalLeads: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="totalQualified">Total Qualified</Label>
              <Input
                id="totalQualified"
                type="number"
                min="0"
                placeholder="0"
                value={formData.totalQualified}
                onChange={(e) => setFormData({ ...formData, totalQualified: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="notQualified">Not Qualified</Label>
              <Input
                id="notQualified"
                type="number"
                min="0"
                placeholder="0"
                value={formData.notQualified}
                onChange={(e) => setFormData({ ...formData, notQualified: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="noAnswer">No Answer</Label>
              <Input
                id="noAnswer"
                type="number"
                min="0"
                placeholder="0"
                value={formData.noAnswer}
                onChange={(e) => setFormData({ ...formData, noAnswer: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
