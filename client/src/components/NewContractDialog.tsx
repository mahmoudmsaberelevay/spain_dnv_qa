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
import { Loader2, Download, CheckCircle, Users, User, FileText, Phone, Receipt, UserCheck } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CONSULTANTS = [
  "Ziad El Shurafa",
  "Mahmoud Saber",
  "Fouad Abdo",
  "Kirolos Nabil",
];

interface Props {
  open: boolean;
  onClose: () => void;
}

function getContractValue(members: number): number {
  if (members === 1) return 12000;
  if (members === 2) return 13000;
  if (members <= 4) return 14000;
  return 15000;
}

export default function NewContractDialog({ open, onClose }: Props) {
  const [clientName, setClientName] = useState("");
  const [invoicingName, setInvoicingName] = useState("");
  const [clientMobile, setClientMobile] = useState("");
  const [familyMembers, setFamilyMembers] = useState<number | "">("");
  const [consultantName, setConsultantName] = useState("");
  const [result, setResult] = useState<{ contractCode: string; docUrl: string; filename: string } | null>(null);

  const utils = trpc.useUtils();

  const createMutation = trpc.contracting.contracts.create.useMutation({
    onSuccess: (data) => {
      setResult({
        contractCode: data.contract!.contractCode,
        docUrl: data.docUrl,
        filename: data.filename,
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !invoicingName.trim() || !clientMobile.trim() || !familyMembers) return;
    createMutation.mutate({
      clientName: clientName.trim(),
      invoicingName: invoicingName.trim(),
      clientMobile: clientMobile.trim(),
      familyMembers: Number(familyMembers),
      consultantName: consultantName || undefined,
    });
  };

  const handleClose = () => {
    setClientName("");
    setInvoicingName("");
    setClientMobile("");
    setFamilyMembers("");
    setConsultantName("");
    setResult(null);
    createMutation.reset();
    onClose();
  };

  const previewValue = familyMembers ? getContractValue(Number(familyMembers)) : null;
  const isFormValid = clientName.trim() && invoicingName.trim() && clientMobile.trim() && familyMembers && consultantName;

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
                Fill in the client details to generate a new contract document.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              {/* Client Full Name (Arabic allowed — used in contract Word doc) */}
              <div className="space-y-2">
                <Label htmlFor="clientName" className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5" />
                  Client Full Name
                </Label>
                <Input
                  id="clientName"
                  placeholder="e.g. أحمد محمد حسن"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  required
                  disabled={createMutation.isPending}
                  className="h-10"
                />
              </div>

              {/* Invoicing Name (English only — used in receipt BILL TO) */}
              <div className="space-y-2">
                <Label htmlFor="invoicingName" className="flex items-center gap-2">
                  <Receipt className="h-3.5 w-3.5" />
                  Name for Invoicing
                  <span className="text-xs text-muted-foreground font-normal">(English only — appears on receipts)</span>
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

              {previewValue !== null && (
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
