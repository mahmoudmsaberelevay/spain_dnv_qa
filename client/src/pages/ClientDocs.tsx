import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, FolderOpen, User, Calendar, ChevronRight, FileText, Briefcase } from "lucide-react";

type FormState = {
  clientName: string;
  clientCode: string;
  applicationType: "freelancer" | "business_owner" | "";
  maritalStatus: "single" | "family" | "";
  paralegal: "Madonna" | "Monica" | "Marina" | "";
  consultant: "Mahmoud" | "Ziad" | "Fouad" | "Kirolos" | "";
};

export default function ClientDocs() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>({
    clientName: "",
    clientCode: "",
    applicationType: "",
    maritalStatus: "",
    paralegal: "",
    consultant: "",
  });

  const { data: clients, isLoading, refetch } = trpc.clientDocs.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createMutation = trpc.clientDocs.create.useMutation({
    onSuccess: (data) => {
      toast.success("Client case created successfully");
      setOpen(false);
      setForm({ clientName: "", clientCode: "", applicationType: "", maritalStatus: "", paralegal: "", consultant: "" });
      refetch();
      setLocation(`/docs/clients/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Please sign in to access Client Documentation</p>
        <Button onClick={() => (window.location.href = getLoginUrl())}>Sign In</Button>
      </div>
    );
  }

  const handleCreate = () => {
    if (!form.clientName || !form.clientCode || !form.applicationType || !form.maritalStatus || !form.paralegal || !form.consultant) {
      toast.error("Please fill in all fields");
      return;
    }
    createMutation.mutate({
      clientName: form.clientName,
      clientCode: form.clientCode,
      applicationType: form.applicationType as "freelancer" | "business_owner",
      maritalStatus: form.maritalStatus as "single" | "family",
      paralegal: form.paralegal as "Madonna" | "Monica" | "Marina",
      consultant: form.consultant as "Mahmoud" | "Ziad" | "Fouad" | "Kirolos",
    });
  };

  const getTypeLabel = (type: string) =>
    type === "freelancer" ? "Freelancer" : type === "business_owner" ? "Business Owner" : type;

  const getTypeColor = (type: string) =>
    type === "freelancer" ? "bg-blue-500/20 text-blue-300 border-blue-500/30" : "bg-amber-500/20 text-amber-300 border-amber-500/30";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Client Documentation</h1>
          <p className="text-sm text-white/50 mt-1">Track document collection, attestation, and submission readiness</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white gap-2">
              <Plus className="w-4 h-4" />
              New Client
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#0f0f0f] border-white/10 text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white text-lg font-semibold">Create Client Case</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-white/70 text-sm">Client Name</Label>
                <Input
                  placeholder="Full name"
                  value={form.clientName}
                  onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-white/70 text-sm">Client Code</Label>
                <Input
                  placeholder="e.g. ELV-2026-001"
                  value={form.clientCode}
                  onChange={e => setForm(f => ({ ...f, clientCode: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-white/70 text-sm">Application Type</Label>
                  <Select value={form.applicationType} onValueChange={v => setForm(f => ({ ...f, applicationType: v as any }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-white/10">
                      <SelectItem value="freelancer" className="text-white hover:bg-white/10">Freelancer</SelectItem>
                      <SelectItem value="business_owner" className="text-white hover:bg-white/10">Business Owner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70 text-sm">Marital Status</Label>
                  <Select value={form.maritalStatus} onValueChange={v => setForm(f => ({ ...f, maritalStatus: v as any }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-white/10">
                      <SelectItem value="single" className="text-white hover:bg-white/10">Single</SelectItem>
                      <SelectItem value="family" className="text-white hover:bg-white/10">Family</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-white/70 text-sm">Paralegal</Label>
                  <Select value={form.paralegal} onValueChange={v => setForm(f => ({ ...f, paralegal: v as any }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-white/10">
                      {["Madonna", "Monica", "Marina"].map(p => (
                        <SelectItem key={p} value={p} className="text-white hover:bg-white/10">{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70 text-sm">Consultant</Label>
                  <Select value={form.consultant} onValueChange={v => setForm(f => ({ ...f, consultant: v as any }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-white/10">
                      {["Mahmoud", "Ziad", "Fouad", "Kirolos"].map(c => (
                        <SelectItem key={c} value={c} className="text-white hover:bg-white/10">{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                className="w-full bg-primary hover:bg-primary/90 text-white mt-2"
                onClick={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Client Case"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats bar */}
      {clients && clients.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Clients", value: clients.length, icon: User },
            { label: "Freelancers", value: clients.filter(c => c.applicationType === "freelancer").length, icon: FileText },
            { label: "Business Owners", value: clients.filter(c => c.applicationType === "business_owner").length, icon: Briefcase },
          ].map(stat => (
            <div key={stat.label} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                <stat.icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xl font-semibold text-white">{stat.value}</p>
                <p className="text-xs text-white/50">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Client list */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : clients && clients.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clients.map(client => (
            <button
              key={client.id}
              onClick={() => setLocation(`/docs/clients/${client.id}`)}
              className="w-full text-left bg-white/5 hover:bg-white/8 border border-white/10 hover:border-primary/40 rounded-xl p-4 transition-all duration-200 group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
                    {client.clientName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{client.clientName}</p>
                    <p className="text-white/40 text-xs mt-0.5">{client.clientCode}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-primary transition-colors mt-1" />
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Badge className={`text-xs border px-2 py-0.5 ${getTypeColor(client.applicationType)}`}>
                  {getTypeLabel(client.applicationType)}
                </Badge>
                <Badge className="text-xs border px-2 py-0.5 bg-white/10 text-white/60 border-white/10">
                  {client.maritalStatus === "family" ? "Family" : "Single"}
                </Badge>
                <span className="text-white/30 text-xs ml-auto">{client.consultant}</span>
              </div>
              {client.expectedSubmissionDate && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-white/40">
                  <Calendar className="w-3 h-3" />
                  Submission: {new Date(client.expectedSubmissionDate).toLocaleDateString()}
                </div>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <FolderOpen className="w-8 h-8 text-white/20" />
          </div>
          <p className="text-white/50 text-sm">No client cases yet</p>
          <p className="text-white/30 text-xs mt-1">Create your first client case to get started</p>
        </div>
      )}
    </div>
  );
}
