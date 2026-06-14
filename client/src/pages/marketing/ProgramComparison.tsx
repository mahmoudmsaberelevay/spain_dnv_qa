import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { BarChart2, Loader2, Download, CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const PROGRAMS = [
  { key: "dominica", label: "Dominica", flag: "🇩🇲" },
  { key: "grenada", label: "Grenada", flag: "🇬🇩" },
  { key: "egypt", label: "Egypt", flag: "🇪🇬" },
  { key: "st_kitts", label: "Saint Kitts & Nevis", flag: "🇰🇳" },
  { key: "st_lucia", label: "Saint Lucia", flag: "🇱🇨" },
  { key: "antigua", label: "Antigua & Barbuda", flag: "🇦🇬" },
  { key: "vanuatu", label: "Vanuatu", flag: "🇻🇺" },
  { key: "nauru", label: "Nauru", flag: "🇳🇷" },
  { key: "sao_tome", label: "São Tomé & Príncipe", flag: "🇸🇹" },
  { key: "turkey", label: "Turkey", flag: "🇹🇷" },
];

const CRITERIA_LABELS: Record<string, string> = {
  governmentCost: "Government Cost",
  processingTime: "Processing Time",
  familyIncluded: "Family Included",
  investmentType: "Investment Type",
  qualification: "Qualification",
  routeToCitizenship: "Route to Citizenship",
  routeToPR: "Route to Permanent Residency",
  renewal: "Ways to Renew",
};

type ComparisonResult = {
  programs: string[];
  comparison: Record<string, Record<string, string>>;
  summary: string;
  generatedAt: string;
};

export default function ProgramComparison() {
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<ComparisonResult | null>(null);

  const compareMutation = trpc.marketing.comparePrograms.useMutation({
    onSuccess: (data) => setResult(data as ComparisonResult),
    onError: (err) => toast.error("Comparison failed: " + err.message),
  });

  const toggleProgram = (key: string) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : prev.length < 6 ? [...prev, key] : prev
    );
  };

  const handleCompare = () => {
    if (selected.length < 2) {
      toast.error("Select at least 2 programs");
      return;
    }
    setResult(null);
    compareMutation.mutate({ programKeys: selected });
  };

  const handleExportPdf = () => {
    if (!result) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const programLabels = result.programs.map((k) => PROGRAMS.find((p) => p.key === k)?.label || k);
    const rows = Object.entries(CRITERIA_LABELS).map(([key, label]) => ({
      label,
      cells: result.programs.map((pk) => result.comparison[pk]?.[key] || "—"),
    }));
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>ELEVAY Program Comparison</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;background:#fff;color:#1a3a5c;padding:40px}
.header{display:flex;align-items:center;gap:16px;margin-bottom:32px;border-bottom:3px solid #5ba3b8;padding-bottom:16px}
.logo-text{font-size:28px;font-weight:700;color:#1a3a5c;letter-spacing:2px}
.logo-sub{font-size:11px;color:#5ba3b8;letter-spacing:3px}
h1{font-size:22px;font-weight:700;color:#1a3a5c;margin-bottom:8px}
.meta{font-size:12px;color:#888;margin-bottom:24px}
table{width:100%;border-collapse:collapse;margin-bottom:32px;font-size:12px}
th{background:#1a3a5c;color:#fff;padding:10px 12px;text-align:left;font-weight:600}
th.crit{background:#5ba3b8}
td{padding:9px 12px;border-bottom:1px solid #e8f0f5;vertical-align:top}
tr:nth-child(even) td{background:#f5f9fb}
.summary{background:#f0f7fa;border-left:4px solid #5ba3b8;padding:20px;border-radius:4px}
.summary h2{font-size:15px;font-weight:700;margin-bottom:12px;color:#1a3a5c}
.summary p{font-size:13px;line-height:1.7;color:#333;margin-bottom:10px}
@media print{body{padding:20px}}
</style></head><body>
<div class="header"><div><div class="logo-text">ELEVAY</div><div class="logo-sub">CITIZENSHIP &amp; RESIDENCY</div></div></div>
<h1>Program Comparison Report</h1>
<div class="meta">Generated: ${new Date(result.generatedAt).toLocaleString()} | Programs: ${programLabels.join(", ")}</div>
<table><thead><tr><th class="crit">Criteria</th>${programLabels.map((l) => `<th>${l}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr><td style="font-weight:600;color:#1a3a5c">${r.label}</td>${r.cells.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>
<div class="summary"><h2>ELEVAY Analysis &amp; Recommendation</h2>${result.summary.split("\n\n").map((p) => `<p>${p}</p>`).join("")}</div>
</body></html>`;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-900/40 flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Program Enhanced Comparison</h1>
            <p className="text-sm text-gray-400">Select 2–6 programs to compare across 8 criteria using AI</p>
          </div>
        </div>
        {result && (
          <Button onClick={handleExportPdf} variant="outline" size="sm" className="gap-2 border-teal-600 text-teal-400 hover:bg-teal-900/30">
            <Download className="w-4 h-4" />Export PDF
          </Button>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-300">Select Programs to Compare</h2>
          <span className="text-xs text-gray-500">{selected.length}/6 selected</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-4">
          {PROGRAMS.map((p) => {
            const isSel = selected.includes(p.key);
            return (
              <button key={p.key} onClick={() => toggleProgram(p.key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${isSel ? "bg-teal-900/40 border-teal-500 text-teal-300" : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300"}`}>
                <span>{p.flag}</span>
                <span className="truncate">{p.label}</span>
                {isSel && <CheckCircle2 className="w-3.5 h-3.5 ml-auto shrink-0 text-teal-400" />}
              </button>
            );
          })}
        </div>
        <Button onClick={handleCompare} disabled={selected.length < 2 || compareMutation.isPending}
          className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
          {compareMutation.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin" />Generating AI Comparison...</>
            : <><BarChart2 className="w-4 h-4" />Compare {selected.length > 0 ? selected.length : ""} Programs</>}
        </Button>
      </div>

      {compareMutation.isPending && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="w-10 h-10 text-teal-400 animate-spin" />
          <p className="text-gray-400 text-sm">AI is analyzing and comparing the selected programs...</p>
        </div>
      )}

      {result && !compareMutation.isPending && (
        <div className="space-y-6">
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800">
                    <th className="text-left px-4 py-3 text-gray-300 font-semibold w-44 border-r border-gray-700">Criteria</th>
                    {result.programs.map((pk) => {
                      const prog = PROGRAMS.find((p) => p.key === pk);
                      return (
                        <th key={pk} className="text-left px-4 py-3 text-teal-300 font-semibold min-w-[160px]">
                          <span className="mr-1">{prog?.flag}</span>{prog?.label || pk}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(CRITERIA_LABELS).map(([key, label], idx) => (
                    <tr key={key} className={idx % 2 === 0 ? "bg-gray-900" : "bg-gray-800/50"}>
                      <td className="px-4 py-3 font-semibold text-gray-300 border-r border-gray-700 align-top">{label}</td>
                      {result.programs.map((pk) => (
                        <td key={pk} className="px-4 py-3 text-gray-300 align-top leading-relaxed">
                          {result.comparison[pk]?.[key] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-gray-900 border border-teal-700/40 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-5 h-5 text-teal-400" />
              <h2 className="text-base font-semibold text-white">ELEVAY Analysis & Recommendation</h2>
              <Badge variant="outline" className="ml-auto text-xs border-teal-700 text-teal-400">AI Generated</Badge>
            </div>
            <div className="space-y-3">
              {result.summary.split("\n\n").filter(Boolean).map((para, i) => (
                <p key={i} className="text-gray-300 text-sm leading-relaxed">{para}</p>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-4">Generated: {new Date(result.generatedAt).toLocaleString()}</p>
          </div>
        </div>
      )}

      {!result && !compareMutation.isPending && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart2 className="w-12 h-12 text-gray-600 mb-4" />
          <p className="text-gray-400 text-sm">Select at least 2 programs above and click Compare to generate an AI-powered comparison report.</p>
        </div>
      )}
    </div>
  );
}
