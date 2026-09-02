import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, FolderOpen, User, Calendar, ChevronRight, FileText, Briefcase, Baby, Users, Search } from "lucide-react";

type ChildEntry = { name: string; age: number };

type FormState = {
  clientName: string;
  clientCode: string;
  applicationType: "freelancer" | "business_owner" | "";
  maritalStatus: "single" | "family" | "";
  consultant: "Mahmoud" | "Ziad" | "Fouad" | "Kirolos" | "";
  spouseName: string;
  numberOfKids: number;
  children: ChildEntry[];
  schengenVisaValid: boolean | null; // null = not answered yet
  schengenExpiryDate: string;
};

const EMPTY_FORM: FormState = {
  clientName: "",
  clientCode: "",
  applicationType: "",
  maritalStatus: "",
  consultant: "",
  spouseName: "",
  numberOfKids: 0,
  children: [],
  schengenVisaValid: null,
  schengenExpiryDate: "",
};

export default function ClientDocs() {
  const { loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const clientSearchRef = useRef<HTMLDivElement>(null);

  // Search finClients for the dropdown
  const { data: searchResults } = trpc.reports.clientSearch.search.useQuery(
    { query: clientSearch },
    { enabled: clientSearch.length > 0 || showClientDropdown }
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clientSearchRef.current && !clientSearchRef.current.contains(e.target as Node)) {
        setShowClientDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: clients, isLoading, refetch } = trpc.clientDocs.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createMutation = trpc.clientDocs.create.useMutation({
    onSuccess: (data) => {
      toast.success("Client case created successfully");
      setOpen(false);
      setForm(EMPTY_FORM);
      setClientSearch("");
      setSelectedClientId(null);
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
          onClick={() => startLogin("/docs/dashboard")}
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
      const extra: ChildEntry[] = Array.from({ length: Math.max(0, clamped - existing.length) }, () => ({ name: "", age: 10 }));
      return { ...f, numberOfKids: clamped, children: [...existing, ...extra] };
    });
  };

  const handleChildUpdate = (idx: number, field: keyof ChildEntry, value: string | number) => {
    setForm(f => {
      const children = [...f.children];
      children[idx] = { ...children[idx], [field]: value };
      return { ...f, children };
    });
  };

  const handleCreate = () => {
    if (!form.clientName || !form.clientCode || !form.applicationType || !form.maritalStatus || !form.consultant) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (form.schengenVisaValid === null) {
      toast.error("Please indicate whether the client has a valid Schengen visa");
      return;
    }
    if (form.schengenVisaValid && !form.schengenExpiryDate) {
      toast.error("Please enter the Schengen visa expiry date");
      return;
    }
    createMutation.mutate({
      clientName: form.clientName,
      clientCode: form.clientCode,
      applicationType: form.applicationType as "freelancer" | "business_owner",
      maritalStatus: form.maritalStatus as "single" | "family",
      consultant: form.consultant as "Mahmoud" | "Ziad" | "Fouad" | "Kirolos",
      spouseName: form.spouseName || undefined,
      children: form.maritalStatus === "family" ? form.children : [],
      schengenVisaValid: form.schengenVisaValid ?? false,
      schengenExpiryDate: form.schengenVisaValid ? form.schengenExpiryDate : undefined,
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
              {/* Client Search & Select */}
              <div className="space-y-1.5" ref={clientSearchRef}>
                <Label className="text-gray-700 text-sm font-medium">Select Client</Label>
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by name or code..."
                      value={clientSearch}
                      onChange={e => {
                        setClientSearch(e.target.value);
                        setShowClientDropdown(true);
                        if (!e.target.value) {
                          setSelectedClientId(null);
                          setForm(f => ({ ...f, clientName: "", clientCode: "" }));
                        }
                      }}
                      onFocus={() => setShowClientDropdown(true)}
                      className="pl-9 border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-[#1e3a5f] focus:ring-[#1e3a5f]"
                    />
                  </div>
                  {showClientDropdown && (searchResults?.length ?? 0) > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {searchResults?.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between transition-colors ${
                            selectedClientId === client.id ? "bg-[#1e3a5f]/5 border-l-2 border-[#1e3a5f]" : ""
                          }`}
                          onClick={() => {
                            setForm(f => ({ ...f, clientName: client.name, clientCode: client.clientCode || "" }));
                            setClientSearch(client.name);
                            setSelectedClientId(client.id);
                            setShowClientDropdown(false);
                          }}
                        >
                          <div>
                            <div className="text-sm font-medium text-gray-900">{client.name}</div>
                            <div className="text-xs text-gray-500">{client.clientCode || "No code"}</div>
                          </div>
                          <span className="text-xs text-gray-400 font-mono">{client.clientCode}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {showClientDropdown && clientSearch.length > 0 && (searchResults?.length ?? 0) === 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-center text-sm text-gray-500">
                      No clients found matching "{clientSearch}"
                    </div>
                  )}
                </div>
                {selectedClientId && (
                  <div className="flex items-center gap-2 mt-1.5 px-2 py-1.5 bg-green-50 border border-green-200 rounded-md">
                    <User className="h-3.5 w-3.5 text-green-600" />
                    <span className="text-xs text-green-700 font-medium">{form.clientName}</span>
                    <span className="text-xs text-green-600 font-mono">({form.clientCode})</span>
                  </div>
                )}
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

              {/* ── Family section (only for family) ── */}
              {form.maritalStatus === "family" && (
                <div className="border border-[#1e3a5f]/20 rounded-lg p-4 bg-[#1e3a5f]/5 space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-[#1e3a5f]" />
                    <span className="text-sm font-medium text-[#1e3a5f]">Family Details</span>
                  </div>

                  {/* Spouse name */}
                  <div className="space-y-1.5">
                    <Label className="text-gray-700 text-sm">Spouse Name (Optional)</Label>
                    <Input
                      placeholder="Enter spouse / wife name..."
                      value={form.spouseName}
                      onChange={e => setForm(f => ({ ...f, spouseName: e.target.value }))}
                      className="border-gray-300 text-gray-900 bg-white"
                    />
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

                  {/* Per-child name + exact age inputs */}
                  {form.children.length > 0 && (
                    <div className="space-y-3 pt-1">
                      <p className="text-xs text-gray-500 font-medium">Enter name and exact age for each child:</p>
                      {form.children.map((child, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <span className="text-sm text-gray-600 w-14 shrink-0">Child {idx + 1}</span>
                          <Input
                            placeholder="Name (optional)"
                            value={child.name}
                            onChange={e => handleChildUpdate(idx, "name", e.target.value)}
                            className="border-gray-300 text-gray-900 bg-white flex-1"
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            <Input
                              type="number"
                              min={0}
                              max={50}
                              value={child.age}
                              onChange={e => handleChildUpdate(idx, "age", parseInt(e.target.value) || 0)}
                              className="border-gray-300 text-gray-900 bg-white w-16 text-center"
                            />
                            <span className="text-xs text-gray-500">yrs</span>
                          </div>
                          <span className="text-xs shrink-0 px-1.5 py-0.5 rounded-full font-medium"
                            style={{ background: child.age < 18 ? '#dbeafe' : '#ede9fe', color: child.age < 18 ? '#1d4ed8' : '#6d28d9' }}>
                            {child.age < 18 ? "Under 18" : "18+"}
                          </span>
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
                          {child.name ? child.name : `Child ${idx + 1}`} ({child.age} yrs):{" "}
                          {child.age < 18
                            ? "Birth Certificate"
                            : "Police Certificate + Education Enrollment + Single Record"}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Consultant only (paralegal assigned later on client page) */}
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Consultant</Label>
                <Select value={form.consultant} onValueChange={v => setForm(f => ({ ...f, consultant: v as any }))}>
                  <SelectTrigger className="border-gray-300 text-gray-900 bg-white">
                    <SelectValue placeholder="Select consultant" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    {["Mahmoud", "Ziad", "Fouad", "Kirolos"].map(c => (
                      <SelectItem key={c} value={c} className="text-gray-900">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400">Paralegal can be assigned on the client detail page after creation.</p>
              </div>

              {/* ── Schengen Visa Section ── */}
              <div className="border border-amber-200 rounded-lg p-4 bg-amber-50 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-amber-800">🛂 Schengen Visa</span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-gray-700 text-sm">Does the client have a valid Schengen visa?</Label>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      size="sm"
                      variant={form.schengenVisaValid === true ? "default" : "outline"}
                      className={form.schengenVisaValid === true
                        ? "bg-green-600 hover:bg-green-700 text-white border-green-600"
                        : "border-gray-300 text-gray-700"}
                      onClick={() => setForm(f => ({ ...f, schengenVisaValid: true, schengenExpiryDate: f.schengenExpiryDate }))}
                    >
                      ✓ Yes
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={form.schengenVisaValid === false ? "default" : "outline"}
                      className={form.schengenVisaValid === false
                        ? "bg-red-600 hover:bg-red-700 text-white border-red-600"
                        : "border-gray-300 text-gray-700"}
                      onClick={() => setForm(f => ({ ...f, schengenVisaValid: false, schengenExpiryDate: "" }))}
                    >
                      ✗ No
                    </Button>
                  </div>
                </div>
                {form.schengenVisaValid === true && (
                  <div className="space-y-1.5">
                    <Label className="text-gray-700 text-sm font-medium">Schengen Visa Expiry Date <span className="text-red-500">*</span></Label>
                    <Input
                      type="date"
                      value={form.schengenExpiryDate}
                      onChange={e => setForm(f => ({ ...f, schengenExpiryDate: e.target.value }))}
                      className="border-gray-300 text-gray-900 focus:border-[#1e3a5f] focus:ring-[#1e3a5f]"
                    />
                  </div>
                )}
                {form.schengenVisaValid === false && (
                  <p className="text-xs text-amber-700">No Schengen visa — reminders will not be sent for visa expiry.</p>
                )}
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
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getTypeBadge(client.applicationType)}`}>
                    {getTypeLabel(client.applicationType)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#1e3a5f] transition-colors" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                {client.paralegal && (
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {client.paralegal}
                  </span>
                )}
                {client.consultant && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />
                    {client.consultant}
                  </span>
                )}
                {client.maritalStatus === "family" && (
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    Family
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center mb-4">
            <FolderOpen className="w-8 h-8 text-[#1e3a5f]" />
          </div>
          <h3 className="text-gray-900 font-medium text-lg mb-1">No clients yet</h3>
          <p className="text-gray-500 text-sm mb-6">Create your first client case to start tracking documents</p>
          <Button
            className="bg-[#1e3a5f] hover:bg-[#16304f] text-white gap-2"
            onClick={() => setOpen(true)}
          >
            <Plus className="w-4 h-4" />
            New Client
          </Button>
        </div>
      )}
    </div>
  );
}
