import { useState, useEffect, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft, Plus, Trash2, Download, Save, Eye, EyeOff,
  FileText, Image, Palette, Type, Layout, ChevronUp, ChevronDown,
  GripVertical, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PageContent {
  [key: string]: string | { url: string; altText?: string } | Array<{ label: string; value: string }>;
}

interface DocumentPage {
  pageId: string;
  pageNumber: number;
  template: "cover" | "overview" | "eligibility" | "process" | "about" | "blank";
  content: PageContent;
}

interface DocumentColors {
  primary: string;
  secondary: string;
  accent: string;
  divider: string;
  background: string;
  text: string;
}

interface DocumentTypography {
  headingFont: string;
  bodyFont: string;
}

interface DocumentData {
  pages: DocumentPage[];
  colors: DocumentColors;
  typography: DocumentTypography;
}

const TEMPLATE_LABELS: Record<string, string> = {
  cover: "Cover Page",
  overview: "Programme Overview",
  eligibility: "Eligibility & Requirements",
  process: "Process & Stages",
  about: "About Country",
  blank: "Custom Blank",
};

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  cover: "50/50 split with landmark photo and program branding",
  overview: "Two-column with info rows and city photograph",
  eligibility: "Numbered requirements with candidate criteria",
  process: "Process stages with fees and dependents table",
  about: "Country photo with facts and rankings",
  blank: "Empty canvas for custom content",
};

const DEFAULT_COLORS: DocumentColors = {
  primary: "#5BA3B8",
  secondary: "#1A3A5C",
  accent: "#E63946",
  divider: "#CCCCCC",
  background: "#FFFFFF",
  text: "#2C2C2C",
};

const DEFAULT_CONTENT: Record<string, PageContent> = {
  cover: {
    countryName: "SPAIN",
    programLabel: "DIGITAL NOMAD VISA",
    programType: "RESIDENCY",
    summary: "PROGRAM SUMMARY",
    lastUpdatedText: "last updated in June 2026",
  },
  overview: {
    sectionLabel: "SPAIN DIGITAL NOMAD VISA",
    heading: "PROGRAMME OVERVIEW",
    introText: "The Spain Digital Nomad Visa (DNV) is a residency permit that allows non-EU remote workers and freelancers to live and work legally in Spain while employed by companies outside Spain.",
    infoRows: JSON.stringify([
      { label: "TIME TO APPROVAL", value: "3-4 months" },
      { label: "FAMILY", value: "Spouse and dependent children may be included" },
      { label: "MINIMUM INCOME", value: "€2,160/month (200% of Spanish minimum wage)" },
      { label: "VALIDITY", value: "1 year initial, renewable up to 5 years" },
    ]),
  },
  eligibility: {
    heading: "ELIGIBILITY & REQUIREMENTS",
    requirements: JSON.stringify([
      { title: "Remote Work Proof", text: "Valid employment contract or freelance agreements with non-Spanish companies" },
      { title: "Minimum Income", text: "Proof of income of at least €2,160/month" },
      { title: "Clean Criminal Record", text: "Criminal background check from your home country" },
      { title: "Health Insurance", text: "Valid health insurance covering Spain" },
      { title: "Accommodation Proof", text: "Rental contract or property ownership in Spain" },
    ]),
    idealCandidate: "Remote workers, freelancers, and digital entrepreneurs who work for non-Spanish clients and wish to enjoy Spain's lifestyle, climate, and culture.",
  },
  process: {
    heading: "PROCESS & STAGES",
    stages: JSON.stringify([
      { title: "Document Preparation", text: "Gather all required documents including employment proof, income statements, and criminal record" },
      { title: "Application Submission", text: "Submit application at the Spanish consulate in your home country" },
      { title: "Biometrics & Interview", text: "Attend biometrics appointment and consular interview if required" },
      { title: "Visa Issuance", text: "Receive initial visa valid for 1 year" },
      { title: "NIE Registration", text: "Register in Spain and obtain your NIE (Foreigner Identification Number)" },
    ]),
    fees: JSON.stringify([
      { label: "Application Fee", value: "€73" },
      { label: "Biometric Fee", value: "€10" },
      { label: "NIE Registration", value: "€15" },
    ]),
  },
  about: {
    heading: "ABOUT SPAIN",
    mainText: "Spain is a vibrant country in southwestern Europe known for its rich culture, stunning landscapes, and high quality of life. With over 300 days of sunshine per year, world-class cuisine, and a welcoming culture, Spain consistently ranks among the top destinations for expatriates worldwide.",
    infoRows: JSON.stringify([
      { label: "CAPITAL", value: "Madrid" },
      { label: "POPULATION", value: "47.4 million" },
      { label: "CURRENCY", value: "Euro (€)" },
      { label: "LANGUAGE", value: "Spanish (Castilian)" },
      { label: "CLIMATE", value: "Mediterranean to semi-arid" },
      { label: "EU MEMBER", value: "Yes — since 1986" },
    ]),
  },
  blank: {
    heading: "CUSTOM PAGE",
    content: "Add your custom content here...",
  },
};

function createPage(template: DocumentPage["template"], pageNumber: number): DocumentPage {
  return {
    pageId: `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    pageNumber,
    template,
    content: { ...DEFAULT_CONTENT[template] },
  };
}

// ─── Page Preview Component ───────────────────────────────────────────────────
function PagePreview({ page, colors, typography }: { page: DocumentPage; colors: DocumentColors; typography: DocumentTypography }) {
  const c = colors;

  if (page.template === "cover") {
    return (
      <div className="w-full aspect-[3/4] bg-white rounded overflow-hidden flex shadow-lg" style={{ fontFamily: typography.headingFont }}>
        {/* Left — Photo placeholder */}
        <div className="w-1/2 h-full flex items-center justify-center" style={{ backgroundColor: "#e8e8e8" }}>
          <div className="text-center text-gray-400">
            <Image className="w-8 h-8 mx-auto mb-1 opacity-40" />
            <span className="text-xs">Cover Photo</span>
          </div>
        </div>
        {/* Right — Branding */}
        <div className="w-1/2 h-full flex flex-col bg-white">
          {/* Logo area */}
          <div className="p-4 flex items-center gap-2">
            <div className="w-6 h-6 rounded" style={{ backgroundColor: c.primary }} />
            <span className="text-xs font-bold" style={{ color: c.secondary }}>ELEVAY</span>
          </div>
          {/* Spacer */}
          <div className="flex-1" />
          {/* Bottom banner */}
          <div className="p-4" style={{ backgroundColor: c.primary }}>
            <div className="text-white font-bold text-lg leading-tight">{String(page.content.countryName || "COUNTRY")}</div>
            <div className="text-white/80 text-xs tracking-widest mt-1">{String(page.content.programLabel || "PROGRAM")}</div>
            <div className="text-white/60 text-xs tracking-widest">{String(page.content.programType || "TYPE")}</div>
            <div className="text-white/50 text-xs mt-2">{String(page.content.lastUpdatedText || "")}</div>
          </div>
        </div>
      </div>
    );
  }

  if (page.template === "overview") {
    let rows: Array<{ label: string; value: string }> = [];
    try { rows = JSON.parse(String(page.content.infoRows || "[]")); } catch {}
    return (
      <div className="w-full aspect-[3/4] bg-white rounded overflow-hidden flex flex-col shadow-lg p-4" style={{ fontFamily: typography.bodyFont, color: c.text }}>
        <div className="text-xs tracking-widest mb-1" style={{ color: c.primary }}>{String(page.content.sectionLabel || "")}</div>
        <div className="text-base font-bold mb-2" style={{ color: c.secondary }}>{String(page.content.heading || "")}</div>
        <p className="text-xs leading-relaxed mb-3 text-gray-600">{String(page.content.introText || "").slice(0, 120)}...</p>
        <div className="space-y-1.5">
          {rows.slice(0, 4).map((row, i) => (
            <div key={i} className="border-t pt-1.5" style={{ borderColor: c.divider }}>
              <div className="text-xs tracking-widest font-semibold" style={{ color: c.primary }}>{row.label}</div>
              <div className="text-xs font-medium" style={{ color: c.secondary }}>{row.value}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (page.template === "eligibility") {
    let reqs: Array<{ title: string; text: string }> = [];
    try { reqs = JSON.parse(String(page.content.requirements || "[]")); } catch {}
    return (
      <div className="w-full aspect-[3/4] bg-white rounded overflow-hidden flex flex-col shadow-lg p-4" style={{ fontFamily: typography.bodyFont, color: c.text }}>
        <div className="text-base font-bold mb-3" style={{ color: c.secondary }}>{String(page.content.heading || "")}</div>
        <div className="space-y-2">
          {reqs.slice(0, 4).map((req, i) => (
            <div key={i} className="flex gap-2 items-start">
              <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: c.accent }}>{i + 1}</div>
              <div>
                <div className="text-xs font-semibold" style={{ color: c.secondary }}>{req.title}</div>
                <div className="text-xs text-gray-500">{req.text.slice(0, 60)}...</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (page.template === "about") {
    let rows: Array<{ label: string; value: string }> = [];
    try { rows = JSON.parse(String(page.content.infoRows || "[]")); } catch {}
    return (
      <div className="w-full aspect-[3/4] bg-white rounded overflow-hidden flex flex-col shadow-lg p-4" style={{ fontFamily: typography.bodyFont, color: c.text }}>
        <div className="text-base font-bold mb-2" style={{ color: c.secondary }}>{String(page.content.heading || "")}</div>
        <p className="text-xs leading-relaxed mb-3 text-gray-600">{String(page.content.mainText || "").slice(0, 150)}...</p>
        <div className="space-y-1.5">
          {rows.slice(0, 4).map((row, i) => (
            <div key={i} className="border-t pt-1.5" style={{ borderColor: c.divider }}>
              <div className="text-xs tracking-widest font-semibold" style={{ color: c.primary }}>{row.label}</div>
              <div className="text-xs font-medium" style={{ color: c.secondary }}>{row.value}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Generic preview for process and blank
  return (
    <div className="w-full aspect-[3/4] bg-white rounded overflow-hidden flex flex-col shadow-lg p-4" style={{ fontFamily: typography.bodyFont, color: c.text }}>
      <div className="text-base font-bold mb-2" style={{ color: c.secondary }}>{String(page.content.heading || TEMPLATE_LABELS[page.template])}</div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-300">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <span className="text-xs">{TEMPLATE_LABELS[page.template]}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Content Editor ───────────────────────────────────────────────────────────
function ContentEditor({ page, onChange }: { page: DocumentPage; onChange: (content: PageContent) => void }) {
  const update = (key: string, value: string) => onChange({ ...page.content, [key]: value });

  if (page.template === "cover") {
    return (
      <div className="space-y-3">
        <div><Label className="text-gray-300 text-xs mb-1 block">Country Name</Label><Input value={String(page.content.countryName || "")} onChange={e => update("countryName", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-sm" /></div>
        <div><Label className="text-gray-300 text-xs mb-1 block">Program Label</Label><Input value={String(page.content.programLabel || "")} onChange={e => update("programLabel", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-sm" /></div>
        <div><Label className="text-gray-300 text-xs mb-1 block">Program Type</Label><Input value={String(page.content.programType || "")} onChange={e => update("programType", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-sm" /></div>
        <div><Label className="text-gray-300 text-xs mb-1 block">Last Updated Text</Label><Input value={String(page.content.lastUpdatedText || "")} onChange={e => update("lastUpdatedText", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-sm" /></div>
      </div>
    );
  }

  if (page.template === "overview") {
    return (
      <div className="space-y-3">
        <div><Label className="text-gray-300 text-xs mb-1 block">Section Label</Label><Input value={String(page.content.sectionLabel || "")} onChange={e => update("sectionLabel", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-sm" /></div>
        <div><Label className="text-gray-300 text-xs mb-1 block">Heading</Label><Input value={String(page.content.heading || "")} onChange={e => update("heading", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-sm" /></div>
        <div><Label className="text-gray-300 text-xs mb-1 block">Introduction Text</Label><Textarea value={String(page.content.introText || "")} onChange={e => update("introText", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-sm min-h-[80px]" /></div>
        <div>
          <Label className="text-gray-300 text-xs mb-1 block">Info Rows (JSON)</Label>
          <Textarea value={String(page.content.infoRows || "[]")} onChange={e => update("infoRows", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-xs font-mono min-h-[120px]" />
          <p className="text-gray-500 text-xs mt-1">Format: [{`{"label":"...", "value":"..."}`}]</p>
        </div>
      </div>
    );
  }

  if (page.template === "eligibility") {
    return (
      <div className="space-y-3">
        <div><Label className="text-gray-300 text-xs mb-1 block">Heading</Label><Input value={String(page.content.heading || "")} onChange={e => update("heading", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-sm" /></div>
        <div>
          <Label className="text-gray-300 text-xs mb-1 block">Requirements (JSON)</Label>
          <Textarea value={String(page.content.requirements || "[]")} onChange={e => update("requirements", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-xs font-mono min-h-[150px]" />
          <p className="text-gray-500 text-xs mt-1">Format: [{`{"title":"...", "text":"..."}`}]</p>
        </div>
        <div><Label className="text-gray-300 text-xs mb-1 block">Ideal Candidate</Label><Textarea value={String(page.content.idealCandidate || "")} onChange={e => update("idealCandidate", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-sm min-h-[60px]" /></div>
      </div>
    );
  }

  if (page.template === "process") {
    return (
      <div className="space-y-3">
        <div><Label className="text-gray-300 text-xs mb-1 block">Heading</Label><Input value={String(page.content.heading || "")} onChange={e => update("heading", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-sm" /></div>
        <div>
          <Label className="text-gray-300 text-xs mb-1 block">Process Stages (JSON)</Label>
          <Textarea value={String(page.content.stages || "[]")} onChange={e => update("stages", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-xs font-mono min-h-[150px]" />
          <p className="text-gray-500 text-xs mt-1">Format: [{`{"title":"...", "text":"..."}`}]</p>
        </div>
        <div>
          <Label className="text-gray-300 text-xs mb-1 block">Fees (JSON)</Label>
          <Textarea value={String(page.content.fees || "[]")} onChange={e => update("fees", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-xs font-mono min-h-[80px]" />
        </div>
      </div>
    );
  }

  if (page.template === "about") {
    return (
      <div className="space-y-3">
        <div><Label className="text-gray-300 text-xs mb-1 block">Heading</Label><Input value={String(page.content.heading || "")} onChange={e => update("heading", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-sm" /></div>
        <div><Label className="text-gray-300 text-xs mb-1 block">Main Text</Label><Textarea value={String(page.content.mainText || "")} onChange={e => update("mainText", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-sm min-h-[100px]" /></div>
        <div>
          <Label className="text-gray-300 text-xs mb-1 block">Info Rows (JSON)</Label>
          <Textarea value={String(page.content.infoRows || "[]")} onChange={e => update("infoRows", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-xs font-mono min-h-[120px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div><Label className="text-gray-300 text-xs mb-1 block">Heading</Label><Input value={String(page.content.heading || "")} onChange={e => update("heading", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-sm" /></div>
      <div><Label className="text-gray-300 text-xs mb-1 block">Content</Label><Textarea value={String(page.content.content || "")} onChange={e => update("content", e.target.value)} className="bg-[#0f1623] border-white/10 text-white text-sm min-h-[120px]" /></div>
    </div>
  );
}

// ─── Main Editor ──────────────────────────────────────────────────────────────
export default function SummaryEditor() {
  const [, params] = useRoute("/marketing/summary-generator/:id");
  const [, navigate] = useLocation();
  const id = params?.id ? parseInt(params.id) : 0;

  const { data: summary, isLoading } = trpc.marketing.getSummary.useQuery({ id }, { enabled: !!id });
  const saveMutation = trpc.marketing.saveSummary.useMutation({
    onSuccess: () => toast.success("Saved"),
    onError: (err) => toast.error(err.message),
  });
  const exportMutation = trpc.marketing.exportSummaryPdf.useMutation({
    onSuccess: (data) => {
      const link = document.createElement("a");
      link.href = data.url;
      link.download = `${summary?.title || "summary"}.pdf`;
      link.click();
      toast.success("PDF exported");
    },
    onError: (err) => toast.error(err.message),
  });

  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [selectedPageIdx, setSelectedPageIdx] = useState(0);
  const [activePanel, setActivePanel] = useState<"content" | "colors" | "typography" | "pages">("content");
  const [showAddPage, setShowAddPage] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (summary) {
      try {
        const parsed = JSON.parse(summary.documentJson);
        setDoc(parsed);
      } catch {
        setDoc({
          pages: [createPage("cover", 1)],
          colors: { ...DEFAULT_COLORS },
          typography: { headingFont: "Montserrat", bodyFont: "Open Sans" },
        });
      }
    }
  }, [summary]);

  const handleSave = useCallback(() => {
    if (!doc) return;
    saveMutation.mutate({ id, documentJson: JSON.stringify(doc) }, {
      onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); },
    });
  }, [doc, id, saveMutation]);

  const updatePageContent = (content: PageContent) => {
    if (!doc) return;
    const pages = doc.pages.map((p, i) => i === selectedPageIdx ? { ...p, content } : p);
    setDoc({ ...doc, pages });
  };

  const addPage = (template: DocumentPage["template"]) => {
    if (!doc) return;
    const newPage = createPage(template, doc.pages.length + 1);
    setDoc({ ...doc, pages: [...doc.pages, newPage] });
    setSelectedPageIdx(doc.pages.length);
    setShowAddPage(false);
  };

  const deletePage = (idx: number) => {
    if (!doc || doc.pages.length <= 1) return;
    const pages = doc.pages.filter((_, i) => i !== idx).map((p, i) => ({ ...p, pageNumber: i + 1 }));
    setDoc({ ...doc, pages });
    setSelectedPageIdx(Math.min(idx, pages.length - 1));
  };

  const movePage = (idx: number, dir: -1 | 1) => {
    if (!doc) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= doc.pages.length) return;
    const pages = [...doc.pages];
    [pages[idx], pages[newIdx]] = [pages[newIdx], pages[idx]];
    setDoc({ ...doc, pages: pages.map((p, i) => ({ ...p, pageNumber: i + 1 })) });
    setSelectedPageIdx(newIdx);
  };

  const updateColor = (key: keyof DocumentColors, value: string) => {
    if (!doc) return;
    setDoc({ ...doc, colors: { ...doc.colors, [key]: value } });
  };

  const updateTypography = (key: keyof DocumentTypography, value: string) => {
    if (!doc) return;
    setDoc({ ...doc, typography: { ...doc.typography, [key]: value } });
  };

  if (isLoading || !doc) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading editor...</div>
      </div>
    );
  }

  const currentPage = doc.pages[selectedPageIdx];

  return (
    <div className="flex flex-col h-full bg-[#0f1623]">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#1a2235]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/marketing/summary-generator")} className="text-gray-400 hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="text-white font-semibold text-sm">{summary?.title}</div>
            <div className="text-gray-400 text-xs">{summary?.country} — {summary?.programType}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="border-white/10 text-gray-300 hover:text-white gap-1.5 text-xs"
          >
            {saved ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? "Saved" : "Save"}
          </Button>
          <Button
            size="sm"
            onClick={() => exportMutation.mutate({ id })}
            disabled={exportMutation.isPending}
            className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            {exportMutation.isPending ? "Exporting..." : "Export PDF"}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left — Page Navigator */}
        <div className="w-44 border-r border-white/10 bg-[#141c2b] flex flex-col overflow-y-auto">
          <div className="p-3 border-b border-white/10">
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Pages</span>
          </div>
          <div className="flex-1 p-2 space-y-2">
            {doc.pages.map((page, idx) => (
              <div
                key={page.pageId}
                onClick={() => setSelectedPageIdx(idx)}
                className={`relative rounded-lg p-2 cursor-pointer transition-all group ${
                  idx === selectedPageIdx ? "ring-2 ring-teal-500 bg-teal-900/20" : "hover:bg-white/5"
                }`}
              >
                <div className="mb-1">
                  <PagePreview page={page} colors={doc.colors} typography={doc.typography} />
                </div>
                <div className="text-xs text-gray-400 text-center truncate">{TEMPLATE_LABELS[page.template]}</div>
                <div className="absolute top-1 right-1 hidden group-hover:flex gap-0.5">
                  <button onClick={(e) => { e.stopPropagation(); movePage(idx, -1); }} className="p-0.5 rounded bg-black/50 text-gray-300 hover:text-white"><ChevronUp className="w-3 h-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); movePage(idx, 1); }} className="p-0.5 rounded bg-black/50 text-gray-300 hover:text-white"><ChevronDown className="w-3 h-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); deletePage(idx); }} className="p-0.5 rounded bg-black/50 text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-white/10">
            <button
              onClick={() => setShowAddPage(!showAddPage)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-white/20 text-gray-400 hover:text-white hover:border-white/40 text-xs transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Add Page
            </button>
            {showAddPage && (
              <div className="mt-2 space-y-1">
                {Object.entries(TEMPLATE_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => addPage(key as DocumentPage["template"])}
                    className="w-full text-left px-2 py-1.5 rounded text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center — Preview */}
        <div className="flex-1 flex flex-col items-center justify-start overflow-y-auto bg-[#0d1420] p-8">
          <div className="w-full max-w-sm">
            <div className="text-center text-xs text-gray-500 mb-3">
              Page {selectedPageIdx + 1} of {doc.pages.length} — {TEMPLATE_LABELS[currentPage.template]}
            </div>
            <PagePreview page={currentPage} colors={doc.colors} typography={doc.typography} />
            <p className="text-center text-xs text-gray-600 mt-3">Live preview — edit content in the right panel</p>
          </div>
        </div>

        {/* Right — Editor Panel */}
        <div className="w-72 border-l border-white/10 bg-[#141c2b] flex flex-col">
          {/* Panel Tabs */}
          <div className="flex border-b border-white/10">
            {[
              { key: "content", icon: FileText, label: "Content" },
              { key: "colors", icon: Palette, label: "Colors" },
              { key: "typography", icon: Type, label: "Fonts" },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setActivePanel(key as typeof activePanel)}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs transition-colors ${
                  activePanel === key ? "text-teal-400 border-b-2 border-teal-400" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activePanel === "content" && (
              <ContentEditor page={currentPage} onChange={updatePageContent} />
            )}

            {activePanel === "colors" && (
              <div className="space-y-3">
                <p className="text-xs text-gray-400 mb-2">Customize the document color palette</p>
                {(Object.entries(doc.colors) as [keyof DocumentColors, string][]).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={value}
                      onChange={(e) => updateColor(key, e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <div className="flex-1">
                      <div className="text-xs text-gray-300 capitalize">{key.replace(/([A-Z])/g, " $1")}</div>
                      <Input
                        value={value}
                        onChange={(e) => updateColor(key, e.target.value)}
                        className="bg-[#0f1623] border-white/10 text-white text-xs h-6 mt-0.5"
                      />
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => setDoc({ ...doc, colors: { ...DEFAULT_COLORS } })}
                  className="w-full text-xs text-gray-400 hover:text-white py-1.5 rounded border border-white/10 hover:border-white/30 transition-colors mt-2"
                >
                  Reset to ELEVAY defaults
                </button>
              </div>
            )}

            {activePanel === "typography" && (
              <div className="space-y-4">
                <div>
                  <Label className="text-gray-300 text-xs mb-1.5 block">Heading Font</Label>
                  <Select value={doc.typography.headingFont} onValueChange={(v) => updateTypography("headingFont", v)}>
                    <SelectTrigger className="bg-[#0f1623] border-white/10 text-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a2235] border-white/10">
                      {["Montserrat", "Playfair Display", "Raleway", "Oswald", "Roboto Condensed", "Lato"].map(f => (
                        <SelectItem key={f} value={f} className="text-white">{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-300 text-xs mb-1.5 block">Body Font</Label>
                  <Select value={doc.typography.bodyFont} onValueChange={(v) => updateTypography("bodyFont", v)}>
                    <SelectTrigger className="bg-[#0f1623] border-white/10 text-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a2235] border-white/10">
                      {["Open Sans", "Roboto", "Inter", "Lato", "Source Sans 3", "Nunito"].map(f => (
                        <SelectItem key={f} value={f} className="text-white">{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
