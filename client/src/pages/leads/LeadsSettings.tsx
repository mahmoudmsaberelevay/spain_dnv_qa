import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
  FileDown, FileUp, AlertCircle, ExternalLink,
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

// ─── Export / Import Tab ──────────────────────────────────────────────────────

function ExportImportTab() {
  const exportQuery = trpc.leadsSettings.exportLeads.useQuery(undefined, { enabled: false });
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

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

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      let rows: Record<string, unknown>[] = [];
      if (file.name.endsWith(".json")) {
        rows = JSON.parse(text);
      } else {
        const lines = text.split("\n").filter(Boolean);
        const headers = lines[0].split(",");
        rows = lines.slice(1).map(line => {
          const vals = line.split(",");
          return Object.fromEntries(headers.map((h, i) => [h.trim(), vals[i]?.trim() ?? ""]));
        });
      }
      toast.success(`Parsed ${rows.length} leads from file. Import preview coming soon — please review before confirming.`);
    } catch {
      toast.error("Failed to parse file. Please use a valid CSV or JSON export.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

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
            <h3 className="font-semibold text-foreground">Import Leads</h3>
            <p className="text-sm text-muted-foreground">Upload a CSV or JSON file exported from another system. A preview will be shown before any data is saved.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,.json" className="hidden" onChange={handleImport} />
          <Button onClick={() => fileRef.current?.click()} disabled={importing} variant="outline" className="gap-2">
            <Upload className="h-4 w-4" />
            {importing ? "Parsing…" : "Choose File (CSV or JSON)"}
          </Button>
        </div>
        <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Import will not overwrite existing leads. Duplicate phone numbers will be skipped automatically.</span>
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
  const [addUserId, setAddUserId] = useState<string>("");

  const permMap = new Map((permissions ?? []).map(p => [p.userId, p]));
  const usersWithPerms = (allUsers ?? []).map(u => ({
    ...u,
    perms: permMap.get(u.id) ?? { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false, canImport: false },
  }));

  const toggle = (userId: number, key: typeof PERM_KEYS[number], current: boolean) => {
    upsert.mutate({ userId, [key]: !current });
  };

  const addUser = () => {
    const id = parseInt(addUserId);
    if (!id) return;
    upsert.mutate({ userId: id, canView: true });
    setAddUserId("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Team Permissions</h3>
          <p className="text-sm text-muted-foreground">Control what each team member can do in the ELEVAY LEADS module.</p>
        </div>
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
          <p className="text-sm text-muted-foreground">Define where your leads come from. These appear in the lead creation form and filters.</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2"><Plus className="h-4 w-4" />Add Source</Button>
      </div>

      {/* Preset quick-add */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Quick-add common sources:</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_SOURCES.map(s => (
            <button key={s} onClick={() => createMut.mutate({ name: s })}
              className="px-3 py-1 text-xs rounded-full border border-border hover:bg-muted transition-colors text-foreground">
              + {s}
            </button>
          ))}
        </div>
      </div>

      {/* Sources list */}
      <div className="space-y-2">
        {(sources ?? []).map(s => (
          <div key={s.id} className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors">
            <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: s.color ?? "#6366f1" }} />
            <span className="flex-1 font-medium text-foreground">{s.name}</span>
            <Badge variant={s.isActive ? "default" : "secondary"} className="text-xs">
              {s.isActive ? "Active" : "Inactive"}
            </Badge>
            <Switch
              checked={!!s.isActive}
              onCheckedChange={(v) => updateMut.mutate({ id: s.id, isActive: v })}
              title="Toggle active"
            />
            <button onClick={() => setConfirmDelete(s.id)}
              className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {(sources ?? []).length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">No custom sources yet. Add one above.</div>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Lead Source</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Source Name</Label>
              <Input placeholder="e.g. TikTok Ads" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-3">
                <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
                  className="w-10 h-10 rounded border border-border cursor-pointer" />
                <span className="text-sm text-muted-foreground">{newColor}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate({ name: newName, color: newColor })} disabled={!newName.trim() || createMut.isPending}>
              Add Source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={confirmDelete !== null} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead Source?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the source from the list. Existing leads that used this source will keep their value.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { if (confirmDelete) deleteMut.mutate({ id: confirmDelete }); setConfirmDelete(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Meta Ads Tab ─────────────────────────────────────────────────────────────

function MetaAdsTab() {
  const { data: integrations, refetch } = trpc.leadsSettings.listIntegrations.useQuery();
  const createMut = trpc.leadsSettings.createIntegration.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); toast.success("Meta integration added"); } });
  const regenMut = trpc.leadsSettings.regenerateToken.useMutation({ onSuccess: () => { refetch(); toast.success("Token regenerated"); } });
  const deleteMut = trpc.leadsSettings.deleteIntegration.useMutation({ onSuccess: () => { refetch(); toast.success("Integration removed"); } });
  const updateMut = trpc.leadsSettings.updateIntegration.useMutation({ onSuccess: () => { refetch(); toast.success("Updated"); } });

  const metaIntegrations = (integrations ?? []).filter(i => i.type === "meta");
  const [showAdd, setShowAdd] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPageId, setFormPageId] = useState("");
  const [formFormId, setFormFormId] = useState("");
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
          <p className="text-sm text-muted-foreground">Connect your Facebook/Instagram Lead Ad forms to automatically receive new leads.</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2"><Plus className="h-4 w-4" />Connect Form</Button>
      </div>

      {/* Setup instructions */}
      <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-blue-900 flex items-center gap-2"><Zap className="h-4 w-4" />How to connect Meta Lead Ads</h4>
        <ol className="text-sm text-blue-800 space-y-1.5 list-decimal list-inside">
          <li>Go to <a href="https://business.facebook.com/latest/leads_center" target="_blank" rel="noreferrer" className="underline font-medium">Meta Business Suite → Leads Center</a></li>
          <li>Click <strong>Integrations → CRM Integration</strong></li>
          <li>Choose <strong>Custom Integration (Webhook)</strong></li>
          <li>Enter the Webhook URL and Verify Token from each integration below</li>
          <li>Select the Lead Ad form you want to connect</li>
          <li>Click <strong>Test</strong> — a test lead will appear in your ELEVAY LEADS list</li>
        </ol>
      </div>

      {/* Integration cards */}
      {metaIntegrations.map(i => {
        const webhookUrl = `${baseUrl}/api/webhook/meta-leads`;
        return (
          <div key={i.id} className="border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg"><Zap className="h-5 w-5 text-blue-600" /></div>
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
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Webhook URL (enter this in Meta)</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono truncate">{webhookUrl}</code>
                  <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => copy(webhookUrl, `url-${i.id}`)}>
                    {copied === `url-${i.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Verify Token (enter this in Meta)</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono truncate">{i.webhookToken}</code>
                  <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => copy(i.webhookToken ?? "", `token-${i.id}`)}>
                    {copied === `token-${i.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 shrink-0" title="Regenerate token" onClick={() => regenMut.mutate({ id: i.id })}>
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
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
          <DialogHeader><DialogTitle>Connect Meta Lead Form</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Integration Name</Label>
              <Input placeholder="e.g. Spain DNV - Facebook Campaign" value={formName} onChange={e => setFormName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Facebook Page ID <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input placeholder="e.g. 123456789" value={formPageId} onChange={e => setFormPageId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Lead Form ID <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input placeholder="e.g. 987654321" value={formFormId} onChange={e => setFormFormId(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate({ type: "meta", name: formName, config: { pageId: formPageId, formId: formFormId } })} disabled={!formName.trim() || createMut.isPending}>
              Create Integration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 rounded-xl">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">LEADS Settings</h1>
          <p className="text-sm text-muted-foreground">Manage integrations, permissions, and lead sources for the ELEVAY LEADS module.</p>
        </div>
      </div>

      <Tabs defaultValue="export">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="export" className="gap-1.5 text-xs"><Download className="h-3.5 w-3.5" />Export / Import</TabsTrigger>
          <TabsTrigger value="permissions" className="gap-1.5 text-xs"><Users className="h-3.5 w-3.5" />Permissions</TabsTrigger>
          <TabsTrigger value="sources" className="gap-1.5 text-xs"><Tag className="h-3.5 w-3.5" />Lead Sources</TabsTrigger>
          <TabsTrigger value="meta" className="gap-1.5 text-xs"><Zap className="h-3.5 w-3.5" />Meta Ads</TabsTrigger>
          <TabsTrigger value="website" className="gap-1.5 text-xs"><Globe className="h-3.5 w-3.5" />Website</TabsTrigger>
        </TabsList>

        <TabsContent value="export" className="mt-6"><ExportImportTab /></TabsContent>
        <TabsContent value="permissions" className="mt-6"><PermissionsTab /></TabsContent>
        <TabsContent value="sources" className="mt-6"><LeadSourcesTab /></TabsContent>
        <TabsContent value="meta" className="mt-6"><MetaAdsTab /></TabsContent>
        <TabsContent value="website" className="mt-6"><WebsiteIntegrationTab /></TabsContent>
      </Tabs>
    </div>
  );
}
