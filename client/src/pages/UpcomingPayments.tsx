/**
 * Upcoming Payments — Financial Module
 * Tracks scheduled future payments per client.
 * Columns: Client Name | Consultant | Payment For | Due Date | Due Amount (€) | Paid Amount (€) | Remaining (€) | Status
 */
import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Filter,
  Euro,
  Search,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CONSULTANTS = ["Mahmoud", "Fouad", "Kirolos", "Ziad"] as const;
const PAYMENT_FOR = ["First", "Second", "Third"] as const;
type Consultant = typeof CONSULTANTS[number];
type PaymentFor = typeof PAYMENT_FOR[number];
type Status = "Pending" | "Done";

// ─── Client Search Combobox ──────────────────────────────────────────────────
function ClientCombobox({
  value,
  onChange,
}: {
  value: { id?: number; name: string };
  onChange: (v: { id?: number; name: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const { data: results } = trpc.financial.upcomingPayments.searchClients.useQuery(
    { q },
    { staleTime: 5000 }
  );

  return (
    <div className="relative">
      <div
        className="flex items-center gap-2 h-9 px-3 border border-input rounded-md bg-background cursor-pointer text-sm"
        onClick={() => setOpen(o => !o)}
      >
        <span className={value.name ? "text-foreground" : "text-muted-foreground"}>
          {value.name || "Search client…"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1 bg-muted rounded">
              <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Type name or code…"
                className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {/* Free-text option */}
            {q && (
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors text-muted-foreground italic"
                onClick={() => { onChange({ name: q }); setOpen(false); setQ(""); }}
              >
                Use "{q}" as custom name
              </button>
            )}
            {(results ?? []).map(c => (
              <button
                key={c.id}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                onClick={() => { onChange({ id: c.id, name: c.name }); setOpen(false); setQ(""); }}
              >
                <span className="font-medium text-foreground">{c.name}</span>
                {c.clientCode && <span className="text-xs text-muted-foreground">{c.clientCode}</span>}
              </button>
            ))}
            {!q && (!results || results.length === 0) && (
              <p className="px-3 py-4 text-sm text-muted-foreground text-center">No clients found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add Payment Dialog ──────────────────────────────────────────────────────
function AddPaymentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [client, setClient] = useState<{ id?: number; name: string }>({ name: "" });
  const [consultant, setConsultant] = useState<Consultant>("Mahmoud");
  const [paymentFor, setPaymentFor] = useState<PaymentFor>("First");
  const [dueDate, setDueDate] = useState("");
  const [dueAmount, setDueAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("0");
  const [notes, setNotes] = useState("");

  const createMutation = trpc.financial.upcomingPayments.create.useMutation({
    onSuccess: () => {
      utils.financial.upcomingPayments.list.invalidate();
      toast.success("Payment added");
      onClose();
      setClient({ name: "" }); setDueDate(""); setDueAmount(""); setPaidAmount("0"); setNotes("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!client.name || !dueDate || !dueAmount) {
      toast.error("Please fill in Client Name, Due Date, and Due Amount");
      return;
    }
    createMutation.mutate({
      clientName: client.name,
      finClientId: client.id,
      consultant,
      paymentFor,
      dueDate,
      dueAmount: parseFloat(dueAmount),
      paidAmount: parseFloat(paidAmount) || 0,
      notes: notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" /> Add Upcoming Payment
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Client Name *</Label>
            <ClientCombobox value={client} onChange={setClient} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Consultant *</Label>
            <Select value={consultant} onValueChange={v => setConsultant(v as Consultant)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONSULTANTS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Payment For *</Label>
            <Select value={paymentFor} onValueChange={v => setPaymentFor(v as PaymentFor)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_FOR.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Due Date *</Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Due Amount (€) *</Label>
            <Input type="number" min="0" step="0.01" value={dueAmount} onChange={e => setDueAmount(e.target.value)} placeholder="0.00" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Paid Amount (€)</Label>
            <Input type="number" min="0" step="0.01" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} placeholder="0.00" className="h-9 text-sm" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes…" className="h-9 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Adding…" : "Add Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inline Edit Cell ────────────────────────────────────────────────────────
function EditableCell({
  value,
  type = "text",
  onSave,
  className,
}: {
  value: string;
  type?: "text" | "number" | "date";
  onSave: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { onSave(draft); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === "Enter") { onSave(draft); setEditing(false); }
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={cn("w-full h-7 px-2 text-sm border border-primary rounded outline-none bg-background", className)}
      />
    );
  }
  return (
    <span
      className={cn("cursor-pointer hover:bg-accent px-1 py-0.5 rounded text-sm block", className)}
      onClick={() => { setDraft(value); setEditing(true); }}
    >
      {value || <span className="text-muted-foreground italic">—</span>}
    </span>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function UpcomingPayments() {
  const utils = trpc.useUtils();
  const [showDone, setShowDone] = useState(false);
  const [filterConsultant, setFilterConsultant] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = trpc.financial.upcomingPayments.list.useQuery({
    showDone,
    consultant: filterConsultant !== "all" ? filterConsultant as Consultant : undefined,
  });

  const updateMutation = trpc.financial.upcomingPayments.update.useMutation({
    onSuccess: () => utils.financial.upcomingPayments.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.financial.upcomingPayments.delete.useMutation({
    onSuccess: () => { utils.financial.upcomingPayments.list.invalidate(); toast.success("Removed"); },
    onError: (e) => toast.error(e.message),
  });

  const markDone = useCallback((id: number) => {
    updateMutation.mutate({ id, status: "Done" });
    toast.success("Marked as Done — row will disappear");
  }, [updateMutation]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.clientName.toLowerCase().includes(q) ||
      r.consultant.toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Totals
  const totals = useMemo(() => {
    const due = filtered.reduce((s, r) => s + Number(r.dueAmount), 0);
    const paid = filtered.reduce((s, r) => s + Number(r.paidAmount), 0);
    return { due, paid, remaining: due - paid };
  }, [filtered]);

  const fmt = (n: number) => `€${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="p-6 space-y-5 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Upcoming Payments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track scheduled client payments</p>
        </div>
        <Button onClick={() => setShowAdd(true)} size="sm">
          <Plus className="h-4 w-4 mr-1.5" /> Add Payment
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search client or consultant…"
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={filterConsultant} onValueChange={setFilterConsultant}>
          <SelectTrigger className="h-8 text-xs w-36">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue placeholder="Consultant" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Consultants</SelectItem>
            {CONSULTANTS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant={showDone ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setShowDone(d => !d)}
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
          {showDone ? "Hiding Done" : "Show Done"}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-x-auto bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">Client Name</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">Consultant</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">Payment For</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">Due Date</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs">Due Amount (€)</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs">Paid Amount (€)</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs">Remaining (€)</th>
              <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
                    Loading…
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                  No upcoming payments found
                </td>
              </tr>
            ) : filtered.map((row, idx) => {
              const remaining = Number(row.dueAmount) - Number(row.paidAmount);
              const isDone = row.status === "Done";
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border last:border-0 transition-colors",
                    idx % 2 === 0 ? "bg-background" : "bg-muted/20",
                    isDone && "opacity-50"
                  )}
                >
                  {/* Client Name */}
                  <td className="px-4 py-2.5 font-medium text-foreground max-w-[180px]">
                    <EditableCell
                      value={row.clientName}
                      onSave={v => updateMutation.mutate({ id: row.id, clientName: v })}
                    />
                  </td>
                  {/* Consultant */}
                  <td className="px-4 py-2.5">
                    <Select
                      value={row.consultant}
                      onValueChange={v => updateMutation.mutate({ id: row.id, consultant: v as Consultant })}
                    >
                      <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 shadow-none focus:ring-0 w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONSULTANTS.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  {/* Payment For */}
                  <td className="px-4 py-2.5">
                    <Select
                      value={row.paymentFor}
                      onValueChange={v => updateMutation.mutate({ id: row.id, paymentFor: v as PaymentFor })}
                    >
                      <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 shadow-none focus:ring-0 w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_FOR.map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  {/* Due Date */}
                  <td className="px-4 py-2.5 text-muted-foreground">
                    <EditableCell
                      value={row.dueDate instanceof Date ? row.dueDate.toISOString().split('T')[0] : String(row.dueDate)}
                      type="date"
                      onSave={v => updateMutation.mutate({ id: row.id, dueDate: v })}
                    />
                  </td>
                  {/* Due Amount */}
                  <td className="px-4 py-2.5 text-right">
                    <EditableCell
                      value={String(Number(row.dueAmount).toFixed(2))}
                      type="number"
                      onSave={v => updateMutation.mutate({ id: row.id, dueAmount: parseFloat(v) })}
                      className="text-right"
                    />
                  </td>
                  {/* Paid Amount */}
                  <td className="px-4 py-2.5 text-right text-emerald-600 dark:text-emerald-400">
                    <EditableCell
                      value={String(Number(row.paidAmount).toFixed(2))}
                      type="number"
                      onSave={v => updateMutation.mutate({ id: row.id, paidAmount: parseFloat(v) })}
                      className="text-right"
                    />
                  </td>
                  {/* Remaining */}
                  <td className={cn("px-4 py-2.5 text-right font-semibold", remaining > 0 ? "text-orange-600 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400")}>
                    {fmt(remaining)}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-2.5 text-center">
                    {isDone ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-300 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Done
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 border border-amber-300 text-xs">
                        <Clock className="h-3 w-3 mr-1" /> Pending
                      </Badge>
                    )}
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      {!isDone && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => markDone(row.id)}
                          title="Mark as Done"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          if (confirm(`Delete payment for ${row.clientName}?`)) {
                            deleteMutation.mutate({ id: row.id });
                          }
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Totals Row */}
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/60 font-bold">
                <td className="px-4 py-3 text-sm text-foreground" colSpan={4}>
                  <div className="flex items-center gap-1.5">
                    <Euro className="h-3.5 w-3.5 text-primary" />
                    Totals ({filtered.length} {filtered.length === 1 ? "record" : "records"})
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-sm text-foreground">{fmt(totals.due)}</td>
                <td className="px-4 py-3 text-right text-sm text-emerald-600 dark:text-emerald-400">{fmt(totals.paid)}</td>
                <td className={cn("px-4 py-3 text-right text-sm", totals.remaining > 0 ? "text-orange-600 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400")}>
                  {fmt(totals.remaining)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <AddPaymentDialog open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}
