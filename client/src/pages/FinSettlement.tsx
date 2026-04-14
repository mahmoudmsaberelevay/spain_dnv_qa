/**
 * FinSettlement — After Settlement Payment (Dubai Afterlanding Services)
 *
 * Tracks post-settlement payments in AED.
 * EUR = AED / 4 (fixed formula per business rule).
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ClientSearchCombobox } from "@/components/ClientSearchCombobox";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Seed data from Notion (14 records, client names unknown) ────────────────
const NOTION_SEED = [
  { amountAed: 4300.00,  serviceDate: "2025-12-15" },
  { amountAed: 4300.00,  serviceDate: "2026-01-13" },
  { amountAed: 4337.00,  serviceDate: "2026-02-05" },
  { amountAed: 4374.00,  serviceDate: "2026-02-10" },
  { amountAed: 6106.00,  serviceDate: "2026-02-10" },
  { amountAed: 7200.00,  serviceDate: "2026-02-11" },
  { amountAed: 6530.00,  serviceDate: "2026-02-16" },
  { amountAed: 5190.00,  serviceDate: "2026-02-22" },
  { amountAed: 6058.00,  serviceDate: "2026-02-22" },
  { amountAed: 5190.00,  serviceDate: "2026-02-24" },
  { amountAed: 4330.00,  serviceDate: "2026-03-03" },
  { amountAed: 5917.00,  serviceDate: "2026-03-17" },
  { amountAed: 6007.00,  serviceDate: "2026-04-01" },
  { amountAed: 5005.00,  serviceDate: "2026-04-09" },
];

export default function FinSettlement() {
  const { canEdit } = usePermissions();
  const canWrite = canEdit("fin_settlement");

  // ── State ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [importDone, setImportDone] = useState(false);

  // Add form state
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [manualClientName, setManualClientName] = useState("");
  const [amountAed, setAmountAed] = useState("");
  const [serviceDate, setServiceDate] = useState<Date | undefined>(new Date());
  const [notes, setNotes] = useState("");
  const [calOpen, setCalOpen] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data, refetch, isLoading } = trpc.settlement.list.useQuery({
    search: search || undefined,
    limit: 500,
    offset: 0,
  });

  const rows = data?.rows ?? [];
  const totalAed = data?.totalAed ?? 0;
  const totalEur = data?.totalEur ?? 0;

  // ── Mutations ────────────────────────────────────────────────────────────
  const createMut = trpc.settlement.create.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); resetForm(); toast.success("Payment added"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.settlement.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Payment deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const bulkImportMut = trpc.settlement.bulkImport.useMutation({
    onSuccess: (res) => {
      refetch();
      setImportDone(true);
      toast.success(`Imported ${res.imported} records from Notion`);
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────
  function resetForm() {
    setSelectedClientId("");
    setManualClientName("");
    setAmountAed("");
    setServiceDate(new Date());
    setNotes("");
  }

  const amountEur = useMemo(() => {
    const n = parseFloat(amountAed);
    if (isNaN(n) || n <= 0) return "";
    return (Math.round((n / 4) * 100) / 100).toFixed(2);
  }, [amountAed]);

  function handleSubmit() {
    const n = parseFloat(amountAed);
    if (isNaN(n) || n <= 0) { toast.error("Enter a valid AED amount"); return; }
    if (!serviceDate) { toast.error("Select a date"); return; }
    createMut.mutate({
      clientName: manualClientName.trim() || undefined,
      finClientId: selectedClientId ? parseInt(selectedClientId) : undefined,
      amountAed: n,
      serviceDate: format(serviceDate, "yyyy-MM-dd"),
      notes: notes.trim() || undefined,
    });
  }

  function handleExportCsv() {
    const header = ["#", "Client Name", "Amount AED", "Amount EUR", "Service Date", "Notes"];
    const csvRows = rows.map((r, i) => [
      i + 1,
      r.clientName ?? "",
      Number(r.amountAed).toFixed(2),
      Number(r.amountEur).toFixed(2),
      r.serviceDate instanceof Date ? format(r.serviceDate, "yyyy-MM-dd") : String(r.serviceDate),
      r.notes ?? "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `settlement-payments-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-white">After Settlement Payment</h1>
        <p className="text-white/50 text-sm">Dubai Afterlanding Services — AED payments (EUR = AED ÷ 4)</p>
      </div>

      {/* Action bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Center: Add button */}
        <div className="flex-1 flex justify-center">
          {canWrite && (
            <Button
              onClick={() => setShowAdd(true)}
              className="bg-amber-600 hover:bg-amber-500 text-white gap-2 px-6"
            >
              <Plus className="h-4 w-4" />
              Add Payment
            </Button>
          )}
        </div>

        {/* Right: Search + Export + Import */}
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search client..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-52 bg-white/5 border-white/10 text-white placeholder:text-white/30"
          />
          <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1 border-white/20 text-white/70 hover:text-white">
            <Download className="h-4 w-4" />
            CSV
          </Button>
          {canWrite && !importDone && rows.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkImportMut.mutate(NOTION_SEED)}
              disabled={bulkImportMut.isPending}
              className="gap-1 border-amber-500/40 text-amber-400 hover:text-amber-300"
            >
              <Upload className="h-4 w-4" />
              Import Notion
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="text-left px-4 py-3 text-white/50 font-medium">#</th>
              <th className="text-left px-4 py-3 text-white/50 font-medium">Client Name</th>
              <th className="text-right px-4 py-3 text-white/50 font-medium">Amount AED</th>
              <th className="text-right px-4 py-3 text-white/50 font-medium">Amount EUR</th>
              <th className="text-left px-4 py-3 text-white/50 font-medium">Service Date</th>
              <th className="text-left px-4 py-3 text-white/50 font-medium">Notes</th>
              {canWrite && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={canWrite ? 7 : 6} className="text-center py-12 text-white/30">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={canWrite ? 7 : 6} className="text-center py-12 text-white/30">
                No records yet.{canWrite ? " Click \"Add Payment\" to get started." : ""}
              </td></tr>
            ) : rows.map((row, idx) => {
              const dateStr = row.serviceDate instanceof Date
                ? format(row.serviceDate, "dd MMM yyyy")
                : String(row.serviceDate);
              return (
                <tr key={row.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-white/40">{idx + 1}</td>
                  <td className="px-4 py-3 text-white font-medium">
                    {row.clientName ?? <span className="text-white/30 italic">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-amber-300 font-mono">
                    AED {Number(row.amountAed).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-400 font-mono">
                    €{Number(row.amountEur).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-white/70">{dateStr}</td>
                  <td className="px-4 py-3 text-white/50 max-w-xs truncate">{row.notes ?? "—"}</td>
                  {canWrite && (
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("Delete this payment?")) deleteMut.mutate({ id: row.id });
                        }}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 w-7 p-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totals summary */}
      {rows.length > 0 && (
        <div className="flex gap-6 justify-end text-sm">
          <div className="flex items-center gap-2">
            <span className="text-white/40">Total AED:</span>
            <span className="text-amber-300 font-mono font-semibold">
              AED {totalAed.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/40">Total EUR:</span>
            <span className="text-emerald-400 font-mono font-semibold">
              €{totalEur.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/40">Records:</span>
            <span className="text-white/70">{data?.count ?? rows.length}</span>
          </div>
        </div>
      )}

      {/* Add Payment Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-[#1a1a2e] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Add Settlement Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Client */}
            <div className="space-y-1.5">
              <Label className="text-white/70">Client Name</Label>
              <ClientSearchCombobox
                value={selectedClientId}
                onChange={(val) => {
                  setSelectedClientId(val);
                  if (val) setManualClientName("");
                }}
                placeholder="Search Finance client DB..."
              />
              {!selectedClientId && (
                <Input
                  placeholder="Or type name manually..."
                  value={manualClientName}
                  onChange={e => setManualClientName(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30 mt-1"
                />
              )}
            </div>

            {/* Amount AED */}
            <div className="space-y-1.5">
              <Label className="text-white/70">Amount AED <span className="text-red-400">*</span></Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 5190.00"
                value={amountAed}
                onChange={e => setAmountAed(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>

            {/* Amount EUR (auto) */}
            <div className="space-y-1.5">
              <Label className="text-white/70">Amount EUR <span className="text-white/30 text-xs">(AED ÷ 4, auto)</span></Label>
              <Input
                readOnly
                value={amountEur ? `€${amountEur}` : ""}
                placeholder="Auto-calculated"
                className="bg-white/5 border-white/10 text-emerald-400 placeholder:text-white/20 cursor-not-allowed"
              />
            </div>

            {/* Service Date */}
            <div className="space-y-1.5">
              <Label className="text-white/70">Service Date <span className="text-red-400">*</span></Label>
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal bg-white/5 border-white/10 text-white hover:bg-white/10",
                      !serviceDate && "text-white/30"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-white/40" />
                    {serviceDate ? format(serviceDate, "dd MMM yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#1a1a2e] border-white/10">
                  <Calendar
                    mode="single"
                    selected={serviceDate}
                    onSelect={d => { setServiceDate(d); setCalOpen(false); }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-white/70">Notes</Label>
              <Input
                placeholder="Optional notes..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 border-white/20 text-white/70" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-white"
                onClick={handleSubmit}
                disabled={createMut.isPending}
              >
                {createMut.isPending ? "Saving..." : "Add Payment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
