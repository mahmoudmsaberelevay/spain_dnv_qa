import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft, Plus, Trash2, Download, Upload, Loader2,
  ChevronUp, ChevronDown, FileText, Image as ImageIcon, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// ─── ELEVAY Brand ──────────────────────────────────────────────────────────────
const ELEVAY_LOGO = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663524211981/amjcwILftyyzFnPH.png";
const COLORS = {
  navy: "#1A3A5C",
  teal: "#5BA3B8",
  red: "#E63946",
  divider: "#CCCCCC",
  text: "#2C2C2C",
  lightTeal: "#EBF5F8",
};

// ─── Types ─────────────────────────────────────────────────────────────────────
export type TemplateType = "cover" | "overview" | "eligibility" | "process" | "about" | "blank";

export interface InfoRow { label: string; value: string; }
export interface Requirement { heading: string; text: string; }
export interface Stage { heading: string; text: string; }
export interface FeeRow { label: string; value: string; }
export interface ContentBlock { type: "text" | "image" | "list"; text?: string; items?: string[]; imageUrl?: string; }

export interface PageData {
  id: string;
  template: TemplateType;
  photoUrl: string | null;
  content: Record<string, unknown>;
}

export interface DocumentData {
  country: string;
  programType: string;
  programSubtype: string;
  createdAt: number;
  pages: PageData[];
}

const TEMPLATE_LABELS: Record<TemplateType, string> = {
  cover: "Cover Page",
  overview: "Programme Overview",
  eligibility: "Eligibility & Requirements",
  process: "Process & Stages",
  about: "About Country",
  blank: "Custom Blank",
};

// ─── Photo Upload Button ───────────────────────────────────────────────────────
function PhotoUploadButton({ pageId, summaryId, currentUrl, onUploaded }: {
  pageId: string; summaryId: number; currentUrl: string | null; onUploaded: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadMutation = trpc.marketing.uploadPagePhoto.useMutation({
    onSuccess: (data) => { onUploaded(data.url); toast.success("Photo uploaded"); },
    onError: (err) => toast.error(err.message),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Photo must be under 10 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({ summaryId, pageId, fileBase64: base64, fileName: file.name, mimeType: file.type });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-2">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      {currentUrl ? (
        <div className="relative group rounded-lg overflow-hidden border border-white/10">
          <img src={currentUrl} alt="Page photo" className="w-full h-32 object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg">
              Change
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-white/20 hover:border-teal-500/50 text-gray-400 hover:text-teal-400 transition-all"
        >
          {uploadMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
          <span className="text-xs">{uploadMutation.isPending ? "Uploading..." : "Upload Photo"}</span>
        </button>
      )}
    </div>
  );
}

// ─── JSON list editor (for info rows, requirements, stages, etc.) ─────────────
function InfoRowEditor({ rows, onChange, labelPlaceholder = "Label", valuePlaceholder = "Value" }: {
  rows: InfoRow[]; onChange: (rows: InfoRow[]) => void;
  labelPlaceholder?: string; valuePlaceholder?: string;
}) {
  const add = () => onChange([...rows, { label: "", value: "" }]);
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const update = (i: number, field: "label" | "value", val: string) =>
    onChange(rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 items-start">
          <Input value={row.label} onChange={e => update(i, "label", e.target.value)} placeholder={labelPlaceholder}
            className="bg-[#0f1623] border-white/10 text-white text-xs h-8 flex-1" />
          <Input value={row.value} onChange={e => update(i, "value", e.target.value)} placeholder={valuePlaceholder}
            className="bg-[#0f1623] border-white/10 text-white text-xs h-8 flex-1" />
          <button onClick={() => remove(i)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 transition-colors">
        <Plus className="w-3 h-3" /> Add Row
      </button>
    </div>
  );
}

function BulletListEditor({ items, onChange, placeholder = "Item..." }: {
  items: string[]; onChange: (items: string[]) => void; placeholder?: string;
}) {
  const add = () => onChange([...items, ""]);
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const update = (i: number, val: string) => onChange(items.map((it, idx) => idx === i ? val : it));

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 items-center">
          <div className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
          <Input value={item} onChange={e => update(i, e.target.value)} placeholder={placeholder}
            className="bg-[#0f1623] border-white/10 text-white text-xs h-7 flex-1" />
          <button onClick={() => remove(i)} className="p-1 text-gray-500 hover:text-red-400 transition-colors shrink-0">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 transition-colors">
        <Plus className="w-3 h-3" /> Add Item
      </button>
    </div>
  );
}

function RequirementsEditor({ reqs, onChange }: { reqs: Requirement[]; onChange: (r: Requirement[]) => void }) {
  const add = () => onChange([...reqs, { heading: "", text: "" }]);
  const remove = (i: number) => onChange(reqs.filter((_, idx) => idx !== i));
  const update = (i: number, field: "heading" | "text", val: string) =>
    onChange(reqs.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  return (
    <div className="space-y-3">
      {reqs.map((req, i) => (
        <div key={i} className="bg-[#0f1623] rounded-lg p-3 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: COLORS.red }}>{i + 1}</div>
            <Input value={req.heading} onChange={e => update(i, "heading", e.target.value)} placeholder="Requirement heading..."
              className="bg-transparent border-none text-white text-xs h-6 p-0 font-semibold flex-1" />
            <button onClick={() => remove(i)} className="p-1 text-gray-500 hover:text-red-400 transition-colors shrink-0">
              <X className="w-3 h-3" />
            </button>
          </div>
          <Textarea value={req.text} onChange={e => update(i, "text", e.target.value)} placeholder="Requirement description..."
            className="bg-[#141c2b] border-white/10 text-gray-300 text-xs min-h-[50px] resize-none" rows={2} />
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 transition-colors">
        <Plus className="w-3 h-3" /> Add Requirement
      </button>
    </div>
  );
}

function StagesEditor({ stages, onChange }: { stages: Stage[]; onChange: (s: Stage[]) => void }) {
  const add = () => onChange([...stages, { heading: "", text: "" }]);
  const remove = (i: number) => onChange(stages.filter((_, idx) => idx !== i));
  const update = (i: number, field: "heading" | "text", val: string) =>
    onChange(stages.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  return (
    <div className="space-y-2">
      {stages.map((stage, i) => (
        <div key={i} className="bg-[#0f1623] rounded-lg p-3 border border-white/10">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ background: COLORS.teal }}>{i + 1}</div>
            <Input value={stage.heading} onChange={e => update(i, "heading", e.target.value)} placeholder="Stage heading..."
              className="bg-transparent border-none text-white text-xs h-6 p-0 font-semibold flex-1" />
            <button onClick={() => remove(i)} className="p-1 text-gray-500 hover:text-red-400 transition-colors shrink-0">
              <X className="w-3 h-3" />
            </button>
          </div>
          <Textarea value={stage.text} onChange={e => update(i, "text", e.target.value)} placeholder="Stage description..."
            className="bg-[#141c2b] border-white/10 text-gray-300 text-xs min-h-[50px] resize-none" rows={2} />
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 transition-colors">
        <Plus className="w-3 h-3" /> Add Stage
      </button>
    </div>
  );
}

// ─── Content Editors per Template ─────────────────────────────────────────────
function CoverEditor({ page, summaryId, onChange }: { page: PageData; summaryId: number; onChange: (p: PageData) => void }) {
  const c = page.content as { countryName?: string; programLabel?: string; programSubtype?: string; summaryLabel?: string };
  const set = (key: string, val: string) => onChange({ ...page, content: { ...page.content, [key]: val } });

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-gray-400 text-xs mb-1.5 block">Cover Photo (left half)</Label>
        <PhotoUploadButton pageId={page.id} summaryId={summaryId} currentUrl={page.photoUrl}
          onUploaded={url => onChange({ ...page, photoUrl: url })} />
      </div>
      <div className="space-y-3">
        <div>
          <Label className="text-gray-400 text-xs mb-1 block">Country Name (displayed large)</Label>
          <Input value={String(c.countryName || "")} onChange={e => set("countryName", e.target.value)}
            className="bg-[#0f1623] border-white/10 text-white text-sm" placeholder="e.g. DOMINICA" />
        </div>
        <div>
          <Label className="text-gray-400 text-xs mb-1 block">Program Label</Label>
          <Input value={String(c.programLabel || "")} onChange={e => set("programLabel", e.target.value)}
            className="bg-[#0f1623] border-white/10 text-white text-sm" placeholder="e.g. Citizenship by Investment" />
        </div>
        <div>
          <Label className="text-gray-400 text-xs mb-1 block">Program Subtype (spaced caps)</Label>
          <Input value={String(c.programSubtype || "")} onChange={e => set("programSubtype", e.target.value)}
            className="bg-[#0f1623] border-white/10 text-white text-sm" placeholder="e.g. CITIZENSHIP" />
        </div>
        <div>
          <Label className="text-gray-400 text-xs mb-1 block">Summary Label</Label>
          <Input value={String(c.summaryLabel || "PROGRAM SUMMARY")} onChange={e => set("summaryLabel", e.target.value)}
            className="bg-[#0f1623] border-white/10 text-white text-sm" />
        </div>
      </div>
    </div>
  );
}

function OverviewEditor({ page, summaryId, onChange }: { page: PageData; summaryId: number; onChange: (p: PageData) => void }) {
  const c = page.content as { sectionLabel?: string; heading?: string; intro?: string; infoRows?: InfoRow[] };
  const set = (key: string, val: unknown) => onChange({ ...page, content: { ...page.content, [key]: val } });

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-gray-400 text-xs mb-1.5 block">Right Column Photo</Label>
        <PhotoUploadButton pageId={page.id} summaryId={summaryId} currentUrl={page.photoUrl}
          onUploaded={url => onChange({ ...page, photoUrl: url })} />
      </div>
      <div>
        <Label className="text-gray-400 text-xs mb-1 block">Section Label (spaced caps)</Label>
        <Input value={String(c.sectionLabel || "")} onChange={e => set("sectionLabel", e.target.value)}
          className="bg-[#0f1623] border-white/10 text-white text-sm" placeholder="PROGRAMME OVERVIEW" />
      </div>
      <div>
        <Label className="text-gray-400 text-xs mb-1 block">Main Heading</Label>
        <Input value={String(c.heading || "")} onChange={e => set("heading", e.target.value)}
          className="bg-[#0f1623] border-white/10 text-white text-sm" />
      </div>
      <div>
        <Label className="text-gray-400 text-xs mb-1 block">Introduction Paragraph</Label>
        <Textarea value={String(c.intro || "")} onChange={e => set("intro", e.target.value)}
          className="bg-[#0f1623] border-white/10 text-white text-sm min-h-[80px] resize-none" rows={3} />
      </div>
      <div>
        <Label className="text-gray-400 text-xs mb-2 block">Info Rows (teal label + bold value)</Label>
        <InfoRowEditor rows={(c.infoRows || []) as InfoRow[]} onChange={rows => set("infoRows", rows)}
          labelPlaceholder="LABEL (teal)" valuePlaceholder="Value (bold navy)" />
      </div>
    </div>
  );
}

function EligibilityEditor({ page, summaryId, onChange }: { page: PageData; summaryId: number; onChange: (p: PageData) => void }) {
  const c = page.content as {
    requirements?: Requirement[];
    idealCandidateHeading?: string;
    idealCandidateIntro?: string;
    idealCandidateBullets?: string[];
  };
  const set = (key: string, val: unknown) => onChange({ ...page, content: { ...page.content, [key]: val } });

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-gray-400 text-xs mb-1.5 block">Page Photo (optional, used as background accent)</Label>
        <PhotoUploadButton pageId={page.id} summaryId={summaryId} currentUrl={page.photoUrl}
          onUploaded={url => onChange({ ...page, photoUrl: url })} />
      </div>
      <div>
        <Label className="text-gray-400 text-xs mb-2 block">Requirements (left column — numbered with red badges)</Label>
        <RequirementsEditor reqs={(c.requirements || []) as Requirement[]} onChange={reqs => set("requirements", reqs)} />
      </div>
      <div className="border-t border-white/10 pt-4">
        <Label className="text-gray-400 text-xs mb-2 block">Ideal Candidate Box (right column)</Label>
        <div className="space-y-2">
          <Input value={String(c.idealCandidateHeading || "Ideal Candidate")} onChange={e => set("idealCandidateHeading", e.target.value)}
            className="bg-[#0f1623] border-white/10 text-white text-sm" placeholder="Box heading" />
          <Textarea value={String(c.idealCandidateIntro || "")} onChange={e => set("idealCandidateIntro", e.target.value)}
            className="bg-[#0f1623] border-white/10 text-white text-sm min-h-[60px] resize-none" rows={2} placeholder="Intro text..." />
          <Label className="text-gray-400 text-xs mb-1 block">Bullet Points</Label>
          <BulletListEditor items={(c.idealCandidateBullets || []) as string[]} onChange={items => set("idealCandidateBullets", items)} />
        </div>
      </div>
    </div>
  );
}

function ProcessEditor({ page, summaryId, onChange }: { page: PageData; summaryId: number; onChange: (p: PageData) => void }) {
  const c = page.content as { stages?: Stage[]; feesHeading?: string; feeRows?: FeeRow[] };
  const set = (key: string, val: unknown) => onChange({ ...page, content: { ...page.content, [key]: val } });

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-gray-400 text-xs mb-1.5 block">Page Photo (optional)</Label>
        <PhotoUploadButton pageId={page.id} summaryId={summaryId} currentUrl={page.photoUrl}
          onUploaded={url => onChange({ ...page, photoUrl: url })} />
      </div>
      <div>
        <Label className="text-gray-400 text-xs mb-2 block">Process Stages (left column)</Label>
        <StagesEditor stages={(c.stages || []) as Stage[]} onChange={stages => set("stages", stages)} />
      </div>
      <div className="border-t border-white/10 pt-4">
        <Label className="text-gray-400 text-xs mb-2 block">Fees Table (right column)</Label>
        <Input value={String(c.feesHeading || "Programme Fees")} onChange={e => set("feesHeading", e.target.value)}
          className="bg-[#0f1623] border-white/10 text-white text-sm mb-2" placeholder="Fees section heading" />
        <InfoRowEditor rows={(c.feeRows || []) as InfoRow[]} onChange={rows => set("feeRows", rows)}
          labelPlaceholder="Fee type" valuePlaceholder="Amount" />
      </div>
    </div>
  );
}

function AboutEditor({ page, summaryId, onChange }: { page: PageData; summaryId: number; onChange: (p: PageData) => void }) {
  const c = page.content as {
    heading?: string; paragraphs?: string[]; infoRows?: InfoRow[];
    rankingsHeading?: string; rankings?: string[];
    membershipsHeading?: string; memberships?: string[];
  };
  const set = (key: string, val: unknown) => onChange({ ...page, content: { ...page.content, [key]: val } });

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-gray-400 text-xs mb-1.5 block">Left Column Photo</Label>
        <PhotoUploadButton pageId={page.id} summaryId={summaryId} currentUrl={page.photoUrl}
          onUploaded={url => onChange({ ...page, photoUrl: url })} />
      </div>
      <div>
        <Label className="text-gray-400 text-xs mb-1 block">Main Heading</Label>
        <Input value={String(c.heading || "")} onChange={e => set("heading", e.target.value)}
          className="bg-[#0f1623] border-white/10 text-white text-sm" />
      </div>
      <div>
        <Label className="text-gray-400 text-xs mb-2 block">Paragraphs</Label>
        <BulletListEditor items={(c.paragraphs || []) as string[]} onChange={items => set("paragraphs", items)} placeholder="Paragraph text..." />
      </div>
      <div>
        <Label className="text-gray-400 text-xs mb-2 block">Info Rows</Label>
        <InfoRowEditor rows={(c.infoRows || []) as InfoRow[]} onChange={rows => set("infoRows", rows)} />
      </div>
      <div className="border-t border-white/10 pt-3">
        <Label className="text-gray-400 text-xs mb-1 block">Rankings Box Heading</Label>
        <Input value={String(c.rankingsHeading || "Global Rankings")} onChange={e => set("rankingsHeading", e.target.value)}
          className="bg-[#0f1623] border-white/10 text-white text-sm mb-2" />
        <BulletListEditor items={(c.rankings || []) as string[]} onChange={items => set("rankings", items)} placeholder="e.g. #45 in Human Development Index" />
      </div>
      <div className="border-t border-white/10 pt-3">
        <Label className="text-gray-400 text-xs mb-1 block">Memberships Box Heading</Label>
        <Input value={String(c.membershipsHeading || "International Memberships")} onChange={e => set("membershipsHeading", e.target.value)}
          className="bg-[#0f1623] border-white/10 text-white text-sm mb-2" />
        <BulletListEditor items={(c.memberships || []) as string[]} onChange={items => set("memberships", items)} placeholder="e.g. United Nations" />
      </div>
    </div>
  );
}

function BlankEditor({ page, summaryId, onChange }: { page: PageData; summaryId: number; onChange: (p: PageData) => void }) {
  const c = page.content as { layout?: string; blocks?: ContentBlock[] };
  const set = (key: string, val: unknown) => onChange({ ...page, content: { ...page.content, [key]: val } });
  const blocks = (c.blocks || []) as ContentBlock[];
  const addBlock = (type: ContentBlock["type"]) => set("blocks", [...blocks, { type, text: "", items: [], imageUrl: "" }]);
  const removeBlock = (i: number) => set("blocks", blocks.filter((_, idx) => idx !== i));
  const updateBlock = (i: number, field: string, val: unknown) =>
    set("blocks", blocks.map((b, idx) => idx === i ? { ...b, [field]: val } : b));

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-gray-400 text-xs mb-1.5 block">Photo (optional)</Label>
        <PhotoUploadButton pageId={page.id} summaryId={summaryId} currentUrl={page.photoUrl}
          onUploaded={url => onChange({ ...page, photoUrl: url })} />
      </div>
      <div>
        <Label className="text-gray-400 text-xs mb-1.5 block">Layout</Label>
        <div className="flex gap-2">
          {["single", "two-col", "full-width"].map(layout => (
            <button key={layout} onClick={() => set("layout", layout)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                (c.layout || "single") === layout ? "bg-teal-600 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"
              }`}>
              {layout === "single" ? "Single" : layout === "two-col" ? "Two Column" : "Full Width"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-gray-400 text-xs mb-2 block">Content Blocks</Label>
        <div className="space-y-2">
          {blocks.map((block, i) => (
            <div key={i} className="bg-[#0f1623] rounded-lg p-3 border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400 font-medium capitalize">{block.type} block</span>
                <button onClick={() => removeBlock(i)} className="p-1 text-gray-500 hover:text-red-400 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
              {block.type === "text" && (
                <Textarea value={block.text || ""} onChange={e => updateBlock(i, "text", e.target.value)}
                  className="bg-[#141c2b] border-white/10 text-white text-xs min-h-[60px] resize-none" rows={3} placeholder="Text content..." />
              )}
              {block.type === "list" && (
                <BulletListEditor items={block.items || []} onChange={items => updateBlock(i, "items", items)} />
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <button onClick={() => addBlock("text")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs transition-colors">
            <Plus className="w-3 h-3" /> Text
          </button>
          <button onClick={() => addBlock("list")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs transition-colors">
            <Plus className="w-3 h-3" /> List
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page Preview (A4 proportional) ───────────────────────────────────────────
function PagePreview({ page, doc }: { page: PageData; doc: DocumentData }) {
  const monthYear = new Date(doc.createdAt).toLocaleString("en-US", { month: "long", year: "numeric" });

  const wrapperStyle: React.CSSProperties = {
    width: "100%",
    aspectRatio: "210/297",
    fontFamily: "'Montserrat', sans-serif",
    overflow: "hidden",
    position: "relative",
    background: "white",
    fontSize: "7px",
  };

  const header = (
    <div style={{ background: COLORS.navy, height: "8%", display: "flex", alignItems: "center", padding: "0 16px", gap: "8px", flexShrink: 0 }}>
      <img src={ELEVAY_LOGO} alt="ELEVAY" style={{ height: "18px", width: "auto", objectFit: "contain" }} />
      <div style={{ width: "1px", height: "12px", background: "rgba(255,255,255,0.2)" }} />
      <div style={{ color: "white", fontSize: "6px", fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {doc.country} — {doc.programType}
      </div>
    </div>
  );

  const footer = (
    <div style={{ height: "5%", borderTop: `1px solid ${COLORS.divider}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0 }}>
      <div style={{ fontSize: "5px", color: "#999", textTransform: "uppercase", letterSpacing: "0.08em" }}>ELEVAY — Citizenship & Residency by Investment</div>
    </div>
  );

  if (page.template === "cover") {
    const c = page.content as { countryName?: string; programLabel?: string; programSubtype?: string; summaryLabel?: string };
    return (
      <div style={{ ...wrapperStyle, display: "flex" }}>
        {/* Left: photo */}
        <div style={{ width: "50%", height: "100%", background: COLORS.navy, overflow: "hidden", flexShrink: 0 }}>
          {page.photoUrl
            ? <img src={page.photoUrl} alt="cover" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)", fontSize: "8px" }}>Upload Photo</div>
          }
        </div>
        {/* Right: branding */}
        <div style={{ width: "50%", height: "100%", background: "white", display: "flex", flexDirection: "column", padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "auto" }}>
            <img src={ELEVAY_LOGO} alt="ELEVAY" style={{ height: "20px", width: "auto", objectFit: "contain" }} />
            <div>
              <div style={{ fontSize: "6px", fontWeight: 700, color: COLORS.navy, letterSpacing: "0.1em" }}>ELEVAY</div>
              <div style={{ fontSize: "5px", color: COLORS.teal, letterSpacing: "0.08em" }}>CITIZENSHIP & RESIDENCY</div>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ background: COLORS.teal, padding: "10px 12px", marginLeft: "-16px", marginRight: "-16px" }}>
            <div style={{ color: "white", fontSize: "14px", fontWeight: 700, letterSpacing: "0.05em" }}>{c.countryName || doc.country.toUpperCase()}</div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "7px", marginTop: "3px", letterSpacing: "0.08em" }}>{c.programLabel || doc.programType}</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "6px", letterSpacing: "0.15em", textTransform: "uppercase", marginTop: "2px" }}>{c.summaryLabel || "PROGRAM SUMMARY"}</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "5px", marginTop: "6px" }}>Last updated: {monthYear}</div>
          </div>
        </div>
      </div>
    );
  }

  if (page.template === "overview") {
    const c = page.content as { sectionLabel?: string; heading?: string; intro?: string; infoRows?: InfoRow[] };
    const rows = (c.infoRows || []) as InfoRow[];
    return (
      <div style={{ ...wrapperStyle, display: "flex", flexDirection: "column" }}>
        {header}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left col */}
          <div style={{ width: "45%", padding: "10px 10px 10px 12px", borderRight: `1px solid ${COLORS.divider}`, overflow: "hidden" }}>
            <div style={{ fontSize: "5px", letterSpacing: "0.15em", color: COLORS.teal, textTransform: "uppercase", marginBottom: "4px" }}>{c.sectionLabel || "PROGRAMME OVERVIEW"}</div>
            <div style={{ fontSize: "9px", fontWeight: 700, color: COLORS.navy, marginBottom: "4px", lineHeight: 1.2 }}>{c.heading || ""}</div>
            <div style={{ fontSize: "6px", color: COLORS.text, lineHeight: 1.5, marginBottom: "6px" }}>{c.intro || ""}</div>
            {rows.map((row, i) => (
              <div key={i}>
                {i > 0 && <div style={{ height: "1px", background: COLORS.divider, margin: "4px 0" }} />}
                <div style={{ fontSize: "5px", letterSpacing: "0.1em", color: COLORS.teal, textTransform: "uppercase" }}>{row.label}</div>
                <div style={{ fontSize: "6px", fontWeight: 700, color: COLORS.navy }}>{row.value}</div>
              </div>
            ))}
          </div>
          {/* Right col: photo */}
          <div style={{ width: "55%", overflow: "hidden" }}>
            {page.photoUrl
              ? <img src={page.photoUrl} alt="overview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{ width: "100%", height: "100%", background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc", fontSize: "7px" }}>Upload Photo</div>
            }
          </div>
        </div>
        {footer}
      </div>
    );
  }

  if (page.template === "eligibility") {
    const c = page.content as { requirements?: Requirement[]; idealCandidateHeading?: string; idealCandidateIntro?: string; idealCandidateBullets?: string[] };
    const reqs = (c.requirements || []) as Requirement[];
    const bullets = (c.idealCandidateBullets || []) as string[];
    return (
      <div style={{ ...wrapperStyle, display: "flex", flexDirection: "column" }}>
        {header}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left: requirements */}
          <div style={{ width: "50%", padding: "10px 8px 10px 12px", borderRight: `1px solid ${COLORS.divider}`, overflow: "hidden" }}>
            {reqs.map((req, i) => (
              <div key={i} style={{ marginBottom: "6px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "4px", marginBottom: "2px" }}>
                  <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: COLORS.red, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "5px", fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ fontSize: "6px", fontWeight: 700, color: COLORS.navy, lineHeight: 1.3 }}>{req.heading}</div>
                </div>
                <div style={{ fontSize: "5.5px", color: COLORS.text, lineHeight: 1.4, paddingLeft: "16px" }}>{req.text}</div>
              </div>
            ))}
          </div>
          {/* Right: ideal candidate */}
          <div style={{ width: "50%", padding: "10px 12px 10px 8px", overflow: "hidden" }}>
            <div style={{ border: `1px solid ${COLORS.teal}`, borderRadius: "4px", padding: "8px", background: COLORS.lightTeal }}>
              <div style={{ fontSize: "7px", fontWeight: 700, color: COLORS.navy, marginBottom: "4px" }}>{c.idealCandidateHeading || "Ideal Candidate"}</div>
              <div style={{ fontSize: "5.5px", color: COLORS.text, lineHeight: 1.5, marginBottom: "4px" }}>{c.idealCandidateIntro || ""}</div>
              {bullets.map((b, i) => (
                <div key={i} style={{ display: "flex", gap: "4px", marginBottom: "2px" }}>
                  <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: COLORS.teal, marginTop: "2px", flexShrink: 0 }} />
                  <div style={{ fontSize: "5.5px", color: COLORS.text }}>{b}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {footer}
      </div>
    );
  }

  if (page.template === "process") {
    const c = page.content as { stages?: Stage[]; feesHeading?: string; feeRows?: FeeRow[] };
    const stages = (c.stages || []) as Stage[];
    const feeRows = (c.feeRows || []) as FeeRow[];
    return (
      <div style={{ ...wrapperStyle, display: "flex", flexDirection: "column" }}>
        {header}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left: stages */}
          <div style={{ width: "55%", padding: "10px 8px 10px 12px", borderRight: `1px solid ${COLORS.divider}`, overflow: "hidden" }}>
            {stages.map((stage, i) => (
              <div key={i}>
                {i > 0 && <div style={{ height: "1px", background: COLORS.divider, margin: "5px 0" }} />}
                <div style={{ display: "flex", gap: "4px", alignItems: "flex-start" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: COLORS.teal, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "5px", fontWeight: 700, flexShrink: 0, marginTop: "1px" }}>{i + 1}</div>
                  <div>
                    <div style={{ fontSize: "6px", fontWeight: 700, color: COLORS.navy, marginBottom: "1px" }}>{stage.heading}</div>
                    <div style={{ fontSize: "5.5px", color: COLORS.text, lineHeight: 1.4 }}>{stage.text}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Right: fees */}
          <div style={{ width: "45%", padding: "10px 12px 10px 8px", overflow: "hidden" }}>
            <div style={{ fontSize: "7px", fontWeight: 700, color: COLORS.navy, marginBottom: "6px" }}>{c.feesHeading || "Programme Fees"}</div>
            {feeRows.map((row, i) => (
              <div key={i}>
                {i > 0 && <div style={{ height: "1px", background: COLORS.divider, margin: "3px 0" }} />}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontSize: "5.5px", color: COLORS.text }}>{row.label}</div>
                  <div style={{ fontSize: "5.5px", fontWeight: 700, color: COLORS.navy }}>{row.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {footer}
      </div>
    );
  }

  if (page.template === "about") {
    const c = page.content as { heading?: string; paragraphs?: string[]; infoRows?: InfoRow[]; rankingsHeading?: string; rankings?: string[]; membershipsHeading?: string; memberships?: string[] };
    const rows = (c.infoRows || []) as InfoRow[];
    const rankings = (c.rankings || []) as string[];
    const memberships = (c.memberships || []) as string[];
    return (
      <div style={{ ...wrapperStyle, display: "flex", flexDirection: "column" }}>
        {header}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left: photo */}
          <div style={{ width: "45%", overflow: "hidden" }}>
            {page.photoUrl
              ? <img src={page.photoUrl} alt="about" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{ width: "100%", height: "100%", background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc", fontSize: "7px" }}>Upload Photo</div>
            }
          </div>
          {/* Right: info */}
          <div style={{ width: "55%", padding: "10px 12px 10px 8px", borderLeft: `1px solid ${COLORS.divider}`, overflow: "hidden" }}>
            <div style={{ fontSize: "9px", fontWeight: 700, color: COLORS.navy, marginBottom: "5px" }}>{c.heading || ""}</div>
            {(c.paragraphs || []).slice(0, 2).map((p, i) => (
              <div key={i} style={{ fontSize: "5.5px", color: COLORS.text, lineHeight: 1.5, marginBottom: "4px" }}>{p}</div>
            ))}
            {rows.slice(0, 3).map((row, i) => (
              <div key={i}>
                {i > 0 && <div style={{ height: "1px", background: COLORS.divider, margin: "3px 0" }} />}
                <div style={{ fontSize: "5px", letterSpacing: "0.1em", color: COLORS.teal, textTransform: "uppercase" }}>{row.label}</div>
                <div style={{ fontSize: "6px", fontWeight: 700, color: COLORS.navy }}>{row.value}</div>
              </div>
            ))}
            {rankings.length > 0 && (
              <div style={{ border: `1px solid ${COLORS.divider}`, borderRadius: "3px", padding: "5px", marginTop: "5px" }}>
                <div style={{ fontSize: "6px", fontWeight: 700, color: COLORS.navy, marginBottom: "3px" }}>{c.rankingsHeading || "Global Rankings"}</div>
                {rankings.slice(0, 3).map((r, i) => (
                  <div key={i} style={{ fontSize: "5px", color: COLORS.text, marginBottom: "1px" }}>• {r}</div>
                ))}
              </div>
            )}
          </div>
        </div>
        {footer}
      </div>
    );
  }

  // Blank
  const c = page.content as { layout?: string; blocks?: ContentBlock[] };
  const blocks = (c.blocks || []) as ContentBlock[];
  return (
    <div style={{ ...wrapperStyle, display: "flex", flexDirection: "column" }}>
      {header}
      <div style={{ flex: 1, padding: "10px 16px", overflow: "hidden" }}>
        {blocks.length === 0
          ? <div style={{ color: "#ccc", fontSize: "7px", textAlign: "center", marginTop: "30px" }}>Empty page — add content blocks</div>
          : blocks.map((block, i) => (
              <div key={i} style={{ marginBottom: "6px" }}>
                {block.type === "text" && <div style={{ fontSize: "6px", color: COLORS.text, lineHeight: 1.5 }}>{block.text}</div>}
                {block.type === "list" && (block.items || []).map((item, j) => (
                  <div key={j} style={{ display: "flex", gap: "4px", marginBottom: "2px" }}>
                    <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: COLORS.teal, marginTop: "2px", flexShrink: 0 }} />
                    <div style={{ fontSize: "5.5px", color: COLORS.text }}>{item}</div>
                  </div>
                ))}
              </div>
            ))
        }
      </div>
      {footer}
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
    onError: (err) => toast.error(err.message),
  });

  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [selectedPageIdx, setSelectedPageIdx] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");
  const [showAddPage, setShowAddPage] = useState(false);

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
    // Build default doc from summary metadata
    const now = summary.createdAt;
    setDoc({
      country: summary.country,
      programType: summary.programType,
      programSubtype: summary.programSubtype || "RESIDENCY",
      createdAt: now,
      pages: [
        { id: `cover-${now}`, template: "cover", photoUrl: null, content: { countryName: summary.country.toUpperCase(), programLabel: summary.programType, programSubtype: (summary.programSubtype || "RESIDENCY").toUpperCase(), summaryLabel: "PROGRAM SUMMARY" } },
        { id: `overview-${now}`, template: "overview", photoUrl: null, content: { sectionLabel: "PROGRAMME OVERVIEW", heading: `${summary.country} ${summary.programType}`, intro: "", infoRows: [] } },
        { id: `eligibility-${now}`, template: "eligibility", photoUrl: null, content: { requirements: [], idealCandidateHeading: "Ideal Candidate", idealCandidateIntro: "", idealCandidateBullets: [] } },
        { id: `process-${now}`, template: "process", photoUrl: null, content: { stages: [], feesHeading: "Programme Fees", feeRows: [] } },
        { id: `about-${now}`, template: "about", photoUrl: null, content: { heading: `About ${summary.country}`, paragraphs: [], infoRows: [], rankingsHeading: "Global Rankings", rankings: [], membershipsHeading: "International Memberships", memberships: [] } },
      ],
    });
  }, [summary]);

  // Auto-save
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

  const updatePage = useCallback((updatedPage: PageData) => {
    setDoc(prev => prev ? { ...prev, pages: prev.pages.map(p => p.id === updatedPage.id ? updatedPage : p) } : prev);
  }, []);

  const addPage = (template: TemplateType) => {
    if (!doc) return;
    const newPage: PageData = { id: `${template}-${Date.now()}`, template, photoUrl: null, content: {} };
    const pages = [...doc.pages];
    pages.splice(selectedPageIdx + 1, 0, newPage);
    setDoc({ ...doc, pages });
    setSelectedPageIdx(selectedPageIdx + 1);
    setShowAddPage(false);
  };

  const deletePage = (idx: number) => {
    if (!doc || doc.pages.length <= 1) return;
    if (!confirm("Delete this page?")) return;
    const pages = doc.pages.filter((_, i) => i !== idx);
    setDoc({ ...doc, pages });
    setSelectedPageIdx(Math.min(idx, pages.length - 1));
  };

  const movePage = (idx: number, dir: -1 | 1) => {
    if (!doc) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= doc.pages.length) return;
    const pages = [...doc.pages];
    [pages[idx], pages[newIdx]] = [pages[newIdx], pages[idx]];
    setDoc({ ...doc, pages });
    setSelectedPageIdx(newIdx);
  };

  // PDF Export
  const handleExportPdf = async () => {
    if (!doc) return;
    setIsExporting(true);
    try {
      const monthYear = new Date(doc.createdAt).toLocaleString("en-US", { month: "long", year: "numeric" });
      const printWindow = window.open("", "_blank");
      if (!printWindow) { toast.error("Allow popups to export PDF"); setIsExporting(false); return; }

      const headerHtml = (country: string, programType: string) => `
        <div style="background:${COLORS.navy};height:50px;display:flex;align-items:center;padding:0 28px;gap:12px;flex-shrink:0;">
          <img src="${ELEVAY_LOGO}" style="height:28px;width:auto;object-fit:contain;" />
          <div style="width:1px;height:16px;background:rgba(255,255,255,0.2);"></div>
          <div style="color:white;font-size:9px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;">${country} — ${programType}</div>
        </div>`;
      const footerHtml = `
        <div style="height:28px;border-top:1px solid ${COLORS.divider};display:flex;align-items:center;justify-content:space-between;padding:0 28px;flex-shrink:0;">
          <div style="font-size:7px;color:#999;text-transform:uppercase;letter-spacing:0.08em;">ELEVAY — Citizenship & Residency by Investment</div>
        </div>`;

      const pagesHtml = doc.pages.map((page) => {
        if (page.template === "cover") {
          const c = page.content as { countryName?: string; programLabel?: string; programSubtype?: string; summaryLabel?: string };
          return `<div class="page" style="display:flex;font-family:'Montserrat',sans-serif;">
            <div style="width:50%;height:100%;background:${COLORS.navy};overflow:hidden;flex-shrink:0;">
              ${page.photoUrl ? `<img src="${page.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.2);font-size:14px;">No Photo</div>`}
            </div>
            <div style="width:50%;height:100%;background:white;display:flex;flex-direction:column;padding:40px;">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:auto;">
                <img src="${ELEVAY_LOGO}" style="height:40px;width:auto;object-fit:contain;" />
                <div>
                  <div style="font-size:11px;font-weight:700;color:${COLORS.navy};letter-spacing:0.1em;">ELEVAY</div>
                  <div style="font-size:9px;color:${COLORS.teal};letter-spacing:0.08em;">CITIZENSHIP & RESIDENCY</div>
                </div>
              </div>
              <div style="flex:1;"></div>
              <div style="background:${COLORS.teal};padding:24px 28px;margin:0 -40px -40px -40px;">
                <div style="color:white;font-size:32px;font-weight:700;letter-spacing:0.05em;margin-bottom:6px;">${c.countryName || doc.country.toUpperCase()}</div>
                <div style="color:rgba(255,255,255,0.9);font-size:14px;margin-bottom:4px;">${c.programLabel || doc.programType}</div>
                <div style="color:rgba(255,255,255,0.7);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px;">${c.summaryLabel || "PROGRAM SUMMARY"}</div>
                <div style="color:rgba(255,255,255,0.5);font-size:9px;">Last updated: ${monthYear}</div>
              </div>
            </div>
          </div>`;
        }

        if (page.template === "overview") {
          const c = page.content as { sectionLabel?: string; heading?: string; intro?: string; infoRows?: InfoRow[] };
          const rows = (c.infoRows || []) as InfoRow[];
          return `<div class="page" style="display:flex;flex-direction:column;font-family:'Montserrat',sans-serif;">
            ${headerHtml(doc.country, doc.programType)}
            <div style="flex:1;display:flex;overflow:hidden;">
              <div style="width:45%;padding:28px 20px 20px 28px;border-right:1px solid ${COLORS.divider};overflow:hidden;">
                <div style="font-size:9px;letter-spacing:0.15em;color:${COLORS.teal};text-transform:uppercase;margin-bottom:8px;">${c.sectionLabel || "PROGRAMME OVERVIEW"}</div>
                <div style="font-size:20px;font-weight:700;color:${COLORS.navy};margin-bottom:10px;line-height:1.2;">${c.heading || ""}</div>
                <div style="font-size:11px;color:${COLORS.text};line-height:1.6;margin-bottom:16px;">${c.intro || ""}</div>
                ${rows.map((row, i) => `
                  ${i > 0 ? `<div style="height:1px;background:${COLORS.divider};margin:8px 0;"></div>` : ""}
                  <div style="font-size:8px;letter-spacing:0.12em;color:${COLORS.teal};text-transform:uppercase;">${row.label}</div>
                  <div style="font-size:11px;font-weight:700;color:${COLORS.navy};">${row.value}</div>
                `).join("")}
              </div>
              <div style="width:55%;overflow:hidden;">
                ${page.photoUrl ? `<img src="${page.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />` : `<div style="width:100%;height:100%;background:#f0f4f8;display:flex;align-items:center;justify-content:center;color:#ccc;">No Photo</div>`}
              </div>
            </div>
            ${footerHtml}
          </div>`;
        }

        if (page.template === "eligibility") {
          const c = page.content as { requirements?: Requirement[]; idealCandidateHeading?: string; idealCandidateIntro?: string; idealCandidateBullets?: string[] };
          const reqs = (c.requirements || []) as Requirement[];
          const bullets = (c.idealCandidateBullets || []) as string[];
          return `<div class="page" style="display:flex;flex-direction:column;font-family:'Montserrat',sans-serif;">
            ${headerHtml(doc.country, doc.programType)}
            <div style="flex:1;display:flex;overflow:hidden;">
              <div style="width:50%;padding:24px 16px 20px 28px;border-right:1px solid ${COLORS.divider};overflow:hidden;">
                ${reqs.map((req, i) => `
                  <div style="margin-bottom:14px;">
                    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:4px;">
                      <div style="width:22px;height:22px;border-radius:50%;background:${COLORS.red};display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:700;flex-shrink:0;">${i + 1}</div>
                      <div style="font-size:11px;font-weight:700;color:${COLORS.navy};line-height:1.3;">${req.heading}</div>
                    </div>
                    <div style="font-size:10px;color:${COLORS.text};line-height:1.5;padding-left:30px;">${req.text}</div>
                  </div>
                `).join("")}
              </div>
              <div style="width:50%;padding:24px 28px 20px 16px;overflow:hidden;">
                <div style="border:1.5px solid ${COLORS.teal};border-radius:6px;padding:16px;background:${COLORS.lightTeal};">
                  <div style="font-size:13px;font-weight:700;color:${COLORS.navy};margin-bottom:8px;">${c.idealCandidateHeading || "Ideal Candidate"}</div>
                  <div style="font-size:10px;color:${COLORS.text};line-height:1.5;margin-bottom:8px;">${c.idealCandidateIntro || ""}</div>
                  ${bullets.map(b => `<div style="display:flex;gap:6px;margin-bottom:4px;"><div style="width:6px;height:6px;border-radius:50%;background:${COLORS.teal};margin-top:3px;flex-shrink:0;"></div><div style="font-size:10px;color:${COLORS.text};">${b}</div></div>`).join("")}
                </div>
              </div>
            </div>
            ${footerHtml}
          </div>`;
        }

        if (page.template === "process") {
          const c = page.content as { stages?: Stage[]; feesHeading?: string; feeRows?: FeeRow[] };
          const stages = (c.stages || []) as Stage[];
          const feeRows = (c.feeRows || []) as FeeRow[];
          return `<div class="page" style="display:flex;flex-direction:column;font-family:'Montserrat',sans-serif;">
            ${headerHtml(doc.country, doc.programType)}
            <div style="flex:1;display:flex;overflow:hidden;">
              <div style="width:55%;padding:24px 16px 20px 28px;border-right:1px solid ${COLORS.divider};overflow:hidden;">
                ${stages.map((stage, i) => `
                  ${i > 0 ? `<div style="height:1px;background:${COLORS.divider};margin:10px 0;"></div>` : ""}
                  <div style="display:flex;gap:8px;align-items:flex-start;">
                    <div style="width:18px;height:18px;border-radius:50%;background:${COLORS.teal};display:flex;align-items:center;justify-content:center;color:white;font-size:8px;font-weight:700;flex-shrink:0;margin-top:1px;">${i + 1}</div>
                    <div>
                      <div style="font-size:11px;font-weight:700;color:${COLORS.navy};margin-bottom:3px;">${stage.heading}</div>
                      <div style="font-size:10px;color:${COLORS.text};line-height:1.5;">${stage.text}</div>
                    </div>
                  </div>
                `).join("")}
              </div>
              <div style="width:45%;padding:24px 28px 20px 16px;overflow:hidden;">
                <div style="font-size:13px;font-weight:700;color:${COLORS.navy};margin-bottom:10px;">${c.feesHeading || "Programme Fees"}</div>
                ${feeRows.map((row, i) => `
                  ${i > 0 ? `<div style="height:1px;background:${COLORS.divider};margin:6px 0;"></div>` : ""}
                  <div style="display:flex;justify-content:space-between;">
                    <div style="font-size:10px;color:${COLORS.text};">${row.label}</div>
                    <div style="font-size:10px;font-weight:700;color:${COLORS.navy};">${row.value}</div>
                  </div>
                `).join("")}
              </div>
            </div>
            ${footerHtml}
          </div>`;
        }

        if (page.template === "about") {
          const c = page.content as { heading?: string; paragraphs?: string[]; infoRows?: InfoRow[]; rankingsHeading?: string; rankings?: string[]; membershipsHeading?: string; memberships?: string[] };
          const rows = (c.infoRows || []) as InfoRow[];
          const rankings = (c.rankings || []) as string[];
          const memberships = (c.memberships || []) as string[];
          return `<div class="page" style="display:flex;flex-direction:column;font-family:'Montserrat',sans-serif;">
            ${headerHtml(doc.country, doc.programType)}
            <div style="flex:1;display:flex;overflow:hidden;">
              <div style="width:45%;overflow:hidden;">
                ${page.photoUrl ? `<img src="${page.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />` : `<div style="width:100%;height:100%;background:#f0f4f8;display:flex;align-items:center;justify-content:center;color:#ccc;">No Photo</div>`}
              </div>
              <div style="width:55%;padding:24px 28px 20px 16px;border-left:1px solid ${COLORS.divider};overflow:hidden;">
                <div style="font-size:20px;font-weight:700;color:${COLORS.navy};margin-bottom:10px;">${c.heading || ""}</div>
                ${((c.paragraphs || []) as string[]).map(p => `<div style="font-size:10px;color:${COLORS.text};line-height:1.6;margin-bottom:8px;">${p}</div>`).join("")}
                ${rows.map((row, i) => `
                  ${i > 0 ? `<div style="height:1px;background:${COLORS.divider};margin:6px 0;"></div>` : ""}
                  <div style="font-size:8px;letter-spacing:0.1em;color:${COLORS.teal};text-transform:uppercase;">${row.label}</div>
                  <div style="font-size:10px;font-weight:700;color:${COLORS.navy};">${row.value}</div>
                `).join("")}
                ${rankings.length > 0 ? `
                  <div style="border:1px solid ${COLORS.divider};border-radius:4px;padding:10px;margin-top:10px;">
                    <div style="font-size:10px;font-weight:700;color:${COLORS.navy};margin-bottom:5px;">${c.rankingsHeading || "Global Rankings"}</div>
                    ${rankings.map(r => `<div style="font-size:9px;color:${COLORS.text};margin-bottom:2px;">• ${r}</div>`).join("")}
                  </div>` : ""}
                ${memberships.length > 0 ? `
                  <div style="border:1px solid ${COLORS.divider};border-radius:4px;padding:10px;margin-top:8px;">
                    <div style="font-size:10px;font-weight:700;color:${COLORS.navy};margin-bottom:5px;">${c.membershipsHeading || "International Memberships"}</div>
                    ${memberships.map(m => `<div style="font-size:9px;color:${COLORS.text};margin-bottom:2px;">• ${m}</div>`).join("")}
                  </div>` : ""}
              </div>
            </div>
            ${footerHtml}
          </div>`;
        }

        // Blank
        const c = page.content as { blocks?: ContentBlock[] };
        const blocks = (c.blocks || []) as ContentBlock[];
        return `<div class="page" style="display:flex;flex-direction:column;font-family:'Montserrat',sans-serif;">
          ${headerHtml(doc.country, doc.programType)}
          <div style="flex:1;padding:28px;overflow:hidden;">
            ${blocks.map(block => {
              if (block.type === "text") return `<div style="font-size:11px;color:${COLORS.text};line-height:1.6;margin-bottom:10px;">${block.text}</div>`;
              if (block.type === "list") return (block.items || []).map(item => `<div style="display:flex;gap:6px;margin-bottom:4px;"><div style="width:6px;height:6px;border-radius:50%;background:${COLORS.teal};margin-top:3px;flex-shrink:0;"></div><div style="font-size:10px;color:${COLORS.text};">${item}</div></div>`).join("");
              return "";
            }).join("")}
          </div>
          ${footerHtml}
        </div>`;
      }).join("");

      printWindow.document.write(`<!DOCTYPE html><html><head>
        <meta charset="UTF-8">
        <title>${doc.country} — ${doc.programType}</title>
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family:'Montserrat',sans-serif; background:#f0f0f0; }
          .page { width:210mm; height:297mm; margin:0 auto 8mm; page-break-after:always; overflow:hidden; background:white; }
          @media print { body { background:white; } .page { margin:0; box-shadow:none; } }
        </style>
      </head><body>${pagesHtml}
        <script>window.onload=function(){setTimeout(function(){window.print();},1800);};</script>
      </body></html>`);
      printWindow.document.close();
      toast.success("PDF export opened — use Ctrl+P / Cmd+P to save as PDF");
    } catch (e) {
      toast.error("Export failed");
    } finally {
      setIsExporting(false);
    }
  };

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
        <Button onClick={handleExportPdf} disabled={isExporting} className="bg-teal-600 hover:bg-teal-700 text-white gap-2 text-sm h-8 px-3">
          {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Export PDF
        </Button>
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
              <button key={page.id} onClick={() => setSelectedPageIdx(idx)}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-all text-xs ${
                  selectedPageIdx === idx ? "bg-teal-600/30 border border-teal-500/50 text-white" : "hover:bg-white/5 text-gray-400 border border-transparent"
                }`}>
                <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-white/10 text-xs">
                  {page.template === "cover" ? "★" : page.template === "overview" ? "📋" : page.template === "eligibility" ? "✓" : page.template === "process" ? "⚙" : page.template === "about" ? "🌍" : <FileText className="w-3 h-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium text-[11px]">{TEMPLATE_LABELS[page.template]}</div>
                  <div className="text-[10px] text-gray-600">{page.photoUrl ? "📷 Photo added" : "No photo"}</div>
                </div>
                <span className="text-[10px] text-gray-600 shrink-0">{idx + 1}</span>
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-white/10">
            <button onClick={() => setShowAddPage(!showAddPage)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs transition-colors">
              <Plus className="w-3 h-3" /> Add Page
            </button>
            {showAddPage && (
              <div className="mt-1 space-y-0.5">
                {(Object.entries(TEMPLATE_LABELS) as [TemplateType, string][]).map(([key, label]) => (
                  <button key={key} onClick={() => addPage(key)}
                    className="w-full text-left px-2 py-1.5 rounded text-xs text-gray-400 hover:bg-white/10 hover:text-white transition-colors">
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center: Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-[#141c2e] shrink-0">
            <span className="text-xs font-semibold text-white">
              Page {selectedPageIdx + 1} — {TEMPLATE_LABELS[currentPage.template]}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => movePage(selectedPageIdx, -1)} disabled={selectedPageIdx === 0}
                className="p-1.5 rounded hover:bg-white/10 text-gray-500 hover:text-white disabled:opacity-30 transition-colors">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => movePage(selectedPageIdx, 1)} disabled={selectedPageIdx === doc.pages.length - 1}
                className="p-1.5 rounded hover:bg-white/10 text-gray-500 hover:text-white disabled:opacity-30 transition-colors">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {currentPage.template !== "cover" && (
                <button onClick={() => deletePage(selectedPageIdx)}
                  className="p-1.5 rounded hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {currentPage.template === "cover" && <CoverEditor page={currentPage} summaryId={id} onChange={updatePage} />}
            {currentPage.template === "overview" && <OverviewEditor page={currentPage} summaryId={id} onChange={updatePage} />}
            {currentPage.template === "eligibility" && <EligibilityEditor page={currentPage} summaryId={id} onChange={updatePage} />}
            {currentPage.template === "process" && <ProcessEditor page={currentPage} summaryId={id} onChange={updatePage} />}
            {currentPage.template === "about" && <AboutEditor page={currentPage} summaryId={id} onChange={updatePage} />}
            {currentPage.template === "blank" && <BlankEditor page={currentPage} summaryId={id} onChange={updatePage} />}
          </div>
        </div>

        {/* Right: Preview */}
        <div className="w-72 border-l border-white/10 bg-[#141c2e] flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2 border-b border-white/10">
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Live Preview</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="rounded-lg overflow-hidden shadow-2xl border border-white/10">
              <PagePreview page={currentPage} doc={doc} />
            </div>
            <div className="mt-3 text-[10px] text-gray-600 text-center">Page {selectedPageIdx + 1} of {doc.pages.length}</div>
            <div className="mt-4 space-y-2">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider">All Pages</div>
              {doc.pages.map((page, idx) => (
                <button key={page.id} onClick={() => setSelectedPageIdx(idx)}
                  className={`w-full rounded overflow-hidden border-2 transition-all ${idx === selectedPageIdx ? "border-teal-500" : "border-transparent opacity-50 hover:opacity-80"}`}>
                  <PagePreview page={page} doc={doc} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
