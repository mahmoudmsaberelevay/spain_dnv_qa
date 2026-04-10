/**
 * Settings — Owner-only page (mahmoud.saberelevay@gmail.com).
 *
 * Tabs:
 *   1. Users  — list all users, toggle per-page permissions, assign to group, add/invite
 *   2. Groups — create groups with predefined permission levels, assign users to groups
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
  Layers,
  Plus,
  Pencil,
  UserCheck,
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

// ─── Page definitions ─────────────────────────────────────────────────────────
const PAGES = [
  { key: "contracting", label: "Contracting",  color: "bg-blue-500",    light: "bg-blue-100 text-blue-700" },
  { key: "finance",     label: "Financial",    color: "bg-amber-500",   light: "bg-amber-100 text-amber-700" },
  { key: "docs",        label: "Client Docs",  color: "bg-emerald-500", light: "bg-emerald-100 text-emerald-700" },
  { key: "analysis",    label: "Analysis",     color: "bg-violet-500",  light: "bg-violet-100 text-violet-700" },
  { key: "chat",        label: "Team Chat",    color: "bg-sky-500",     light: "bg-sky-100 text-sky-700" },
  { key: "broadcast",   label: "Broadcast",    color: "bg-rose-500",    light: "bg-rose-100 text-rose-700" },
] as const;

type PageKey = (typeof PAGES)[number]["key"];

function emptyPerms(): Record<PageKey, boolean> {
  const p: Record<string, boolean> = {};
  for (const pg of PAGES) p[pg.key] = false;
  return p as Record<PageKey, boolean>;
}

// Predefined group templates
const GROUP_TEMPLATES = [
  { label: "Full Access",      perms: { contracting: true,  finance: true,  docs: true,  analysis: true,  chat: true,  broadcast: true  } },
  { label: "Finance Only",     perms: { contracting: false, finance: true,  docs: false, analysis: false, chat: true,  broadcast: false } },
  { label: "Operations",       perms: { contracting: true,  finance: false, docs: true,  analysis: true,  chat: true,  broadcast: false } },
  { label: "Read-Only Viewer", perms: { contracting: false, finance: false, docs: true,  analysis: true,  chat: false, broadcast: false } },
  { label: "Custom",           perms: null },
];

const GROUP_COLORS = [
  "#6366f1", "#3b82f6", "#10b981", "#f59e0b",
  "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6",
];

// ─── User Row ─────────────────────────────────────────────────────────────────
function UserRow({
  user,
  isOwnerRow,
  currentUserOpenId,
  groups,
}: {
  user: { id: number; name: string | null; email: string | null; openId: string; role: string; groupId: number | null; lastSignedIn: Date };
  isOwnerRow: boolean;
  currentUserOpenId: string;
  groups: { id: number; name: string; color: string }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const utils = trpc.useUtils();

  const { data: permsData, isLoading: permsLoading } = trpc.permissions.getUserPermissions.useQuery(
    { userId: user.id },
    { enabled: expanded && !user.groupId }
  );

  const toggleMutation = trpc.permissions.togglePermission.useMutation({
    onSuccess: () => utils.permissions.getUserPermissions.invalidate({ userId: user.id }),
    onError: () => toast.error("Failed to update permission"),
  });

  const deleteMutation = trpc.permissions.deleteUser.useMutation({
    onSuccess: () => { utils.permissions.listUsers.invalidate(); toast.success("User removed"); },
    onError: (e) => toast.error(e.message),
  });

  const assignGroupMutation = trpc.permissions.assignUserToGroup.useMutation({
    onSuccess: () => { utils.permissions.listUsers.invalidate(); toast.success("Group updated"); },
    onError: (e) => toast.error(e.message),
  });

  const removeGroupMutation = trpc.permissions.removeUserFromGroup.useMutation({
    onSuccess: () => { utils.permissions.listUsers.invalidate(); toast.success("Removed from group"); },
    onError: (e) => toast.error(e.message),
  });

  const isMe = user.openId === currentUserOpenId;
  const displayName = user.name || user.email || `User #${user.id}`;
  const initials = displayName.slice(0, 2).toUpperCase();
  const assignedGroup = groups.find((g) => g.id === user.groupId);

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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-foreground font-medium truncate">{displayName}</span>
            {isOwnerRow && <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Owner</Badge>}
            {isMe && !isOwnerRow && <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">You</Badge>}
            {assignedGroup && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: assignedGroup.color }}
              >
                <Layers className="h-2.5 w-2.5" />
                {assignedGroup.name}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-xs truncate">{user.email || "No email"}</p>
        </div>

        {/* Permission dots (individual only) */}
        {!isOwnerRow && !user.groupId && permsData && (
          <div className="hidden md:flex items-center gap-1 flex-wrap max-w-xs">
            {PAGES.map((pg) => (
              <span
                key={pg.key}
                className={cn("h-2.5 w-2.5 rounded-full", permsData[pg.key] ? pg.color : "bg-gray-200")}
                title={`${pg.label}: ${permsData[pg.key] ? "Allowed" : "Denied"}`}
              />
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {!isOwnerRow && (
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
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-border px-5 py-4 bg-muted/20 space-y-4">
          {isOwnerRow ? (
            <p className="text-muted-foreground text-sm">The owner has full access to all pages and cannot be restricted.</p>
          ) : (
            <>
              {/* Group assignment */}
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                  Assign to Group
                </Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={user.groupId ? String(user.groupId) : "none"}
                    onValueChange={(val) => {
                      if (val === "none") {
                        removeGroupMutation.mutate({ userId: user.id });
                      } else {
                        assignGroupMutation.mutate({ userId: user.id, groupId: Number(val) });
                      }
                    }}
                  >
                    <SelectTrigger className="w-56 h-8 text-sm">
                      <SelectValue placeholder="No group (individual)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No group (individual permissions)</SelectItem>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={String(g.id)}>
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: g.color }} />
                            {g.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {user.groupId && (
                    <p className="text-xs text-muted-foreground">Permissions are inherited from the group.</p>
                  )}
                </div>
              </div>

              {/* Individual permissions (only when not in a group) */}
              {!user.groupId && (
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Individual Page Access
                  </Label>
                  {permsLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <div className="h-4 w-4 rounded-full border-2 border-muted border-t-foreground/40 animate-spin" />
                      Loading…
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
                              allowed ? "bg-white border-border shadow-sm" : "bg-muted/30 border-border/50"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className={cn("h-2.5 w-2.5 rounded-full", pg.color)} />
                              <span className="text-sm text-foreground font-medium">{pg.label}</span>
                            </div>
                            <Switch
                              checked={allowed}
                              onCheckedChange={() => toggleMutation.mutate({ userId: user.id, pageKey: pg.key, canAccess: !allowed })}
                              disabled={toggleMutation.isPending}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Group Card ───────────────────────────────────────────────────────────────
function GroupCard({
  group,
  memberCount,
  onEdit,
  onDelete,
}: {
  group: { id: number; name: string; description: string | null; color: string };
  memberCount: number;
  onEdit: (group: { id: number; name: string; description: string | null; color: string }) => void;
  onDelete: (groupId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const utils = trpc.useUtils();

  const { data: permsData, isLoading } = trpc.permissions.getGroupPermissions.useQuery(
    { groupId: group.id },
    { enabled: expanded }
  );

  const toggleMutation = trpc.permissions.toggleGroupPermission.useMutation({
    onSuccess: () => utils.permissions.getGroupPermissions.invalidate({ groupId: group.id }),
    onError: () => toast.error("Failed to update permission"),
  });

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Color swatch */}
        <div
          className="h-10 w-10 rounded-full flex items-center justify-center text-white flex-shrink-0"
          style={{ backgroundColor: group.color }}
        >
          <Layers className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-foreground font-medium">{group.name}</p>
          <p className="text-muted-foreground text-xs">
            {group.description || "No description"} · {memberCount} member{memberCount !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Permission dots preview */}
        {permsData && (
          <div className="hidden md:flex items-center gap-1">
            {PAGES.map((pg) => (
              <span
                key={pg.key}
                className={cn("h-2.5 w-2.5 rounded-full", permsData[pg.key] ? pg.color : "bg-gray-200")}
                title={`${pg.label}: ${permsData[pg.key] ? "Allowed" : "Denied"}`}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(group); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-500 hover:bg-blue-50 transition-colors"
            title="Edit group"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete group "${group.name}"? Members will be unassigned.`)) {
                onDelete(group.id);
              }
            }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete group"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-5 py-4 bg-muted/20">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
            Group Page Access
          </Label>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <div className="h-4 w-4 rounded-full border-2 border-muted border-t-foreground/40 animate-spin" />
              Loading…
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
                      allowed ? "bg-white border-border shadow-sm" : "bg-muted/30 border-border/50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-full", pg.color)} />
                      <span className="text-sm text-foreground font-medium">{pg.label}</span>
                    </div>
                    <Switch
                      checked={allowed}
                      onCheckedChange={() => toggleMutation.mutate({ groupId: group.id, pageKey: pg.key, canAccess: !allowed })}
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

// ─── Create / Edit Group Dialog ───────────────────────────────────────────────
function GroupDialog({
  open,
  onClose,
  editGroup,
}: {
  open: boolean;
  onClose: () => void;
  editGroup?: { id: number; name: string; description: string | null; color: string } | null;
}) {
  const [name, setName] = useState(editGroup?.name ?? "");
  const [description, setDescription] = useState(editGroup?.description ?? "");
  const [color, setColor] = useState(editGroup?.color ?? GROUP_COLORS[0]);
  const [templateIdx, setTemplateIdx] = useState<number | null>(null);
  const [perms, setPerms] = useState<Record<string, boolean>>(emptyPerms());

  const utils = trpc.useUtils();

  const createMutation = trpc.permissions.createGroup.useMutation({
    onSuccess: () => {
      utils.permissions.listGroups.invalidate();
      toast.success("Group created");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.permissions.updateGroup.useMutation({
    onSuccess: () => {
      utils.permissions.listGroups.invalidate();
      toast.success("Group updated");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleTemplate = (idx: number) => {
    setTemplateIdx(idx);
    const tpl = GROUP_TEMPLATES[idx];
    if (tpl.perms) {
      setPerms(tpl.perms as Record<string, boolean>);
      if (!name) setName(tpl.label);
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) { toast.error("Group name is required"); return; }
    if (editGroup) {
      updateMutation.mutate({ groupId: editGroup.id, name: name.trim(), description: description.trim() || undefined, color });
    } else {
      createMutation.mutate({ name: name.trim(), description: description.trim() || undefined, color, permissions: perms });
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-violet-500" />
            {editGroup ? "Edit Group" : "Create New Group"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div>
            <Label className="text-sm mb-1.5 block">Group Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Finance Team" />
          </div>

          {/* Description */}
          <div>
            <Label className="text-sm mb-1.5 block">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
          </div>

          {/* Color */}
          <div>
            <Label className="text-sm mb-2 block">Group Color</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition-all",
                    color === c ? "border-foreground scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          {/* Permission template (create only) */}
          {!editGroup && (
            <>
              <div>
                <Label className="text-sm mb-2 block">Permission Template</Label>
                <div className="grid grid-cols-2 gap-2">
                  {GROUP_TEMPLATES.map((tpl, idx) => (
                    <button
                      key={tpl.label}
                      className={cn(
                        "px-3 py-2 rounded-lg border text-sm text-left transition-all",
                        templateIdx === idx
                          ? "border-violet-400 bg-violet-50 text-violet-700"
                          : "border-border bg-background text-foreground hover:border-violet-300"
                      )}
                      onClick={() => handleTemplate(idx)}
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom permissions */}
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
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isLoading} className="bg-violet-600 hover:bg-violet-700 text-white">
            {isLoading ? (editGroup ? "Saving…" : "Creating…") : (editGroup ? "Save Changes" : "Create Group")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add User Dialog ──────────────────────────────────────────────────────────
function AddUserDialog({
  open,
  onClose,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  groups: { id: number; name: string; color: string }[];
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [perms, setPerms] = useState<Record<string, boolean>>(emptyPerms());
  const utils = trpc.useUtils();

  const addMutation = trpc.permissions.addUserManually.useMutation({
    onSuccess: () => {
      utils.permissions.listUsers.invalidate();
      toast.success("User added successfully");
      onClose();
      setName(""); setEmail(""); setGroupId(null); setPerms(emptyPerms());
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!name.trim() || !email.trim()) { toast.error("Name and email are required"); return; }
    addMutation.mutate({ name: name.trim(), email: email.trim(), groupId: groupId ?? undefined, permissions: groupId ? undefined : perms });
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
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ahmed Hassan" />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Email Address *</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ahmed@example.com" type="email" />
            </div>
          </div>

          {/* Group assignment */}
          {groups.length > 0 && (
            <div>
              <Label className="text-sm mb-1.5 block">Assign to Group</Label>
              <Select value={groupId ? String(groupId) : "none"} onValueChange={(v) => setGroupId(v === "none" ? null : Number(v))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="No group (set individual permissions)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No group (individual permissions)</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: g.color }} />
                        {g.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Individual permissions (only when no group) */}
          {!groupId && (
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
                    <Switch checked={perms[pg.key]} onCheckedChange={(v) => setPerms((p) => ({ ...p, [pg.key]: v }))} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={addMutation.isPending}>
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
    onSuccess: (data) => { setInviteUrl(data.inviteUrl); utils.permissions.listInvites.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!email.trim()) { toast.error("Email is required"); return; }
    inviteMutation.mutate({ email: email.trim(), permissions: perms, origin: window.location.origin });
  };

  const handleCopy = () => {
    if (inviteUrl) { navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const handleClose = () => { onClose(); setEmail(""); setPerms(emptyPerms()); setInviteUrl(null); setCopied(false); };

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
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@example.com" type="email" />
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
                    <Switch checked={perms[pg.key]} onCheckedChange={(v) => setPerms((p) => ({ ...p, [pg.key]: v }))} />
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
              <Input value={inviteUrl} readOnly className="text-xs text-muted-foreground" />
              <Button size="icon" variant="outline" onClick={handleCopy} className="flex-shrink-0">
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>{inviteUrl ? "Close" : "Cancel"}</Button>
          {!inviteUrl && (
            <Button onClick={handleCreate} disabled={inviteMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
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
  const [activeTab, setActiveTab] = useState<"users" | "groups">("users");
  const [showAddUser, setShowAddUser] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState<{ id: number; name: string; description: string | null; color: string } | null>(null);

  const utils = trpc.useUtils();

  const { data: myPerms } = trpc.permissions.getMyPermissions.useQuery(undefined, { enabled: !!user });
  const { data: users, isLoading: usersLoading } = trpc.permissions.listUsers.useQuery(undefined, { enabled: !!myPerms?.isOwner });
  const { data: groups, isLoading: groupsLoading } = trpc.permissions.listGroups.useQuery(undefined, { enabled: !!myPerms?.isOwner });
  const { data: invites } = trpc.permissions.listInvites.useQuery(undefined, { enabled: !!myPerms?.isOwner });

  const deleteGroupMutation = trpc.permissions.deleteGroup.useMutation({
    onSuccess: () => { utils.permissions.listGroups.invalidate(); utils.permissions.listUsers.invalidate(); toast.success("Group deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const revokeInviteMutation = trpc.permissions.revokeInvite.useMutation({
    onSuccess: () => { utils.permissions.listInvites.invalidate(); toast.success("Invite revoked"); },
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

  // Only mahmoud.saberelevay@gmail.com can access Settings
  if (user && user.email !== OWNER_EMAIL) {
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

  const groupList = (groups ?? []) as { id: number; name: string; description: string | null; color: string; memberCount: number }[];

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <SettingsIcon className="h-6 w-6 text-muted-foreground" />
              <h1 className="text-2xl font-bold text-foreground">Settings</h1>
            </div>
            <p className="text-muted-foreground text-sm">Manage users, groups, and page access for the Elevay platform.</p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "users" ? (
              <>
                <Button onClick={() => setShowInvite(true)} variant="outline" className="gap-2">
                  <Link className="h-4 w-4" />
                  Invite User
                </Button>
                <Button onClick={() => setShowAddUser(true)} className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  Add User
                </Button>
              </>
            ) : (
              <Button onClick={() => setShowCreateGroup(true)} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
                <Plus className="h-4 w-4" />
                New Group
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
          <button
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === "users" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab("users")}
          >
            <Users className="h-4 w-4" />
            Users ({users?.length ?? 0})
          </button>
          <button
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === "groups" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab("groups")}
          >
            <Layers className="h-4 w-4" />
            Groups ({groupList.length})
          </button>
        </div>

        {/* ── Users Tab ── */}
        {activeTab === "users" && (
          <div className="space-y-6">
            <div className="space-y-3">
              {usersLoading ? (
                [1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)
              ) : (
                <>
                  {users?.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u as any}
                      isOwnerRow={u.email === OWNER_EMAIL}
                      currentUserOpenId={user?.openId ?? ""}
                      groups={groupList}
                    />
                  ))}
                  {(!users || users.length === 0) && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
                      <p>No users yet. Add one manually or send an invite.</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Pending invites */}
            {invites && invites.filter((i: any) => !i.usedAt).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Pending Invites ({invites.filter((i: any) => !i.usedAt).length})
                  </h2>
                </div>
                <div className="space-y-2">
                  {invites.filter((inv: any) => !inv.usedAt).map((inv: any) => (
                    <div key={inv.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card shadow-sm">
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-amber-500" />
                        <div>
                          <p className="text-foreground text-sm font-medium">{inv.email}</p>
                          <p className="text-muted-foreground text-xs">Sent {new Date(inv.createdAt).toLocaleDateString()}</p>
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
          </div>
        )}

        {/* ── Groups Tab ── */}
        {activeTab === "groups" && (
          <div className="space-y-4">
            {/* Info banner */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-violet-50 border border-violet-200">
              <UserCheck className="h-5 w-5 text-violet-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-violet-800 text-sm font-medium">How Groups Work</p>
                <p className="text-violet-700 text-xs mt-0.5">
                  Create groups with predefined permission levels, then assign users to a group. Users in a group inherit the group's permissions. Users without a group use their individual permissions.
                </p>
              </div>
            </div>

            {groupsLoading ? (
              [1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)
            ) : groupList.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
                <Layers className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No groups yet</p>
                <p className="text-xs mt-1">Create a group to assign predefined permission levels to multiple users at once.</p>
                <Button onClick={() => setShowCreateGroup(true)} className="mt-4 gap-2 bg-violet-600 hover:bg-violet-700 text-white" size="sm">
                  <Plus className="h-4 w-4" />
                  Create First Group
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {groupList.map((g) => (
                  <GroupCard
                    key={g.id}
                    group={g}
                    memberCount={g.memberCount}
                    onEdit={(grp) => setEditingGroup(grp)}
                    onDelete={(id) => deleteGroupMutation.mutate({ groupId: id })}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Legend */}
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
            Colored dot = access granted. Gray dot = access denied. Group permissions override individual permissions.
          </p>
        </div>
      </div>

      <AddUserDialog open={showAddUser} onClose={() => setShowAddUser(false)} groups={groupList} />
      <InviteDialog open={showInvite} onClose={() => setShowInvite(false)} />
      <GroupDialog open={showCreateGroup} onClose={() => setShowCreateGroup(false)} />
      {editingGroup && (
        <GroupDialog open={!!editingGroup} onClose={() => setEditingGroup(null)} editGroup={editingGroup} />
      )}
    </DashboardLayout>
  );
}
