import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Calculator, CheckCircle2, Download, Globe, Info, Loader2, Route, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MARKETING_PROPOSAL_PROGRAMS,
  defaultProposalCriteria,
  visibleProposalCriteria,
  type ProposalCriterion,
  type ProposalCriterionValue,
} from "../../../../shared/marketingProposalCatalog";

type ProposalResult = {
  country: string;
  programName: string;
  programType: "Citizenship" | "Residency";
  currency: "USD" | "EUR";
  sourceLabel: string;
  routeLabel: string;
  investmentType: string;
  familyMembers: number;
  criteriaSnapshot: Array<{ label: string; value: ProposalCriterionValue }>;
  lineItems: Array<{ key: string; label: string; category: string; amount: number | null; includedInTotal: boolean; formula: string }>;
  totalKnownCost: number;
  quoteStatus: "complete" | "partial" | "not_calculable";
  assumptions: string[];
  unresolvedCosts: string[];
  programSummary: string;
  recommendation: string;
  generationMode: "ai" | "standard";
  generatedAt: string;
};

const currencySymbol = (currency: "USD" | "EUR") => currency === "EUR" ? "€" : "$";
const fmt = (currency: "USD" | "EUR", value: number | null) => value == null
  ? "Confirmation required"
  : `${currencySymbol(currency)}${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const displayValue = (value: ProposalCriterionValue) => typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

export default function ProgramProposal() {
  const [programKey, setProgramKey] = useState("");
  const [routeKey, setRouteKey] = useState("");
  const [criteria, setCriteria] = useState<Record<string, ProposalCriterionValue>>({});
  const [result, setResult] = useState<ProposalResult | null>(null);
  const selectedProgram = useMemo(() => MARKETING_PROPOSAL_PROGRAMS.find((program) => program.key === programKey), [programKey]);
  const selectedRoute = selectedProgram?.routes.find((route) => route.key === routeKey);
  const activeCriteria = selectedProgram ? visibleProposalCriteria(selectedProgram, routeKey) : [];

  const proposalMutation = trpc.marketing.generateProposal.useMutation({
    onSuccess: (data) => setResult(data as ProposalResult),
    onError: (error) => toast.error(error.message || "The proposal could not be generated"),
  });

  const chooseProgram = (nextKey: string) => {
    const program = MARKETING_PROPOSAL_PROGRAMS.find((entry) => entry.key === nextKey);
    setProgramKey(nextKey);
    setRouteKey(program?.routes[0]?.key ?? "");
    setCriteria(program ? defaultProposalCriteria(program) : {});
    setResult(null);
  };

  const updateCriterion = (definition: ProposalCriterion, value: ProposalCriterionValue) => {
    setCriteria((current) => ({ ...current, [definition.key]: value }));
    setResult(null);
  };

  const handleGenerate = () => {
    if (!selectedProgram || !selectedRoute) {
      toast.error("Select a programme and investment route");
      return;
    }
    setResult(null);
    proposalMutation.mutate({ programKey: selectedProgram.key, routeKey: selectedRoute.key, criteria });
  };

  const handleExportPdf = () => {
    if (!result) return;
    const win = window.open("", "_blank");
    if (!win) {
      toast.error("Allow pop-ups to export the proposal PDF");
      return;
    }
    const rows = result.lineItems.map((line) => `
      <tr class="${line.includedInTotal ? "" : "excluded"}">
        <td><strong>${escapeHtml(line.label)}</strong><small>${escapeHtml(line.formula)}</small></td>
        <td>${escapeHtml(line.category)}</td>
        <td>${escapeHtml(fmt(result.currency, line.amount))}</td>
        <td>${line.includedInTotal ? "Included" : "Excluded"}</td>
      </tr>`).join("");
    const criteriaRows = result.criteriaSnapshot.map((entry) => `<tr><td>${escapeHtml(entry.label)}</td><td>${escapeHtml(displayValue(entry.value))}</td></tr>`).join("");
    const notes = [...result.assumptions, ...result.unresolvedCosts].map((note) => `<li>${escapeHtml(note)}</li>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>ELEVAY Proposal - ${escapeHtml(result.country)}</title><style>
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1a3a5c;margin:0;padding:38px;background:#fff}.header{border-bottom:3px solid #5ba3b8;padding-bottom:14px;margin-bottom:24px}.brand{font-size:28px;font-weight:700;letter-spacing:2px}.tag{font-size:10px;color:#5ba3b8;letter-spacing:3px}.meta{color:#5ba3b8;font-size:12px;margin-top:6px}.section{margin-top:24px}.section h2{font-size:15px;border-bottom:2px solid #5ba3b8;padding-bottom:6px}.status{display:inline-block;padding:4px 9px;border-radius:12px;background:#e8f3f6;font-size:11px}table{width:100%;border-collapse:collapse;font-size:12px}td{padding:8px;border-bottom:1px solid #e4edf1;vertical-align:top}td:nth-child(n+2){text-align:right}small{display:block;color:#6a7d8d;margin-top:3px}.excluded{color:#986b19;background:#fff9eb}.total td{background:#1a3a5c;color:#fff;font-size:15px;font-weight:700}.copy{font-size:13px;line-height:1.65;color:#2c3944}li{font-size:11px;line-height:1.5;margin-bottom:5px}.footer{border-top:1px solid #d9e4e9;margin-top:30px;padding-top:12px;color:#71808a;font-size:10px}@media print{body{padding:20px}}
    </style></head><body>
      <div class="header"><div class="brand">ELEVAY</div><div class="tag">CITIZENSHIP &amp; RESIDENCY</div></div>
      <h1>${escapeHtml(result.programName)}</h1><div class="meta">${escapeHtml(result.routeLabel)} · ${result.familyMembers} applicant${result.familyMembers === 1 ? "" : "s"} · ${escapeHtml(new Date(result.generatedAt).toLocaleDateString())}</div>
      <div class="section"><span class="status">${escapeHtml(result.quoteStatus.replaceAll("_", " ").toUpperCase())}</span><h2>Selected Criteria</h2><table>${criteriaRows}</table></div>
      <div class="section"><h2>Itemized Cost Breakdown</h2><table>${rows}<tr class="total"><td colspan="2">Total Known One-Time Cost</td><td>${escapeHtml(fmt(result.currency, result.totalKnownCost))}</td><td></td></tr></table></div>
      ${notes ? `<div class="section"><h2>Assumptions and Costs Requiring Confirmation</h2><ul>${notes}</ul></div>` : ""}
      <div class="section"><h2>Programme Overview</h2><div class="copy">${escapeHtml(result.programSummary)}</div></div>
      <div class="section"><h2>ELEVAY Recommendation</h2><div class="copy">${escapeHtml(result.recommendation)}</div></div>
      <div class="footer">Source supplied to ELEVAY: ${escapeHtml(result.sourceLabel)}. Calculable amounts are separated from recurring, optional, ambiguous, and request-only costs. Fees remain subject to confirmation and approval is never guaranteed.</div>
    </body></html>`;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-900/40"><Send className="h-5 w-5 text-purple-400" /></div>
          <div><h1 className="text-xl font-bold text-white">Program Proposal</h1><p className="text-sm text-gray-400">Source-based citizenship and Residency cost calculation</p></div>
        </div>
        {result && <Button onClick={handleExportPdf} variant="outline" size="sm" className="gap-2 border-teal-600 text-teal-400 hover:bg-teal-900/30"><Download className="h-4 w-4" />Export PDF</Button>}
      </div>

      <div className="mb-6 rounded-xl border border-gray-700 bg-gray-900 p-4 sm:p-5">
        <h2 className="mb-5 text-sm font-semibold text-gray-300">Configure Proposal</h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <SelectField label="Programme" icon={<Globe className="h-3.5 w-3.5" />} value={programKey} onChange={chooseProgram}>
            <option value="">Select programme...</option>
            {MARKETING_PROPOSAL_PROGRAMS.map((program) => <option key={program.key} value={program.key}>{program.flag} {program.shortLabel} — {program.programType}</option>)}
          </SelectField>
          <SelectField label="Investment route" icon={<Route className="h-3.5 w-3.5" />} value={routeKey} onChange={(value) => { setRouteKey(value); setResult(null); }} disabled={!selectedProgram}>
            {selectedProgram?.routes.map((route) => <option key={route.key} value={route.key}>{route.label} · {route.minimumLabel}</option>)}
          </SelectField>
        </div>

        {selectedProgram && selectedRoute && (
          <>
            <div className="mt-5 flex flex-wrap gap-2"><Badge className="bg-teal-900/40 text-teal-300">{selectedProgram.programType}</Badge><Badge variant="outline" className="border-gray-600 text-gray-300">Currency: {selectedProgram.currency}</Badge><Badge variant="outline" className="border-gray-600 text-gray-300">Source: {selectedProgram.sourceLabel}</Badge></div>
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activeCriteria.map((definition) => <CriterionField key={definition.key} definition={definition} value={criteria[definition.key] ?? definition.defaultValue} onChange={(value) => updateCriterion(definition, value)} />)}
            </div>
            {selectedRoute.rules.length > 0 && <div className="mt-4 rounded-lg border border-amber-800/50 bg-amber-950/20 p-3">{selectedRoute.rules.map((rule) => <p key={rule} className="text-xs text-amber-300">{rule}</p>)}</div>}
          </>
        )}

        <Button onClick={handleGenerate} disabled={!selectedProgram || !selectedRoute || proposalMutation.isPending} className="mt-5 gap-2 bg-purple-600 text-white hover:bg-purple-700">
          {proposalMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Calculating and preparing proposal...</> : <><Calculator className="h-4 w-4" />Generate Proposal</>}
        </Button>
      </div>

      {proposalMutation.isPending && <div className="flex flex-col items-center justify-center gap-4 py-16"><Loader2 className="h-10 w-10 animate-spin text-purple-400" /><p className="text-sm text-gray-400">Calculating source-supported costs and preparing the proposal...</p></div>}

      {result && !proposalMutation.isPending && (
        <div className="space-y-5">
          <div className="rounded-xl border border-gray-700 bg-gray-900">
            <div className="flex flex-col gap-2 border-b border-gray-700 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
              <div className="flex items-center gap-2"><Calculator className="h-4 w-4 text-teal-400" /><h2 className="text-sm font-semibold text-white">Itemized Cost Breakdown</h2></div>
              <QuoteStatus status={result.quoteStatus} />
            </div>
            <div className="space-y-2 p-4 sm:p-5">
              {result.lineItems.map((line) => (
                <div key={line.key} className={`grid grid-cols-[1fr_auto] gap-3 rounded-lg border p-3 ${line.includedInTotal ? "border-gray-800 bg-gray-950/30" : "border-amber-800/40 bg-amber-950/15"}`}>
                  <div><p className="text-sm font-medium text-white">{line.label}</p><p className="mt-1 text-xs text-gray-500">{line.formula}</p><p className="mt-1 text-[11px] uppercase tracking-wide text-gray-600">{line.category} · {line.includedInTotal ? "Included" : "Not included"}</p></div>
                  <span className={`self-center text-right font-mono text-sm font-semibold ${line.amount == null ? "text-amber-300" : "text-gray-200"}`}>{fmt(result.currency, line.amount)}</span>
                </div>
              ))}
              <div className="mt-3 flex items-center justify-between rounded-lg bg-teal-900/30 px-3 py-4"><span className="font-bold text-white">Total Known One-Time Cost</span><span className="font-mono text-xl font-bold text-teal-300">{fmt(result.currency, result.totalKnownCost)}</span></div>
            </div>
          </div>

          {(result.assumptions.length > 0 || result.unresolvedCosts.length > 0) && (
            <div className="rounded-xl border border-amber-800/50 bg-amber-950/15 p-5">
              <div className="mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /><h2 className="text-sm font-semibold text-white">Assumptions and Costs Requiring Confirmation</h2></div>
              <div className="space-y-2">{[...result.assumptions, ...result.unresolvedCosts].map((note) => <p key={note} className="text-xs leading-5 text-amber-200/80">• {note}</p>)}</div>
            </div>
          )}

          <TextPanel icon={<Globe className="h-4 w-4 text-teal-400" />} title="Programme Overview" text={result.programSummary} />
          <TextPanel icon={<Info className="h-4 w-4 text-purple-400" />} title="ELEVAY Recommendation" text={result.recommendation} badge={result.generationMode === "standard" ? "Standard Proposal" : "AI Narrative"} />
        </div>
      )}

      {!result && !proposalMutation.isPending && <div className="flex flex-col items-center justify-center py-14 text-center"><Send className="mb-4 h-12 w-12 text-gray-600" /><p className="max-w-lg text-sm text-gray-400">Select a programme and route, enter every applicable family and investment criterion, then generate an itemized proposal.</p></div>}
    </div>
  );
}

function SelectField({ label, icon, value, onChange, disabled, children }: { label: string; icon: React.ReactNode; value: string; onChange: (value: string) => void; disabled?: boolean; children: React.ReactNode }) {
  return <div><label className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-400">{icon}{label}</label><select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none disabled:opacity-40">{children}</select></div>;
}

function CriterionField({ definition, value, onChange }: { definition: ProposalCriterion; value: ProposalCriterionValue; onChange: (value: ProposalCriterionValue) => void }) {
  if (definition.type === "boolean") {
    return <label className="flex min-h-24 cursor-pointer items-start gap-3 rounded-lg border border-gray-700 bg-gray-800/60 p-3"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 accent-teal-500" /><span><span className="block text-sm font-medium text-white">{definition.label}</span>{definition.helpText && <span className="mt-1 block text-xs leading-4 text-gray-500">{definition.helpText}</span>}</span></label>;
  }
  if (definition.type === "select") {
    return <div><label className="mb-2 block text-xs font-medium text-gray-400">{definition.label}</label><select value={String(value)} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white">{definition.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{definition.helpText && <p className="mt-1 text-xs text-gray-500">{definition.helpText}</p>}</div>;
  }
  return <div><label className="mb-2 block text-xs font-medium text-gray-400">{definition.label}</label><input type="number" value={Number(value)} min={definition.min} max={definition.max} step={definition.step ?? 1} onChange={(event) => onChange(Number(event.target.value))} className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none" />{definition.helpText && <p className="mt-1 text-xs leading-4 text-gray-500">{definition.helpText}</p>}</div>;
}

function QuoteStatus({ status }: { status: ProposalResult["quoteStatus"] }) {
  const complete = status === "complete";
  return <Badge variant="outline" className={`sm:ml-auto ${complete ? "border-emerald-700 text-emerald-400" : "border-amber-700 text-amber-400"}`}>{complete ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}{status === "complete" ? "Complete known-cost quote" : status === "partial" ? "Partial — exclusions listed" : "Price confirmation required"}</Badge>;
}

function TextPanel({ icon, title, text, badge }: { icon: React.ReactNode; title: string; text: string; badge?: string }) {
  return <div className="rounded-xl border border-gray-700 bg-gray-900 p-5"><div className="mb-4 flex items-center gap-2">{icon}<h2 className="text-sm font-semibold text-white">{title}</h2>{badge && <Badge variant="outline" className="ml-auto border-purple-700 text-xs text-purple-400">{badge}</Badge>}</div><div className="space-y-3">{text.split("\n\n").filter(Boolean).map((paragraph) => <p key={paragraph} className="text-sm leading-relaxed text-gray-300">{paragraph}</p>)}</div></div>;
}
