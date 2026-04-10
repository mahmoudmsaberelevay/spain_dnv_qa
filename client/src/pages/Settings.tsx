/**
 * Settings — Owner-only page for managing user access permissions.
 *
 * Features:
 * - List all users with their current permission status
 * - Toggle individual page permissions per user
 * - Add a new user manually (name + email + permissions)
 * - Generate an invite link for a new user with pre-set permissions
 * - View and revoke pending invites
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Shield,
  UserPlus,
  Mail,
  Trash2,
  Copy,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Settings as SettingsIcon,
  Users,
  Link,
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";

// ─── Page definitions ─────────────────────────────────────────────────────────
const PAGES = [
  { key: "contracting", label: "Contracting", color: "bg-blue-500", light: "bg-blue-100 text-blue-700" },
  { key: "finance", label: "Financial", color: "bg-amber-500", light: "bg-amber-100 text-amber-700" },
  { key: "docs", label: "Client Docs", color: "bg-emerald-500", light: "bg-emerald-100 text-emerald-700" },
  { key: "analysis", label: "Analysis", color: "bg-violet-500", light: "bg-violet-100 text-violet-700" },
  { key: "chat", label: "Team Chat", color: "bg-sky-500", light: "bg-sky-100 text-sky-700" },
  { key: "broadcast", label: "Broadcast", color: "bg-rose-500", light: "bg-rose-100 text-rose-700" },
] as const;

type PageKey = (typeof PAGES)[number]["key"];

// ─── Empty permissions ────────────────────────────────────────────────────────
function emptyPerms(): Record<PageKey, boolean> {
  const p: Record<string, boolean> = {};
  for (const pg of PAGES) p[pg.key] = false;
  return p as Record<PageKey, boolean>;
}

// ─── User Row ─────────────────────────────────────────────────────────────────
function UserRow({
  user,
  isOwner: isOwnerUser,
  currentUserOpenId,
}: {
  user: { id: number; name: string | null; email: string | null; openId: string; role: string; lastSignedIn: Date };
  isOwner: boolean;
  currentUserOpenId: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const utils = trpc.useUtils();

  const { data: permsData, isLoading: permsLoading } = trpc.permissions.getUserPermissions.useQuery(
    { userId: user.id },
    { enabled: expanded }
  );

  const toggleMutation = trpc.permissions.togglePermission.useMutation({
    onSuccess: () => {
      utils.permissions.getUserPermissions.invalidate({ userId: user.id });
    },
    onError: () => toast.error("Failed to update permission"),
  });

  const deleteMutation = trpc.permissions.deleteUser.useMutation({
    onSuccess: () => {
      utils.permissions.listUsers.invalidate();
      toast.success("User removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleToggle = (pageKey: string, current: boolean) => {
    toggleMutation.mutate({ userId: user.id, pageKey, canAccess: !current });
  };

  const isMe = user.openId === currentUserOpenId;
  const displayName = user.name || user.email || `User #${user.id}`;
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
      {/* Header row */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Avatar */}
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
          {initials}
        </div>

        {/* Name & email */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-foreground font-medium truncate">{displayName}</span>
            {isOwnerUser && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Owner</Badge>
            )}
            {isMe && !isOwnerUser && (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">You</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-xs truncate">{user.email || "No email"}</p>
        </div>

        {/* Permission pills summary */}
        {!isOwnerUser && permsData && (
          <div className="hidden md:flex items-center gap-1 flex-wrap max-w-xs">
            {PAGES.map((pg) => (
              <span
                key={pg.key}
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  permsData[pg.key] ? pg.color : "bg-gray-200"
                )}
                title={`${pg.label}: ${permsData[pg.key] ? "Allowed" : "Denied"}`}
              />
            ))}
          </div>
        )}

        {/* Expand/collapse */}
        <div className="flex items-center gap-2">
          {!isOwnerUser && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Remove ${displayName} from the platform?`)) {
                  deleteMutation.mutate({ userId: user.id });
                }
              }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Remove user"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded permissions grid */}
      {expanded && (
        <div className="border-t border-border px-5 py-4 bg-muted/20">
          {isOwnerUser ? (
            <p className="text-muted-foreground text-sm">The owner has full access to all pages and cannot be restricted.</p>
          ) : permsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <div className="h-4 w-4 rounded-full border-2 border-muted border-t-foreground/40 animate-spin" />
              Loading permissions…
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {PAGES.map((pg) => {
                const allowed = permsData?.[pg.key] ?? false;
                return (
                  <div
                    key={pg.key}
                    className={cn(
                      "flex items-center justify-between px-4 py-3 rounded-xl border transition-all",
                      allowed
                        ? "bg-white border-border shadow-sm"
                        : "bg-muted/30 border-border/50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-full", pg.color)} />
                      <span className="text-sm text-foreground font-medium">{pg.label}</span>
                    </div>
                    <Switch
                      checked={allowed}
                      onCheckedChange={() => handleToggle(pg.key, allowed)}
                      disabled={toggleMutation.isPending}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add User Dialog ──────────────────────────────────────────────────────────
function AddUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [perms, setPerms] = useState<Record<string, boolean>>(emptyPerms());

  const utils = trpc.useUtils();

  const addMutation = trpc.permissions.addUserManually.useMutation({
    onSuccess: () => {
      utils.permissions.listUsers.invalidate();
      toast.success("User added successfully");
      onClose();
      setName(""); setEmail(""); setPerms(emptyPerms());
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    addMutation.mutate({ name: name.trim(), email: email.trim(), permissions: perms });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-500" />
            Add User Manually
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm mb-1.5 block">Full Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ahmed Hassan"
              />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Email Address *</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ahmed@example.com"
                type="email"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm mb-2 block">Page Access</Label>
            <div className="grid grid-cols-2 gap-2">
              {PAGES.map((pg) => (
                <div
                  key={pg.key}
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all cursor-pointer",
                    perms[pg.key] ? "bg-muted border-border" : "bg-background border-border/50"
                  )}
                  onClick={() => setPerms((p) => ({ ...p, [pg.key]: !p[pg.key] }))}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", pg.color)} />
                    <span className="text-sm text-foreground">{pg.label}</span>
                  </div>
                  <Switch
                    checked={perms[pg.key]}
                    onCheckedChange={(v) => setPerms((p) => ({ ...p, [pg.key]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={addMutation.isPending}
          >
            {addMutation.isPending ? "Adding…" : "Add User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invite Dialog ────────────────────────────────────────────────────────────
function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [perms, setPerms] = useState<Record<string, boolean>>(emptyPerms());
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const utils = trpc.useUtils();

  const inviteMutation = trpc.permissions.createInvite.useMutation({
    onSuccess: (data) => {
      setInviteUrl(data.inviteUrl);
      utils.permissions.listInvites.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    inviteMutation.mutate({ email: email.trim(), permissions: perms, origin: window.location.origin });
  };

  const handleCopy = () => {
    if (inviteUrl) {
      navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    onClose();
    setEmail(""); setPerms(emptyPerms()); setInviteUrl(null); setCopied(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-emerald-500" />
            Invite User
          </DialogTitle>
        </DialogHeader>

        {!inviteUrl ? (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm mb-1.5 block">Email Address *</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                type="email"
              />
            </div>

            <div>
              <Label className="text-sm mb-2 block">Pre-set Page Access</Label>
              <div className="grid grid-cols-2 gap-2">
                {PAGES.map((pg) => (
                  <div
                    key={pg.key}
                    className={cn(
                      "flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all cursor-pointer",
                      perms[pg.key] ? "bg-muted border-border" : "bg-background border-border/50"
                    )}
                    onClick={() => setPerms((p) => ({ ...p, [pg.key]: !p[pg.key] }))}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", pg.color)} />
                      <span className="text-sm text-foreground">{pg.label}</span>
                    </div>
                    <Switch
                      checked={perms[pg.key]}
                      onCheckedChange={(v) => setPerms((p) => ({ ...p, [pg.key]: v }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <Check className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <p className="text-emerald-700 text-sm">Invite link generated! Share it with {email}.</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={inviteUrl}
                readOnly
                className="text-xs text-muted-foreground"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={handleCopy}
                className="flex-shrink-0"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            {inviteUrl ? "Close" : "Cancel"}
          </Button>
          {!inviteUrl && (
            <Button
              onClick={handleCreate}
              disabled={inviteMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {inviteMutation.isPending ? "Generating…" : "Generate Invite Link"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
export default function Settings() {
  const { user, loading } = useAuth();
  const [showAddUser, setShowAddUser] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  const utils = trpc.useUtils();

  const { data: myPerms } = trpc.permissions.getMyPermissions.useQuery(undefined, {
    enabled: !!user,
  });

  const { data: users, isLoading: usersLoading } = trpc.permissions.listUsers.useQuery(undefined, {
    enabled: !!myPerms?.isOwner,
  });

  const { data: invites } = trpc.permissions.listInvites.useQuery(undefined, {
    enabled: !!myPerms?.isOwner,
  });

  const revokeInviteMutation = trpc.permissions.revokeInvite.useMutation({
    onSuccess: () => {
      utils.permissions.listInvites.invalidate();
      toast.success("Invite revoked");
    },
  });

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 rounded-full border-2 border-muted border-t-primary animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  // Not the owner — show access denied
  if (!myPerms?.isOwner) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <Shield className="h-12 w-12 text-muted-foreground/30" />
          <h2 className="text-xl font-semibold text-foreground">Access Denied</h2>
          <p className="text-muted-foreground text-sm">Only the platform owner can access Settings.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <SettingsIcon className="h-6 w-6 text-muted-foreground" />
              <h1 className="text-2xl font-bold text-foreground">Settings</h1>
            </div>
            <p className="text-muted-foreground text-sm">Manage user access and permissions for the Elevay platform.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowInvite(true)}
              variant="outline"
              className="gap-2"
            >
              <Link className="h-4 w-4" />
              Invite User
            </Button>
            <Button
              onClick={() => setShowAddUser(true)}
              className="gap-2"
            >
              <UserPlus className="h-4 w-4" />
              Add User
            </Button>
          </div>
        </div>

        {/* Users section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Platform Users ({users?.length ?? 0})
            </h2>
          </div>

          {usersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {users?.map((u) => (
                <UserRow
                  key={u.id}
                  user={u as any}
                  isOwner={u.openId === user?.openId}
                  currentUserOpenId={user?.openId ?? ""}
                />
              ))}
              {(!users || users.length === 0) && (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  <p>No users yet. Add one manually or send an invite.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pending invites section */}
        {invites && invites.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Pending Invites ({invites.filter((i) => !i.usedAt).length})
              </h2>
            </div>
            <div className="space-y-2">
              {invites
                .filter((inv: any) => !inv.usedAt)
                .map((inv: any) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-amber-500" />
                      <div>
                        <p className="text-foreground text-sm font-medium">{inv.email}</p>
                        <p className="text-muted-foreground text-xs">
                          Sent {new Date(inv.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => revokeInviteMutation.mutate({ inviteId: inv.id })}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Revoke invite"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Permission legend */}
        <div className="rounded-xl border border-border bg-card shadow-sm p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Page Access Legend</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PAGES.map((pg) => (
              <div key={pg.key} className="flex items-center gap-2">
                <span className={cn("h-3 w-3 rounded-full flex-shrink-0", pg.color)} />
                <span className="text-muted-foreground text-sm">{pg.label}</span>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground/60 text-xs mt-3">
            Toggle each page on/off per user. The owner always has full access.
          </p>
        </div>
      </div>

      <AddUserDialog open={showAddUser} onClose={() => setShowAddUser(false)} />
      <InviteDialog open={showInvite} onClose={() => setShowInvite(false)} />
    </DashboardLayout>
  );
}
