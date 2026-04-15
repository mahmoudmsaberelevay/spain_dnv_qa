/**
 * Settings — Owner-only page.
 *
 * Access & Permissions tab shows all users with 4 module dropdowns:
 *   - Contracting: Full Access | Normal User (View Only) | No Access
 *   - Client Documentation: Full Access | Normal User (View Only) | No Access
 *   - Application Analysis: Full Access | Normal User (View Only) | No Access
 *   - Financial: Full Access | Normal User (View Only) | No Access
 *
 * Changes take effect immediately — no code changes needed.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  Shield,
  UserPlus,
  Mail,
  Trash2,
  Copy,
  Check,
  Users,
  Link,
  Settings as SettingsIcon,
  FileText,
  FolderOpen,
  Search,
  DollarSign,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";

const OWNER_EMAIL = "mahmoud.saberelevay@gmail.com";
const SUPER_ADMIN_EMAILS = ["mahmoud.saberelevay@gmail.com", "mahmoud.saber@elevay.com"];

type AccessLevel = "none" | "viewer" | "full";
type ModuleName = "contracting" | "clientDocs" | "appAnalysis" | "financial";

const MODULES: { key: ModuleName; label: string; icon: React.ReactNode; color: string }[] = [
  { key: "contracting",  label: "Contracting",           icon: <FileText className="h-4 w-4" />,  color: "text-blue-400" },
  { key: "clientDocs",   label: "Client Documentation",  icon: <FolderOpen className="h-4 w-4" />, color: "text-emerald-400" },
  { key: "appAnalysis",  label: "Application Analysis",  icon: <Search className="h-4 w-4" />,     color: "text-violet-400" },
  { key: "financial",    label: "Financial",             icon: <DollarSign className="h-4 w-4" />, color: "text-amber-400" },
];

const ACCESS_OPTIONS: { value: AccessLevel; label: string; description: string; badge: string; badgeColor: string }[] = [
  { value: "full",   label: "Full Access",           description: "Can view, create, edit & delete",  badge: "Full",   badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  { value: "viewer", label: "Normal User (View Only)", description: "Can only view, no changes",      badge: "Viewer", badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  { value: "none",   label: "No Access",             description: "Blocked — sees 403 page",          badge: "None",   badgeColor: "bg-red-500/20 text-red-300 border-red-500/30" },
];

function AccessBadge({ level }: { level: AccessLevel }) {
  const opt = ACCESS_OPTIONS.find(o => o.value === level) ?? ACCESS_OPTIONS[2];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${opt.badgeColor}`}>
      {opt.badge}
    </span>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────
function UserPermissionRow({ user }: { user: { id: number; name: string | null; email: string | null; role: string | null } }) {
  const utils = trpc.useUtils();
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes((user.email ?? "").toLowerCase());

  const { data: moduleAccess, isLoading } = trpc.permissions.getUserModuleAccess.useQuery(
    { userId: user.id },
    { staleTime: 10_000 }
  );

  const setModuleMutation = trpc.permissions.setModuleAccess.useMutation({
    onSuccess: () => {
      utils.permissions.getUserModuleAccess.invalidate({ userId: user.id });
      utils.permissions.listUsers.invalidate();
      toast.success("Permission updated");
    },
    onError: () => toast.error("Failed to update permission"),
  });

  const deleteMutation = trpc.permissions.deleteUser.useMutation({
    onSuccess: () => { utils.permissions.listUsers.invalidate(); toast.success("User removed"); },
    onError: () => toast.error("Failed to remove user"),
  });

  const [expanded, setExpanded] = useState(false);

  const handleChange = (module: ModuleName, level: AccessLevel) => {
    setModuleMutation.mutate({ userId: user.id, module, accessLevel: level });
  };

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-white/5 cursor-pointer hover:bg-white/8 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="h-9 w-9 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-semibold text-indigo-300">
            {(user.name ?? user.email ?? "?")[0].toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">{user.name ?? "—"}</span>
            {isSuperAdmin && <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs">Super Admin</Badge>}
          </div>
          <span className="text-xs text-white/50 truncate">{user.email}</span>
        </div>
        {/* Quick summary badges */}
        {!isSuperAdmin && !isLoading && moduleAccess && (
          <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
            {MODULES.map(m => (
              <AccessBadge key={m.key} level={(moduleAccess[m.key] as AccessLevel) ?? "none"} />
            ))}
          </div>
        )}
        {isSuperAdmin && (
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs flex-shrink-0">Full Access (System)</Badge>
        )}
        <ChevronDown className={`h-4 w-4 text-white/40 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </div>

      {/* Expanded permissions */}
      {expanded && (
        <div className="px-4 py-4 bg-white/[0.02] border-t border-white/10">
          {isSuperAdmin ? (
            <p className="text-sm text-white/50 italic">This user has unrestricted super-admin access and cannot be modified.</p>
          ) : isLoading ? (
            <div className="flex items-center gap-2 text-white/40 text-sm"><div className="h-4 w-4 rounded-full border border-white/20 border-t-white animate-spin" /> Loading permissions…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {MODULES.map(mod => {
                const current = (moduleAccess?.[mod.key] as AccessLevel) ?? "none";
                return (
                  <div key={mod.key} className="space-y-1.5">
                    <div className={`flex items-center gap-1.5 text-xs font-medium ${mod.color}`}>
                      {mod.icon}
                      {mod.label}
                    </div>
                    <Select
                      value={current}
                      onValueChange={(val) => handleChange(mod.key, val as AccessLevel)}
                      disabled={setModuleMutation.isPending}
                    >
                      <SelectTrigger className="h-8 text-xs bg-white/5 border-white/20 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1a2e] border-white/20">
                        {ACCESS_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs text-white focus:bg-white/10">
                            <div>
                              <span className="font-medium">{opt.label}</span>
                              <span className="text-white/50 ml-1">— {opt.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          )}

          {/* Delete user */}
          {!isSuperAdmin && (
            <div className="mt-4 pt-3 border-t border-white/10 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs"
                onClick={() => {
                  if (confirm(`Remove ${user.name ?? user.email} from the system?`)) {
                    deleteMutation.mutate({ userId: user.id });
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Remove User
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add User Dialog ──────────────────────────────────────────────────────────
function AddUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<Record<ModuleName, AccessLevel>>({
    contracting: "full",
    clientDocs: "full",
    appAnalysis: "none",
    financial: "none",
  });

  const addMutation = trpc.permissions.addUserManually.useMutation({
    onSuccess: () => {
      utils.permissions.listUsers.invalidate();
      toast.success("User added successfully");
      setName(""); setEmail("");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#12122a] border-white/20 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-indigo-400" /> Add User</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/70">Full Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" className="bg-white/5 border-white/20 text-white text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/70">Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="john@elevay.com" type="email" className="bg-white/5 border-white/20 text-white text-sm" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-white/70 font-semibold">Module Access</Label>
            <div className="grid grid-cols-1 gap-2">
              {MODULES.map(mod => (
                <div key={mod.key} className="flex items-center justify-between gap-3">
                  <div className={`flex items-center gap-1.5 text-xs ${mod.color} w-40`}>{mod.icon}{mod.label}</div>
                  <Select value={access[mod.key]} onValueChange={val => setAccess(a => ({ ...a, [mod.key]: val as AccessLevel }))}>
                    <SelectTrigger className="h-7 text-xs bg-white/5 border-white/20 text-white flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a2e] border-white/20">
                      {ACCESS_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs text-white focus:bg-white/10">{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-white/70">Cancel</Button>
          <Button
            onClick={() => addMutation.mutate({ name, email, access })}
            disabled={!name || !email || addMutation.isPending}
            className="bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            {addMutation.isPending ? "Adding…" : "Add User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invite Link Dialog ───────────────────────────────────────────────────────
function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<Record<ModuleName, AccessLevel>>({
    contracting: "full",
    clientDocs: "full",
    appAnalysis: "none",
    financial: "none",
  });
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createInvite = trpc.permissions.createInvite.useMutation({
    onSuccess: (data) => setInviteUrl(data.inviteUrl),
    onError: (e) => toast.error(e.message),
  });

  const copy = () => {
    if (inviteUrl) {
      navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); setInviteUrl(null); setEmail(""); }}>
      <DialogContent className="bg-[#12122a] border-white/20 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link className="h-5 w-5 text-indigo-400" /> Generate Invite Link</DialogTitle>
        </DialogHeader>
        {!inviteUrl ? (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/70">Email (optional — pre-fills for the invitee)</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@elevay.com" type="email" className="bg-white/5 border-white/20 text-white text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-white/70 font-semibold">Module Access for this invite</Label>
              <div className="grid grid-cols-1 gap-2">
                {MODULES.map(mod => (
                  <div key={mod.key} className="flex items-center justify-between gap-3">
                    <div className={`flex items-center gap-1.5 text-xs ${mod.color} w-40`}>{mod.icon}{mod.label}</div>
                    <Select value={access[mod.key]} onValueChange={val => setAccess(a => ({ ...a, [mod.key]: val as AccessLevel }))}>
                      <SelectTrigger className="h-7 text-xs bg-white/5 border-white/20 text-white flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1a2e] border-white/20">
                        {ACCESS_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs text-white focus:bg-white/10">{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <p className="text-sm text-white/70">Share this link with the user. It expires after first use.</p>
            <div className="flex items-center gap-2 p-3 bg-white/5 rounded-lg border border-white/10">
              <span className="text-xs text-white/60 flex-1 truncate font-mono">{inviteUrl}</span>
              <Button variant="ghost" size="sm" onClick={copy} className="flex-shrink-0 text-white/60 hover:text-white">
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
        <DialogFooter>
          {!inviteUrl ? (
            <>
              <Button variant="ghost" onClick={onClose} className="text-white/70">Cancel</Button>
              <Button
                onClick={() => createInvite.mutate({ email, access, origin: window.location.origin })}
                disabled={createInvite.isPending}
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                {createInvite.isPending ? "Generating…" : "Generate Link"}
              </Button>
            </>
          ) : (
            <Button onClick={() => { onClose(); setInviteUrl(null); }} className="bg-indigo-600 hover:bg-indigo-500 text-white">Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
export default function Settings() {
  const { user } = useAuth();
  const isOwner = user?.email === OWNER_EMAIL || SUPER_ADMIN_EMAILS.includes((user?.email ?? "").toLowerCase());

  const [tab, setTab] = useState<"users" | "invites">("users");
  const [search, setSearch] = useState("");
  const [showAddUser, setShowAddUser] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  const { data: allUsers, isLoading: usersLoading } = trpc.permissions.listUsers.useQuery(undefined, { enabled: isOwner });
  const { data: invites } = trpc.permissions.listInvites.useQuery(undefined, { enabled: isOwner && tab === "invites" });
  const utils = trpc.useUtils();
  const revokeInvite = trpc.permissions.revokeInvite.useMutation({
    onSuccess: () => { utils.permissions.listInvites.invalidate(); toast.success("Invite revoked"); },
  });

  if (!isOwner) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Shield className="h-16 w-16 text-red-400/50" />
          <h2 className="text-xl font-bold text-white">Access Restricted</h2>
          <p className="text-white/50 text-sm">Only the platform owner can access Settings.</p>
        </div>
      </DashboardLayout>
    );
  }

  const filteredUsers = (allUsers ?? []).filter(u =>
    !search || (u.name ?? "").toLowerCase().includes(search.toLowerCase()) || (u.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <SettingsIcon className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Settings</h1>
              <p className="text-xs text-white/50">Manage user access and permissions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowInvite(true)} variant="outline" size="sm" className="border-white/20 text-white/80 hover:text-white text-xs">
              <Link className="h-3.5 w-3.5 mr-1.5" /> Invite Link
            </Button>
            <Button onClick={() => setShowAddUser(true)} size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs">
              <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Add User
            </Button>
          </div>
        </div>

        {/* Permission Legend */}
        <div className="grid grid-cols-3 gap-3 p-4 bg-white/5 rounded-xl border border-white/10">
          {ACCESS_OPTIONS.map(opt => (
            <div key={opt.value} className="text-center">
              <AccessBadge level={opt.value} />
              <p className="text-xs text-white/50 mt-1">{opt.description}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-white/5 rounded-lg border border-white/10 w-fit">
          {[
            { key: "users" as const, label: "Users", icon: <Users className="h-3.5 w-3.5" /> },
            { key: "invites" as const, label: "Pending Invites", icon: <Mail className="h-3.5 w-3.5" /> },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${tab === t.key ? "bg-indigo-600 text-white" : "text-white/50 hover:text-white"}`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Users Tab */}
        {tab === "users" && (
          <div className="space-y-3">
            <Input
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-white/5 border-white/20 text-white text-sm"
            />
            {usersLoading ? (
              <div className="flex items-center justify-center py-12 text-white/40">
                <div className="h-6 w-6 rounded-full border-2 border-white/20 border-t-white animate-spin mr-3" />
                Loading users…
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-white/40 text-sm">No users found</div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map(u => (
                  <UserPermissionRow key={u.id} user={u} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Invites Tab */}
        {tab === "invites" && (
          <div className="space-y-2">
            {!invites || invites.length === 0 ? (
              <div className="text-center py-12 text-white/40 text-sm">No pending invites</div>
            ) : invites.map(inv => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-lg border border-white/10">
                <div>
                  <p className="text-sm text-white font-medium">{inv.email}</p>
                  <p className="text-xs text-white/40">{inv.usedAt ? "Used" : "Pending"} · {new Date(inv.createdAt).toLocaleDateString()}</p>
                </div>
                <Button
                  variant="ghost" size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs"
                  onClick={() => revokeInvite.mutate({ inviteId: inv.id })}
                  disabled={revokeInvite.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddUserDialog open={showAddUser} onClose={() => setShowAddUser(false)} />
      <InviteDialog open={showInvite} onClose={() => setShowInvite(false)} />
    </DashboardLayout>
  );
}
