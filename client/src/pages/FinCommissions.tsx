import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtEur(n: string | number | null | undefined) {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (isNaN(v)) return "—";
  return `€ ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;
}
function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function toISODate(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().split("T")[0];
}
function parseDate(s: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  Started: "bg-green-100 text-green-800 border-green-200",
  Cancelled: "bg-red-100 text-red-800 border-red-200",
};

// ─── Commission Form Type ─────────────────────────────────────────────────────
interface CommissionForm {
  clientName: string;
  seqNumber: string;
  status: "Pending" | "Started" | "Cancelled";
  signingDate: string;
  contractValue: string;
  leadSource: "" | "Sales Mining" | "Referal" | "Marketing";
  qualifierName: string;
  qualifierCommissionAmount: string;
  qualifierCommissionDate: string;
  qualifierLeader: string;
  qualifierLeaderCommissionAmount: string;
  qualifierLeaderCommissionDate: string;
  paralegalTlCommissionAmount: string;
  paralegalTlCommissionDate: string;
  operationManagerCommissionAmount: string;
  operationManagerCommissionDate: string;
  paralegal: string;
  paralegalFirstPaymentAmount: string;
  paralegalFirstPaymentDate: string;
  paralegalSecondPaymentAmount: string;
  paralegalSecondPaymentDate: string;
  paralegalThirdPaymentAmount: string;
  paralegalThirdPaymentDate: string;
  consultant: string;
  consultantTotalPayment: string;
  consultantFirstPayment: string;
  consultantFirstPaymentDate: string;
  consultantSecondPayment: string;
  consultantSecondPaymentDate: string;
  consultantThirdPayment: string;
  consultantThirdPaymentDate: string;
  leaderName: string;
  leaderCommissionAmount: string;
  leaderCommissionDate: string;
}

const EMPTY_FORM: CommissionForm = {
  clientName: "", seqNumber: "", status: "Pending", signingDate: "", contractValue: "",
  leadSource: "", qualifierName: "", qualifierCommissionAmount: "", qualifierCommissionDate: "",
  qualifierLeader: "", qualifierLeaderCommissionAmount: "", qualifierLeaderCommissionDate: "",
  paralegalTlCommissionAmount: "", paralegalTlCommissionDate: "",
  operationManagerCommissionAmount: "", operationManagerCommissionDate: "",
  paralegal: "", paralegalFirstPaymentAmount: "", paralegalFirstPaymentDate: "",
  paralegalSecondPaymentAmount: "", paralegalSecondPaymentDate: "",
  paralegalThirdPaymentAmount: "", paralegalThirdPaymentDate: "",
  consultant: "", consultantTotalPayment: "", consultantFirstPayment: "", consultantFirstPaymentDate: "",
  consultantSecondPayment: "", consultantSecondPaymentDate: "",
  consultantThirdPayment: "", consultantThirdPaymentDate: "",
  leaderName: "Mahmoud Saber", leaderCommissionAmount: "", leaderCommissionDate: "",
};

function formToMutation(form: CommissionForm) {
  return {
    clientName: form.clientName,
    seqNumber: form.seqNumber ? Number(form.seqNumber) : undefined,
    status: form.status || undefined,
    signingDate: parseDate(form.signingDate),
    contractValue: form.contractValue ? Number(form.contractValue) : undefined,
    leadSource: (form.leadSource || undefined) as "Sales Mining" | "Referal" | "Marketing" | undefined,
    qualifierName: form.qualifierName || undefined,
    qualifierCommissionAmount: form.qualifierCommissionAmount ? Number(form.qualifierCommissionAmount) : undefined,
    qualifierCommissionDate: parseDate(form.qualifierCommissionDate),
    qualifierLeader: form.qualifierLeader || undefined,
    qualifierLeaderCommissionAmount: form.qualifierLeaderCommissionAmount ? Number(form.qualifierLeaderCommissionAmount) : undefined,
    qualifierLeaderCommissionDate: parseDate(form.qualifierLeaderCommissionDate),
    paralegalTlCommissionAmount: form.paralegalTlCommissionAmount ? Number(form.paralegalTlCommissionAmount) : undefined,
    paralegalTlCommissionDate: parseDate(form.paralegalTlCommissionDate),
    operationManagerCommissionAmount: form.operationManagerCommissionAmount ? Number(form.operationManagerCommissionAmount) : undefined,
    operationManagerCommissionDate: parseDate(form.operationManagerCommissionDate),
    paralegal: form.paralegal || undefined,
    paralegalFirstPaymentAmount: form.paralegalFirstPaymentAmount ? Number(form.paralegalFirstPaymentAmount) : undefined,
    paralegalFirstPaymentDate: parseDate(form.paralegalFirstPaymentDate),
    paralegalSecondPaymentAmount: form.paralegalSecondPaymentAmount ? Number(form.paralegalSecondPaymentAmount) : undefined,
    paralegalSecondPaymentDate: parseDate(form.paralegalSecondPaymentDate),
    paralegalThirdPaymentAmount: form.paralegalThirdPaymentAmount ? Number(form.paralegalThirdPaymentAmount) : undefined,
    paralegalThirdPaymentDate: parseDate(form.paralegalThirdPaymentDate),
    consultant: form.consultant || undefined,
    consultantTotalPayment: form.consultantTotalPayment ? Number(form.consultantTotalPayment) : undefined,
    consultantFirstPayment: form.consultantFirstPayment ? Number(form.consultantFirstPayment) : undefined,
    consultantFirstPaymentDate: parseDate(form.consultantFirstPaymentDate),
    consultantSecondPayment: form.consultantSecondPayment ? Number(form.consultantSecondPayment) : undefined,
    consultantSecondPaymentDate: parseDate(form.consultantSecondPaymentDate),
    consultantThirdPayment: form.consultantThirdPayment ? Number(form.consultantThirdPayment) : undefined,
    consultantThirdPaymentDate: parseDate(form.consultantThirdPaymentDate),
    leaderName: form.leaderName || "Mahmoud Saber",
    leaderCommissionAmount: form.leaderCommissionAmount ? Number(form.leaderCommissionAmount) : undefined,
    leaderCommissionDate: parseDate(form.leaderCommissionDate),
  };
}

// ─── Form Section Component ───────────────────────────────────────────────────
function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}
function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FinCommissions() {
  const utils = trpc.useUtils();

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [leadSourceFilter, setLeadSourceFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const filters = useMemo(() => ({
    search: search || undefined,
    status: statusFilter || undefined,
    leadSource: leadSourceFilter || undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  }), [search, statusFilter, leadSourceFilter, page, pageSize]);

  const countFilters = useMemo(() => ({
    search: search || undefined,
    status: statusFilter || undefined,
    leadSource: leadSourceFilter || undefined,
  }), [search, statusFilter, leadSourceFilter]);

  const { data: commissions, isLoading } = trpc.financial.commissions.list.useQuery(filters);
  const { data: total } = trpc.financial.commissions.count.useQuery(countFilters);
  const { data: employees } = trpc.financial.employees.list.useQuery();

  const totalPages = Math.ceil((total ?? 0) / pageSize);

  // Mutations
  const createMut = trpc.financial.commissions.create.useMutation({
    onSuccess: () => {
      utils.financial.commissions.list.invalidate();
      utils.financial.commissions.count.invalidate();
      toast.success("Commission record created");
      setShowDialog(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.financial.commissions.update.useMutation({
    onSuccess: () => {
      utils.financial.commissions.list.invalidate();
      toast.success("Commission record updated");
      setShowDialog(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.financial.commissions.delete.useMutation({
    onSuccess: () => {
      utils.financial.commissions.list.invalidate();
      utils.financial.commissions.count.invalidate();
      toast.success("Commission record deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  // Dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CommissionForm>(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Employee lists by role — matches actual role names stored in finEmployees table
  const csList = employees?.filter(e => {
    const r = (e.role ?? "").trim();
    return r === "CS" || r === "CS TL" || r === "Qualifier" || r === "Qualifier TL";
  }) ?? [];
  const csTlList = employees?.filter(e => {
    const r = (e.role ?? "").trim();
    return r === "CS TL" || r === "Qualifier TL";
  }) ?? [];
  const paralegalList = employees?.filter(e => {
    const r = (e.role ?? "").trim();
    return r === "Paralegal" || r === "Operation TL" || r === "Operation Manager";
  }) ?? [];
  const consultantList = employees?.filter(e => {
    const r = (e.role ?? "").trim();
    return r === "Consultant" || r === "S Consultant" || r === "Country Manager" || r === "CEO";
  }) ?? [];

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  }
  function openEdit(c: NonNullable<typeof commissions>[number]) {
    setEditingId(c.id);
    setForm({
      clientName: c.clientName ?? "",
      seqNumber: c.seqNumber?.toString() ?? "",
      status: (c.status as CommissionForm["status"]) ?? "Pending",
      signingDate: toISODate(c.signingDate),
      contractValue: c.contractValue?.toString() ?? "",
      leadSource: (c.leadSource as CommissionForm["leadSource"]) ?? "",
      qualifierName: c.qualifierName ?? "",
      qualifierCommissionAmount: c.qualifierCommissionAmount?.toString() ?? "",
      qualifierCommissionDate: toISODate(c.qualifierCommissionDate),
      qualifierLeader: c.qualifierLeader ?? "",
      qualifierLeaderCommissionAmount: c.qualifierLeaderCommissionAmount?.toString() ?? "",
      qualifierLeaderCommissionDate: toISODate(c.qualifierLeaderCommissionDate),
      paralegalTlCommissionAmount: c.paralegalTlCommissionAmount?.toString() ?? "",
      paralegalTlCommissionDate: toISODate(c.paralegalTlCommissionDate),
      operationManagerCommissionAmount: c.operationManagerCommissionAmount?.toString() ?? "",
      operationManagerCommissionDate: toISODate(c.operationManagerCommissionDate),
      paralegal: c.paralegal ?? "",
      paralegalFirstPaymentAmount: c.paralegalFirstPaymentAmount?.toString() ?? "",
      paralegalFirstPaymentDate: toISODate(c.paralegalFirstPaymentDate),
      paralegalSecondPaymentAmount: c.paralegalSecondPaymentAmount?.toString() ?? "",
      paralegalSecondPaymentDate: toISODate(c.paralegalSecondPaymentDate),
      paralegalThirdPaymentAmount: c.paralegalThirdPaymentAmount?.toString() ?? "",
      paralegalThirdPaymentDate: toISODate(c.paralegalThirdPaymentDate),
      consultant: c.consultant ?? "",
      consultantTotalPayment: c.consultantTotalPayment?.toString() ?? "",
      consultantFirstPayment: c.consultantFirstPayment?.toString() ?? "",
      consultantFirstPaymentDate: toISODate(c.consultantFirstPaymentDate),
      consultantSecondPayment: c.consultantSecondPayment?.toString() ?? "",
      consultantSecondPaymentDate: toISODate(c.consultantSecondPaymentDate),
      consultantThirdPayment: c.consultantThirdPayment?.toString() ?? "",
      consultantThirdPaymentDate: toISODate(c.consultantThirdPaymentDate),
      leaderName: c.leaderName ?? "Mahmoud Saber",
      leaderCommissionAmount: c.leaderCommissionAmount?.toString() ?? "",
      leaderCommissionDate: toISODate(c.leaderCommissionDate),
    });
    setShowDialog(true);
  }

  function handleSave() {
    if (!form.clientName.trim()) { toast.error("Client name is required"); return; }
    const data = formToMutation(form);
    if (editingId !== null) {
      updateMut.mutate({ id: editingId, ...data });
    } else {
      createMut.mutate(data);
    }
  }

  const f = (field: keyof CommissionForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  const fs = (field: keyof CommissionForm) => (val: string) =>
    setForm(prev => ({ ...prev, [field]: val }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Commission Database</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total ?? 0} records total
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Add Commission
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search client name..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <Select value={statusFilter || "all"} onValueChange={v => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Started">Started</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={leadSourceFilter || "all"} onValueChange={v => { setLeadSourceFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Lead Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="Sales Mining">Sales Mining</SelectItem>
                <SelectItem value="Referal">Referal</SelectItem>
                <SelectItem value="Marketing">Marketing</SelectItem>
              </SelectContent>
            </Select>
            {(search || statusFilter || leadSourceFilter) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter(""); setLeadSourceFilter(""); setPage(1); }}>
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
            <Select value={pageSize.toString()} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="250">250</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-10">#</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground min-w-[180px]">Client Name</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-24">Status</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-28">Signing Date</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-28">Contract Value</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-28">Lead Source</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-28">Qualifier</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-24">Qual. Comm.</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-28">Qual. Leader</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-24">QL Comm.</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-24">Op. TL</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-24">Op. Mgr</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-28">Paralegal</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-24">Para. 1st</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-24">Para. 2nd</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-24">Para. 3rd</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-28">Consultant</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-24">Cons. 1st</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-24">Cons. 2nd</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-24">Cons. 3rd</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-28">Leader</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-24">Leader Comm.</th>
                  <th className="text-center px-3 py-2.5 font-medium text-muted-foreground w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={23} className="text-center py-12 text-muted-foreground">Loading...</td></tr>
                ) : !commissions?.length ? (
                  <tr><td colSpan={23} className="text-center py-12 text-muted-foreground">No commission records found</td></tr>
                ) : commissions.map((c) => (
                  <tr key={c.id} className="border-b border-muted/40 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 text-muted-foreground">{c.seqNumber ?? c.id}</td>
                    <td className="px-3 py-2 font-medium">{c.clientName}</td>
                    <td className="px-3 py-2">
                      {c.status ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[c.status] ?? ""}`}>
                          {c.status}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(c.signingDate)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{fmtEur(c.contractValue)}</td>
                    <td className="px-3 py-2">
                      {c.leadSource ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">
                          {c.leadSource}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{c.qualifierName ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{fmtEur(c.qualifierCommissionAmount)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.qualifierLeader ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{fmtEur(c.qualifierLeaderCommissionAmount)}</td>
                    <td className="px-3 py-2 text-right">{fmtEur(c.paralegalTlCommissionAmount)}</td>
                    <td className="px-3 py-2 text-right">{fmtEur(c.operationManagerCommissionAmount)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.paralegal ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{fmtEur(c.paralegalFirstPaymentAmount)}</td>
                    <td className="px-3 py-2 text-right">{fmtEur(c.paralegalSecondPaymentAmount)}</td>
                    <td className="px-3 py-2 text-right">{fmtEur(c.paralegalThirdPaymentAmount)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.consultant ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{fmtEur(c.consultantFirstPayment)}</td>
                    <td className="px-3 py-2 text-right">{fmtEur(c.consultantSecondPayment)}</td>
                    <td className="px-3 py-2 text-right">{fmtEur(c.consultantThirdPayment)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.leaderName ?? "Mahmoud Saber"}</td>
                    <td className="px-3 py-2 text-right">{fmtEur(c.leaderCommissionAmount)}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteConfirmId(c.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages} · {total} records
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId !== null ? "Edit Commission Record" : "Add Commission Record"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* Basic Info */}
            <FormSection title="Client & Contract">
              <FormRow>
                <FormField label="Client Name *">
                  <Input value={form.clientName} onChange={f("clientName")} placeholder="Client full name" />
                </FormField>
                <FormField label="Seq. Number">
                  <Input type="number" value={form.seqNumber} onChange={f("seqNumber")} placeholder="1" />
                </FormField>
              </FormRow>
              <FormRow>
                <FormField label="Status">
                  <Select value={form.status} onValueChange={fs("status")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Started">Started</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Lead Source">
                  <Select value={form.leadSource || "none"} onValueChange={v => fs("leadSource")(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      <SelectItem value="Sales Mining">Sales Mining</SelectItem>
                      <SelectItem value="Referal">Referal</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </FormRow>
              <FormRow>
                <FormField label="Signing Date">
                  <Input type="date" value={form.signingDate} onChange={f("signingDate")} />
                </FormField>
                <FormField label="Contract Value (EUR)">
                  <Input type="number" step="0.01" value={form.contractValue} onChange={f("contractValue")} placeholder="0.00" />
                </FormField>
              </FormRow>
            </FormSection>

            {/* Qualifier */}
            <FormSection title="Qualifier (CS / CS TL)">
              <FormRow>
                <FormField label="Qualifier Name">
                  <Select value={form.qualifierName || "none"} onValueChange={v => fs("qualifierName")(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select qualifier" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {csList.map(e => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Qualifier Commission Amount (EUR)">
                  <Input type="number" step="0.01" value={form.qualifierCommissionAmount} onChange={f("qualifierCommissionAmount")} placeholder="0.00" />
                </FormField>
              </FormRow>
              <FormRow>
                <FormField label="Qualifier Commission Date">
                  <Input type="date" value={form.qualifierCommissionDate} onChange={f("qualifierCommissionDate")} />
                </FormField>
                <div />
              </FormRow>
            </FormSection>

            {/* Qualifier Leader */}
            <FormSection title="Qualifier Leader (CS TL)">
              <FormRow>
                <FormField label="Qualifier Leader Name">
                  <Select value={form.qualifierLeader || "none"} onValueChange={v => fs("qualifierLeader")(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select CS TL" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {csTlList.map(e => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Qualifier Leader Commission (EUR)">
                  <Input type="number" step="0.01" value={form.qualifierLeaderCommissionAmount} onChange={f("qualifierLeaderCommissionAmount")} placeholder="0.00" />
                </FormField>
              </FormRow>
              <FormRow>
                <FormField label="Qualifier Leader Commission Date">
                  <Input type="date" value={form.qualifierLeaderCommissionDate} onChange={f("qualifierLeaderCommissionDate")} />
                </FormField>
                <div />
              </FormRow>
            </FormSection>

            {/* Paralegal TL & Operation Manager */}
            <FormSection title="Paralegal TL & Operation Manager">
              <FormRow>
                <FormField label="Paralegal TL Commission (EUR)">
                  <Input type="number" step="0.01" value={form.paralegalTlCommissionAmount} onChange={f("paralegalTlCommissionAmount")} placeholder="0.00" />
                </FormField>
                <FormField label="Paralegal TL Commission Date">
                  <Input type="date" value={form.paralegalTlCommissionDate} onChange={f("paralegalTlCommissionDate")} />
                </FormField>
              </FormRow>
              <FormRow>
                <FormField label="Operation Manager Commission (EUR)">
                  <Input type="number" step="0.01" value={form.operationManagerCommissionAmount} onChange={f("operationManagerCommissionAmount")} placeholder="0.00" />
                </FormField>
                <FormField label="Operation Manager Commission Date">
                  <Input type="date" value={form.operationManagerCommissionDate} onChange={f("operationManagerCommissionDate")} />
                </FormField>
              </FormRow>
            </FormSection>

            {/* Paralegal */}
            <FormSection title="Paralegal">
              <FormRow>
                <FormField label="Paralegal Name">
                  <Select value={form.paralegal || "none"} onValueChange={v => fs("paralegal")(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select paralegal" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {paralegalList.map(e => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                <div />
              </FormRow>
              <FormRow>
                <FormField label="1st Payment Amount (EUR)">
                  <Input type="number" step="0.01" value={form.paralegalFirstPaymentAmount} onChange={f("paralegalFirstPaymentAmount")} placeholder="0.00" />
                </FormField>
                <FormField label="1st Payment Date">
                  <Input type="date" value={form.paralegalFirstPaymentDate} onChange={f("paralegalFirstPaymentDate")} />
                </FormField>
              </FormRow>
              <FormRow>
                <FormField label="2nd Payment Amount (EUR)">
                  <Input type="number" step="0.01" value={form.paralegalSecondPaymentAmount} onChange={f("paralegalSecondPaymentAmount")} placeholder="0.00" />
                </FormField>
                <FormField label="2nd Payment Date">
                  <Input type="date" value={form.paralegalSecondPaymentDate} onChange={f("paralegalSecondPaymentDate")} />
                </FormField>
              </FormRow>
              <FormRow>
                <FormField label="3rd Payment Amount (EUR)">
                  <Input type="number" step="0.01" value={form.paralegalThirdPaymentAmount} onChange={f("paralegalThirdPaymentAmount")} placeholder="0.00" />
                </FormField>
                <FormField label="3rd Payment Date">
                  <Input type="date" value={form.paralegalThirdPaymentDate} onChange={f("paralegalThirdPaymentDate")} />
                </FormField>
              </FormRow>
            </FormSection>

            {/* Consultant */}
            <FormSection title="Consultant">
              <FormRow>
                <FormField label="Consultant Name">
                  <Select value={form.consultant || "none"} onValueChange={v => fs("consultant")(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select consultant" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {consultantList.map(e => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Total Payment Amount (EUR)">
                  <Input type="number" step="0.01" value={form.consultantTotalPayment} onChange={f("consultantTotalPayment")} placeholder="0.00" />
                </FormField>
              </FormRow>
              <FormRow>
                <FormField label="1st Payment (50%) (EUR)">
                  <Input type="number" step="0.01" value={form.consultantFirstPayment} onChange={f("consultantFirstPayment")} placeholder="0.00" />
                </FormField>
                <FormField label="1st Payment Date">
                  <Input type="date" value={form.consultantFirstPaymentDate} onChange={f("consultantFirstPaymentDate")} />
                </FormField>
              </FormRow>
              <FormRow>
                <FormField label="2nd Payment (25%) (EUR)">
                  <Input type="number" step="0.01" value={form.consultantSecondPayment} onChange={f("consultantSecondPayment")} placeholder="0.00" />
                </FormField>
                <FormField label="2nd Payment Date">
                  <Input type="date" value={form.consultantSecondPaymentDate} onChange={f("consultantSecondPaymentDate")} />
                </FormField>
              </FormRow>
              <FormRow>
                <FormField label="3rd Payment (25%) (EUR)">
                  <Input type="number" step="0.01" value={form.consultantThirdPayment} onChange={f("consultantThirdPayment")} placeholder="0.00" />
                </FormField>
                <FormField label="3rd Payment Date">
                  <Input type="date" value={form.consultantThirdPaymentDate} onChange={f("consultantThirdPaymentDate")} />
                </FormField>
              </FormRow>
            </FormSection>

            {/* Leader */}
            <FormSection title="Leader Commission">
              <FormRow>
                <FormField label="Leader Name">
                  <Input value={form.leaderName} onChange={f("leaderName")} placeholder="Mahmoud Saber" />
                </FormField>
                <FormField label="Leader Commission Amount (EUR)">
                  <Input type="number" step="0.01" value={form.leaderCommissionAmount} onChange={f("leaderCommissionAmount")} placeholder="0.00" />
                </FormField>
              </FormRow>
              <FormRow>
                <FormField label="Leader Commission Date">
                  <Input type="date" value={form.leaderCommissionDate} onChange={f("leaderCommissionDate")} />
                </FormField>
                <div />
              </FormRow>
            </FormSection>
          </div>

          <DialogFooter className="sticky bottom-0 bg-background pt-4 border-t">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
              {(createMut.isPending || updateMut.isPending) ? "Saving..." : editingId !== null ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Commission Record</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to delete this commission record? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (deleteConfirmId !== null) {
                deleteMut.mutate({ id: deleteConfirmId });
                setDeleteConfirmId(null);
              }
            }} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
