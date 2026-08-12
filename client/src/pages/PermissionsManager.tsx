import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Shield, Users, CheckCircle2, XCircle, Eye, Save, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type AccessLevel = "none" | "viewer" | "full";
type ModuleName = "contracting" | "clientDocs" | "appAnalysis" | "financial" | "aiCouncil";

const MODULES: { key: ModuleName; label: string; description: string; color: string }[] = [
  { key: "contracting", label: "Contracting", description: "Contracts, receipts, proforma invoices", color: "text-blue-400" },
  { key: "clientDocs", label: "Client Docs", description: "Client documentation & attestations", color: "text-green-400" },
  { key: "appAnalysis", label: "App Analysis", description: "AI-powered visa application QA", color: "text-purple-400" },
  { key: "financial", label: "Financial", description: "Income, expenses, accounts, reports", color: "text-amber-400" },
  { key: "aiCouncil", label: "AI Council", description: "Connected-provider administrative decisions", color: "text-cyan-400" },
];

const ACCESS_LEVELS: { value: AccessLevel; label: string; icon: React.ReactNode; badge: string }[] = [
  { value: "none", label: "No Access", icon: <XCircle className="h-3.5 w-3.5" />, badge: "bg-red-500/10 text-red-400 border-red-500/20" },
  { value: "viewer", label: "View Only", icon: <Eye className="h-3.5 w-3.5" />, badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  { value: "full", label: "Full Access", icon: <CheckCircle2 className="h-3.5 w-3.5" />, badge: "bg-green-500/10 text-green-400 border-green-500/20" },
];

// Owner emails that should not be editable
const OWNER_EMAILS = ["mahmoud.saberelevay@gmail.com", "mahmoud.saber@elevay.com"];

function AccessBadge({ level }: { level: AccessLevel }) {
  const cfg = ACCESS_LEVELS.find(a => a.value === level) ?? ACCESS_LEVELS[0];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border", cfg.badge)}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function UserPermissionRow({ user }: { user: { id: number; name: string | null; email: string | null; role: string } }) {
  const isOwner = OWNER_EMAILS.includes((user.email ?? "").toLowerCase());
  const utils = trpc.useUtils();

  const { data: moduleAccess, isLoading } = trpc.permissions.getUserModuleAccess.useQuery(
    { userId: user.id },
    { enabled: !isOwner }
  );

  const setAllMutation = trpc.permissions.setAllModuleAccess.useMutation({
    onSuccess: () => {
      utils.permissions.getUserModuleAccess.invalidate({ userId: user.id });
      toast.success(`Permissions updated for ${user.name ?? user.email}`);
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const [localAccess, setLocalAccess] = useState<Record<ModuleName, AccessLevel> | null>(null);
  const effectiveAccess = localAccess ?? moduleAccess ?? { contracting: "none", clientDocs: "none", appAnalysis: "none", financial: "none", aiCouncil: "none" };

  const handleChange = (mod: ModuleName, level: AccessLevel) => {
    setLocalAccess(prev => ({ ...(prev ?? effectiveAccess), [mod]: level }));
  };

  const handleSave = () => {
    if (!localAccess) return;
    setAllMutation.mutate({ userId: user.id, access: localAccess });
    setLocalAccess(null);
  };

  const hasChanges = localAccess !== null;

  if (isOwner) {
    return (
      <div className="flex items-center justify-between p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-semibold text-sm">
            {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{user.name ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <Badge variant="outline" className="text-amber-400 border-amber-500/30 bg-amber-500/10 text-xs">
          <Shield className="h-3 w-3 mr-1" /> Owner — Full Access
        </Badge>
      </div>
    );
  }

  return (
    <div className={cn(
      "p-4 rounded-lg border transition-colors",
      hasChanges ? "border-primary/40 bg-primary/5" : "border-border bg-card"
    )}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-foreground font-semibold text-sm">
            {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{user.name ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        {hasChanges && (
          <Button size="sm" onClick={handleSave} disabled={setAllMutation.isPending} className="h-7 text-xs gap-1">
            {setAllMutation.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {MODULES.map(m => <Skeleton key={m.key} className="h-16 rounded-md" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {MODULES.map(mod => (
            <div key={mod.key} className="space-y-1.5">
              <p className={cn("text-xs font-medium", mod.color)}>{mod.label}</p>
              <Select
                value={effectiveAccess[mod.key] ?? "none"}
                onValueChange={(val) => handleChange(mod.key, val as AccessLevel)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_LEVELS.map(al => (
                    <SelectItem key={al.value} value={al.value} className="text-xs">
                      <span className="flex items-center gap-1.5">
                        {al.icon}
                        {al.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PermissionsManager() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isOwner = OWNER_EMAILS.includes((user?.email ?? "").toLowerCase());

  const { data: allUsers, isLoading } = trpc.permissions.listUsers.useQuery(undefined, {
    enabled: isOwner,
  });

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <Shield className="h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-lg font-semibold">Access Restricted</h2>
        <p className="text-sm text-muted-foreground max-w-xs">Only the system owner can manage team permissions.</p>
        <Button variant="outline" size="sm" onClick={() => setLocation("/")}>Go Home</Button>
      </div>
    );
  }

  // Filter: exclude duplicate accounts (keep unique emails, prefer older id)
  const uniqueUsers = allUsers
    ? Object.values(
        allUsers.reduce((acc, u) => {
          const key = (u.email ?? u.id.toString()).toLowerCase();
          if (!acc[key] || u.id < acc[key].id) acc[key] = u;
          return acc;
        }, {} as Record<string, typeof allUsers[0]>)
      ).sort((a, b) => a.id - b.id)
    : [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Permissions Manager</h1>
          <p className="text-sm text-muted-foreground">Grant or revoke module access for each team member</p>
        </div>
      </div>

      {/* Legend */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Access Levels</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {ACCESS_LEVELS.map(al => (
              <div key={al.value} className="flex items-center gap-2">
                <AccessBadge level={al.value} />
                <span className="text-xs text-muted-foreground">
                  {al.value === "none" && "Cannot see the module"}
                  {al.value === "viewer" && "Can view but not create or edit"}
                  {al.value === "full" && "Can view, create, and edit"}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* User list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team Members ({uniqueUsers.length})
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Changes are saved per user when you click Save. Select a new access level from the dropdown for each module.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)
          ) : uniqueUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No team members found.</p>
          ) : (
            uniqueUsers.map(u => <UserPermissionRow key={u.id} user={u} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
