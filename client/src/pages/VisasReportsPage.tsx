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
import { Plus, Download, Search } from "lucide-react";
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

export default function VisasReportsPage() {
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<{ id: number; name: string; code?: string } | null>(null);
  const [formData, setFormData] = useState({
    recordDate: new Date().toISOString().split("T")[0],
    visaType: "Schengen" as "Schengen" | "National",
    status: "Submitted" as "Submitted" | "Finished",
    provider: "",
  });

  const range = dateRange === "custom" && customFrom && customTo
    ? { from: new Date(customFrom), to: new Date(customTo) }
    : getDateRange(dateRange);

  // Fetch visa records
  const { data: records = [], isLoading, refetch } = trpc.reports.visaClients.list.useQuery(
    range ? { dateFrom: range.from, dateTo: range.to } : undefined,
    { enabled: !!range }
  );

  // Search for clients
  const { data: clients = [] } = trpc.reports.visaFinancialClients.search.useQuery(
    { searchTerm },
    { enabled: searchTerm.length > 0 }
  );

  const createMutation = trpc.reports.visaClients.create.useMutation({
    onSuccess: () => {
      toast.success("Visa record created successfully");
      setShowForm(false);
      setSelectedClient(null);
      setFormData({
        recordDate: new Date().toISOString().split("T")[0],
        visaType: "Schengen",
        status: "Submitted",
        provider: "",
      });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create record");
    },
  });

  const handleSubmit = () => {
    if (!formData.recordDate || !selectedClient || !formData.provider) {
      toast.error("Please fill in all required fields");
      return;
    }

    createMutation.mutate({
      recordDate: new Date(formData.recordDate),
      finClientId: selectedClient.id,
      clientName: selectedClient.name,
      clientCode: selectedClient.code,
      visaType: formData.visaType,
      status: formData.status,
      provider: formData.provider,
    });
  };

  const handleExportPdf = () => {
    if (records.length === 0) {
      toast.error("No data to export");
      return;
    }

    const jsPDFLib = (window as any).jsPDF;
    if (!jsPDFLib) {
      toast.error("PDF export not available");
      return;
    }
    const doc = new jsPDFLib.jsPDF();

    doc.text("Visa Client Records", 14, 10);
    doc.text(`Date Range: ${range?.from?.toLocaleDateString() || ""} - ${range?.to?.toLocaleDateString() || ""}`, 14, 20);

    let y = 30;
    doc.setFontSize(10);
    doc.text("Date", 14, y);
    doc.text("Client Name", 50, y);
    doc.text("Visa Type", 120, y);
    doc.text("Status", 150, y);
    doc.text("Provider", 180, y);
    y += 10;

    records.forEach((record: any) => {
      const date = new Date(record.recordDate).toLocaleDateString();
      doc.text(date, 14, y);
      doc.text(record.clientName.substring(0, 30), 50, y);
      doc.text(record.visaType, 120, y);
      doc.text(record.status, 150, y);
      doc.text(record.provider.substring(0, 20), 180, y);
      y += 10;
    });

    try {
      doc.save("visa-report.pdf");
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
            Enter New VISA Entry
          </Button>
        </div>
      </div>

      {/* Visa Records Table */}
      <Card>
        <CardHeader>
          <CardTitle>Visa Client Records</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading records...</div>
          ) : records.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No records found for the selected date range</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold">Date</th>
                    <th className="text-left py-3 px-4 font-semibold">Client Name</th>
                    <th className="text-left py-3 px-4 font-semibold">Visa Type</th>
                    <th className="text-left py-3 px-4 font-semibold">Status</th>
                    <th className="text-left py-3 px-4 font-semibold">Provider</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record: any) => (
                    <tr key={record.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4">
                        {new Date(record.recordDate).toLocaleDateString("en-US", {
                          weekday: "short",
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium">{record.clientName}</div>
                        {record.clientCode && <div className="text-sm text-muted-foreground">{record.clientCode}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-sm font-medium ${
                          record.visaType === "Schengen" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"
                        }`}>
                          {record.visaType}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-sm font-medium ${
                          record.status === "Finished" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                        }`}>
                          {record.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">{record.provider}</td>
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
            <DialogTitle>Enter New VISA Entry</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="recordDate">Record Date</Label>
              <Input
                id="recordDate"
                type="date"
                value={formData.recordDate}
                onChange={(e) => setFormData({ ...formData, recordDate: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="clientSearch">Client Name or Code</Label>
              <div className="relative">
                <Input
                  id="clientSearch"
                  placeholder="Search client..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-8"
                />
                <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>

              {searchTerm && clients.length > 0 && (
                <div className="mt-2 border rounded-md max-h-40 overflow-y-auto">
                  {clients.map((client: any) => (
                    <button
                      key={client.id}
                      onClick={() => {
                        setSelectedClient({ id: client.id, name: client.clientName, code: client.clientCode });
                        setSearchTerm("");
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-b-0"
                    >
                      <div className="font-medium">{client.clientName}</div>
                      {client.clientCode && <div className="text-sm text-muted-foreground">{client.clientCode}</div>}
                    </button>
                  ))}
                </div>
              )}

              {selectedClient && (
                <div className="mt-2 p-2 bg-muted rounded">
                  <div className="font-medium">{selectedClient.name}</div>
                  {selectedClient.code && <div className="text-sm text-muted-foreground">{selectedClient.code}</div>}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="visaType">Visa Type</Label>
              <Select value={formData.visaType} onValueChange={(v) => setFormData({ ...formData, visaType: v as "Schengen" | "National" })}>
                <SelectTrigger id="visaType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Schengen">Schengen</SelectItem>
                  <SelectItem value="National">National</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as "Submitted" | "Finished" })}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Submitted">Submitted</SelectItem>
                  <SelectItem value="Finished">Finished</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="provider">Service Provider Name</Label>
              <Input
                id="provider"
                placeholder="Enter provider name"
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
