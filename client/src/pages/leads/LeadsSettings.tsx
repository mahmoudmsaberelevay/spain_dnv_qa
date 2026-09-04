import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import MetaOperationsTab from "./MetaOperationsTab";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Settings, Download, Upload, Users, Tag, Zap, Globe,
  Plus, Trash2, RefreshCw, Copy, Check, Eye, Pencil,
  FileDown, FileUp, AlertCircle, ExternalLink, MapPin, Star, List,
  CheckCircle2, XCircle, Clock, ToggleLeft, ToggleRight, Activity,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied!`));
}

function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) { toast.error("No data to export"); return; }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => {
      const v = r[h] ?? "";
      return typeof v === "string" && (v.includes(",") || v.includes('"'))
        ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const PERMISSION_LABELS: Record<string, string> = {
  canView: "View", canCreate: "Create", canEdit: "Edit",
  canDelete: "Delete", canExport: "Export", canImport: "Import",
};
const PERM_KEYS = ["canView", "canCreate", "canEdit", "canDelete", "canExport", "canImport"] as const;

// ─── LeadSquared Column Mapping ───────────────────────────────────────────────

const ELEVAY_FIELDS = [
  { key: "fullName", label: "Full Name", required: true },
  { key: "__firstName__", label: "First Name (will combine with Last Name)" },
  { key: "__lastName__", label: "Last Name (will combine with First Name)" },
  { key: "phone", label: "Phone", required: true },
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "nationality", label: "Nationality" },
  { key: "countryOfResidence", label: "Country of Residence" },
  { key: "interestedProgram", label: "Interested Program" },
  { key: "interestedCountry", label: "Interested Country" },
  { key: "budgetRange", label: "Budget Range" },
  { key: "occupation", label: "Occupation" },
  { key: "leadSource", label: "Lead Source" },
  { key: "assignedTo", label: "Assigned To" },
  { key: "notes", label: "Notes" },
  { key: "stage", label: "Current Stage" },
  { key: "createdAt", label: "Created Date" },
  { key: "__lastActivityDate__", label: "Last Activity Date" },
  { key: "__lastActivityType__", label: "Last Activity Type" },
  { key: "__skip__", label: "— Skip this column —" },
];

// ─── Export / Import Tab ──────────────────────────────────────────────────────

function ExportImportTab() {
  const exportQuery = trpc.leadsSettings.exportLeads.useQuery(undefined, { enabled: false });
  const importMut = trpc.leads.create.useMutation();
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<"idle" | "mapping" | "preview" | "done">("idle");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [importResults, setImportResults] = useState<{ success: number; skipped: number; errors: string[] }>({ success: 0, skipped: 0, errors: [] });
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExportCsv = async () => {
    const result = await exportQuery.refetch();
    if (result.data) downloadCsv(result.data as Record<string, unknown>[], `elevay_leads_${new Date().toISOString().slice(0,10)}.csv`);
  };

  const handleExportJson = async () => {
    const result = await exportQuery.refetch();
    if (result.data) {
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `elevay_leads_${new Date().toISOString().slice(0,10)}.json`; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const parseCsv = (text: string): { headers: string[]; rows: string[][] } => {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return { headers: [], rows: [] };
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    const rows = lines.slice(1).map(line => {
      const vals: string[] = [];
      let cur = ""; let inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; }
        else { cur += ch; }
      }
      vals.push(cur.trim());
      return vals;
    });
    return { headers, rows };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      if (file.name.endsWith(".json")) {
        // JSON: direct import
        const rows = JSON.parse(text) as Record<string, unknown>[];
        toast.success(`Parsed ${rows.length} leads from JSON. JSON import not yet supported in wizard — please use CSV.`);
        setImporting(false);
        return;
      }
      const { headers, rows } = parseCsv(text);
      setCsvHeaders(headers);
      setCsvRows(rows);
      // Auto-map by common LeadSquared column names
      const autoMap: Record<string, string> = {};
      headers.forEach(h => {
        const lower = h.toLowerCase().replace(/[\s_-]/g, "");
        if (lower === "fullname" || lower === "name") autoMap[h] = "fullName";
        // LeadSquared uses separate First Name / Last Name columns — map them to special keys
        else if (lower === "firstname" || lower === "first") autoMap[h] = "__firstName__";
        else if (lower === "lastname" || lower === "last") autoMap[h] = "__lastName__";
        else if (lower.includes("phone") || lower.includes("mobile")) autoMap[h] = "phone";
        else if (lower.includes("email")) autoMap[h] = "email";
        else if (lower.includes("whatsapp")) autoMap[h] = "whatsapp";
        else if (lower.includes("nationality")) autoMap[h] = "nationality";
        else if (lower.includes("country") && !lower.includes("interested")) autoMap[h] = "countryOfResidence";
        else if (lower.includes("program") || lower.includes("interested")) autoMap[h] = "interestedProgram";
        else if (lower.includes("budget")) autoMap[h] = "budgetRange";
        else if (lower.includes("occupation") || lower.includes("job")) autoMap[h] = "occupation";
        else if (lower.includes("source") || lower.includes("leadsource")) autoMap[h] = "leadSource";
        else if (lower.includes("owner") || lower.includes("assigned")) autoMap[h] = "assignedTo";
        else if (lower.includes("note") || lower.includes("comment")) autoMap[h] = "notes";
        else if (lower.includes("stage") || lower.includes("status")) autoMap[h] = "stage";
        else if ((lower.includes("created") && lower.includes("date")) || lower === "createdat" || lower === "createdon" || lower === "date") autoMap[h] = "createdAt";
        else if (lower.includes("lastactivity") && lower.includes("date")) autoMap[h] = "__lastActivityDate__";
        else if (lower.includes("lastactivity") && lower.includes("type")) autoMap[h] = "__lastActivityType__";
        else autoMap[h] = "__skip__";
      });
      setMapping(autoMap);
      setStep("mapping");
    } catch {
      toast.error("Failed to parse file.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const buildPreview = () => {
    const preview = csvRows.slice(0, 5).map(row => {
      const obj: Record<string, string> = {};
      csvHeaders.forEach((h, i) => {
        const field = mapping[h];
        if (field && field !== "__skip__") obj[field] = row[i] ?? "";
      });
      return obj;
    });
    setPreviewRows(preview);
    setStep("preview");
  };

  // Known LeadSquared placeholder/test names that should be skipped
  const PLACEHOLDER_NAMES = new Set(["robertblock", "robert block", "john doe", "jane doe", "test lead", "sample lead", "test user"]);

  const runImport = async () => {
    let success = 0; let skipped = 0; const errors: string[] = [];
    for (const row of csvRows) {
      const obj: Record<string, string> = {};
      csvHeaders.forEach((h, i) => {
        const field = mapping[h];
        if (field && field !== "__skip__") obj[field] = row[i] ?? "";
      });

      // Combine First Name + Last Name if fullName not directly mapped
      if (!obj.fullName && (obj["__firstName__"] || obj["__lastName__"])) {
        obj.fullName = [obj["__firstName__"], obj["__lastName__"]].filter(Boolean).join(" ").trim();
      }
      delete obj["__firstName__"];
      delete obj["__lastName__"];

      // Skip rows with no name
      if (!obj.fullName?.trim()) { skipped++; continue; }

      // Skip known LeadSquared placeholder/test rows
      if (PLACEHOLDER_NAMES.has(obj.fullName.toLowerCase().trim())) { skipped++; continue; }

      // Skip rows with no contact info at all (phone and email both empty)
      if (!obj.phone?.trim() && !obj.email?.trim()) { skipped++; continue; }

      // Parse optional date fields
      let parsedCreatedAt: number | undefined;
      if (obj.createdAt) {
        const d = new Date(obj.createdAt);
        if (!isNaN(d.getTime())) parsedCreatedAt = d.getTime();
      }
      const lastActivityDate = obj["__lastActivityDate__"];
      const lastActivityType = obj["__lastActivityType__"];
      delete obj["__lastActivityDate__"];
      delete obj["__lastActivityType__"];

      // Normalise stage value
      const stageMap: Record<string, string> = {
        fresh: "fresh", new: "fresh", contacted: "contacted", qualified: "qualified",
        prospect: "prospect", client: "client", dormant: "dormant",
      };
      const rawStage = (obj.stage ?? "").toLowerCase().trim().replace(/\s+/g, "_");
      const normalisedStage = stageMap[rawStage] ?? undefined;

      try {
        const lead = await importMut.mutateAsync({ fullName: obj.fullName, phone: obj.phone, email: obj.email || undefined, whatsapp: obj.whatsapp, nationality: obj.nationality, countryOfResidence: obj.countryOfResidence, interestedProgram: obj.interestedProgram, budgetRange: obj.budgetRange, occupation: obj.occupation, leadSource: obj.leadSource || "LeadSquared Import", assignedTo: obj.assignedTo, notes: obj.notes, stage: normalisedStage, importedCreatedAt: parsedCreatedAt, skipDuplicateCheck: false });
        // If last activity date/type provided, create an activity record
        if (lastActivityDate && lead?.id) {
          const actDate = new Date(lastActivityDate);
          if (!isNaN(actDate.getTime())) {
            try {
              await (window as any).__trpcClient?.leads?.addActivity?.mutate?.({ leadId: lead.id, type: lastActivityType || "other", description: `Imported activity: ${lastActivityType || "other"}`, createdAt: actDate.getTime() });
            } catch { /* best-effort */ }
          }
        }
        success++;
      } catch (err: any) {
        if (err?.message?.includes("Duplicate")) skipped++;
        else errors.push(`${obj.fullName}: ${err?.message ?? "unknown error"}`);
      }
    }
    setImportResults({ success, skipped, errors });
    setStep("done");
  };

  if (step === "mapping") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Map Columns</h3>
            <p className="text-sm text-muted-foreground">Match your CSV columns to ELEVAY fields. {csvRows.length} rows detected.</p>
          </div>
          <Button variant="outline" onClick={() => setStep("idle")}>Cancel</Button>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">CSV Column</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sample Value</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Map to ELEVAY Field</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {csvHeaders.map((h, idx) => (
                <tr key={h} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium text-foreground">{h}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs font-mono">{csvRows[0]?.[idx] ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <Select value={mapping[h] ?? "__skip__"} onValueChange={v => setMapping(m => ({ ...m, [h]: v }))}>
                      <SelectTrigger className="h-8 text-xs w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ELEVAY_FIELDS.map(f => (
                          <SelectItem key={f.key} value={f.key} className="text-xs">{f.label}{f.required ? " *" : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-3">
          <Button onClick={buildPreview} className="gap-2"><Eye className="h-4 w-4" />Preview (first 5 rows)</Button>
        </div>
      </div>
    );
  }

  if (step === "preview") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Import Preview</h3>
            <p className="text-sm text-muted-foreground">Showing first 5 of {csvRows.length} rows. Duplicates (same phone) will be skipped automatically.</p>
          </div>
          <Button variant="outline" onClick={() => setStep("mapping")}>← Back to Mapping</Button>
        </div>
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                {Object.keys(previewRows[0] ?? {}).map(k => (
                  <th key={k} className="text-left px-3 py-2 font-medium text-muted-foreground capitalize">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {previewRows.map((row, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  {Object.values(row).map((v, j) => (
                    <td key={j} className="px-3 py-2 text-foreground">{v || "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>This will import all {csvRows.length} rows. Leads with duplicate phone numbers will be skipped. This action cannot be undone.</span>
        </div>
        <div className="flex gap-3">
          <Button onClick={runImport} disabled={importMut.isPending} className="gap-2">
            <Upload className="h-4 w-4" />
            {importMut.isPending ? "Importing…" : `Confirm Import (${csvRows.length} leads)`}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="space-y-6">
        <div className="border border-green-200 bg-green-50 rounded-lg p-6 space-y-3">
          <h3 className="font-semibold text-green-800">Import Complete</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center"><div className="text-3xl font-bold text-green-700">{importResults.success}</div><div className="text-sm text-green-600">Imported</div></div>
            <div className="text-center"><div className="text-3xl font-bold text-amber-600">{importResults.skipped}</div><div className="text-sm text-amber-500">Skipped (duplicates)</div></div>
            <div className="text-center"><div className="text-3xl font-bold text-red-600">{importResults.errors.length}</div><div className="text-sm text-red-500">Errors</div></div>
          </div>
          {importResults.errors.length > 0 && (
            <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-3 max-h-32 overflow-y-auto">
              {importResults.errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </div>
        <Button onClick={() => setStep("idle")} variant="outline">Import Another File</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Export */}
      <div className="border border-border rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg"><FileDown className="h-5 w-5 text-green-600" /></div>
          <div>
            <h3 className="font-semibold text-foreground">Export Leads</h3>
            <p className="text-sm text-muted-foreground">Download all leads as CSV or JSON for offline use, backup, or migration.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleExportCsv} disabled={exportQuery.isFetching} className="gap-2">
            <Download className="h-4 w-4" />
            {exportQuery.isFetching ? "Preparing…" : "Export as CSV"}
          </Button>
          <Button variant="outline" onClick={handleExportJson} disabled={exportQuery.isFetching} className="gap-2">
            <Download className="h-4 w-4" />
            Export as JSON
          </Button>
        </div>
      </div>

      {/* Import */}
      <div className="border border-border rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><FileUp className="h-5 w-5 text-blue-600" /></div>
          <div>
            <h3 className="font-semibold text-foreground">Import Leads from LeadSquared / Other CRM</h3>
            <p className="text-sm text-muted-foreground">Upload a CSV file from LeadSquared or any CRM. A column-mapping wizard will guide you before any data is saved.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,.json" className="hidden" onChange={handleFileChange} />
          <Button onClick={() => fileRef.current?.click()} disabled={importing} variant="outline" className="gap-2">
            <Upload className="h-4 w-4" />
            {importing ? "Parsing…" : "Choose CSV File"}
          </Button>
        </div>
        <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Import will not overwrite existing leads. Duplicate phone numbers will be skipped automatically. You will see a preview before confirming.</span>
        </div>
      </div>
    </div>
  );
}

// ─── Permissions Tab ──────────────────────────────────────────────────────────

function PermissionsTab() {
  const { data: permissions, refetch } = trpc.leadsSettings.listPermissions.useQuery();
  const { data: allUsers } = trpc.leadsSettings.listAllUsers.useQuery();
  const upsert = trpc.leadsSettings.upsertPermission.useMutation({ onSuccess: () => { refetch(); toast.success("Permissions updated"); } });

  const permMap = new Map((permissions ?? []).map(p => [p.userId, p]));
  const usersWithPerms = (allUsers ?? []).map(u => ({
    ...u,
    perms: permMap.get(u.id) ?? { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false, canImport: false },
  }));

  const toggle = (userId: number, key: typeof PERM_KEYS[number], current: boolean) => {
    upsert.mutate({ userId, [key]: !current });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-foreground">Team Permissions</h3>
        <p className="text-sm text-muted-foreground">Control what each team member can do in the ELEVAY LEADS module.</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Team Member</th>
              {PERM_KEYS.map(k => (
                <th key={k} className="text-center px-3 py-3 font-medium text-muted-foreground">{PERMISSION_LABELS[k]}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {usersWithPerms.map(u => (
              <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{u.name}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                {PERM_KEYS.map(k => (
                  <td key={k} className="text-center px-3 py-3">
                    <Switch
                      checked={!!(u.perms as Record<string, unknown>)[k]}
                      onCheckedChange={() => toggle(u.id, k, !!(u.perms as Record<string, unknown>)[k])}
                      disabled={upsert.isPending}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {usersWithPerms.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Lead Sources Tab ─────────────────────────────────────────────────────────

function LeadSourcesTab() {
  const { data: sources, refetch } = trpc.leadsSettings.listSources.useQuery();
  const createMut = trpc.leadsSettings.createSource.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); setNewName(""); toast.success("Source added"); } });
  const updateMut = trpc.leadsSettings.updateSource.useMutation({ onSuccess: () => { refetch(); toast.success("Source updated"); } });
  const deleteMut = trpc.leadsSettings.deleteSource.useMutation({ onSuccess: () => { refetch(); toast.success("Source deleted"); } });

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const PRESET_SOURCES = [
    "Facebook Ads", "Instagram Ads", "Google Ads", "Website Form",
    "WhatsApp", "Referral", "Walk-in", "Exhibition", "Cold Call", "Email Campaign",
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Custom Lead Sources</h3>
          <p className="text-sm text-muted-foreground">Define where your leads come from. These will appear as options when creating or editing a lead.</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2"><Plus className="h-4 w-4" />Add Source</Button>
      </div>

      {/* Quick add presets */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Quick Add</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_SOURCES.map(s => (
            <button key={s} onClick={() => createMut.mutate({ name: s })}
              className="px-3 py-1.5 text-xs rounded-full border border-border hover:bg-muted transition-colors text-foreground">
              + {s}
            </button>
          ))}
        </div>
      </div>

      {/* Source list */}
      <div className="space-y-2">
        {(sources ?? []).map(s => (
          <div key={s.id} className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted/20 transition-colors">
            <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: s.color ?? "#6366f1" }} />
            <span className="flex-1 font-medium text-foreground text-sm">{s.name}</span>
            <Switch checked={!!s.isActive} onCheckedChange={v => updateMut.mutate({ id: s.id, isActive: v })} />
            <button onClick={() => setConfirmDelete(s.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {(sources ?? []).length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
            No custom sources yet. Add one above or use a quick-add preset.
          </div>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Lead Source</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Source Name</Label>
              <Input placeholder="e.g. LinkedIn Ads" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-3">
                <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="h-9 w-16 rounded cursor-pointer border border-border" />
                <span className="text-sm text-muted-foreground">{newColor}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate({ name: newName, color: newColor })} disabled={!newName.trim() || createMut.isPending}>Add Source</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={confirmDelete !== null} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead Source?</AlertDialogTitle>
            <AlertDialogDescription>This source will be removed. Existing leads with this source will keep their value.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmDelete) deleteMut.mutate({ id: confirmDelete }); setConfirmDelete(null); }} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Programs Tab ─────────────────────────────────────────────────────────────

function ProgramsTab() {
  const { data: programs, refetch } = trpc.leadsSettings.listPrograms.useQuery();
  const createMut = trpc.leadsSettings.createProgram.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); setNewName(""); toast.success("Program added"); } });
  const updateMut = trpc.leadsSettings.updateProgram.useMutation({ onSuccess: () => { refetch(); toast.success("Updated"); } });
  const deleteMut = trpc.leadsSettings.deleteProgram.useMutation({ onSuccess: () => { refetch(); toast.success("Program deleted"); } });

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Interested Programs</h3>
          <p className="text-sm text-muted-foreground">Manage the list of residency and citizenship programs. These appear as options when creating or editing a lead.</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2"><Plus className="h-4 w-4" />Add Program</Button>
      </div>

      <div className="space-y-2">
        {(programs ?? []).map(p => (
          <div key={p.id} className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted/20 transition-colors">
            <div className="p-1.5 bg-primary/10 rounded"><MapPin className="h-3.5 w-3.5 text-primary" /></div>
            <span className="flex-1 font-medium text-foreground text-sm">{p.name}</span>
            <Switch checked={!!p.isActive} onCheckedChange={v => updateMut.mutate({ id: p.id, isActive: v })} />
            <button onClick={() => { setEditId(p.id); setEditName(p.name); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={() => setConfirmDelete(p.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {(programs ?? []).length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
            No programs yet. Add your first program above.
          </div>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Interested Program</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Program Name</Label>
              <Input placeholder="e.g. Spain DNV, Portugal D7, Malta PR…" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate({ name: newName })} disabled={!newName.trim() || createMut.isPending}>Add Program</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editId !== null} onOpenChange={() => setEditId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Program</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Program Name</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditId(null)}>Cancel</Button>
            <Button onClick={() => { if (editId) updateMut.mutate({ id: editId, name: editName }); setEditId(null); }} disabled={!editName.trim() || updateMut.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={confirmDelete !== null} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Program?</AlertDialogTitle>
            <AlertDialogDescription>This program will be removed from the list. Existing leads will keep their program value.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmDelete) deleteMut.mutate({ id: confirmDelete }); setConfirmDelete(null); }} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Activity Presets Tab ─────────────────────────────────────────────────────

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  call: "Phone Call", whatsapp: "WhatsApp", sms: "SMS", email: "Email",
  meeting: "Meeting", note: "Note", stage_change: "Stage Change", email_sent: "Email Sent", other: "Other",
};

function ActivityPresetsTab() {
  const { data: presets, refetch } = trpc.leadsSettings.listActivityPresets.useQuery();
  const createMut = trpc.leadsSettings.createActivityPreset.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); resetForm(); toast.success("Preset added"); } });
  const updateMut = trpc.leadsSettings.updateActivityPreset.useMutation({ onSuccess: () => { refetch(); setEditId(null); toast.success("Preset updated"); } });
  const deleteMut = trpc.leadsSettings.deleteActivityPreset.useMutation({ onSuccess: () => { refetch(); toast.success("Preset deleted"); } });

  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formType, setFormType] = useState<string>("call");
  const [formScore, setFormScore] = useState("1");
  const [editLabel, setEditLabel] = useState("");
  const [editType, setEditType] = useState<string>("call");
  const [editScore, setEditScore] = useState("1");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const resetForm = () => { setFormLabel(""); setFormType("call"); setFormScore("1"); };

  const openEdit = (p: any) => {
    setEditId(p.id); setEditLabel(p.label); setEditType(p.activityType); setEditScore(String(p.score));
  };

  const SCORE_COLOR = (score: number) => score >= 4 ? "text-green-600 bg-green-50" : score >= 2 ? "text-blue-600 bg-blue-50" : "text-muted-foreground bg-muted";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Activity Presets</h3>
          <p className="text-sm text-muted-foreground">Define common activities with automatic lead score increments. These appear as quick-log buttons on each lead profile.</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2"><Plus className="h-4 w-4" />Add Preset</Button>
      </div>

      <div className="space-y-2">
        {(presets ?? []).map(p => (
          <div key={p.id} className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted/20 transition-colors">
            <div className="p-1.5 bg-primary/10 rounded"><Star className="h-3.5 w-3.5 text-primary" /></div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-foreground text-sm">{p.label}</div>
              <div className="text-xs text-muted-foreground">{ACTIVITY_TYPE_LABELS[p.activityType] ?? p.activityType}</div>
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${SCORE_COLOR(p.score)}`}>+{p.score} pts</span>
            <Switch checked={!!p.isActive} onCheckedChange={v => updateMut.mutate({ id: p.id, isActive: v })} />
            <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={() => setConfirmDelete(p.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {(presets ?? []).length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
            No activity presets yet. Add your first preset above.
          </div>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Activity Preset</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input placeholder="e.g. Had a phone conversation" value={formLabel} onChange={e => setFormLabel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Activity Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTIVITY_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Score Points</Label>
              <Input type="number" min="-100" max="100" value={formScore} onChange={e => setFormScore(e.target.value)} />
              <p className="text-xs text-muted-foreground">Points added to the lead score when this activity is logged. Use negative values to decrease score.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate({ label: formLabel, activityType: formType as any, score: parseInt(formScore) || 0 })} disabled={!formLabel.trim() || createMut.isPending}>Add Preset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editId !== null} onOpenChange={() => setEditId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Activity Preset</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input value={editLabel} onChange={e => setEditLabel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Activity Type</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTIVITY_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Score Points</Label>
              <Input type="number" min="-100" max="100" value={editScore} onChange={e => setEditScore(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditId(null)}>Cancel</Button>
            <Button onClick={() => { if (editId) updateMut.mutate({ id: editId, label: editLabel, activityType: editType as any, score: parseInt(editScore) || 0 }); }} disabled={!editLabel.trim() || updateMut.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={confirmDelete !== null} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Preset?</AlertDialogTitle>
            <AlertDialogDescription>This activity preset will be removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmDelete) deleteMut.mutate({ id: confirmDelete }); setConfirmDelete(null); }} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Meta Ads Tab ─────────────────────────────────────────────────────────────

function MetaAdsTab() {
  const { data: integrations, refetch } = trpc.leadsSettings.listIntegrations.useQuery();
  const { data: metaHealth } = trpc.leadsSettings.metaAdmin.health.useQuery();
  const createMut = trpc.leadsSettings.createIntegration.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); setFormName(""); toast.success("Meta integration added. Configure secure Meta credentials before syncing."); } });
  const deleteMut = trpc.leadsSettings.deleteIntegration.useMutation({ onSuccess: () => { refetch(); toast.success("Integration removed"); } });
  const updateMut = trpc.leadsSettings.updateIntegration.useMutation({ onSuccess: () => { refetch(); toast.success("Updated"); } });
  const syncMut = trpc.leadsSettings.syncMeta.useMutation({
    onSuccess: (data) => {
      refetch();
      const r = data.results[0];
      if (!r) return;
      if (r.errors.length > 0) {
        toast.error(`Sync error: ${r.errors[0]}`);
      } else {
        const formsMsg = (r as any).formsDiscovered ? ` across ${(r as any).formsDiscovered} form(s)` : "";
        toast.success(`Sync complete: ${r.newLeads} new lead(s), ${r.skippedDuplicates} duplicate(s) skipped${formsMsg}`);
      }
    },
    onError: (e) => toast.error(`Sync failed: ${e.message}`),
  });

  const metaIntegrations = (integrations ?? []).filter(i => i.type === "meta");
  const [showAdd, setShowAdd] = useState(false);
  const [formName, setFormName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
    toast.success("Copied to clipboard");
  };

  const baseUrl = window.location.origin;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Meta Ads Lead Forms</h3>
          <p className="text-sm text-muted-foreground">ELEVAY receives Meta Instant Form leads through a signed webhook and reconciles missed leads server-to-server. Credentials are managed only as secure environment secrets.</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2"><Plus className="h-4 w-4" />Connect Form</Button>
      </div>

      {/* Setup instructions */}
      <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-blue-900 flex items-center gap-2"><Zap className="h-4 w-4" />How it works</h4>
        <ol className="text-sm text-blue-800 space-y-1.5 list-decimal list-inside">
          <li>Create the Meta integration record, then configure the Page token, App secret, verify token, Page ID, dataset ID, and CAPI token in secure system settings</li>
          <li>Subscribe the Meta Page to the app's <strong>leadgen</strong> webhook and use the webhook URL shown below</li>
          <li>ELEVAY retrieves the lead server-to-server, matches the contact conservatively, and preserves every inquiry attribution</li>
          <li>Reconciliation pulls missed leads and retries ordered CRM events without creating duplicate Leads</li>
          <li>Production CRM event sending remains disabled until explicit approval</li>
        </ol>
      </div>

      {/* Integration cards */}
      {metaIntegrations.map(i => {
        const webhookUrl = `${baseUrl}/api/webhook/meta-leads`;
        const cfg: Record<string, string> = (() => { try { return i.config ? JSON.parse(i.config) : {}; } catch { return {}; } })();
        const hasToken = i.hasMetaPageAccessToken || metaHealth?.pageAccessTokenConfigured;
        const isSyncing = syncMut.isPending && syncMut.variables?.integrationId === i.id;
        return (
          <div key={i.id} className="border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg"><Zap className="h-5 w-5 text-blue-600" /></div>
                <div>
                  <div className="font-semibold text-foreground">{i.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant={i.isActive ? "default" : "secondary"} className="text-xs">
                      {i.isActive ? "Active" : "Paused"}
                    </Badge>
                    {i.lastSyncAt ? (
                      <span className="text-xs text-muted-foreground">Last sync: {new Date(i.lastSyncAt).toLocaleString()} · {i.lastSyncCount ?? 0} new</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Never synced</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={!hasToken || isSyncing}
                  onClick={() => syncMut.mutate({ integrationId: i.id })}
                  title={hasToken ? "Pull latest leads from Meta now" : "Add Page Access Token first"}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                  {isSyncing ? "Syncing..." : "Sync Now"}
                </Button>
                <Switch checked={!!i.isActive} onCheckedChange={v => updateMut.mutate({ id: i.id, isActive: v })} />
                <button onClick={() => deleteMut.mutate({ id: i.id })} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Secure credential readiness</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {[
                  ["Page token", hasToken],
                  ["App secret", metaHealth?.appSecretConfigured],
                  ["Verify token", metaHealth?.verifyTokenConfigured],
                  ["Page ID", metaHealth?.pageIdConfigured],
                  ["Dataset", metaHealth?.datasetConfigured],
                  ["CAPI token", metaHealth?.capiTokenConfigured],
                ].map(([label, ready]) => <div key={String(label)} className="bg-muted px-3 py-2 rounded"><span className={ready ? "text-emerald-700" : "text-amber-700"}>{ready ? "Configured" : "Required"}</span> · {label}</div>)}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Webhook URL <span className="text-muted-foreground font-normal">(for real-time push from Meta)</span></Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono truncate">{webhookUrl}</code>
                  <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => copy(webhookUrl, `url-${i.id}`)}>
                    {copied === `url-${i.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Verify Token <span className="text-muted-foreground font-normal">(secure secret; enter the same value in Meta)</span></Label>
                <div className="text-xs bg-muted px-3 py-2 rounded text-muted-foreground">{metaHealth?.verifyTokenConfigured ? "Configured securely" : "Not configured"}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                {cfg.page_id ? <>Page ID: <code className="bg-muted px-1 rounded">{cfg.page_id}</code> · </> : null}
                All lead forms auto-discovered on each sync
              </div>
            </div>
          </div>
        );
      })}

      {metaIntegrations.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
          No Meta integrations yet. Click "Connect Form" to add your first one.
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Connect Meta Lead Ads</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
              This creates the integration record only. Sensitive Meta credentials must be added through secure system settings and are never shown in the browser.
            </div>
            <div className="space-y-2">
              <Label>Integration Name</Label>
              <Input placeholder="e.g. ELEVAY Facebook Leads" value={formName} onChange={e => setFormName(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">After creating it, complete the secure credential checklist shown on this page.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              onClick={() => createMut.mutate({ type: "meta", name: formName, config: {} })}
              disabled={!formName.trim() || createMut.isPending}
            >
              {createMut.isPending ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Lead Forms Tab ──────────────────────────────────────────────────────────

function LeadFormsTab() {
  const { data: integrations = [], refetch: refetchIntegrations } = trpc.leadsSettings.listIntegrations.useQuery();
  const metaIntegrations = (integrations as any[]).filter(i => i.type === "meta");

  const { data: formsData, isLoading: formsLoading, refetch: refetchForms } = trpc.leadsSettings.listMetaForms.useQuery(
    { integrationId: metaIntegrations[0]?.id ?? 0 },
    { enabled: metaIntegrations.length > 0 }
  );

  const toggleForm = trpc.leadsSettings.toggleMetaForm.useMutation({
    onSuccess: () => { refetchForms(); toast.success("Form updated"); },
    onError: (err: any) => toast.error(err.message),
  });

  const setFormSource = trpc.leadsSettings.setFormLeadSource.useMutation({
    onSuccess: () => { refetchForms(); refetchIntegrations(); toast.success("Lead source saved"); },
    onError: (err: any) => toast.error(err.message),
  });
  const [formSourceEdits, setFormSourceEdits] = useState<Record<string, string>>({});

  const syncNow = trpc.leadsSettings.syncMeta.useMutation({
    onSuccess: (data: any) => {
      refetchForms();
      refetchIntegrations();
      toast.success(`Sync complete — ${data.newLeads} new lead${data.newLeads !== 1 ? "s" : ""} imported.`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (metaIntegrations.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No Meta integration configured</p>
        <p className="text-sm mt-1">Go to the <strong>Meta Ads</strong> tab to add your Page Access Token first.</p>
      </div>
    );
  }

  const integration = metaIntegrations[0];
  const forms: any[] = (formsData as any)?.forms ?? [];
  const disabledFormIds: string[] = ((integration as any).config as any)?.disabledFormIds ?? [];
  const perFormSources: Record<string, string> = (() => { try { const c = JSON.parse((integration as any).config ?? "{}"); return (c.form_sources && typeof c.form_sources === "object") ? c.form_sources : {}; } catch { return {}; } })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Lead Forms</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            All lead forms discovered on your <strong>{integration.name}</strong> page.
            Toggle any form on or off to include or exclude it from the automatic sync.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchForms()} disabled={formsLoading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${formsLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => syncNow.mutate({ integrationId: integration.id })} disabled={syncNow.isPending}>
            {syncNow.isPending
              ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              : <Zap className="w-4 h-4 mr-1" />}
            {syncNow.isPending ? "Syncing…" : "Sync Now"}
          </Button>
        </div>
      </div>

      {(integration as any).lastSyncAt && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-2.5 border">
          <Clock className="w-3.5 h-3.5" />
          Last sync: {new Date((integration as any).lastSyncAt).toLocaleString()}
          {(integration as any).lastSyncCount != null && (
            <span className="ml-2 text-emerald-600 font-medium">· {(integration as any).lastSyncCount} new lead{(integration as any).lastSyncCount !== 1 ? "s" : ""} imported</span>
          )}
        </div>
      )}

      {formsLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading forms…</div>
      ) : forms.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <List className="w-8 h-8 mx-auto mb-2 opacity-30" />
          No lead forms found on this page. Click Refresh to try again.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground mb-3">{forms.length} form{forms.length !== 1 ? "s" : ""} discovered</div>
          {forms.map((form: any) => {
            const isEnabled = !disabledFormIds.includes(form.id);
            const isRunning = form.status === "ACTIVE";
            return (
              <div
                key={form.id}
                className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                  isEnabled ? "bg-background border-border" : "bg-muted/30 border-dashed border-muted-foreground/30"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex-shrink-0 w-2 h-2 rounded-full ${isRunning ? "bg-emerald-500" : "bg-gray-400"}`} />
                  <div className="min-w-0">
                    <div className={`font-medium text-sm truncate ${isEnabled ? "text-foreground" : "text-muted-foreground"}`}>
                      {form.name}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted-foreground font-mono">{form.id}</span>
                      <span className={`inline-flex items-center gap-1 text-xs ${isRunning ? "text-emerald-600" : "text-gray-500"}`}>
                        {isRunning
                          ? <><CheckCircle2 className="w-3 h-3" />Running</>
                          : <><XCircle className="w-3 h-3" />{form.status ?? "Inactive"}</>}
                      </span>
                      {form.leadCount != null && (
                        <span className="text-xs text-muted-foreground">{Number(form.leadCount).toLocaleString()} total leads</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">Lead Source</span>
                    <Input
                      className="h-7 text-xs w-40"
                      placeholder={perFormSources[form.id] ? perFormSources[form.id] : "e.g. Spain DNV Ads"}
                      value={formSourceEdits[form.id] ?? perFormSources[form.id] ?? ""}
                      onChange={e => setFormSourceEdits(prev => ({ ...prev, [form.id]: e.target.value }))}
                      onBlur={() => {
                        const val = formSourceEdits[form.id] ?? "";
                        if (val !== (perFormSources[form.id] ?? "")) {
                          setFormSource.mutate({ integrationId: integration.id, formId: form.id, leadSource: val });
                        }
                      }}
                    />
                  </div>
                  <span className={`text-xs font-medium ${isEnabled ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {isEnabled ? "Connected" : "Disconnected"}
                  </span>
                  <button
                    onClick={() => toggleForm.mutate({ integrationId: integration.id, formId: form.id, connected: !isEnabled })}
                    disabled={toggleForm.isPending}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title={isEnabled ? "Disconnect this form" : "Connect this form"}
                  >
                    {isEnabled
                      ? <ToggleRight className="w-8 h-8 text-emerald-600" />
                      : <ToggleLeft className="w-8 h-8" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Website Integration Tab ──────────────────────────────────────────────────

function WebsiteIntegrationTab() {
  const { data: integrations, refetch } = trpc.leadsSettings.listIntegrations.useQuery();
  const createMut = trpc.leadsSettings.createIntegration.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); toast.success("Website integration added"); } });
  const regenMut = trpc.leadsSettings.regenerateToken.useMutation({ onSuccess: () => { refetch(); toast.success("Token regenerated"); } });
  const deleteMut = trpc.leadsSettings.deleteIntegration.useMutation({ onSuccess: () => { refetch(); toast.success("Integration removed"); } });
  const updateMut = trpc.leadsSettings.updateIntegration.useMutation({ onSuccess: () => { refetch(); toast.success("Updated"); } });

  const webIntegrations = (integrations ?? []).filter(i => i.type === "website");
  const [showAdd, setShowAdd] = useState(false);
  const [formName, setFormName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
    toast.success("Copied to clipboard");
  };

  const baseUrl = window.location.origin;

  const samplePayload = JSON.stringify({
    full_name: "Ahmed Mohamed",
    phone: "+201012345678",
    email: "ahmed@example.com",
    nationality: "Egyptian",
    interested_program: "Spain DNV",
    lead_source: "Website Form",
    utm_source: "google",
    utm_campaign: "spain-dnv-2026",
  }, null, 2);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Website / Landing Page Integration</h3>
          <p className="text-sm text-muted-foreground">Connect your website contact form or landing page to automatically send new leads here.</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2"><Plus className="h-4 w-4" />Add Integration</Button>
      </div>

      {/* Integration cards */}
      {webIntegrations.map(i => {
        const webhookUrl = `${baseUrl}/api/webhook/leads/${i.webhookToken}`;
        return (
          <div key={i.id} className="border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg"><Globe className="h-5 w-5 text-purple-600" /></div>
                <div>
                  <div className="font-semibold text-foreground">{i.name}</div>
                  <Badge variant={i.isActive ? "default" : "secondary"} className="text-xs mt-0.5">
                    {i.isActive ? "Active" : "Paused"}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={!!i.isActive} onCheckedChange={v => updateMut.mutate({ id: i.id, isActive: v })} />
                <button onClick={() => deleteMut.mutate({ id: i.id })} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">POST Endpoint URL</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono truncate">{webhookUrl}</code>
                <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => copy(webhookUrl, `url-${i.id}`)}>
                  {copied === `url-${i.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
                <Button size="sm" variant="outline" className="gap-1 shrink-0" title="Regenerate token" onClick={() => regenMut.mutate({ id: i.id })}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Example JSON Payload (POST body)</Label>
              <div className="relative">
                <pre className="text-xs bg-muted px-3 py-3 rounded font-mono overflow-x-auto">{samplePayload}</pre>
                <Button size="sm" variant="outline" className="absolute top-2 right-2 gap-1" onClick={() => copy(samplePayload, `payload-${i.id}`)}>
                  {copied === `payload-${i.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </div>

            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-3 space-y-1">
              <p className="font-medium">Required fields: <code>full_name</code>, <code>phone</code></p>
              <p>Optional: <code>email</code>, <code>nationality</code>, <code>interested_program</code>, <code>interested_country</code>, <code>lead_source</code>, <code>utm_source</code>, <code>utm_medium</code>, <code>utm_campaign</code>, <code>budget_range</code></p>
              <p>Method: <code>POST</code> · Content-Type: <code>application/json</code> · No authentication header needed (token is in the URL)</p>
            </div>
          </div>
        );
      })}

      {webIntegrations.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
          No website integrations yet. Click "Add Integration" to generate your first webhook URL.
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Website Integration</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Integration Name</Label>
              <Input placeholder="e.g. Main Website Contact Form" value={formName} onChange={e => setFormName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate({ type: "website", name: formName })} disabled={!formName.trim() || createMut.isPending}>
              Generate Webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeadsSettings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 rounded-xl">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">LEADS Settings</h1>
          <p className="text-sm text-muted-foreground">Manage integrations, permissions, programs, and lead sources for the ELEVAY LEADS module.</p>
        </div>
      </div>

      <Tabs defaultValue="export">
        <TabsList className="flex w-full h-auto justify-start overflow-x-auto">
          <TabsTrigger value="export" className="gap-1 text-xs"><Download className="h-3.5 w-3.5" />Export / Import</TabsTrigger>
          <TabsTrigger value="permissions" className="gap-1 text-xs"><Users className="h-3.5 w-3.5" />Permissions</TabsTrigger>
          <TabsTrigger value="sources" className="gap-1 text-xs"><Tag className="h-3.5 w-3.5" />Lead Sources</TabsTrigger>
          <TabsTrigger value="programs" className="gap-1 text-xs"><MapPin className="h-3.5 w-3.5" />Programs</TabsTrigger>
          <TabsTrigger value="presets" className="gap-1 text-xs"><Star className="h-3.5 w-3.5" />Activity Presets</TabsTrigger>
          {isAdmin && <TabsTrigger value="meta" className="gap-1 text-xs"><Zap className="h-3.5 w-3.5" />Meta Ads</TabsTrigger>}
          {isAdmin && <TabsTrigger value="meta-ops" className="gap-1 text-xs"><Activity className="h-3.5 w-3.5" />Meta Ops</TabsTrigger>}
          {isAdmin && <TabsTrigger value="forms" className="gap-1 text-xs"><List className="h-3.5 w-3.5" />Lead Forms</TabsTrigger>}
          <TabsTrigger value="website" className="gap-1 text-xs"><Globe className="h-3.5 w-3.5" />Website</TabsTrigger>
        </TabsList>

        <TabsContent value="export" className="mt-6"><ExportImportTab /></TabsContent>
        <TabsContent value="permissions" className="mt-6"><PermissionsTab /></TabsContent>
        <TabsContent value="sources" className="mt-6"><LeadSourcesTab /></TabsContent>
        <TabsContent value="programs" className="mt-6"><ProgramsTab /></TabsContent>
        <TabsContent value="presets" className="mt-6"><ActivityPresetsTab /></TabsContent>
        {isAdmin && <TabsContent value="meta" className="mt-6"><MetaAdsTab /></TabsContent>}
        {isAdmin && <TabsContent value="meta-ops" className="mt-6"><MetaOperationsTab /></TabsContent>}
        {isAdmin && <TabsContent value="forms" className="mt-6"><LeadFormsTab /></TabsContent>}
        <TabsContent value="website" className="mt-6"><WebsiteIntegrationTab /></TabsContent>
      </Tabs>
    </div>
  );
}
