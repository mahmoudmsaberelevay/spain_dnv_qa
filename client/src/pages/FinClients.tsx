import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Search, Plus, Phone, MapPin, User, TrendingDown, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const CONSULTANTS = ["Mahmoud", "Ziad", "Kirolos", "Fouad"];
const PAGE_SIZE = 50;

function fmtEur(n: number | string | null | undefined) {
  if (n === null || n === undefined) return "—";
  const num = Number(n);
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

export default function FinClients() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [consultant, setConsultant] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [showAdd, setShowAdd] = useState(false);

  // Debounce search
  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(0);
    clearTimeout((window as any)._searchTimer);
    (window as any)._searchTimer = setTimeout(() => setDebouncedSearch(v), 400);
  };

  const queryParams = useMemo(() => ({
    search: debouncedSearch || undefined,
    consultant: consultant !== "all" ? consultant : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [debouncedSearch, consultant, page]);

  const countParams = useMemo(() => ({
    search: debouncedSearch || undefined,
    consultant: consultant !== "all" ? consultant : undefined,
  }), [debouncedSearch, consultant]);

  const { data: clients, isLoading, refetch } = trpc.financial.clients.list.useQuery(queryParams);
  const { data: total } = trpc.financial.clients.count.useQuery(countParams);
  const utils = trpc.useUtils();

  const totalPages = Math.ceil((total ?? 0) / PAGE_SIZE);

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
        <Button onClick={() => setShowAdd(true)} className="bg-primary">
          <Plus className="h-4 w-4 mr-1.5" /> Add Client
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or code..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
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
      </div>

      {/* Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !clients || clients.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No clients found</p>
              {debouncedSearch && <p className="text-sm mt-1">Try a different search term</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Code</th>
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Client Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Program</th>
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Consultant</th>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Contract Value</th>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Paid</th>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Remaining Due</th>
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => {
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages} ({total} total)
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

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
    </div>
  );
}
