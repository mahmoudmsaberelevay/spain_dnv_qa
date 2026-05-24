import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Shield, Download, RefreshCw, Search, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  login: "bg-green-100 text-green-800",
  logout: "bg-gray-100 text-gray-700",
  view: "bg-blue-100 text-blue-800",
  create: "bg-emerald-100 text-emerald-800",
  update: "bg-yellow-100 text-yellow-800",
  delete: "bg-red-100 text-red-800",
  export: "bg-purple-100 text-purple-800",
  bulk_delete: "bg-red-200 text-red-900",
  bulk_update: "bg-orange-100 text-orange-800",
  sync: "bg-cyan-100 text-cyan-800",
  import: "bg-indigo-100 text-indigo-800",
  download: "bg-violet-100 text-violet-800",
};

export default function AdminSecurity() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [resourceFilter, setResourceFilter] = useState<string>("");
  const [emailSearch, setEmailSearch] = useState("");
  const [emailInput, setEmailInput] = useState("");

  const isAdmin = user?.role === "admin";

  const { data: logsData, isLoading: logsLoading, refetch } = trpc.admin.listAuditLogs.useQuery(
    {
      page,
      pageSize: 50,
      action: actionFilter || undefined,
      resource: resourceFilter || undefined,
      userEmail: emailSearch || undefined,
    },
    { enabled: isAdmin }
  );

  const backupMutation = trpc.admin.exportFullBackup.useMutation({
    onSuccess: (data) => {
      // Download the backup JSON
      const link = document.createElement("a");
      link.href = data.url;
      link.download = `elevay-backup-${new Date().toISOString().split("T")[0]}.json`;
      link.click();
      toast.success(`Backup exported: ${data.sizeKb} KB across ${data.tables.length} tables`);
    },
    onError: (err) => toast.error("Backup failed: " + err.message),
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle className="w-12 h-12 text-yellow-500" />
        <h2 className="text-xl font-semibold text-gray-700">Admin Access Required</h2>
        <p className="text-gray-500 text-sm">This page is only accessible to system administrators.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Security & Audit</h1>
            <p className="text-sm text-gray-500">Monitor all system activity and export full data backups</p>
          </div>
        </div>
        <Button
          onClick={() => backupMutation.mutate()}
          disabled={backupMutation.isPending}
          className="gap-2 bg-blue-600 hover:bg-blue-700"
        >
          {backupMutation.isPending ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {backupMutation.isPending ? "Generating Backup..." : "Export Full Backup"}
        </Button>
      </div>

      {/* Backup Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">Full Database Backup</p>
          <p>Clicking "Export Full Backup" will generate a complete JSON export of all your data — leads, contracts, clients, financial records, and more — and download it directly to your computer. Store this file in a secure location (e.g., Google Drive or an encrypted USB drive).</p>
        </div>
      </div>

      {/* Audit Logs */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-semibold text-gray-800">Activity Audit Log</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Email search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
              <Input
                className="pl-8 h-8 w-48 text-sm"
                placeholder="Search by email..."
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { setEmailSearch(emailInput); setPage(1); }
                }}
              />
            </div>
            {/* Action filter */}
            <Select value={actionFilter || "all"} onValueChange={(v) => { setActionFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="h-8 w-36 text-sm">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="logout">Logout</SelectItem>
                <SelectItem value="export">Export</SelectItem>
                <SelectItem value="bulk_delete">Bulk Delete</SelectItem>
                <SelectItem value="bulk_update">Bulk Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="sync">Sync</SelectItem>
                <SelectItem value="import">Import</SelectItem>
              </SelectContent>
            </Select>
            {/* Resource filter */}
            <Select value={resourceFilter || "all"} onValueChange={(v) => { setResourceFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="h-8 w-32 text-sm">
                <SelectValue placeholder="All modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modules</SelectItem>
                <SelectItem value="leads">Leads</SelectItem>
                <SelectItem value="full_backup">Backup</SelectItem>
                <SelectItem value="contracts">Contracts</SelectItem>
                <SelectItem value="financial">Financial</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
          </div>
        </div>

        {logsLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading audit logs...</div>
        ) : !logsData?.logs.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <Shield className="w-10 h-10 opacity-30" />
            <p className="text-sm">No audit log entries found</p>
            <p className="text-xs text-gray-300">Activity will be recorded here as your team uses the system</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Time</th>
                    <th className="px-4 py-3 text-left">User</th>
                    <th className="px-4 py-3 text-left">Action</th>
                    <th className="px-4 py-3 text-left">Module</th>
                    <th className="px-4 py-3 text-left">Details</th>
                    <th className="px-4 py-3 text-left">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logsData.logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString("en-GB", {
                          day: "2-digit", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        }) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800 text-xs">{log.userName ?? "—"}</div>
                        <div className="text-gray-400 text-xs">{log.userEmail ?? "System"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-700"}`}>
                          {log.action.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs capitalize">{log.resource}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate" title={log.details ?? ""}>
                        {log.details ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs font-mono">{log.ipAddress ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
              <span>{logsData.total} total entries</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs">Page {page}</span>
                <Button variant="outline" size="sm" className="h-7" disabled={logsData.logs.length < 50} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
