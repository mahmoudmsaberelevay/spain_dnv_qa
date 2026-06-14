import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft, Plus, Trash2, Download, Eye, EyeOff,
  FileText, Image as ImageIcon, Type, AlignLeft,
  Loader2, ChevronUp, ChevronDown, GripVertical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

// ─── ELEVAY Logo ───────────────────────────────────────────────────────────────
const ELEVAY_LOGO = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663524211981/amjcwILftyyzFnPH.png";

// ─── Country Photo Queries ─────────────────────────────────────────────────────
const COUNTRY_PHOTO_QUERIES: Record<string, string[]> = {
  "Spain":                  ["spain+landscape", "spain+architecture", "spain+coast", "spain+culture", "spain+city"],
  "Portugal":               ["portugal+landscape", "lisbon+portugal", "portugal+coast", "portugal+nature", "portugal+culture"],
  "Greece":                 ["greece+landscape", "santorini+greece", "greece+coast", "greece+nature", "athens+greece"],
  "Malta":                  ["malta+landscape", "malta+architecture", "malta+coast", "valletta+malta", "malta+culture"],
  "United Kingdom":         ["london+uk", "england+landscape", "uk+nature", "uk+architecture", "scotland+landscape"],
  "Canada":                 ["canada+landscape", "canada+nature", "canada+mountains", "toronto+canada", "canada+culture"],
  "Australia":              ["australia+landscape", "australia+nature", "sydney+australia", "australia+coast", "australia+culture"],
  "Latvia":                 ["latvia+landscape", "riga+latvia", "latvia+nature", "latvia+culture", "latvia+city"],
  "Hungary":                ["budapest+hungary", "hungary+landscape", "hungary+nature", "hungary+culture", "hungary+city"],
  "United States":          ["usa+landscape", "new+york+usa", "usa+nature", "usa+city", "usa+architecture"],
  "United Arab Emirates":   ["dubai+uae", "abu+dhabi+uae", "uae+landscape", "uae+architecture", "uae+culture"],
  "Bulgaria":               ["bulgaria+landscape", "sofia+bulgaria", "bulgaria+nature", "bulgaria+culture", "bulgaria+mountains"],
  "Turkey":                 ["istanbul+turkey", "turkey+landscape", "turkey+coast", "turkey+culture", "turkey+nature"],
  "Dominica":               ["dominica+island", "dominica+nature", "dominica+coast", "dominica+landscape", "dominica+waterfall"],
  "Saint Lucia":            ["saint+lucia+island", "saint+lucia+nature", "saint+lucia+coast", "saint+lucia+landscape", "saint+lucia+culture"],
  "Saint Kitts and Nevis":  ["saint+kitts+island", "nevis+island", "caribbean+nature", "caribbean+coast", "caribbean+landscape"],
  "Grenada":                ["grenada+island", "grenada+nature", "grenada+coast", "grenada+landscape", "grenada+culture"],
  "Antigua and Barbuda":    ["antigua+island", "antigua+nature", "antigua+coast", "antigua+landscape", "caribbean+culture"],
  "Vanuatu":                ["vanuatu+island", "vanuatu+nature", "vanuatu+coast", "vanuatu+landscape", "vanuatu+culture"],
  "Nauru":                  ["nauru+island", "pacific+island+nature", "pacific+island+coast", "pacific+ocean+landscape", "tropical+island"],
  "São Tomé and Príncipe":  ["sao+tome+island", "africa+island+nature", "tropical+island+coast", "tropical+island+landscape", "tropical+island"],
  "Egypt":                  ["egypt+pyramids", "egypt+landscape", "egypt+culture", "nile+egypt", "egypt+architecture"],
};

function getCountryPhotoUrl(country: string, index: number): string {
  const queries = COUNTRY_PHOTO_QUERIES[country] ?? [`${country.replace(/\s+/g, "+")}+landscape`];
  const query = queries[index % queries.length];
  return `https://source.unsplash.com/1200x800/?${query}&sig=${encodeURIComponent(country + index)}`;
}

// ─── Types ─────────────────────────────────────────────────────────────────────
type TextBlockType = "header" | "primary" | "normal";

interface TextBlock {
  id: string;
  type: TextBlockType;
  text: string;
}

interface PageData {
  id: string;
  pageType: "cover" | "photo" | "text";
  photoIndex?: number;
  blocks: TextBlock[];
}

interface DocumentData {
  country: string;
  programType: string;
  programSubtype: string;
  createdAt: number;
  pages: PageData[];
}

const TEXT_TYPE_CONFIG: Record<TextBlockType, { label: string; pdfStyle: string; previewClass: string }> = {
  header:  { label: "Header",       pdfStyle: "font-size:22px;font-weight:700;color:#1A3A5C;margin-bottom:10px;line-height:1.2;", previewClass: "text-xl font-bold text-[#1A3A5C]" },
  primary: { label: "Primary Text", pdfStyle: "font-size:15px;font-weight:600;color:#5BA3B8;margin-bottom:8px;line-height:1.4;", previewClass: "text-sm font-semibold text-[#5BA3B8]" },
  normal:  { label: "Normal Text",  pdfStyle: "font-size:13px;color:#2C2C2C;margin-bottom:6px;line-height:1.6;",                previewClass: "text-xs text-gray-700" },
};

// ─── Page Preview ──────────────────────────────────────────────────────────────
function PagePreview({ page, country, programType, createdAt, pageNumber, totalPages }: {
  page: PageData; country: string; programType: string; createdAt: number; pageNumber: number; totalPages: number;
}) {
  const monthYear = new Date(createdAt).toLocaleString("en-US", { month: "long", year: "numeric" });
  const photoUrl = page.photoIndex !== undefined ? getCountryPhotoUrl(country, page.photoIndex) : "";

  if (page.pageType === "cover") {
    return (
      <div className="w-full bg-[#1A3A5C] relative overflow-hidden" style={{ aspectRatio: "210/297", fontFamily: "'Montserrat', sans-serif" }}>
        {photoUrl && <img src={photoUrl} alt={country} className="absolute inset-0 w-full h-full object-cover opacity-40" />}
        <div className="absolute inset-0 bg-gradient-to-b from-[#1A3A5C]/60 via-transparent to-[#1A3A5C]/95" />
        <div className="absolute top-3 left-3 z-10">
          <img src={ELEVAY_LOGO} alt="ELEVAY" className="h-8 w-auto object-contain" />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-white text-center px-6">
          <div className="text-[8px] tracking-[0.3em] uppercase text-[#5BA3B8] mb-1 font-medium">ELEVAY</div>
          <div className="text-2xl font-bold mb-1">{country.toUpperCase()}</div>
          <div className="text-xs font-light opacity-90 mb-1">{programType}</div>
          <div className="text-[9px] text-[#5BA3B8] tracking-widest uppercase mb-3">PROGRAM SUMMARY</div>
          <div className="w-8 h-px bg-[#5BA3B8] mb-3" />
          <div className="text-[8px] opacity-40">Last updated: {monthYear}</div>
        </div>
        <div className="absolute bottom-2 right-3 text-[8px] text-white/30 z-10">{pageNumber} / {totalPages}</div>
      </div>
    );
  }

  if (page.pageType === "photo") {
    return (
      <div className="w-full relative overflow-hidden" style={{ aspectRatio: "210/297", fontFamily: "'Montserrat', sans-serif" }}>
        {photoUrl
          ? <img src={photoUrl} alt={country} className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0 bg-[#1A3A5C]" />
        }
        <div className="absolute inset-0 bg-gradient-to-t from-[#1A3A5C]/85 via-transparent to-transparent" />
        <div className="absolute top-2 left-2 z-10 bg-white/10 backdrop-blur-sm rounded px-1.5 py-0.5">
          <img src={ELEVAY_LOGO} alt="ELEVAY" className="h-5 w-auto object-contain" />
        </div>
        {page.blocks.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 z-10 p-3">
            {page.blocks.map((block) => (
              <div key={block.id} className="mb-1" style={{
                color: block.type === "header" ? "white" : block.type === "primary" ? "#5BA3B8" : "rgba(255,255,255,0.8)",
                fontSize: block.type === "header" ? "11px" : "8px",
                fontWeight: block.type === "header" ? 700 : block.type === "primary" ? 600 : 400,
              }}>
                {block.text || <span className="opacity-30 italic">Empty block</span>}
              </div>
            ))}
          </div>
        )}
        <div className="absolute bottom-1.5 right-2 text-[7px] text-white/30 z-10">{pageNumber} / {totalPages}</div>
      </div>
    );
  }

  // Text page
  return (
    <div className="w-full bg-white relative overflow-hidden flex flex-col" style={{ aspectRatio: "210/297", fontFamily: "'Montserrat', sans-serif" }}>
      <div className="bg-[#1A3A5C] flex items-center px-3 gap-2 shrink-0" style={{ height: "12%" }}>
        <img src={ELEVAY_LOGO} alt="ELEVAY" className="h-5 w-auto object-contain" />
        <div className="w-px h-3 bg-white/20" />
        <div className="text-white text-[7px] font-medium tracking-widest uppercase truncate">{country} — {programType}</div>
      </div>
      <div className="flex-1 px-3 py-2 overflow-hidden">
        {page.blocks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-300 text-[8px]">No content yet</div>
        ) : (
          page.blocks.map((block) => (
            <div key={block.id} className="mb-1.5" style={{
              color: TEXT_TYPE_CONFIG[block.type].pdfStyle.match(/color:([^;]+)/)?.[1] ?? "#2C2C2C",
              fontSize: block.type === "header" ? "10px" : "7px",
              fontWeight: block.type === "header" ? 700 : block.type === "primary" ? 600 : 400,
              lineHeight: 1.4,
            }}>
              {block.text || <span className="opacity-30 italic">Empty block</span>}
            </div>
          ))
        )}
      </div>
      <div className="border-t border-[#5BA3B8]/20 flex items-center justify-between px-3 shrink-0" style={{ height: "8%" }}>
        <div className="text-[6px] text-gray-400 uppercase tracking-widest">ELEVAY — Citizenship & Residency by Investment</div>
        <div className="text-[6px] text-gray-400">{pageNumber} / {totalPages}</div>
      </div>
    </div>
  );
}

// ─── Main Editor ───────────────────────────────────────────────────────────────
export default function SummaryEditor() {
  const [, params] = useRoute("/marketing/summary-generator/:id");
  const [, navigate] = useLocation();
  const id = params?.id ? parseInt(params.id) : 0;

  const { data: summary, isLoading } = trpc.marketing.getSummary.useQuery({ id }, { enabled: !!id });
  const saveMutation = trpc.marketing.saveSummary.useMutation({
    onSuccess: () => {},
    onError: (err) => toast.error(err.message),
  });

  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [selectedPageIdx, setSelectedPageIdx] = useState(0);
  const [showPreview, setShowPreview] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");

  // Initialize doc from DB
  useEffect(() => {
    if (!summary) return;
    try {
      const parsed = JSON.parse(summary.documentJson || "{}");
      if (parsed.pages && Array.isArray(parsed.pages)) {
        setDoc(parsed as DocumentData);
        lastSavedRef.current = summary.documentJson;
        return;
      }
    } catch {}
    // Build default doc
    const country = summary.country;
    const programType = summary.programType;
    const programSubtype = summary.programSubtype || "RESIDENCY";
    const newDoc: DocumentData = {
      country, programType, programSubtype,
      createdAt: summary.createdAt,
      pages: [
        { id: `cover-${Date.now()}`, pageType: "cover", photoIndex: 0, blocks: [] },
        { id: `photo-1-${Date.now()}`, pageType: "photo", photoIndex: 0, blocks: [
          { id: `b1a`, type: "header", text: `Welcome to ${country}` },
          { id: `b1b`, type: "primary", text: programType },
        ]},
        { id: `photo-2-${Date.now()}`, pageType: "photo", photoIndex: 1, blocks: [
          { id: `b2a`, type: "header", text: "Why Choose This Program?" },
        ]},
        { id: `photo-3-${Date.now()}`, pageType: "photo", photoIndex: 2, blocks: [
          { id: `b3a`, type: "header", text: "Key Requirements" },
        ]},
        { id: `photo-4-${Date.now()}`, pageType: "photo", photoIndex: 3, blocks: [
          { id: `b4a`, type: "header", text: "Application Process" },
        ]},
        { id: `photo-5-${Date.now()}`, pageType: "photo", photoIndex: 4, blocks: [
          { id: `b5a`, type: "header", text: "Contact ELEVAY" },
          { id: `b5b`, type: "normal", text: "www.elevay.vip" },
        ]},
        { id: `text-1-${Date.now()}`, pageType: "text", blocks: [
          { id: `tb1`, type: "header", text: "Program Overview" },
          { id: `tb2`, type: "normal", text: "Add your program overview text here..." },
        ]},
      ],
    };
    setDoc(newDoc);
  }, [summary]);

  // Auto-save with debounce
  useEffect(() => {
    if (!doc) return;
    const json = JSON.stringify(doc);
    if (json === lastSavedRef.current) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      lastSavedRef.current = json;
      saveMutation.mutate({ id, documentJson: json });
    }, 1500);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [doc]);

  // ─── Page operations ──────────────────────────────────────────────────────────
  function addPhotoPage() {
    if (!doc) return;
    const usedIndices = doc.pages.filter(p => p.pageType === "photo").map(p => p.photoIndex ?? 0);
    const nextIndex = ((Math.max(...usedIndices, -1) + 1) % 5);
    const newPage: PageData = { id: `photo-${Date.now()}`, pageType: "photo", photoIndex: nextIndex, blocks: [] };
    const pages = [...doc.pages];
    pages.splice(selectedPageIdx + 1, 0, newPage);
    setDoc({ ...doc, pages });
    setSelectedPageIdx(selectedPageIdx + 1);
  }

  function addTextPage() {
    if (!doc) return;
    const newPage: PageData = { id: `text-${Date.now()}`, pageType: "text", blocks: [] };
    const pages = [...doc.pages];
    pages.splice(selectedPageIdx + 1, 0, newPage);
    setDoc({ ...doc, pages });
    setSelectedPageIdx(selectedPageIdx + 1);
  }

  function deletePage(idx: number) {
    if (!doc || doc.pages.length <= 1) return;
    if (!confirm("Delete this page?")) return;
    const pages = doc.pages.filter((_, i) => i !== idx);
    setDoc({ ...doc, pages });
    setSelectedPageIdx(Math.min(idx, pages.length - 1));
  }

  function movePage(idx: number, dir: -1 | 1) {
    if (!doc) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= doc.pages.length) return;
    const pages = [...doc.pages];
    [pages[idx], pages[newIdx]] = [pages[newIdx], pages[idx]];
    setDoc({ ...doc, pages });
    setSelectedPageIdx(newIdx);
  }

  function updatePagePhotoIndex(idx: number, photoIndex: number) {
    if (!doc) return;
    setDoc({ ...doc, pages: doc.pages.map((p, i) => i === idx ? { ...p, photoIndex } : p) });
  }

  // ─── Block operations ─────────────────────────────────────────────────────────
  function addBlock(pageIdx: number, type: TextBlockType) {
    if (!doc) return;
    const newBlock: TextBlock = { id: `block-${Date.now()}`, type, text: "" };
    setDoc({ ...doc, pages: doc.pages.map((p, i) => i === pageIdx ? { ...p, blocks: [...p.blocks, newBlock] } : p) });
  }

  function updateBlock(pageIdx: number, blockId: string, field: "text" | "type", value: string) {
    if (!doc) return;
    setDoc({ ...doc, pages: doc.pages.map((p, i) =>
      i === pageIdx ? { ...p, blocks: p.blocks.map(b => b.id === blockId ? { ...b, [field]: value } : b) } : p
    )});
  }

  function deleteBlock(pageIdx: number, blockId: string) {
    if (!doc) return;
    setDoc({ ...doc, pages: doc.pages.map((p, i) =>
      i === pageIdx ? { ...p, blocks: p.blocks.filter(b => b.id !== blockId) } : p
    )});
  }

  // ─── PDF Export ───────────────────────────────────────────────────────────────
  async function handleExportPdf() {
    if (!doc) return;
    setIsExporting(true);
    try {
      const printWindow = window.open("", "_blank");
      if (!printWindow) { toast.error("Allow popups to export PDF"); setIsExporting(false); return; }

      const monthYear = new Date(doc.createdAt).toLocaleString("en-US", { month: "long", year: "numeric" });

      const pagesHtml = doc.pages.map((page, pageIdx) => {
        const photoUrl = page.photoIndex !== undefined ? getCountryPhotoUrl(doc.country, page.photoIndex) : "";
        const blocksHtml = page.blocks.map(b => `<div style="${TEXT_TYPE_CONFIG[b.type].pdfStyle}">${b.text.replace(/\n/g, "<br/>")}</div>`).join("");

        if (page.pageType === "cover") {
          return `<div class="page" style="background:#1A3A5C;position:relative;overflow:hidden;">
            ${photoUrl ? `<img src="${photoUrl}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.4;" />` : ""}
            <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(26,58,92,0.6),rgba(26,58,92,0.95));"></div>
            <div style="position:absolute;top:20px;left:20px;z-index:10;">
              <img src="${ELEVAY_LOGO}" style="height:50px;width:auto;object-fit:contain;" />
            </div>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;color:white;text-align:center;padding:40px;font-family:'Montserrat',sans-serif;">
              <div style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#5BA3B8;margin-bottom:8px;">ELEVAY</div>
              <div style="font-size:42px;font-weight:700;margin-bottom:8px;">${doc.country.toUpperCase()}</div>
              <div style="font-size:18px;font-weight:300;margin-bottom:6px;opacity:0.9;">${doc.programType}</div>
              <div style="font-size:12px;color:#5BA3B8;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:24px;">${doc.programSubtype}</div>
              <div style="width:60px;height:2px;background:#5BA3B8;margin-bottom:24px;"></div>
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.2em;opacity:0.6;">PROGRAM SUMMARY</div>
              <div style="font-size:10px;opacity:0.4;margin-top:8px;">Last updated: ${monthYear}</div>
            </div>
            <div style="position:absolute;bottom:12px;right:18px;font-size:9px;color:rgba(255,255,255,0.3);z-index:10;">${pageIdx + 1} / ${doc.pages.length}</div>
          </div>`;
        }

        if (page.pageType === "photo") {
          return `<div class="page" style="position:relative;overflow:hidden;">
            ${photoUrl ? `<img src="${photoUrl}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />` : `<div style="position:absolute;inset:0;background:#1A3A5C;"></div>`}
            <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(26,58,92,0.85) 0%,transparent 50%);"></div>
            <div style="position:absolute;top:16px;left:16px;z-index:10;background:rgba(255,255,255,0.12);backdrop-filter:blur(4px);border-radius:8px;padding:6px 10px;">
              <img src="${ELEVAY_LOGO}" style="height:28px;width:auto;object-fit:contain;" />
            </div>
            ${page.blocks.length > 0 ? `<div style="position:absolute;bottom:0;left:0;right:0;z-index:10;padding:28px;font-family:'Montserrat',sans-serif;">
              ${page.blocks.map(b => {
                const s: Record<TextBlockType, string> = {
                  header:  "font-size:24px;font-weight:700;color:white;margin-bottom:8px;",
                  primary: "font-size:15px;font-weight:600;color:#5BA3B8;margin-bottom:6px;",
                  normal:  "font-size:12px;color:rgba(255,255,255,0.8);margin-bottom:4px;",
                };
                return `<div style="${s[b.type]}">${b.text.replace(/\n/g, "<br/>")}</div>`;
              }).join("")}
            </div>` : ""}
            <div style="position:absolute;bottom:12px;right:18px;font-size:9px;color:rgba(255,255,255,0.4);z-index:10;">${pageIdx + 1} / ${doc.pages.length}</div>
          </div>`;
        }

        // Text page
        return `<div class="page" style="background:white;display:flex;flex-direction:column;font-family:'Montserrat',sans-serif;">
          <div style="background:#1A3A5C;height:64px;display:flex;align-items:center;padding:0 20px;gap:12px;flex-shrink:0;">
            <img src="${ELEVAY_LOGO}" style="height:32px;width:auto;object-fit:contain;" />
            <div style="width:1px;height:16px;background:rgba(255,255,255,0.2);"></div>
            <div style="color:white;font-size:10px;font-weight:500;letter-spacing:0.15em;text-transform:uppercase;">${doc.country} — ${doc.programType}</div>
          </div>
          <div style="flex:1;padding:28px 28px 16px;overflow:hidden;">
            ${blocksHtml || '<div style="color:#ccc;font-size:12px;">Empty page</div>'}
          </div>
          <div style="height:32px;border-top:1px solid rgba(91,163,184,0.2);display:flex;align-items:center;justify-content:space-between;padding:0 20px;flex-shrink:0;">
            <div style="font-size:8px;color:#999;text-transform:uppercase;letter-spacing:0.1em;">ELEVAY — Citizenship & Residency by Investment</div>
            <div style="font-size:8px;color:#999;">${pageIdx + 1} / ${doc.pages.length}</div>
          </div>
        </div>`;
      }).join("");

      printWindow.document.write(`<!DOCTYPE html><html><head>
        <meta charset="UTF-8">
        <title>${doc.country} — ${doc.programType}</title>
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family:'Montserrat',sans-serif; background:#f0f0f0; }
          .page { width:210mm; height:297mm; margin:0 auto 10mm; page-break-after:always; overflow:hidden; }
          @media print { body { background:white; } .page { margin:0; } }
        </style>
      </head><body>
        ${pagesHtml}
        <script>window.onload=function(){setTimeout(function(){window.print();},1500);};</script>
      </body></html>`);
      printWindow.document.close();
      toast.success("PDF export opened — save as PDF from the print dialog");
    } catch {
      toast.error("Export failed");
    } finally {
      setIsExporting(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  if (isLoading || !doc) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
      </div>
    );
  }

  const currentPage = doc.pages[selectedPageIdx];

  return (
    <div className="flex flex-col bg-[#0f1623] overflow-hidden" style={{ height: "calc(100vh - 0px)" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#1a2235] shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/marketing/summary-generator")} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="text-sm font-semibold text-white">{doc.country} — {doc.programType}</div>
            <div className="text-xs text-gray-500">{doc.pages.length} pages · {saveMutation.isPending ? "Saving..." : "Auto-saved"}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs transition-colors"
          >
            {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPreview ? "Hide Preview" : "Show Preview"}
          </button>
          <Button
            onClick={handleExportPdf}
            disabled={isExporting}
            className="bg-teal-600 hover:bg-teal-700 text-white gap-2 text-sm h-8 px-3"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export PDF
          </Button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Page list */}
        <div className="w-44 border-r border-white/10 bg-[#141c2e] flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Pages</span>
            <span className="text-xs text-gray-600">{doc.pages.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto py-2 space-y-1 px-2">
            {doc.pages.map((page, idx) => (
              <button
                key={page.id}
                onClick={() => setSelectedPageIdx(idx)}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-all text-xs ${
                  selectedPageIdx === idx
                    ? "bg-teal-600/30 border border-teal-500/50 text-white"
                    : "hover:bg-white/5 text-gray-400 border border-transparent"
                }`}
              >
                <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-white/10 text-xs">
                  {page.pageType === "photo" ? <ImageIcon className="w-3 h-3" /> : page.pageType === "cover" ? "★" : <FileText className="w-3 h-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">
                    {page.pageType === "cover" ? "Cover" : page.pageType === "photo" ? `Photo ${(page.photoIndex ?? 0) + 1}` : "Text Page"}
                  </div>
                  <div className="text-[10px] text-gray-600">{page.blocks.length} blocks</div>
                </div>
                <span className="text-[10px] text-gray-600 shrink-0">{idx + 1}</span>
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-white/10 space-y-1">
            <button onClick={addPhotoPage} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs transition-colors">
              <ImageIcon className="w-3 h-3" /> Add Photo Page
            </button>
            <button onClick={addTextPage} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs transition-colors">
              <FileText className="w-3 h-3" /> Add Text Page
            </button>
          </div>
        </div>

        {/* Center: Editor panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4">
            {/* Page controls */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-white">
                Page {selectedPageIdx + 1} — {currentPage.pageType === "cover" ? "Cover Page" : currentPage.pageType === "photo" ? "Photo Page" : "Text Page"}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => movePage(selectedPageIdx, -1)} disabled={selectedPageIdx === 0} className="p-1.5 rounded hover:bg-white/10 text-gray-500 hover:text-white disabled:opacity-30 transition-colors">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => movePage(selectedPageIdx, 1)} disabled={selectedPageIdx === doc.pages.length - 1} className="p-1.5 rounded hover:bg-white/10 text-gray-500 hover:text-white disabled:opacity-30 transition-colors">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {currentPage.pageType !== "cover" && (
                  <button onClick={() => deletePage(selectedPageIdx)} className="p-1.5 rounded hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Photo selector */}
            {(currentPage.pageType === "photo" || currentPage.pageType === "cover") && (
              <div className="mb-4 p-3 bg-[#1a2235] rounded-xl border border-white/10">
                <div className="text-xs text-gray-400 mb-2 font-medium">Country Photo (1–5 different scenic views of {doc.country})</div>
                <div className="flex gap-2 flex-wrap">
                  {[0, 1, 2, 3, 4].map(idx => (
                    <button
                      key={idx}
                      onClick={() => updatePagePhotoIndex(selectedPageIdx, idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        (currentPage.photoIndex ?? 0) === idx
                          ? "bg-teal-600 text-white"
                          : "bg-white/5 text-gray-400 hover:bg-white/10"
                      }`}
                    >
                      Photo {idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Text blocks */}
            <div className="space-y-3 mb-4">
              {currentPage.blocks.map((block) => (
                <div key={block.id} className="bg-[#1a2235] rounded-xl border border-white/10 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <GripVertical className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                    <div className="flex gap-1 flex-wrap">
                      {(["header", "primary", "normal"] as TextBlockType[]).map(t => (
                        <button
                          key={t}
                          onClick={() => updateBlock(selectedPageIdx, block.id, "type", t)}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                            block.type === t
                              ? t === "header" ? "bg-[#1A3A5C] text-white" : t === "primary" ? "bg-[#5BA3B8] text-white" : "bg-gray-600 text-white"
                              : "bg-white/5 text-gray-500 hover:bg-white/10 text-gray-400"
                          }`}
                        >
                          {TEXT_TYPE_CONFIG[t].label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => deleteBlock(selectedPageIdx, block.id)}
                      className="ml-auto p-1 rounded hover:bg-red-900/30 text-gray-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <Textarea
                    value={block.text}
                    onChange={(e) => updateBlock(selectedPageIdx, block.id, "text", e.target.value)}
                    placeholder={
                      block.type === "header" ? "Enter heading text..." :
                      block.type === "primary" ? "Enter primary / subtitle text..." :
                      "Enter body text..."
                    }
                    className={`bg-[#0f1623] border-white/10 text-white resize-none text-sm ${
                      block.type === "header" ? "text-base font-bold" :
                      block.type === "primary" ? "font-semibold text-[#5BA3B8]" : "text-gray-300"
                    }`}
                    rows={block.type === "normal" ? 3 : 2}
                  />
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${
                      block.type === "header" ? "bg-[#1A3A5C]" : block.type === "primary" ? "bg-[#5BA3B8]" : "bg-gray-500"
                    }`} />
                    <span className="text-[10px] text-gray-600">
                      {block.type === "header" ? "Large bold heading — dark navy" :
                       block.type === "primary" ? "Medium bold — teal accent" :
                       "Regular body text — dark gray"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Add block buttons */}
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => addBlock(selectedPageIdx, "header")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A3A5C]/50 hover:bg-[#1A3A5C] text-white text-xs transition-colors border border-[#1A3A5C]">
                <Type className="w-3 h-3" /> + Header
              </button>
              <button onClick={() => addBlock(selectedPageIdx, "primary")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5BA3B8]/20 hover:bg-[#5BA3B8]/30 text-[#5BA3B8] text-xs transition-colors border border-[#5BA3B8]/30">
                <Type className="w-3 h-3" /> + Primary Text
              </button>
              <button onClick={() => addBlock(selectedPageIdx, "normal")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs transition-colors border border-white/10">
                <AlignLeft className="w-3 h-3" /> + Normal Text
              </button>
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        {showPreview && (
          <div className="w-72 border-l border-white/10 bg-[#141c2e] flex flex-col overflow-hidden shrink-0">
            <div className="px-3 py-2 border-b border-white/10">
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Live Preview</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="rounded-lg overflow-hidden shadow-2xl">
                <PagePreview
                  page={currentPage}
                  country={doc.country}
                  programType={doc.programType}
                  createdAt={doc.createdAt}
                  pageNumber={selectedPageIdx + 1}
                  totalPages={doc.pages.length}
                />
              </div>
              <div className="mt-3 text-[10px] text-gray-600 text-center">
                Page {selectedPageIdx + 1} of {doc.pages.length}
              </div>
              {/* Mini page strip */}
              <div className="mt-4 space-y-2">
                <div className="text-[10px] text-gray-600 uppercase tracking-wider">All Pages</div>
                {doc.pages.map((page, idx) => (
                  <button
                    key={page.id}
                    onClick={() => setSelectedPageIdx(idx)}
                    className={`w-full rounded overflow-hidden border-2 transition-all ${
                      idx === selectedPageIdx ? "border-teal-500" : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    <PagePreview
                      page={page}
                      country={doc.country}
                      programType={doc.programType}
                      createdAt={doc.createdAt}
                      pageNumber={idx + 1}
                      totalPages={doc.pages.length}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
