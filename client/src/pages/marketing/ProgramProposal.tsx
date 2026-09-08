import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Send, Loader2, Download, Info, DollarSign, Users, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const PROGRAMS = [
  { key: "dominica", label: "Dominica", flag: "🇩🇲", hasRealEstate: true },
  { key: "grenada", label: "Grenada", flag: "🇬🇩", hasRealEstate: true },
  { key: "egypt", label: "Egypt", flag: "🇪🇬", hasRealEstate: true },
  { key: "st_kitts", label: "Saint Kitts & Nevis", flag: "🇰🇳", hasRealEstate: true },
  { key: "st_lucia", label: "Saint Lucia", flag: "🇱🇨", hasRealEstate: true },
  { key: "antigua", label: "Antigua & Barbuda", flag: "🇦🇬", hasRealEstate: true },
  { key: "sao_tome", label: "São Tomé & Príncipe", flag: "🇸🇹", hasRealEstate: false },
];

type ProposalResult = {
  country: string;
  investmentType: string;
  familyMembers: number;
  breakdown: {
    investmentCost: number;
    governmentFee: number;
    dueDiligenceFee: number;
    processingFee: number;
    otherFees: number;
    totalCost: number;
    notes: string[];
  };
  programSummary: string;
  recommendation: string;
  generationMode?: "ai" | "standard";
  generatedAt: string;
};

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US");
}

export default function ProgramProposal() {
  const [programKey, setProgramKey] = useState("");
  const [investmentType, setInvestmentType] = useState<"donation" | "real_estate">("donation");
  const [familyMembers, setFamilyMembers] = useState(1);
  const [result, setResult] = useState<ProposalResult | null>(null);

  const proposalMutation = trpc.marketing.generateProposal.useMutation({
    onSuccess: (data) => setResult(data as ProposalResult),
    onError: (err) => toast.error("Failed: " + err.message),
  });

  const selectedProgram = PROGRAMS.find((p) => p.key === programKey);

  const handleGenerate = () => {
    if (!programKey) { toast.error("Please select a country"); return; }
    setResult(null);
    proposalMutation.mutate({ programKey, investmentType, familyMembers });
  };

  const handleExportPdf = () => {
    if (!result) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const prog = PROGRAMS.find((p) => p.key === programKey);
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>ELEVAY Program Proposal - ${result.country}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;background:#fff;color:#1a3a5c;padding:40px}
.header{display:flex;align-items:center;gap:16px;margin-bottom:32px;border-bottom:3px solid #5ba3b8;padding-bottom:16px}
.logo-text{font-size:28px;font-weight:700;color:#1a3a5c;letter-spacing:2px}
.logo-sub{font-size:11px;color:#5ba3b8;letter-spacing:3px}
h1{font-size:22px;font-weight:700;color:#1a3a5c;margin-bottom:4px}
.subtitle{font-size:13px;color:#5ba3b8;margin-bottom:24px}
.section{margin-bottom:28px}
.section-title{font-size:14px;font-weight:700;color:#1a3a5c;border-bottom:2px solid #5ba3b8;padding-bottom:6px;margin-bottom:14px}
.cost-table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px}
.cost-table td{padding:8px 12px;border-bottom:1px solid #e8f0f5}
.cost-table tr:nth-child(even) td{background:#f5f9fb}
.total td{background:#1a3a5c;color:#fff;font-weight:700;font-size:15px}
.note{font-size:11px;color:#888;margin-top:4px;padding-left:4px}
.text-block{font-size:13px;line-height:1.7;color:#333;margin-bottom:10px}
.badge{display:inline-block;background:#5ba3b8;color:#fff;font-size:11px;padding:2px 8px;border-radius:12px;margin-bottom:8px}
.footer{font-size:11px;color:#aaa;margin-top:32px;border-top:1px solid #e8f0f5;padding-top:12px}
@media print{body{padding:20px}}
</style></head><body>
<div class="header"><div><div class="logo-text">ELEVAY</div><div class="logo-sub">CITIZENSHIP &amp; RESIDENCY</div></div></div>
<h1>${prog?.flag || ""} ${result.country} Citizenship - Program Proposal</h1>
<div class="subtitle">${result.investmentType === "donation" ? "Donation / Contribution Route" : "Real Estate Investment Route"} | ${result.familyMembers} Family Member${result.familyMembers > 1 ? "s" : ""} | Generated: ${new Date(result.generatedAt).toLocaleDateString()}</div>
<div class="section">
<div class="section-title">Cost Breakdown</div>
<table class="cost-table">
<tr><td>Investment / Contribution</td><td style="text-align:right;font-weight:600">${fmt(result.breakdown.investmentCost)}</td></tr>
<tr><td>Government Fees</td><td style="text-align:right">${fmt(result.breakdown.governmentFee)}</td></tr>
<tr><td>Due Diligence Fees</td><td style="text-align:right">${fmt(result.breakdown.dueDiligenceFee)}</td></tr>
<tr><td>Processing Fees</td><td style="text-align:right">${fmt(result.breakdown.processingFee)}</td></tr>
<tr class="total"><td>Total Estimated Cost</td><td style="text-align:right">${fmt(result.breakdown.totalCost)}</td></tr>
</table>
${result.breakdown.notes.map((n) => `<div class="note">* ${n}</div>`).join("")}
</div>
<div class="section">
<div class="section-title">Program Overview</div>
${result.programSummary.split("\n\n").map((p) => `<p class="text-block">${p}</p>`).join("")}
</div>
<div class="section">
<div class="section-title">ELEVAY Recommendation</div>
<div class="badge">AI-Powered Analysis</div>
${result.recommendation.split("\n\n").map((p) => `<p class="text-block">${p}</p>`).join("")}
</div>
<div class="footer">This proposal is prepared by ELEVAY Citizenship &amp; Residency. All costs are estimates and subject to change. Legal fees and ELEVAY service fees are not included. Contact your ELEVAY consultant for a complete quote.</div>
</body></html>`;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-900/40 flex items-center justify-center">
            <Send className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Program Proposal</h1>
            <p className="text-sm text-gray-400">AI-generated cost breakdown and proposal for citizenship programs</p>
          </div>
        </div>
        {result && (
          <Button onClick={handleExportPdf} variant="outline" size="sm" className="gap-2 border-teal-600 text-teal-400 hover:bg-teal-900/30">
            <Download className="w-4 h-4" />Export PDF
          </Button>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-5">Configure Proposal</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-2">
              <Globe className="w-3.5 h-3.5" />Country
            </label>
            <select
              value={programKey}
              onChange={(e) => {
                const nextProgram = PROGRAMS.find((program) => program.key === e.target.value);
                setProgramKey(e.target.value);
                if (nextProgram && !nextProgram.hasRealEstate) setInvestmentType("donation");
                setResult(null);
              }}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
            >
              <option value="">Select country...</option>
              {PROGRAMS.map((p) => (
                <option key={p.key} value={p.key}>{p.flag} {p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-2">
              <DollarSign className="w-3.5 h-3.5" />Type of Investment
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setInvestmentType("donation")}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${investmentType === "donation" ? "bg-teal-900/40 border-teal-500 text-teal-300" : "bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500"}`}
              >Donation</button>
              <button
                onClick={() => setInvestmentType("real_estate")}
                disabled={selectedProgram ? !selectedProgram.hasRealEstate : false}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${investmentType === "real_estate" ? "bg-teal-900/40 border-teal-500 text-teal-300" : "bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500"}`}
              >Real Estate</button>
            </div>
            {selectedProgram && !selectedProgram.hasRealEstate && (
              <p className="text-xs text-amber-400 mt-1">Real estate not available for {selectedProgram.label}</p>
            )}
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-2">
              <Users className="w-3.5 h-3.5" />Number of Family Members
            </label>
            <div className="flex items-center gap-3">
              <button onClick={() => setFamilyMembers((n) => Math.max(1, n - 1))}
                className="w-9 h-9 rounded-lg bg-gray-800 border border-gray-600 text-white text-lg font-bold hover:bg-gray-700 transition-colors">−</button>
              <span className="text-2xl font-bold text-white w-8 text-center">{familyMembers}</span>
              <button onClick={() => setFamilyMembers((n) => Math.min(20, n + 1))}
                className="w-9 h-9 rounded-lg bg-gray-800 border border-gray-600 text-white text-lg font-bold hover:bg-gray-700 transition-colors">+</button>
              <span className="text-xs text-gray-500 ml-1">
                {familyMembers === 1 ? "Main applicant only" : "Main + " + (familyMembers - 1) + " dependent" + (familyMembers > 2 ? "s" : "")}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <Button onClick={handleGenerate} disabled={!programKey || proposalMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700 text-white gap-2">
            {proposalMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" />Generating Proposal...</>
              : <><Send className="w-4 h-4" />Generate Proposal</>}
          </Button>
        </div>
      </div>

      {proposalMutation.isPending && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
          <p className="text-gray-400 text-sm">AI is calculating costs and generating your proposal...</p>
        </div>
      )}

      {result && !proposalMutation.isPending && (
        <div className="space-y-5">
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-700 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-teal-400" />
              <h2 className="text-sm font-semibold text-white">Cost Breakdown</h2>
              <span className="ml-auto text-xs text-gray-500">
                {result.investmentType === "donation" ? "Donation Route" : "Real Estate Route"} · {result.familyMembers} member{result.familyMembers > 1 ? "s" : ""}
              </span>
            </div>
            <div className="p-5">
              <div className="space-y-2">
                {[
                  { label: "Investment / Contribution", value: result.breakdown.investmentCost, bold: true },
                  { label: "Government Fees", value: result.breakdown.governmentFee },
                  { label: "Due Diligence Fees", value: result.breakdown.dueDiligenceFee },
                  { label: "Processing Fees", value: result.breakdown.processingFee },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-2 border-b border-gray-800">
                    <span className={`text-sm ${row.bold ? "font-semibold text-white" : "text-gray-400"}`}>{row.label}</span>
                    <span className={`text-sm font-mono ${row.bold ? "font-bold text-white" : "text-gray-300"}`}>{fmt(row.value)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between py-3 mt-2 bg-teal-900/30 rounded-lg px-3">
                  <span className="text-base font-bold text-white">Total Estimated Cost</span>
                  <span className="text-xl font-bold text-teal-300 font-mono">{fmt(result.breakdown.totalCost)}</span>
                </div>
              </div>
              {result.breakdown.notes.length > 0 && (
                <div className="mt-4 space-y-1">
                  {result.breakdown.notes.map((note, i) => (
                    <p key={i} className="text-xs text-amber-400/80">* {note}</p>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-4 h-4 text-teal-400" />
              <h2 className="text-sm font-semibold text-white">Program Overview</h2>
            </div>
            <div className="space-y-3">
              {result.programSummary.split("\n\n").filter(Boolean).map((para, i) => (
                <p key={i} className="text-gray-300 text-sm leading-relaxed">{para}</p>
              ))}
            </div>
          </div>

          <div className="bg-gray-900 border border-purple-700/40 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-semibold text-white">ELEVAY Recommendation</h2>
              <Badge variant="outline" className="ml-auto text-xs border-purple-700 text-purple-400">
                {result.generationMode === "standard" ? "Standard Proposal" : "AI Generated"}
              </Badge>
            </div>
            <div className="space-y-3">
              {result.recommendation.split("\n\n").filter(Boolean).map((para, i) => (
                <p key={i} className="text-gray-300 text-sm leading-relaxed">{para}</p>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-4">Generated: {new Date(result.generatedAt).toLocaleString()}</p>
          </div>
        </div>
      )}

      {!result && !proposalMutation.isPending && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Send className="w-12 h-12 text-gray-600 mb-4" />
          <p className="text-gray-400 text-sm">Select a country, investment type, and number of family members, then click Generate Proposal.</p>
        </div>
      )}
    </div>
  );
}
