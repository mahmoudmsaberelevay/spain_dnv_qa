import React, { useState } from "react";
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

// Spain uses family-size pricing; citizenship programs require a manual fee entry
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
  const [clientOrigin, setClientOrigin] = useState<"referral" | "marketing" | "">("");
  const [marketingLeadId, setMarketingLeadId] = useState("");
  const [contractValueOverride, setContractValueOverride] = useState<number | "">("");
  const [currency, setCurrency] = useState<"EUR" | "USD">("EUR");
  const [discountValue, setDiscountValue] = useState<string>("");
  const [result, setResult] = useState<{ contractCode: string; docUrl: string; filename: string; country: string } | null>(null);

  const utils = trpc.useUtils();

  // Load country list from backend
  const { data: countries } = trpc.contracting.contracts.getCountries.useQuery();
  const { data: consultants = [], isLoading: consultantsLoading } = trpc.contracting.contracts.getConsultants.useQuery();
  const parsedMarketingLeadId = Number(marketingLeadId);
  const marketingLead = trpc.contracting.contracts.getMarketingLead.useQuery(
    { leadId: Number.isInteger(parsedMarketingLeadId) && parsedMarketingLeadId > 0 ? parsedMarketingLeadId : 1 },
    { enabled: clientOrigin === "marketing" && Number.isInteger(parsedMarketingLeadId) && parsedMarketingLeadId > 0, retry: false },
  );

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
  const contractCurrency = isSpain ? "EUR" : currency;
  const hasValidFamilyMembers = Number.isInteger(familyMembers) && Number(familyMembers) >= 1;
  const originalValue = isSpain
    ? (hasValidFamilyMembers ? getSpainValue(Number(familyMembers)) : 0)
    : Number(contractValueOverride === "" ? 0 : contractValueOverride);
  // Keep this UI-only calculation in cents, matching backend rounding without a server import.
  const originalCents = Math.round((originalValue + Number.EPSILON) * 100);
  const originalValueError = !Number.isFinite(originalValue) || originalValue < 0 || !Number.isSafeInteger(originalCents)
    ? "Contract value must be a finite, non-negative amount within the supported range."
    : null;
  const parsedDiscount = discountValue === "" ? 0 : Number(discountValue);
  const discountCents = Math.round(parsedDiscount * 100);
  const discountError = !Number.isFinite(parsedDiscount) || parsedDiscount < 0
    ? "Discount must be a finite, non-negative amount."
    : discountValue !== "" && (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(discountValue) || Number(parsedDiscount.toFixed(2)) !== parsedDiscount)
      ? "Enter a discount with at most two decimal places."
      : !Number.isSafeInteger(discountCents) || (!originalValueError && discountCents > originalCents)
        ? "Discount cannot exceed the original contract value."
        : null;
  const pricingError = originalValueError || discountError;
  const netValue = pricingError ? null : (originalCents - discountCents) / 100;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (createMutation.isPending) return;
    if (pricingError) {
      toast.error(pricingError);
      return;
    }
    if (!clientName.trim() || !invoicingName.trim() || !clientMobile.trim() || !hasValidFamilyMembers || !consultantName || !country) return;
    if (!clientOrigin) {
      toast.error("Choose whether the client is Referral or Marketing");
      return;
    }
    if (clientOrigin === "marketing" && (!Number.isInteger(parsedMarketingLeadId) || parsedMarketingLeadId <= 0 || !marketingLead.data || marketingLead.data.linkedContract)) {
      toast.error(marketingLead.data?.linkedContract ? "This Lead is already linked to an active Contract" : "Enter and verify a valid Marketing Lead ID");
      return;
    }
    createMutation.mutate({
      clientName: clientName.trim(),
      invoicingName: invoicingName.trim(),
      clientMobile: clientMobile.trim(),
      familyMembers: Number(familyMembers),
      consultantName: consultantName || undefined,
      clientOrigin,
      marketingLeadId: clientOrigin === "marketing" ? parsedMarketingLeadId : null,
      country,
      contractValueOverride: !isSpain && contractValueOverride !== "" ? Number(contractValueOverride) : undefined,
      currency: contractCurrency,
      discountValue: discountValue === "" ? undefined : parsedDiscount,
    });
  };

  const handleClose = () => {
    setCountry("spain");
    setClientName("");
    setInvoicingName("");
    setClientMobile("");
    setFamilyMembers("");
    setConsultantName("");
    setClientOrigin("");
    setMarketingLeadId("");
    setContractValueOverride("");
    setCurrency("EUR");
    setDiscountValue("");
    setResult(null);
    createMutation.reset();
    onClose();
  };

  const isFormValid =
    clientName.trim() &&
    invoicingName.trim() &&
    clientMobile.trim() &&
    hasValidFamilyMembers &&
    consultantName &&
    country &&
    !pricingError &&
    clientOrigin &&
    (clientOrigin === "referral" || (Number.isInteger(parsedMarketingLeadId) && parsedMarketingLeadId > 0 && Boolean(marketingLead.data) && !marketingLead.data?.linkedContract));

  const selectedCountryLabel = countries?.find((c) => c.key === country)?.label ?? country;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) handleClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[85dvh] min-w-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
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

            <form onSubmit={handleSubmit} className="min-w-0 space-y-4 py-2">
              {/* Country / Program selector */}
              <div className="space-y-2">
                <Label htmlFor="programCountry" className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5" />
                  Program Country
                </Label>
                <Select value={country} onValueChange={(v) => { setCountry(v); setContractValueOverride(""); setDiscountValue(""); if (v === "spain") setCurrency("EUR"); }} disabled={createMutation.isPending}>
                  <SelectTrigger id="programCountry" className="h-10 w-full min-w-0 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
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
                <Label htmlFor="clientName" className="flex flex-wrap items-center gap-2">
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
                <Label htmlFor="invoicingName" className="flex flex-wrap items-center gap-2">
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
                <Label htmlFor="consultantName" className="flex items-center gap-2">
                  <UserCheck className="h-3.5 w-3.5" />
                  Consultant
                </Label>
                <Select value={consultantName} onValueChange={setConsultantName} disabled={createMutation.isPending || consultantsLoading}>
                  <SelectTrigger id="consultantName" className="h-10 w-full min-w-0 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                    <SelectValue placeholder={consultantsLoading ? "Loading consultants..." : "Select consultant..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {consultants.map((consultant) => (
                      <SelectItem key={consultant.id} value={consultant.name}>{consultant.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!consultantsLoading && consultants.length === 0 && (
                  <p className="text-xs text-destructive">Add an active employee with the Consultant position before issuing a contract.</p>
                )}
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <Label htmlFor="clientOrigin">Is this client Referral or from Marketing?</Label>
                <Select value={clientOrigin} onValueChange={(value) => { setClientOrigin(value as "referral" | "marketing"); if (value === "referral") setMarketingLeadId(""); }} disabled={createMutation.isPending}>
                  <SelectTrigger id="clientOrigin" className="h-10 w-full min-w-0 bg-white"><SelectValue placeholder="Choose Referral or Marketing" /></SelectTrigger>
                  <SelectContent><SelectItem value="referral">Referral</SelectItem><SelectItem value="marketing">Marketing</SelectItem></SelectContent>
                </Select>
                {clientOrigin === "marketing" ? <div className="space-y-2">
                  <Label htmlFor="marketingLeadId">Lead Number ID</Label>
                  <Input id="marketingLeadId" type="number" min={1} inputMode="numeric" placeholder="Enter the Lead ID from the Leads module" value={marketingLeadId} onChange={event => setMarketingLeadId(event.target.value.replace(/[^0-9]/g, ""))} disabled={createMutation.isPending} />
                  {marketingLead.isFetching ? <p className="text-xs text-slate-500">Checking the Leads module…</p> : marketingLead.isError ? <p className="text-xs font-medium text-red-600">{marketingLead.error.message}</p> : marketingLead.data ? <div className={`rounded-lg border px-3 py-2 text-xs ${marketingLead.data.linkedContract ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}><p className="font-semibold">Lead #{marketingLead.data.id} · {marketingLead.data.fullName}</p><p>Current stage: {marketingLead.data.stage}{marketingLead.data.assignedTo ? ` · Assigned to ${marketingLead.data.assignedTo}` : ""}</p>{marketingLead.data.linkedContract ? <p className="mt-1 font-semibold">Already linked to active Contract {marketingLead.data.linkedContract.contractCode}</p> : <p className="mt-1">Creating this pending Contract links the Lead only. The Lead becomes a Client when this Contract is marked Signed.</p>}</div> : <p className="text-xs text-slate-500">The Lead must be verified before the Contract can be created.</p>}
                </div> : null}
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
              {!isSpain && (
                <div className="space-y-2">
                  <Label htmlFor="contractValueOverride" className="flex flex-wrap items-center gap-2">
                    <Receipt className="h-3.5 w-3.5" />
                    Original Contract Value
                    <span className="text-xs text-muted-foreground font-normal">(optional — leave blank if not yet agreed)</span>
                  </Label>
                  <div className="flex min-w-0 gap-2">
                    <Input
                      id="contractValueOverride"
                      type="number"
                      min={0}
                      step="any"
                      placeholder="e.g. 50000"
                      value={contractValueOverride}
                      onChange={(e) => setContractValueOverride(e.target.value ? Number(e.target.value) : "")}
                      disabled={createMutation.isPending}
                      aria-invalid={Boolean(originalValueError)}
                      aria-describedby={originalValueError ? "contractValueError" : undefined}
                      className="h-10 min-w-0 flex-1"
                    />
                    <Select value={currency} onValueChange={(v) => setCurrency(v as "EUR" | "USD")} disabled={createMutation.isPending}>
                      <SelectTrigger aria-label="Contract currency" className="h-10 w-24 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EUR">€ EUR</SelectItem>
                        <SelectItem value="USD">$ USD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {originalValueError && (
                    <p id="contractValueError" role="alert" className="text-xs text-destructive">
                      {originalValueError}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="discountValue">Discount ({contractCurrency}) <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="discountValue"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 2000.00"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  disabled={createMutation.isPending}
                  aria-invalid={Boolean(discountError)}
                  aria-describedby={`discountHelp${discountError ? " discountError" : ""}`}
                  className="h-10"
                />
                <p id="discountHelp" className="text-xs text-muted-foreground">One-time discount in {contractCurrency}. Leave blank for no discount. This permanently reduces the contract value.</p>
                {discountError && <p id="discountError" role="alert" className="text-xs text-destructive">{discountError}</p>}
              </div>

              <div role="status" aria-live="polite" aria-atomic="true" className="min-w-0 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <dl className="space-y-2">
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                    <dt>Original Contract Value</dt>
                    <dd className="break-all font-medium">{originalValueError ? "—" : isSpain && !hasValidFamilyMembers ? "Choose family size" : formatCurrency(originalCents / 100, contractCurrency)}</dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                    <dt>Discount</dt>
                    <dd className="break-all font-medium">{discountError ? "—" : formatCurrency(parsedDiscount, contractCurrency)}</dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-t border-amber-200 pt-2 font-bold">
                    <dt>Net Contract Value</dt>
                    <dd className="break-all">{netValue === null || (isSpain && !hasValidFamilyMembers) ? "—" : formatCurrency(netValue, contractCurrency)}</dd>
                  </div>
                </dl>
                {isSpain && hasValidFamilyMembers && <p className="mt-2 text-xs text-amber-700">Based on {familyMembers} family member{Number(familyMembers) > 1 ? "s" : ""}; Spain contracts use EUR.</p>}
                <p className="mt-2 text-xs text-amber-700">The net amount will be recorded as the contract value.</p>
              </div>

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
