import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, FolderOpen, User, Calendar, ChevronRight, FileText, Briefcase, Baby, Users } from "lucide-react";

type ChildEntry = { ageRange: "0-17" | "18-26" };

type FormState = {
  clientName: string;
  clientCode: string;
  applicationType: "freelancer" | "business_owner" | "";
  maritalStatus: "single" | "family" | "";
  paralegal: "Madonna" | "Monica" | "Marina" | "";
  consultant: "Mahmoud" | "Ziad" | "Fouad" | "Kirolos" | "";
  numberOfKids: number;
  children: ChildEntry[];
};

const EMPTY_FORM: FormState = {
  clientName: "",
  clientCode: "",
  applicationType: "",
  maritalStatus: "",
  paralegal: "",
  consultant: "",
  numberOfKids: 0,
  children: [],
};

export default function ClientDocs() {
  const { loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data: clients, isLoading, refetch } = trpc.clientDocs.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createMutation = trpc.clientDocs.create.useMutation({
    onSuccess: (data) => {
      toast.success("Client case created successfully");
      setOpen(false);
      setForm(EMPTY_FORM);
      refetch();
      setLocation(`/docs/clients/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="w-8 h-8 border-2 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-white">
        <p className="text-gray-500">Please sign in to access Client Documentation</p>
        <Button
          className="bg-[#1e3a5f] hover:bg-[#16304f] text-white"
          onClick={() => (window.location.href = getLoginUrl())}
        >
          Sign In
        </Button>
      </div>
    );
  }

  // When marital status changes to single, clear children
  const handleMaritalChange = (v: string) => {
    setForm(f => ({
      ...f,
      maritalStatus: v as any,
      numberOfKids: v === "single" ? 0 : f.numberOfKids,
      children: v === "single" ? [] : f.children,
    }));
  };

  // When number of kids changes, resize children array
  const handleKidsCountChange = (count: number) => {
    const clamped = Math.max(0, Math.min(20, count));
    setForm(f => {
      const existing = f.children.slice(0, clamped);
      const extra: ChildEntry[] = Array.from({ length: Math.max(0, clamped - existing.length) }, () => ({ ageRange: "0-17" as const }));
      return { ...f, numberOfKids: clamped, children: [...existing, ...extra] };
    });
  };

  const handleChildAgeRange = (idx: number, ageRange: "0-17" | "18-26") => {
    setForm(f => {
      const children = [...f.children];
      children[idx] = { ageRange };
      return { ...f, children };
    });
  };

  const handleCreate = () => {
    if (!form.clientName || !form.clientCode || !form.applicationType || !form.maritalStatus || !form.paralegal || !form.consultant) {
      toast.error("Please fill in all fields");
      return;
    }
    if (form.maritalStatus === "family" && form.numberOfKids > 0 && form.children.some(c => !c.ageRange)) {
      toast.error("Please select an age range for each child");
      return;
    }
    createMutation.mutate({
      clientName: form.clientName,
      clientCode: form.clientCode,
      applicationType: form.applicationType as "freelancer" | "business_owner",
      maritalStatus: form.maritalStatus as "single" | "family",
      paralegal: form.paralegal as "Madonna" | "Monica" | "Marina",
      consultant: form.consultant as "Mahmoud" | "Ziad" | "Fouad" | "Kirolos",
      children: form.maritalStatus === "family" ? form.children : [],
    });
  };

  const getTypeLabel = (type: string) =>
    type === "freelancer" ? "Freelancer" : type === "business_owner" ? "Business Owner" : type;

  const getTypeBadge = (type: string) =>
    type === "freelancer"
      ? "bg-blue-100 text-blue-800 border-blue-200"
      : "bg-amber-100 text-amber-800 border-amber-200";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 bg-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Client Documentation</h1>
          <p className="text-sm text-gray-500 mt-1">Track document collection, attestation, and submission readiness</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#1e3a5f] hover:bg-[#16304f] text-white gap-2 shadow-sm">
              <Plus className="w-4 h-4" />
              New Client
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-gray-900 text-lg font-semibold">Create Client Case</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {/* Client Name */}
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Client Name</Label>
                <Input
                  placeholder="Full name"
                  value={form.clientName}
                  onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                  className="border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-[#1e3a5f] focus:ring-[#1e3a5f]"
                />
              </div>

              {/* Client Code */}
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Client Code</Label>
                <Input
                  placeholder="e.g. ELV-2026-001"
                  value={form.clientCode}
                  onChange={e => setForm(f => ({ ...f, clientCode: e.target.value }))}
                  className="border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-[#1e3a5f] focus:ring-[#1e3a5f]"
                />
              </div>

              {/* Application Type + Marital Status */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-gray-700 text-sm font-medium">Application Type</Label>
                  <Select value={form.applicationType} onValueChange={v => setForm(f => ({ ...f, applicationType: v as any }))}>
                    <SelectTrigger className="border-gray-300 text-gray-900 bg-white">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200">
                      <SelectItem value="freelancer" className="text-gray-900">Freelancer</SelectItem>
                      <SelectItem value="business_owner" className="text-gray-900">Business Owner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-gray-700 text-sm font-medium">Marital Status</Label>
                  <Select value={form.maritalStatus} onValueChange={handleMaritalChange}>
                    <SelectTrigger className="border-gray-300 text-gray-900 bg-white">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200">
                      <SelectItem value="single" className="text-gray-900">Single</SelectItem>
                      <SelectItem value="family" className="text-gray-900">Family</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ── Children section (only for family) ── */}
              {form.maritalStatus === "family" && (
                <div className="border border-[#1e3a5f]/20 rounded-lg p-4 bg-[#1e3a5f]/5 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Baby className="w-4 h-4 text-[#1e3a5f]" />
                    <span className="text-sm font-medium text-[#1e3a5f]">Children</span>
                  </div>

                  {/* Number of kids */}
                  <div className="space-y-1.5">
                    <Label className="text-gray-700 text-sm">Number of Children</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-8 h-8 p-0 border-gray-300 text-gray-700"
                        onClick={() => handleKidsCountChange(form.numberOfKids - 1)}
                        disabled={form.numberOfKids <= 0}
                      >
                        −
                      </Button>
                      <span className="w-8 text-center text-gray-900 font-medium">{form.numberOfKids}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-8 h-8 p-0 border-gray-300 text-gray-700"
                        onClick={() => handleKidsCountChange(form.numberOfKids + 1)}
                      >
                        +
                      </Button>
                    </div>
                  </div>

                  {/* Per-child age range selectors */}
                  {form.children.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <p className="text-xs text-gray-500">Select age range for each child:</p>
                      {form.children.map((child, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <span className="text-sm text-gray-600 w-16 shrink-0">Child {idx + 1}</span>
                          <Select
                            value={child.ageRange}
                            onValueChange={v => handleChildAgeRange(idx, v as "0-17" | "18-26")}
                          >
                            <SelectTrigger className="border-gray-300 text-gray-900 bg-white flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white border-gray-200">
                              <SelectItem value="0-17" className="text-gray-900">
                                <span className="flex items-center gap-2">
                                  <Baby className="w-3.5 h-3.5 text-blue-500" />
                                  0 – 17 years
                                </span>
                              </SelectItem>
                              <SelectItem value="18-26" className="text-gray-900">
                                <span className="flex items-center gap-2">
                                  <Users className="w-3.5 h-3.5 text-purple-500" />
                                  18 – 26 years
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Document hint */}
                  {form.children.length > 0 && (
                    <div className="text-xs text-gray-500 pt-1 space-y-0.5 border-t border-[#1e3a5f]/10 pt-2">
                      <p className="font-medium text-gray-600">Documents that will be added:</p>
                      {form.children.map((child, idx) => (
                        <p key={idx}>
                          Child {idx + 1} ({child.ageRange} yrs):{" "}
                          {child.ageRange === "0-17"
                            ? "Birth Certificate"
                            : "Police Certificate + Education Enrollment + Single Record"}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Paralegal + Consultant */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-gray-700 text-sm font-medium">Paralegal</Label>
                  <Select value={form.paralegal} onValueChange={v => setForm(f => ({ ...f, paralegal: v as any }))}>
                    <SelectTrigger className="border-gray-300 text-gray-900 bg-white">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200">
                      {["Madonna", "Monica", "Marina"].map(p => (
                        <SelectItem key={p} value={p} className="text-gray-900">{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-gray-700 text-sm font-medium">Consultant</Label>
                  <Select value={form.consultant} onValueChange={v => setForm(f => ({ ...f, consultant: v as any }))}>
                    <SelectTrigger className="border-gray-300 text-gray-900 bg-white">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200">
                      {["Mahmoud", "Ziad", "Fouad", "Kirolos"].map(c => (
                        <SelectItem key={c} value={c} className="text-gray-900">{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                className="w-full bg-[#1e3a5f] hover:bg-[#16304f] text-white mt-2"
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
            { label: "Total Clients", value: clients.length, icon: User, color: "text-[#1e3a5f] bg-[#1e3a5f]/10" },
            { label: "Freelancers", value: clients.filter(c => c.applicationType === "freelancer").length, icon: FileText, color: "text-blue-700 bg-blue-50" },
            { label: "Business Owners", value: clients.filter(c => c.applicationType === "business_owner").length, icon: Briefcase, color: "text-amber-700 bg-amber-50" },
          ].map(stat => (
            <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${stat.color}`}>
                <stat.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xl font-semibold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Client list */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : clients && clients.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clients.map(client => (
            <button
              key={client.id}
              onClick={() => setLocation(`/docs/clients/${client.id}`)}
              className="w-full text-left bg-white hover:bg-gray-50 border border-gray-200 hover:border-[#1e3a5f]/40 rounded-xl p-4 transition-all duration-200 group shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center text-[#1e3a5f] font-semibold text-sm">
                    {client.clientName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-gray-900 font-medium text-sm">{client.clientName}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{client.clientCode}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#1e3a5f] transition-colors mt-1" />
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Badge className={`text-xs border px-2 py-0.5 ${getTypeBadge(client.applicationType)}`}>
                  {getTypeLabel(client.applicationType)}
                </Badge>
                <Badge className="text-xs border px-2 py-0.5 bg-gray-100 text-gray-600 border-gray-200">
                  {client.maritalStatus === "family" ? "Family" : "Single"}
                </Badge>
                {client.maritalStatus === "family" && (client.childrenData as any)?.length > 0 && (
                  <Badge className="text-xs border px-2 py-0.5 bg-purple-50 text-purple-700 border-purple-200 flex items-center gap-1">
                    <Baby className="w-3 h-3" />
                    {(client.childrenData as any).length} {(client.childrenData as any).length === 1 ? "child" : "children"}
                  </Badge>
                )}
                <span className="text-gray-400 text-xs ml-auto">{client.consultant}</span>
              </div>
              {client.expectedSubmissionDate && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                  <Calendar className="w-3 h-3" />
                  Submission: {new Date(client.expectedSubmissionDate).toLocaleDateString()}
                </div>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <FolderOpen className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-gray-500 text-sm">No client cases yet</p>
          <p className="text-gray-400 text-xs mt-1">Create your first client case to get started</p>
        </div>
      )}
    </div>
  );
}
