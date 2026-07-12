/**
 * Settings — Owner-only page.
 * Access & Permissions tab shows all users with 4 module dropdowns.
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
import { AdminPermissionsPanel } from "@/components/AdminPermissionsPanel";

const OWNER_EMAIL = "mahmoud.saberelevay@gmail.com";
const SUPER_ADMIN_EMAILS = ["mahmoud.saberelevay@gmail.com", "mahmoud.saber@elevay.com"];

type AccessLevel = "none" | "viewer" | "full";
type ModuleName = "contracting" | "clientDocs" | "appAnalysis" | "financial";

const MODULES: { key: ModuleName; label: string; icon: React.ReactNode; shortLabel: string }[] = [
  { key: "contracting",  label: "Contracting",          shortLabel: "Contracting",  icon: <FileText className="h-3.5 w-3.5" /> },
  { key: "clientDocs",   label: "Client Docs",          shortLabel: "Client Docs",  icon: <FolderOpen className="h-3.5 w-3.5" /> },
  { key: "appAnalysis",  label: "App Analysis",         shortLabel: "App Analysis", icon: <Search className="h-3.5 w-3.5" /> },
  { key: "financial",    label: "Financial",            shortLabel: "Financial",    icon: <DollarSign className="h-3.5 w-3.5" /> },
];

const ACCESS_OPTIONS: { value: AccessLevel; label: string; badgeClass: string }[] = [
  { value: "full",   label: "Full Access",  badgeClass: "bg-emerald-100 text-emerald-700 border border-emerald-300" },
  { value: "viewer", label: "View Only",    badgeClass: "bg-blue-100 text-blue-700 border border-blue-300" },
  { value: "none",   label: "No Access",   badgeClass: "bg-red-100 text-red-600 border border-red-300" },
];

function AccessBadge({ level }: { level: AccessLevel }) {
  const opt = ACCESS_OPTIONS.find(o => o.value === level) ?? ACCESS_OPTIONS[2];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${opt.badgeClass}`}>
      {opt.label}
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

  const initials = (user.name ?? user.email ?? "?")[0].toUpperCase();

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
      {/* Collapsed header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Avatar */}
        <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-primary">{initials}</span>
        </div>

        {/* Name + email */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{user.name ?? "—"}</span>
            {isSuperAdmin && (
              <Badge className="bg-amber-100 text-amber-700 border border-amber-300 text-xs font-semibold">
                Super Admin
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{user.email}</span>
        </div>

        {/* Quick summary — 4 module badges */}
        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          {isSuperAdmin ? (
            <Badge className="bg-amber-100 text-amber-700 border border-amber-300 text-xs font-semibold">
              Full Access (System)
            </Badge>
          ) : !isLoading && moduleAccess ? (
            MODULES.map(m => (
              <div key={m.key} className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] text-muted-foreground font-medium">{m.shortLabel}</span>
                <AccessBadge level={(moduleAccess[m.key] as AccessLevel) ?? "none"} />
              </div>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">Loading…</span>
          )}
        </div>

        <ChevronDown className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </div>

      {/* Expanded permissions editor */}
      {expanded && (
        <div className="px-4 py-4 bg-muted/30 border-t border-border">
          {isSuperAdmin ? (
            <p className="text-sm text-muted-foreground italic">
              This user has unrestricted super-admin access and cannot be modified.
            </p>
          ) : isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
              Loading permissions…
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {MODULES.map(mod => {
                const current = (moduleAccess?.[mod.key] as AccessLevel) ?? "none";
                return (
                  <div key={mod.key} className="space-y-2 p-3 bg-background rounded-lg border border-border">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <span className="text-primary">{mod.icon}</span>
                      {mod.label}
                    </div>
                    <Select
                      value={current}
                      onValueChange={(val) => handleChange(mod.key, val as AccessLevel)}
                      disabled={setModuleMutation.isPending}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCESS_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="pt-0.5">
                      <AccessBadge level={current} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Delete user */}
          {!isSuperAdmin && (
            <div className="mt-4 pt-3 border-t border-border flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs"
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> Add User
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Full Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email Address</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="john@elevay.com" type="email" className="text-sm" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Module Access</Label>
            <div className="grid grid-cols-1 gap-2">
              {MODULES.map(mod => (
                <div key={mod.key} className="flex items-center justify-between gap-3 p-2 bg-muted/40 rounded-lg">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground w-36">
                    <span className="text-primary">{mod.icon}</span>
                    {mod.label}
                  </div>
                  <Select value={access[mod.key]} onValueChange={val => setAccess(a => ({ ...a, [mod.key]: val as AccessLevel }))}>
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCESS_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => addMutation.mutate({ name, email, access })}
            disabled={!name || !email || addMutation.isPending}
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-5 w-5 text-primary" /> Generate Invite Link
          </DialogTitle>
        </DialogHeader>
        {!inviteUrl ? (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Email (optional)</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@elevay.com" type="email" className="text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Module Access for this invite</Label>
              <div className="grid grid-cols-1 gap-2">
                {MODULES.map(mod => (
                  <div key={mod.key} className="flex items-center justify-between gap-3 p-2 bg-muted/40 rounded-lg">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-foreground w-36">
                      <span className="text-primary">{mod.icon}</span>
                      {mod.label}
                    </div>
                    <Select value={access[mod.key]} onValueChange={val => setAccess(a => ({ ...a, [mod.key]: val as AccessLevel }))}>
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCESS_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
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
            <p className="text-sm text-muted-foreground">Share this link with the user. It expires after first use.</p>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border border-border">
              <span className="text-xs text-muted-foreground flex-1 truncate font-mono">{inviteUrl}</span>
              <Button variant="ghost" size="sm" onClick={copy} className="flex-shrink-0">
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
        <DialogFooter>
          {!inviteUrl ? (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                onClick={() => createInvite.mutate({ email, access, origin: window.location.origin })}
                disabled={createInvite.isPending}
              >
                {createInvite.isPending ? "Generating…" : "Generate Link"}
              </Button>
            </>
          ) : (
            <Button onClick={() => { onClose(); setInviteUrl(null); }}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
// Change Password Panel Component
function ChangePasswordPanel() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);

  const changePasswordMutation = trpc.system.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Password changed successfully!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to change password");
    },
  });

  const handleChangePassword = () => {
    if (!oldPassword) {
      toast.error("Please enter your current password");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (oldPassword === newPassword) {
      toast.error("New password must be different from current password");
      return;
    }

    changePasswordMutation.mutate({
      oldPassword,
      newPassword,
    });
  };

  return (
    <div className="max-w-md mx-auto space-y-6 p-6 bg-card rounded-lg border border-border">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-foreground">Change Your Password</h3>
        <p className="text-sm text-muted-foreground">Update your password to keep your account secure</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="current-password" className="text-sm font-medium">Current Password</Label>
          <Input
            id="current-password"
            type={showPasswords ? "text" : "password"}
            placeholder="Enter your current password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            disabled={changePasswordMutation.isPending}
            className="text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-password" className="text-sm font-medium">New Password</Label>
          <Input
            id="new-password"
            type={showPasswords ? "text" : "password"}
            placeholder="Enter new password (min 6 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={changePasswordMutation.isPending}
            className="text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password" className="text-sm font-medium">Confirm New Password</Label>
          <Input
            id="confirm-password"
            type={showPasswords ? "text" : "password"}
            placeholder="Re-enter new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={changePasswordMutation.isPending}
            className="text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="show-passwords"
            checked={showPasswords}
            onChange={(e) => setShowPasswords(e.target.checked)}
            className="rounded border border-input"
          />
          <Label htmlFor="show-passwords" className="text-xs font-medium cursor-pointer">Show passwords</Label>
        </div>
      </div>

      <div className="p-3 bg-muted/40 rounded-lg border border-border space-y-2">
        <p className="text-xs font-semibold text-foreground">Password Requirements:</p>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>✓ At least 6 characters long</li>
          <li>✓ Different from your current password</li>
          <li>✓ Passwords must match</li>
        </ul>
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            setOldPassword("");
            setNewPassword("");
            setConfirmPassword("");
          }}
          disabled={changePasswordMutation.isPending}
        >
          Clear
        </Button>
        <Button
          className="flex-1"
          onClick={handleChangePassword}
          disabled={changePasswordMutation.isPending || !oldPassword || !newPassword || !confirmPassword}
        >
          {changePasswordMutation.isPending ? "Updating..." : "Update Password"}
        </Button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const isOwner = user?.email === OWNER_EMAIL || SUPER_ADMIN_EMAILS.includes((user?.email ?? "").toLowerCase());

  const [tab, setTab] = useState<"users" | "invites" | "permissions" | "changePassword">("users");
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
          <Shield className="h-16 w-16 text-destructive/40" />
          <h2 className="text-xl font-bold">Access Restricted</h2>
          <p className="text-muted-foreground text-sm">Only the platform owner can access Settings.</p>
        </div>
      </DashboardLayout>
    );
  }

  const filteredUsers = (allUsers ?? []).filter(u =>
    !search || (u.name ?? "").toLowerCase().includes(search.toLowerCase()) || (u.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <SettingsIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Settings</h1>
              <p className="text-xs text-muted-foreground">Manage user access and permissions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowInvite(true)} variant="outline" size="sm" className="text-xs">
              <Link className="h-3.5 w-3.5 mr-1.5" /> Invite Link
            </Button>
            <Button onClick={() => setShowAddUser(true)} size="sm" className="text-xs">
              <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Add User
            </Button>
          </div>
        </div>

        {/* Permission Legend */}
        <div className="grid grid-cols-3 gap-3 p-4 bg-muted/40 rounded-xl border border-border">
          <div className="text-center space-y-1">
            <AccessBadge level="full" />
            <p className="text-xs text-muted-foreground">Can view, create, edit & delete</p>
          </div>
          <div className="text-center space-y-1">
            <AccessBadge level="viewer" />
            <p className="text-xs text-muted-foreground">Can only view, no changes</p>
          </div>
          <div className="text-center space-y-1">
            <AccessBadge level="none" />
            <p className="text-xs text-muted-foreground">Blocked — no access</p>
          </div>
        </div>

        {/* Module column headers */}
        <div className="hidden md:grid grid-cols-[1fr_repeat(4,_minmax(0,_1fr))_auto] gap-3 px-4 py-2 bg-muted/30 rounded-lg border border-border text-xs font-semibold text-muted-foreground">
          <div>User</div>
          {MODULES.map(m => (
            <div key={m.key} className="flex items-center gap-1 justify-center">
              <span className="text-primary">{m.icon}</span>
              {m.shortLabel}
            </div>
          ))}
          <div />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted/40 rounded-lg border border-border w-fit">
          {[
            { key: "users" as const, label: "Users", icon: <Users className="h-3.5 w-3.5" /> },
            { key: "invites" as const, label: "Pending Invites", icon: <Mail className="h-3.5 w-3.5" /> },
            { key: "permissions" as const, label: "Module Permissions", icon: <Shield className="h-3.5 w-3.5" /> },
            { key: "changePassword" as const, label: "Change Password", icon: <SettingsIcon className="h-3.5 w-3.5" /> },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
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
              className="text-sm"
            />
            {usersLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <div className="h-6 w-6 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin mr-3" />
                Loading users…
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No users found</div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map(u => (
                  <UserPermissionRow key={u.id} user={u} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Module Permissions Tab */}
        {tab === "permissions" && (
          <AdminPermissionsPanel />
        )}

        {/* Change Password Tab */}
        {tab === "changePassword" && (
          <ChangePasswordPanel />
        )}

        {/* Invites Tab */}
        {tab === "invites" && (
          <div className="space-y-2">
            {!invites || invites.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No pending invites</div>
            ) : invites.map(inv => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-3 bg-card rounded-lg border border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">{inv.usedAt ? "Used" : "Pending"} · {new Date(inv.createdAt).toLocaleDateString()}</p>
                </div>
                <Button
                  variant="ghost" size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs"
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
