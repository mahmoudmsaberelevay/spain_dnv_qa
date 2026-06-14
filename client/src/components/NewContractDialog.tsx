import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, CheckCircle, Users, User, FileText, Phone, Receipt, UserCheck, Globe } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CONSULTANTS = [
  "Ziad El Shurafa",
  "Mahmoud Saber",
  "Fouad Abdo",
  "Kirolos Nabil",
];

// Spain uses family-size pricing; citizenship programs require a manual fee entry
const SPAIN_PRICING: Record<number, number> = { 1: 12000, 2: 13000, 3: 14000, 4: 14000 };

function getSpainValue(members: number): number {
  if (members === 1) return 12000;
  if (members === 2) return 13000;
  if (members <= 4) return 14000;
  return 15000;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function NewContractDialog({ open, onClose }: Props) {
  const [country, setCountry] = useState("spain");
  const [clientName, setClientName] = useState("");
  const [invoicingName, setInvoicingName] = useState("");
  const [clientMobile, setClientMobile] = useState("");
  const [familyMembers, setFamilyMembers] = useState<number | "">("");
  const [consultantName, setConsultantName] = useState("");
  const [contractValueOverride, setContractValueOverride] = useState<number | "">("");
  const [result, setResult] = useState<{ contractCode: string; docUrl: string; filename: string; country: string } | null>(null);

  const utils = trpc.useUtils();

  // Load country list from backend
  const { data: countries } = trpc.contracting.contracts.getCountries.useQuery();

  const createMutation = trpc.contracting.contracts.create.useMutation({
    onSuccess: (data) => {
      setResult({
        contractCode: data.contract!.contractCode,
        docUrl: data.docUrl,
        filename: data.filename,
        country: country,
      });
      utils.contracting.contracts.list.invalidate();
      utils.contracting.analytics.stats.invalidate();
      utils.contracting.analytics.recentContracts.invalidate();
      toast.success(`Contract ${data.contract!.contractCode} created successfully!`);
    },
    onError: (err) => {
      toast.error(`Failed to create contract: ${err.message}`);
    },
  });

  const isSpain = country === "spain";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !invoicingName.trim() || !clientMobile.trim() || !familyMembers || !country) return;
    createMutation.mutate({
      clientName: clientName.trim(),
      invoicingName: invoicingName.trim(),
      clientMobile: clientMobile.trim(),
      familyMembers: Number(familyMembers),
      consultantName: consultantName || undefined,
      country,
      contractValueOverride: !isSpain && contractValueOverride !== "" ? Number(contractValueOverride) : undefined,
    });
  };

  const handleClose = () => {
    setCountry("spain");
    setClientName("");
    setInvoicingName("");
    setClientMobile("");
    setFamilyMembers("");
    setConsultantName("");
    setContractValueOverride("");
    setResult(null);
    createMutation.reset();
    onClose();
  };

  const previewValue = isSpain && familyMembers ? getSpainValue(Number(familyMembers)) : null;
  const isFormValid =
    clientName.trim() &&
    invoicingName.trim() &&
    clientMobile.trim() &&
    familyMembers &&
    consultantName &&
    country;

  const selectedCountryLabel = countries?.find((c) => c.key === country)?.label ?? country;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {!result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Issue New Contract
              </DialogTitle>
              <DialogDescription>
                Select the program country, then fill in the client details to generate the contract.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              {/* Country / Program selector */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5" />
                  Program Country
                </Label>
                <Select value={country} onValueChange={(v) => { setCountry(v); setContractValueOverride(""); }} disabled={createMutation.isPending}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select country..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(countries ?? [
                      { key: "spain", label: "Spain Digital Nomad Visa" },
                      { key: "egypt", label: "Egypt Citizenship" },
                      { key: "dominica", label: "Dominica Citizenship" },
                      { key: "saint_kitts", label: "Saint Kitts & Nevis Citizenship" },
                      { key: "grenada", label: "Grenada Citizenship" },
                    ]).map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Arabic Name — used ONLY in the contract Word document */}
              <div className="space-y-2">
                <Label htmlFor="clientName" className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5" />
                  Arabic Name
                  <span className="text-xs text-muted-foreground font-normal">(for contract document only)</span>
                </Label>
                <Input
                  id="clientName"
                  placeholder="e.g. أحمد محمد حسن"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  required
                  disabled={createMutation.isPending}
                  className="h-10"
                  dir="rtl"
                />
              </div>

              {/* English Name — used in client DB, receipts, commission, income, all other records */}
              <div className="space-y-2">
                <Label htmlFor="invoicingName" className="flex items-center gap-2">
                  <Receipt className="h-3.5 w-3.5" />
                  English Name
                  <span className="text-xs text-muted-foreground font-normal">(for client DB, receipts &amp; all records)</span>
                </Label>
                <Input
                  id="invoicingName"
                  placeholder="e.g. Ahmed Mohamed Hassan"
                  value={invoicingName}
                  onChange={(e) => setInvoicingName(e.target.value)}
                  required
                  disabled={createMutation.isPending}
                  className="h-10"
                  lang="en"
                />
              </div>

              {/* Client Mobile Number */}
              <div className="space-y-2">
                <Label htmlFor="clientMobile" className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5" />
                  Client Mobile Number
                </Label>
                <Input
                  id="clientMobile"
                  type="tel"
                  placeholder="e.g. +201012345678"
                  value={clientMobile}
                  onChange={(e) => setClientMobile(e.target.value)}
                  required
                  disabled={createMutation.isPending}
                  className="h-10"
                />
              </div>

              {/* Consultant */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <UserCheck className="h-3.5 w-3.5" />
                  Consultant
                </Label>
                <Select value={consultantName} onValueChange={setConsultantName} disabled={createMutation.isPending}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select consultant..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CONSULTANTS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Family Members */}
              <div className="space-y-2">
                <Label htmlFor="familyMembers" className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" />
                  Number of Family Members
                </Label>
                <Input
                  id="familyMembers"
                  type="number"
                  min={1}
                  placeholder="e.g. 3"
                  value={familyMembers}
                  onChange={(e) => setFamilyMembers(e.target.value ? Number(e.target.value) : "")}
                  required
                  disabled={createMutation.isPending}
                  className="h-10"
                />
              </div>

              {/* Contract value — auto-calculated for Spain, manual for citizenship programs */}
              {isSpain && previewValue !== null && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-amber-800 font-medium">Calculated Contract Value</span>
                    <span className="text-lg font-bold text-amber-900">
                      {formatCurrency(previewValue, "EUR")}
                    </span>
                  </div>
                  <p className="text-xs text-amber-700 mt-1">
                    Based on {familyMembers} family member{Number(familyMembers) > 1 ? "s" : ""}
                  </p>
                </div>
              )}

              {!isSpain && (
                <div className="space-y-2">
                  <Label htmlFor="contractValueOverride" className="flex items-center gap-2">
                    <Receipt className="h-3.5 w-3.5" />
                    Contract Value (EUR)
                    <span className="text-xs text-muted-foreground font-normal">(optional — leave blank if not yet agreed)</span>
                  </Label>
                  <Input
                    id="contractValueOverride"
                    type="number"
                    min={0}
                    placeholder="e.g. 50000"
                    value={contractValueOverride}
                    onChange={(e) => setContractValueOverride(e.target.value ? Number(e.target.value) : "")}
                    disabled={createMutation.isPending}
                    className="h-10"
                  />
                  {contractValueOverride !== "" && (
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(Number(contractValueOverride), "EUR")} will be recorded as the contract value.
                    </p>
                  )}
                </div>
              )}

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={handleClose} disabled={createMutation.isPending}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || !isFormValid}
                  className="gap-2"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      Generate Contract
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle className="h-5 w-5" />
                Contract Generated!
              </DialogTitle>
              <DialogDescription>
                Your contract has been created and is ready for download.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-green-800">Contract Code</span>
                  <Badge className="bg-green-100 text-green-800 border border-green-200 font-mono">
                    {result.contractCode}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-green-800">Program</span>
                  <span className="text-sm font-medium text-green-900">{selectedCountryLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-green-800">Client</span>
                  <span className="text-sm font-medium text-green-900">{clientName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-green-800">Invoicing Name</span>
                  <span className="text-sm font-medium text-green-900">{invoicingName}</span>
                </div>
              </div>

              <Button
                className="w-full gap-2"
                onClick={() => window.open(result.docUrl, "_blank")}
              >
                <Download className="h-4 w-4" />
                Download Contract (Word)
              </Button>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
