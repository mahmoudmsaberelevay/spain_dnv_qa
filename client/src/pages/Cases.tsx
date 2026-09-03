import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Shield, Plus, Search, FolderOpen, Clock, CheckCircle2, AlertTriangle,
  FileText, ChevronRight, Trash2, User, ArrowLeft, MoreVertical
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { startSystemLogin } from "@/const";
import { format } from "date-fns";

const STATUS_CONFIG = {
  draft: { label: "Draft", color: "bg-muted text-muted-foreground", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700", icon: FileText },
  complete: { label: "Complete", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  issues_found: { label: "Issues Found", color: "bg-red-100 text-red-700", icon: AlertTriangle },
} as const;

export default function Cases() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ clientName: "" });
  const [creating, setCreating] = useState(false);

  const { data: cases, isLoading, refetch } = trpc.cases.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createCase = trpc.cases.create.useMutation({
    onSuccess: (newCase) => {
      toast.success("Case created successfully");
      setShowCreate(false);
      setForm({ clientName: "" });
      navigate(`/analysis/cases/${newCase?.id}/upload`);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteCase = trpc.cases.delete.useMutation({
    onSuccess: () => { toast.success("Case deleted"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-sm">
          <Shield className="w-12 h-12 text-primary mx-auto mb-4" />
          <h2 className="font-serif text-2xl font-semibold mb-2">Sign In Required</h2>
          <p className="text-muted-foreground mb-6">Please sign in to access your cases.</p>
          <Button onClick={() => startSystemLogin("/cases")}>Sign In</Button>
        </div>
      </div>
    );
  }

  const filtered = (cases || []).filter(c =>
    c.clientName.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!form.clientName.trim()) { toast.error("Client name is required"); return; }
    setCreating(true);
    try {
      await createCase.mutateAsync(form);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/analysis")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                <Shield className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span className="font-semibold text-sm">Spain DNV QA</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.name}</span>
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              New Case
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-semibold text-foreground mb-1">Client Cases</h1>
          <p className="text-muted-foreground">Manage and track your Spain DNV application reviews.</p>
        </div>

        {/* Search + stats */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search cases..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-3 text-sm text-muted-foreground items-center">
            <span>{(cases || []).length} total cases</span>
            <span>·</span>
            <span>{(cases || []).filter(c => c.status === "complete").length} complete</span>
          </div>
        </div>

        {/* Cases grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 rounded-xl border border-border bg-card animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <FolderOpen className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold text-foreground mb-1">
              {search ? "No cases match your search" : "No cases yet"}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {search ? "Try a different search term." : "Create your first client case to get started."}
            </p>
            {!search && (
              <Button onClick={() => setShowCreate(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Create First Case
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c) => {
              const status = STATUS_CONFIG[c.status] || STATUS_CONFIG.draft;
              const StatusIcon = status.icon;
              return (
                <div
                  key={c.id}
                  className="group relative rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden"
                  onClick={() => navigate(`/analysis/cases/${c.id}`)}
                >
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground text-sm leading-tight">{c.clientName}</h3>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                            <button className="p-1 rounded hover:bg-muted transition-colors opacity-0 group-hover:opacity-100">
                              <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={e => { e.stopPropagation(); deleteCase.mutate({ id: c.id }); }}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              Delete Case
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {c.passportFullName && (
                      <div className="mb-3 px-3 py-2 rounded-lg bg-muted/50 border border-border">
                        <p className="text-xs text-muted-foreground mb-0.5">Passport Name</p>
                        <p className="text-xs font-mono font-medium text-foreground">{c.passportFullName}</p>
                      </div>
                    )}


                  </div>

                  <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(c.updatedAt), "MMM d, yyyy")}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-primary font-medium">
                      {c.analysisCompleted ? "View Report" : "Continue"}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create Case Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">New Client Case</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-1.5">
              <Label htmlFor="clientName">Client Full Name <span className="text-destructive">*</span></Label>
              <Input
                id="clientName"
                placeholder="e.g. Ahmed Mohamed Hassan"
                value={form.clientName}
                onChange={e => setForm({ clientName: e.target.value })}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Enter the client's full name exactly as it appears on their passport.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating..." : "Create & Start Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
