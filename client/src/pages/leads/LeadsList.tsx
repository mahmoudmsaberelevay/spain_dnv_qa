import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Search, Phone, Mail, User, Calendar, Download } from "lucide-react";

const STAGES = [
  { value: "fresh", label: "Fresh", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "contacted", label: "Contacted", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "qualified", label: "Qualified", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "prospect", label: "Prospect", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  { value: "client", label: "Client", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "dormant", label: "Dormant", color: "bg-gray-100 text-gray-600 border-gray-200" },
  { value: "not_qualified_budget", label: "NQ - Budget", color: "bg-red-100 text-red-700 border-red-200" },
  { value: "not_qualified_work", label: "NQ - Work", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "not_qualified_study", label: "NQ - Study", color: "bg-pink-100 text-pink-700 border-pink-200" },
  { value: "not_qualified_criminal", label: "NQ - Criminal", color: "bg-red-200 text-red-800 border-red-300" },
  { value: "not_qualified_other", label: "NQ - Other", color: "bg-gray-200 text-gray-700 border-gray-300" },
];

const PROGRAMS = [
  "Spain DNV", "Portugal D7", "Portugal D8", "Portugal D2",
  "Greece Golden Visa", "Malta Permanent Residency", "UK Expansion Worker",
  "Canada Skilled Migration", "Caribbean Citizenship",
];

const SOURCES = [
  "Meta Ads", "Google Ads", "Referral", "Website", "WhatsApp", "Walk-in",
  "Instagram", "LinkedIn", "TikTok", "YouTube", "Email Campaign", "Other",
];

const TEAM = [
  "Mahmoud Saber", "Fouad", "Kirolos", "Ziad El Shurafa", "Madonna Adel",
];

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

function getStageMeta(stage: string) {
  return STAGES.find(s => s.value === stage) ?? { label: stage, color: "bg-gray-100 text-gray-600 border-gray-200" };
}

export default function LeadsList() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [programFilter, setProgramFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("all");

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    fullName: "", phone: "", whatsapp: "", email: "",
    nationality: "", interestedProgram: "", leadSource: "",
    assignedTo: "", priority: "medium" as "low" | "medium" | "high",
    notes: "", budgetRange: "",
  });

  const filters = useMemo(() => ({
    search: search || undefined,
    stage: stageFilter !== "all" ? stageFilter : undefined,
    leadSource: sourceFilter !== "all" ? sourceFilter : undefined,
    interestedProgram: programFilter !== "all" ? programFilter : undefined,
    assignedTo: assignedFilter !== "all" ? assignedFilter : undefined,
  }), [search, stageFilter, sourceFilter, programFilter, assignedFilter]);

  const { data: leads = [], isLoading } = trpc.leads.list.useQuery(filters);

  const createLead = trpc.leads.create.useMutation({
    onSuccess: () => {
      utils.leads.list.invalidate();
      utils.leads.analytics.overview.invalidate();
      setShowCreate(false);
      setForm({ fullName: "", phone: "", whatsapp: "", email: "", nationality: "", interestedProgram: "", leadSource: "", assignedTo: "", priority: "medium", notes: "", budgetRange: "" });
      toast.success("Lead created — new lead added to pipeline.");
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.error(`Duplicate detected: ${err.message}`);
      } else {
        toast.error(err.message);
      }
    },
  });

  function handleCreate() {
    if (!form.fullName.trim()) {
      toast.error("Full name is required.");
      return;
    }
    createLead.mutate(form);
  }

  function exportCSV() {
    const headers = ["ID", "Name", "Phone", "WhatsApp", "Email", "Nationality", "Program", "Source", "Stage", "Priority", "Assigned To", "Created"];
    const rows = leads.map(l => [
      l.id, l.fullName, l.phone ?? "", l.whatsapp ?? "", l.email ?? "",
      l.nationality ?? "", l.interestedProgram ?? "", l.leadSource ?? "",
      l.stage, l.priority ?? "", l.assignedTo ?? "",
      new Date(l.createdAt).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `elevay-leads-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">{leads.length} lead{leads.length !== 1 ? "s" : ""} found</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> New Lead
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search name, phone, email…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={programFilter} onValueChange={setProgramFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Program" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Programs</SelectItem>
            {PROGRAMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={assignedFilter} onValueChange={setAssignedFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Assigned To" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Team</SelectItem>
            {TEAM.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading leads…</div>
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No leads found</p>
            <p className="text-sm mt-1">Try adjusting your filters or create a new lead.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Program</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Source</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Stage</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Priority</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Assigned</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leads.map(lead => {
                const stage = getStageMeta(lead.stage);
                return (
                  <tr
                    key={lead.id}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/leads/${lead.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{lead.fullName}</div>
                      {lead.nationality && <div className="text-xs text-muted-foreground">{lead.nationality}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {lead.phone && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{lead.phone}</span>}
                        {lead.email && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{lead.email}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{lead.interestedProgram ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{lead.leadSource ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${stage.color}`}>
                        {stage.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lead.priority && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${PRIORITY_COLORS[lead.priority] ?? ""}`}>
                          {lead.priority}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {lead.assignedTo ?? "Unassigned"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Lead Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Full Name <span className="text-red-500">*</span></Label>
              <Input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="e.g. Ahmed Mohamed" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+20 10..." className="mt-1" />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="+20 10..." className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" className="mt-1" />
            </div>
            <div>
              <Label>Nationality</Label>
              <Input value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} placeholder="e.g. Egyptian" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Interested Program</Label>
                <Select value={form.interestedProgram} onValueChange={v => setForm(f => ({ ...f, interestedProgram: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {PROGRAMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Lead Source</Label>
                <Select value={form.leadSource} onValueChange={v => setForm(f => ({ ...f, leadSource: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Assigned To</Label>
                <Select value={form.assignedTo} onValueChange={v => setForm(f => ({ ...f, assignedTo: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {TEAM.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as any }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Budget Range</Label>
              <Input value={form.budgetRange} onChange={e => setForm(f => ({ ...f, budgetRange: e.target.value }))} placeholder="e.g. €50,000 - €100,000" className="mt-1" />
            </div>
            <div>
              <Label>Notes</Label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Initial notes about this lead…"
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createLead.isPending}>
              {createLead.isPending ? "Creating…" : "Create Lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Users({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}
