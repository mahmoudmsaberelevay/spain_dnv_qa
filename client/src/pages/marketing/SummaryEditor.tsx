import { useState, useEffect, useCallback, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft, Plus, Trash2, Download, Loader2,
  ChevronUp, ChevronDown, X, GripVertical, Image, Type,
  List, Table2, AlignLeft, AlignRight, AlignCenter, LayoutTemplate,
  Palette, Hash
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent, DragOverlay, DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
export type TemplateType = "cover" | "about" | "custom";

/** A single content block on a custom page */
export type BlockType = "headline" | "text" | "bullets" | "numbered" | "photo" | "table";
export type PhotoPlacement = "left-half" | "right-half" | "top-header";
export type TextAlign = "left" | "right" | "center";

export interface TableCell { text: string; align?: "left" | "center" | "right"; fontSize?: number; bold?: boolean; }
export interface TableData { cols: number; rows: number; cells: TableCell[]; headerBg?: string; headerTextColor?: string; cellBg?: string; cellTextColor?: string; borderColor?: string; }

export interface ContentBlock {
  id: string;
  type: BlockType;
  // headline / text / bullets / numbered
  text?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  align?: TextAlign;
  // bullets / numbered — list items
  items?: string[];
  // photo
  photoUrl?: string | null;
  photoPlacement?: PhotoPlacement;
  // table
  table?: TableData;
}

export interface PageStyle {
  headingFontSize?: number;
  headingColor?: string;
  bodyFontSize?: number;
  bodyColor?: string;
  accentColor?: string;
}

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

// ─── Helpers ───────────────────────────────────────────────────────────────────
const newId = () => Math.random().toString(36).slice(2, 9);

function getStyle(page: PageData): PageStyle {
  return ((page.content as Record<string, unknown>).style as PageStyle) || {};
}

function getBlocks(page: PageData): ContentBlock[] {
  return ((page.content as Record<string, unknown>).blocks as ContentBlock[]) || [];
}

function setBlocks(page: PageData, blocks: ContentBlock[]): PageData {
  return { ...page, content: { ...page.content, blocks } };
}

// ─── Photo Upload Button ───────────────────────────────────────────────────────
function PhotoUploadButton({ pageId, summaryId, currentUrl, onUploaded }: {
  pageId: string; summaryId: number; currentUrl: string | null; onUploaded: (url: string) => void;
}) {
  const uploadMutation = trpc.marketing.uploadPagePhoto.useMutation({
    onSuccess: (data) => { onUploaded(data.url); toast.success("Photo uploaded"); },
    onError: (err) => toast.error(err.message),
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const fileBase64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({ summaryId, pageId, fileBase64, fileName: file.name, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex items-center gap-2">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs transition-colors border border-white/10">
        <Image className="w-3 h-3" />
        {uploadMutation.isPending ? "Uploading..." : currentUrl ? "Change Photo" : "Upload Photo"}
      </button>
      {currentUrl && (
        <img src={currentUrl} alt="preview" className="w-10 h-10 rounded object-cover border border-white/10" />
      )}
    </div>
  );
}

// ─── Typography Panel ──────────────────────────────────────────────────────────
function TypographyPanel({ page, onChange }: { page: PageData; onChange: (p: PageData) => void }) {
  const s = getStyle(page);
  const [open, setOpen] = useState(false);
  const hasCustom = !!(s.headingColor || s.bodyColor || s.accentColor || s.headingFontSize || s.bodyFontSize);

  const setS = (key: keyof PageStyle, val: string | number | undefined) => {
    const cur = getStyle(page);
    onChange({ ...page, content: { ...page.content, style: { ...cur, [key]: val } } });
  };

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#141c2b] hover:bg-[#1a2438] transition-colors text-xs">
        <div className="flex items-center gap-2 text-gray-400">
          <Palette className="w-3.5 h-3.5 text-teal-400" />
          <span className="font-medium">Typography &amp; Colors</span>
          {hasCustom && <span className="px-1.5 py-0.5 rounded text-[9px] bg-teal-600/30 text-teal-300 font-medium">Custom</span>}
        </div>
        <span className="text-gray-600">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="p-3 space-y-2 bg-[#0f1623]">
          {([
            ["Heading Font Size", "headingFontSize", 14, "number"],
            ["Heading Color", "headingColor", COLORS.navy, "color"],
            ["Body Font Size", "bodyFontSize", 11, "number"],
            ["Body Color", "bodyColor", COLORS.text, "color"],
            ["Accent Color", "accentColor", COLORS.teal, "color"],
          ] as [string, keyof PageStyle, string | number, string][]).map(([label, key, def, inputType]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400 w-32 shrink-0">{label}</span>
              {inputType === "color" ? (
                <div className="flex items-center gap-1.5 flex-1">
                  <input type="color" value={String(s[key] || def)}
                    onChange={e => setS(key, e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent" />
                  <Input value={String(s[key] || def)} onChange={e => setS(key, e.target.value)}
                    className="bg-[#141c2b] border-white/10 text-white text-xs h-6 flex-1 font-mono" />
                  <button onClick={() => setS(key, undefined)} className="text-[10px] text-gray-600 hover:text-gray-400 shrink-0">↺</button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-1">
                  <Input type="number" value={Number(s[key] || def)} min={6} max={72}
                    onChange={e => setS(key, parseInt(e.target.value))}
                    className="bg-[#141c2b] border-white/10 text-white text-xs h-6 flex-1" />
                  <span className="text-[10px] text-gray-600">px</span>
                  <button onClick={() => setS(key, undefined)} className="text-[10px] text-gray-600 hover:text-gray-400 shrink-0">↺</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Cover Editor ──────────────────────────────────────────────────────────────
function CoverEditor({ page, summaryId, onChange }: { page: PageData; summaryId: number; onChange: (p: PageData) => void }) {
  const c = page.content as { countryName?: string; programLabel?: string; summaryLabel?: string };
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
          <Label className="text-gray-400 text-xs mb-1 block">Country Name (large)</Label>
          <Input value={String(c.countryName || "")} onChange={e => set("countryName", e.target.value)}
            className="bg-[#0f1623] border-white/10 text-white text-sm" placeholder="e.g. SPAIN" />
        </div>
        <div>
          <Label className="text-gray-400 text-xs mb-1 block">Program Label</Label>
          <Input value={String(c.programLabel || "")} onChange={e => set("programLabel", e.target.value)}
            className="bg-[#0f1623] border-white/10 text-white text-sm" placeholder="e.g. Digital Nomad Visa" />
        </div>
        <div>
          <Label className="text-gray-400 text-xs mb-1 block">Summary Label</Label>
          <Input value={String(c.summaryLabel || "PROGRAM SUMMARY")} onChange={e => set("summaryLabel", e.target.value)}
            className="bg-[#0f1623] border-white/10 text-white text-sm" />
        </div>
      </div>
      <TypographyPanel page={page} onChange={onChange} />
    </div>
  );
}

// ─── About Editor ──────────────────────────────────────────────────────────────
function AboutEditor({ page, summaryId, onChange }: { page: PageData; summaryId: number; onChange: (p: PageData) => void }) {
  const c = page.content as { heading?: string; paragraphs?: string[]; rankings?: string[]; memberships?: string[] };
  const set = (key: string, val: unknown) => onChange({ ...page, content: { ...page.content, [key]: val } });

  const updateList = (key: string, items: string[], idx: number, val: string) =>
    set(key, items.map((it, i) => i === idx ? val : it));
  const addItem = (key: string, items: string[]) => set(key, [...items, ""]);
  const removeItem = (key: string, items: string[], idx: number) => set(key, items.filter((_, i) => i !== idx));

  const ListEditor = ({ label, itemKey, items }: { label: string; itemKey: string; items: string[] }) => (
    <div>
      <Label className="text-gray-400 text-xs mb-1.5 block">{label}</Label>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input value={item} onChange={e => updateList(itemKey, items, i, e.target.value)}
              className="bg-[#0f1623] border-white/10 text-white text-xs h-7 flex-1" />
            <button onClick={() => removeItem(itemKey, items, i)} className="p-1 text-gray-600 hover:text-red-400 transition-colors shrink-0">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button onClick={() => addItem(itemKey, items)} className="flex items-center gap-1.5 text-xs text-teal-500 hover:text-teal-300 transition-colors">
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
    </div>
  );

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
      <ListEditor label="Paragraphs" itemKey="paragraphs" items={(c.paragraphs || []) as string[]} />
      <ListEditor label="Global Rankings" itemKey="rankings" items={(c.rankings || []) as string[]} />
      <ListEditor label="International Memberships" itemKey="memberships" items={(c.memberships || []) as string[]} />
      <TypographyPanel page={page} onChange={onChange} />
    </div>
  );
}

// ─── Block Editor ──────────────────────────────────────────────────────────────
function BlockEditor({ block, onChange, onDelete, onMoveUp, onMoveDown, isFirst, isLast, summaryId, pageId }: {
  block: ContentBlock; onChange: (b: ContentBlock) => void; onDelete: () => void;
  onMoveUp: () => void; onMoveDown: () => void; isFirst: boolean; isLast: boolean;
  summaryId: number; pageId: string;
}) {
  const uploadMutation = trpc.marketing.uploadPagePhoto.useMutation({
    onSuccess: (data) => { onChange({ ...block, photoUrl: data.url }); toast.success("Photo uploaded"); },
    onError: (err) => toast.error(err.message),
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const fileBase64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({ summaryId, pageId: `${pageId}-block-${block.id}`, fileBase64, fileName: file.name, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const blockTypeLabel: Record<BlockType, string> = {
    headline: "Headline", text: "Paragraph", bullets: "Bullet List", numbered: "Numbered List",
    photo: "Photo", table: "Table",
  };

  const blockTypeIcon: Record<BlockType, React.ReactNode> = {
    headline: <Type className="w-3 h-3" />,
    text: <AlignLeft className="w-3 h-3" />,
    bullets: <List className="w-3 h-3" />,
    numbered: <Hash className="w-3 h-3" />,
    photo: <Image className="w-3 h-3" />,
    table: <Table2 className="w-3 h-3" />,
  };

  const updateItem = (idx: number, val: string) =>
    onChange({ ...block, items: (block.items || []).map((it, i) => i === idx ? val : it) });
  const addItem = () => onChange({ ...block, items: [...(block.items || []), ""] });
  const removeItem = (idx: number) => onChange({ ...block, items: (block.items || []).filter((_, i) => i !== idx) });

  // Table helpers
  const table = block.table || { cols: 2, rows: 2, cells: Array(4).fill({ text: "" }) };
  const getCellObj = (r: number, c: number): TableCell => table.cells[r * table.cols + c] || { text: "" };
  const getCell = (r: number, c: number) => getCellObj(r, c).text || "";
  const setCell = (r: number, c: number, val: string) => {
    const cells = [...table.cells];
    cells[r * table.cols + c] = { ...getCellObj(r, c), text: val };
    onChange({ ...block, table: { ...table, cells } });
  };
  const setCellProp = (r: number, c: number, prop: keyof TableCell, val: string | number | boolean | undefined) => {
    const cells = [...table.cells];
    cells[r * table.cols + c] = { ...getCellObj(r, c), [prop]: val };
    onChange({ ...block, table: { ...table, cells } });
  };
  const [selectedCell, setSelectedCell] = React.useState<{r:number;c:number}|null>(null);
  const resizeTable = (cols: number, rows: number) => {
    const cells: TableCell[] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        cells.push(r < table.rows && c < table.cols ? (table.cells[r * table.cols + c] || { text: "" }) : { text: "" });
    onChange({ ...block, table: { cols, rows, cells } });
    setSelectedCell(null);
  };

  return (
    <div className="bg-[#0f1623] rounded-xl border border-white/10 overflow-hidden">
      {/* Block header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#141c2b] border-b border-white/5">
        <div className="text-teal-400">{blockTypeIcon[block.type]}</div>
        <span className="text-xs font-medium text-gray-300 flex-1">{blockTypeLabel[block.type]}</span>
        <div className="flex items-center gap-0.5">
          <button onClick={onMoveUp} disabled={isFirst} className="p-1 text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors">
            <ChevronUp className="w-3 h-3" />
          </button>
          <button onClick={onMoveDown} disabled={isLast} className="p-1 text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors">
            <ChevronDown className="w-3 h-3" />
          </button>
          <button onClick={onDelete} className="p-1 text-gray-600 hover:text-red-400 transition-colors ml-1">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Block content */}
      <div className="p-3 space-y-2">
        {/* Headline */}
        {block.type === "headline" && (
          <>
            <Input value={block.text || ""} onChange={e => onChange({ ...block, text: e.target.value })}
              placeholder="Headline text..." className="bg-[#141c2b] border-white/10 text-white text-sm font-semibold" />
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500">Size</span>
                <Input type="number" value={block.fontSize || 18} min={8} max={72}
                  onChange={e => onChange({ ...block, fontSize: parseInt(e.target.value) })}
                  className="bg-[#141c2b] border-white/10 text-white text-xs h-6 w-16" />
                <span className="text-[10px] text-gray-600">px</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500">Color</span>
                <input type="color" value={block.color || COLORS.navy}
                  onChange={e => onChange({ ...block, color: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent" />
              </div>
              <div className="flex items-center gap-0.5 rounded-lg overflow-hidden border border-white/10">
                {(["left", "center", "right"] as TextAlign[]).map(a => (
                  <button key={a} onClick={() => onChange({ ...block, align: a })}
                    className={`p-1.5 transition-colors ${(block.align || "left") === a ? "bg-teal-600 text-white" : "bg-[#141c2b] text-gray-500 hover:text-white"}`}>
                    {a === "left" ? <AlignLeft className="w-3 h-3" /> : a === "center" ? <AlignCenter className="w-3 h-3" /> : <AlignRight className="w-3 h-3" />}
                  </button>
                ))}
              </div>
              <button onClick={() => onChange({ ...block, bold: !block.bold })}
                className={`px-2 py-1 rounded text-xs font-bold transition-colors ${block.bold ? "bg-teal-600 text-white" : "bg-[#141c2b] text-gray-500 hover:text-white"}`}>B</button>
            </div>
          </>
        )}

        {/* Paragraph */}
        {block.type === "text" && (
          <>
            <Textarea value={block.text || ""} onChange={e => onChange({ ...block, text: e.target.value })}
              placeholder="Paragraph text... (press Enter for new line)" rows={4}
              className="bg-[#141c2b] border-white/10 text-white text-xs resize-y min-h-[80px]" />
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500">Size</span>
                <Input type="number" value={block.fontSize || 11} min={6} max={48}
                  onChange={e => onChange({ ...block, fontSize: parseInt(e.target.value) })}
                  className="bg-[#141c2b] border-white/10 text-white text-xs h-6 w-16" />
                <span className="text-[10px] text-gray-600">px</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500">Color</span>
                <input type="color" value={block.color || COLORS.text}
                  onChange={e => onChange({ ...block, color: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent" />
              </div>
              <div className="flex items-center gap-0.5 rounded-lg overflow-hidden border border-white/10">
                {(["left", "center", "right"] as TextAlign[]).map(a => (
                  <button key={a} onClick={() => onChange({ ...block, align: a })}
                    className={`p-1.5 transition-colors ${(block.align || "left") === a ? "bg-teal-600 text-white" : "bg-[#141c2b] text-gray-500 hover:text-white"}`}>
                    {a === "left" ? <AlignLeft className="w-3 h-3" /> : a === "center" ? <AlignCenter className="w-3 h-3" /> : <AlignRight className="w-3 h-3" />}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Bullet / Numbered list */}
        {(block.type === "bullets" || block.type === "numbered") && (
          <>
            <div className="space-y-1.5">
              {(block.items || []).map((item, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 w-4 shrink-0 text-right">
                    {block.type === "numbered" ? `${i + 1}.` : "•"}
                  </span>
                  <Input value={item} onChange={e => updateItem(i, e.target.value)}
                    className="bg-[#141c2b] border-white/10 text-white text-xs h-7 flex-1" placeholder="List item..." />
                  <button onClick={() => removeItem(i)} className="p-1 text-gray-600 hover:text-red-400 transition-colors shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button onClick={addItem} className="flex items-center gap-1.5 text-xs text-teal-500 hover:text-teal-300 transition-colors pl-5">
                <Plus className="w-3 h-3" /> Add Item
              </button>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500">Size</span>
                <Input type="number" value={block.fontSize || 11} min={6} max={48}
                  onChange={e => onChange({ ...block, fontSize: parseInt(e.target.value) })}
                  className="bg-[#141c2b] border-white/10 text-white text-xs h-6 w-16" />
                <span className="text-[10px] text-gray-600">px</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500">Color</span>
                <input type="color" value={block.color || COLORS.text}
                  onChange={e => onChange({ ...block, color: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent" />
              </div>
            </div>
          </>
        )}

        {/* Photo */}
        {block.type === "photo" && (
          <>
            <div>
              <Label className="text-gray-400 text-xs mb-1.5 block">Photo Placement</Label>
              <div className="flex gap-2 flex-wrap">
                {([
                  ["left-half", "Left Half"],
                  ["right-half", "Right Half"],
                  ["top-header", "Top Header"],
                ] as [PhotoPlacement, string][]).map(([val, label]) => (
                  <button key={val} onClick={() => onChange({ ...block, photoPlacement: val })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      (block.photoPlacement || "left-half") === val ? "bg-teal-600 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              <button onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs transition-colors border border-white/10">
                <Image className="w-3 h-3" />
                {uploadMutation.isPending ? "Uploading..." : block.photoUrl ? "Change Photo" : "Upload Photo"}
              </button>
              {block.photoUrl && (
                <img src={block.photoUrl} alt="preview" className="mt-2 w-full max-h-32 object-cover rounded border border-white/10" />
              )}
            </div>
          </>
        )}

        {/* Table */}
        {block.type === "table" && (
          <>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500">Columns</span>
                <Input type="number" value={table.cols} min={1} max={8}
                  onChange={e => resizeTable(parseInt(e.target.value) || 1, table.rows)}
                  className="bg-[#141c2b] border-white/10 text-white text-xs h-6 w-14" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500">Rows</span>
                <Input type="number" value={table.rows} min={1} max={20}
                  onChange={e => resizeTable(table.cols, parseInt(e.target.value) || 1)}
                  className="bg-[#141c2b] border-white/10 text-white text-xs h-6 w-14" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                {Array.from({ length: table.rows }).map((_, r) => (
                  <tr key={r}>
                    {Array.from({ length: table.cols }).map((_, c) => {
                      const isSelected = selectedCell?.r === r && selectedCell?.c === c;
                      const cellObj = getCellObj(r, c);
                      return (
                        <td key={c} className={`border p-0 cursor-pointer ${isSelected ? "border-teal-400" : "border-white/10"}`}
                          onClick={() => setSelectedCell({ r, c })}>
                          <Input value={getCell(r, c)} onChange={e => setCell(r, c, e.target.value)}
                            onFocus={() => setSelectedCell({ r, c })}
                            style={{ textAlign: cellObj.align || "left", fontSize: cellObj.fontSize ? `${cellObj.fontSize}px` : undefined, fontWeight: cellObj.bold || r === 0 ? 700 : 400 }}
                            className="bg-transparent border-none text-white text-xs h-7 rounded-none"
                            placeholder={r === 0 ? `Header ${c + 1}` : `Cell`} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </table>
            </div>
            {/* Per-cell style toolbar */}
            {selectedCell && (() => {
              const { r, c } = selectedCell;
              const cellObj = getCellObj(r, c);
              return (
                <div className="bg-[#141c2b] border border-teal-400/30 rounded-lg p-2 space-y-2">
                  <div className="text-[10px] text-teal-400 font-medium">Cell [{r + 1},{c + 1}] Style</div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Alignment */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-500">Align</span>
                      {(["left", "center", "right"] as const).map(a => (
                        <button key={a} onClick={() => setCellProp(r, c, "align", cellObj.align === a ? undefined : a)}
                          className={`px-1.5 py-0.5 text-[10px] rounded ${cellObj.align === a ? "bg-teal-500 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>
                          {a === "left" ? "←" : a === "center" ? "↔" : "→"}
                        </button>
                      ))}
                    </div>
                    {/* Font size */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-500">Size</span>
                      <Input type="number" min={6} max={24} value={cellObj.fontSize || ""}
                        onChange={e => setCellProp(r, c, "fontSize", e.target.value ? parseInt(e.target.value) : undefined)}
                        placeholder="auto" className="bg-[#0f1623] border-white/10 text-white text-[10px] h-5 w-12" />
                    </div>
                    {/* Bold */}
                    <button onClick={() => setCellProp(r, c, "bold", !cellObj.bold)}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded ${cellObj.bold ? "bg-teal-500 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>
                      B
                    </button>
                    <button onClick={() => setSelectedCell(null)} className="ml-auto text-[10px] text-gray-600 hover:text-gray-400">✕ Close</button>
                  </div>
                </div>
              );
            })()}
            <p className="text-[10px] text-gray-600">Click any cell to edit its text style. First row is treated as the table header.</p>
            {/* Table color controls */}
            <div className="border-t border-white/10 pt-2 mt-2">
              <div className="text-[10px] text-gray-500 font-medium mb-2 uppercase tracking-wider">Table Colors</div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["Header Background", "headerBg", COLORS.navy],
                  ["Header Text", "headerTextColor", "#ffffff"],
                  ["Cell Background", "cellBg", "#ffffff"],
                  ["Cell Text", "cellTextColor", COLORS.text],
                  ["Border Color", "borderColor", COLORS.divider],
                ] as [string, keyof TableData, string][]).map(([label, key, def]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <input type="color" value={String(table[key] || def)}
                      onChange={e => onChange({ ...block, table: { ...table, [key]: e.target.value } })}
                      className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent shrink-0" />
                    <span className="text-[10px] text-gray-400 truncate">{label}</span>
                    {table[key] && (
                      <button onClick={() => { const t = { ...table }; delete (t as Record<string, unknown>)[key]; onChange({ ...block, table: t }); }}
                        className="text-[9px] text-gray-600 hover:text-gray-400 shrink-0">↺</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Custom Page Editor ────────────────────────────────────────────────────────
function CustomEditor({ page, summaryId, onChange }: { page: PageData; summaryId: number; onChange: (p: PageData) => void }) {
  const blocks = getBlocks(page);

  const addBlock = (type: BlockType) => {
    const newBlock: ContentBlock = { id: newId(), type };
    if (type === "bullets" || type === "numbered") newBlock.items = [];
    if (type === "photo") { newBlock.photoPlacement = "left-half"; newBlock.photoUrl = null; }
    if (type === "table") newBlock.table = { cols: 2, rows: 3, cells: Array(6).fill({ text: "" }) };
    onChange(setBlocks(page, [...blocks, newBlock]));
  };

  const updateBlock = (idx: number, b: ContentBlock) =>
    onChange(setBlocks(page, blocks.map((bl, i) => i === idx ? b : bl)));
  const deleteBlock = (idx: number) =>
    onChange(setBlocks(page, blocks.filter((_, i) => i !== idx)));
  const moveBlock = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    const arr = [...blocks];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    onChange(setBlocks(page, arr));
  };

  const blockButtons: [BlockType, string, React.ReactNode][] = [
    ["headline", "Headline", <Type className="w-3 h-3" />],
    ["text", "Paragraph", <AlignLeft className="w-3 h-3" />],
    ["bullets", "Bullets", <List className="w-3 h-3" />],
    ["numbered", "Numbered", <Hash className="w-3 h-3" />],
    ["photo", "Photo", <Image className="w-3 h-3" />],
    ["table", "Table", <Table2 className="w-3 h-3" />],
  ];

  return (
    <div className="space-y-4">
      {/* Add block toolbar */}
      <div>
        <Label className="text-gray-400 text-xs mb-2 block font-semibold">Add Content Block</Label>
        <div className="flex flex-wrap gap-1.5">
          {blockButtons.map(([type, label, icon]) => (
            <button key={type} onClick={() => addBlock(type)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-teal-600/30 hover:text-teal-300 text-gray-400 text-xs transition-colors border border-white/10 hover:border-teal-500/40">
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* Blocks */}
      {blocks.length === 0 ? (
        <div className="text-center py-8 text-gray-600 text-xs border border-dashed border-white/10 rounded-xl">
          No content yet — add blocks above
        </div>
      ) : (
        <div className="space-y-3">
          {blocks.map((block, idx) => (
            <BlockEditor
              key={block.id}
              block={block}
              onChange={b => updateBlock(idx, b)}
              onDelete={() => deleteBlock(idx)}
              onMoveUp={() => moveBlock(idx, -1)}
              onMoveDown={() => moveBlock(idx, 1)}
              isFirst={idx === 0}
              isLast={idx === blocks.length - 1}
              summaryId={summaryId}
              pageId={page.id}
            />
          ))}
        </div>
      )}

      <TypographyPanel page={page} onChange={onChange} />
    </div>
  );
}

// ─── Page Preview ──────────────────────────────────────────────────────────────
function renderBlocksHtml(blocks: ContentBlock[], ps: PageStyle, COLORS: Record<string, string>): string {
  const hColor = ps.headingColor || COLORS.navy;
  const bColor = ps.bodyColor || COLORS.text;
  const aColor = ps.accentColor || COLORS.teal;

  return blocks.map(block => {
    if (block.type === "headline") {
      const fs = block.fontSize || 18;
      const color = block.color || hColor;
      const align = block.align || "left";
      const weight = block.bold !== false ? "700" : "400";
      return `<div style="font-size:${fs * 0.44}px;font-weight:${weight};color:${color};text-align:${align};margin-bottom:4px;line-height:1.2;">${block.text || ""}</div>`;
    }
    if (block.type === "text") {
      const fs = block.fontSize || 11;
      const color = block.color || bColor;
      const align = block.align || "left";
      return `<div style="font-size:${fs * 0.44}px;color:${color};text-align:${align};line-height:1.5;margin-bottom:5px;white-space:pre-wrap;">${block.text || ""}</div>`;
    }
    if (block.type === "bullets") {
      const fs = block.fontSize || 11;
      const color = block.color || bColor;
      return `<div style="margin-bottom:5px;">${(block.items || []).map(item =>
        `<div style="display:flex;gap:4px;align-items:flex-start;margin-bottom:2px;">
          <div style="width:4px;height:4px;border-radius:50%;background:${aColor};margin-top:${fs * 0.44 * 0.35}px;flex-shrink:0;"></div>
          <div style="font-size:${fs * 0.44}px;color:${color};line-height:1.4;">${item}</div>
        </div>`).join("")}</div>`;
    }
    if (block.type === "numbered") {
      const fs = block.fontSize || 11;
      const color = block.color || bColor;
      return `<div style="margin-bottom:5px;">${(block.items || []).map((item, i) =>
        `<div style="display:flex;gap:4px;align-items:flex-start;margin-bottom:2px;">
          <div style="font-size:${fs * 0.44}px;color:${aColor};font-weight:700;flex-shrink:0;min-width:10px;">${i + 1}.</div>
          <div style="font-size:${fs * 0.44}px;color:${color};line-height:1.4;">${item}</div>
        </div>`).join("")}</div>`;
    }
    if (block.type === "table") {
      const t = block.table;
      if (!t) return "";
      const tHeaderBg = t.headerBg || COLORS.navy;
      const tHeaderText = t.headerTextColor || "#ffffff";
      const tCellBg = t.cellBg || "transparent";
      const tCellText = t.cellTextColor || bColor;
      const tBorder = t.borderColor || COLORS.divider;
      return `<table style="width:100%;border-collapse:collapse;margin-bottom:6px;font-size:5px;">
        ${Array.from({ length: t.rows }).map((_, r) =>
          `<tr>${Array.from({ length: t.cols }).map((_, c) => {
            const cellObj = t.cells[r * t.cols + c] || { text: "" };
            const cell = cellObj.text || "";
            const isHeader = r === 0;
            const cellAlign = cellObj.align || "left";
            const cellFs = cellObj.fontSize ? `${cellObj.fontSize * 0.44}px` : undefined;
            const cellBold = cellObj.bold || isHeader ? 700 : 400;
            const fsStyle = cellFs ? `font-size:${cellFs};` : "";
            return `<td style="border:1px solid ${tBorder};padding:2px 3px;background:${isHeader ? tHeaderBg : tCellBg};color:${isHeader ? tHeaderText : tCellText};font-weight:${cellBold};text-align:${cellAlign};${fsStyle}">${cell}</td>`;
          }).join("")}</tr>`
        ).join("")}
      </table>`;
    }
    // photo blocks are handled separately in the page layout
    return "";
  }).join("");
}

function PagePreview({ page, doc }: { page: PageData; doc: DocumentData }) {
  const monthYear = new Date(doc.createdAt).toLocaleString("en-US", { month: "long", year: "numeric" });
  const ps = getStyle(page);
  const hColor = ps.headingColor || COLORS.navy;
  const bColor = ps.bodyColor || COLORS.text;
  const aColor = ps.accentColor || COLORS.teal;
  const hFs = ps.headingFontSize;
  const bFs = ps.bodyFontSize;

  const wrapperStyle: React.CSSProperties = {
    width: "100%", aspectRatio: "210/297", fontFamily: "'Montserrat', sans-serif",
    overflow: "hidden", position: "relative", background: "white", fontSize: "7px",
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
    const c = page.content as { countryName?: string; programLabel?: string; summaryLabel?: string };
    return (
      <div style={{ ...wrapperStyle, display: "flex" }}>
        <div style={{ width: "50%", height: "100%", background: COLORS.navy, overflow: "hidden", flexShrink: 0 }}>
          {page.photoUrl ? <img src={page.photoUrl} alt="cover" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)", fontSize: "8px" }}>Upload Photo</div>}
        </div>
        <div style={{ width: "50%", height: "100%", background: "white", display: "flex", flexDirection: "column", padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "auto" }}>
            <img src={ELEVAY_LOGO} alt="ELEVAY" style={{ height: "20px", width: "auto", objectFit: "contain" }} />
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ background: aColor, padding: "10px 12px", marginLeft: "-16px", marginRight: "-16px" }}>
            <div style={{ color: "white", fontSize: hFs ? `${hFs * 0.44}px` : "14px", fontWeight: 700, letterSpacing: "0.05em" }}>{c.countryName || doc.country.toUpperCase()}</div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: bFs ? `${bFs * 0.44}px` : "7px", marginTop: "3px" }}>{c.programLabel || doc.programType}</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "6px", letterSpacing: "0.15em", textTransform: "uppercase", marginTop: "2px" }}>{c.summaryLabel || "PROGRAM SUMMARY"}</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "5px", marginTop: "6px" }}>Last updated: {monthYear}</div>
          </div>
        </div>
      </div>
    );
  }

  if (page.template === "about") {
    const c = page.content as { heading?: string; paragraphs?: string[]; rankings?: string[]; memberships?: string[] };
    return (
      <div style={{ ...wrapperStyle, display: "flex", flexDirection: "column" }}>
        {header}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <div style={{ width: "45%", overflow: "hidden" }}>
            {page.photoUrl ? <img src={page.photoUrl} alt="about" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{ width: "100%", height: "100%", background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc", fontSize: "7px" }}>Upload Photo</div>}
          </div>
          <div style={{ width: "55%", padding: "10px 12px 10px 8px", borderLeft: `1px solid ${COLORS.divider}`, overflow: "hidden" }}>
            <div style={{ fontSize: hFs ? `${hFs * 0.44}px` : "9px", fontWeight: 700, color: hColor, marginBottom: "5px" }}>{c.heading || ""}</div>
            {(c.paragraphs || []).slice(0, 2).map((p, i) => (
              <div key={i} style={{ fontSize: bFs ? `${bFs * 0.44}px` : "5.5px", color: bColor, lineHeight: 1.5, marginBottom: "4px" }}>{p}</div>
            ))}
            {(c.rankings || []).length > 0 && (
              <div style={{ border: `1px solid ${COLORS.divider}`, borderRadius: "3px", padding: "5px", marginTop: "5px" }}>
                <div style={{ fontSize: "6px", fontWeight: 700, color: hColor, marginBottom: "3px" }}>Global Rankings</div>
                {(c.rankings || []).slice(0, 3).map((r, i) => (
                  <div key={i} style={{ fontSize: "5px", color: bColor, marginBottom: "1px" }}>• {r}</div>
                ))}
              </div>
            )}
          </div>
        </div>
        {footer}
      </div>
    );
  }

  // Custom page
  const blocks = getBlocks(page);
  const photoBlock = blocks.find(b => b.type === "photo" && b.photoUrl);
  const contentBlocks = blocks.filter(b => b.type !== "photo");
  const placement = photoBlock?.photoPlacement || "left-half";

  const contentHtml = contentBlocks.map(block => {
    if (block.type === "headline") {
      const fs = (block.fontSize || 18) * 0.44;
      const color = block.color || hColor;
      const align = block.align || "left";
      const weight = block.bold !== false ? "700" : "400";
      return <div key={block.id} style={{ fontSize: `${fs}px`, fontWeight: weight, color, textAlign: align, marginBottom: "4px", lineHeight: 1.2 }}>{block.text || ""}</div>;
    }
    if (block.type === "text") {
      const fs = (block.fontSize || 11) * 0.44;
      const color = block.color || bColor;
      const align = block.align || "left";
      return <div key={block.id} style={{ fontSize: `${fs}px`, color, textAlign: align, lineHeight: 1.5, marginBottom: "5px", whiteSpace: "pre-wrap" }}>{block.text || ""}</div>;
    }
    if (block.type === "bullets") {
      const fs = (block.fontSize || 11) * 0.44;
      const color = block.color || bColor;
      return (
        <div key={block.id} style={{ marginBottom: "5px" }}>
          {(block.items || []).map((item, i) => (
            <div key={i} style={{ display: "flex", gap: "4px", alignItems: "flex-start", marginBottom: "2px" }}>
              <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: aColor, marginTop: `${fs * 0.35}px`, flexShrink: 0 }} />
              <div style={{ fontSize: `${fs}px`, color, lineHeight: 1.4 }}>{item}</div>
            </div>
          ))}
        </div>
      );
    }
    if (block.type === "numbered") {
      const fs = (block.fontSize || 11) * 0.44;
      const color = block.color || bColor;
      return (
        <div key={block.id} style={{ marginBottom: "5px" }}>
          {(block.items || []).map((item, i) => (
            <div key={i} style={{ display: "flex", gap: "4px", alignItems: "flex-start", marginBottom: "2px" }}>
              <div style={{ fontSize: `${fs}px`, color: aColor, fontWeight: 700, flexShrink: 0, minWidth: "10px" }}>{i + 1}.</div>
              <div style={{ fontSize: `${fs}px`, color, lineHeight: 1.4 }}>{item}</div>
            </div>
          ))}
        </div>
      );
    }
    if (block.type === "table") {
      const t = block.table;
      if (!t) return null;
      const tHeaderBg = t.headerBg || COLORS.navy;
      const tHeaderText = t.headerTextColor || "#ffffff";
      const tCellBg = t.cellBg || "transparent";
      const tCellText = t.cellTextColor || bColor;
      const tBorder = t.borderColor || COLORS.divider;
      return (
        <table key={block.id} style={{ width: "100%", borderCollapse: "collapse", marginBottom: "6px", fontSize: "5px" }}>
          <tbody>
            {Array.from({ length: t.rows }).map((_, r) => (
              <tr key={r}>
                {Array.from({ length: t.cols }).map((_, c) => {
                  const cellObj = t.cells[r * t.cols + c] || { text: "" };
                  const cell = cellObj.text || "";
                  const isHeader = r === 0;
                  return (
                    <td key={c} style={{ border: `1px solid ${tBorder}`, padding: "2px 3px", background: isHeader ? tHeaderBg : tCellBg, color: isHeader ? tHeaderText : tCellText, fontWeight: cellObj.bold || isHeader ? 700 : 400, textAlign: cellObj.align || "left", fontSize: cellObj.fontSize ? `${cellObj.fontSize * 0.44}px` : undefined }}>
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    return null;
  });

  if (photoBlock && placement === "top-header") {
    return (
      <div style={{ ...wrapperStyle, display: "flex", flexDirection: "column" }}>
        {header}
        <div style={{ height: "28%", overflow: "hidden", flexShrink: 0 }}>
          <img src={photoBlock.photoUrl!} alt="page" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ flex: 1, padding: "8px 12px", overflow: "hidden" }}>{contentHtml}</div>
        {footer}
      </div>
    );
  }

  if (photoBlock && (placement === "left-half" || placement === "right-half")) {
    const photoLeft = placement === "left-half";
    return (
      <div style={{ ...wrapperStyle, display: "flex", flexDirection: "column" }}>
        {header}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {photoLeft && (
            <div style={{ width: "45%", overflow: "hidden", flexShrink: 0 }}>
              <img src={photoBlock.photoUrl!} alt="page" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          )}
          <div style={{ flex: 1, padding: "8px 12px", overflow: "hidden", borderLeft: photoLeft ? `1px solid ${COLORS.divider}` : undefined, borderRight: !photoLeft ? `1px solid ${COLORS.divider}` : undefined }}>
            {contentHtml}
          </div>
          {!photoLeft && (
            <div style={{ width: "45%", overflow: "hidden", flexShrink: 0 }}>
              <img src={photoBlock.photoUrl!} alt="page" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          )}
        </div>
        {footer}
      </div>
    );
  }

  // Text only
  return (
    <div style={{ ...wrapperStyle, display: "flex", flexDirection: "column" }}>
      {header}
      <div style={{ flex: 1, padding: "10px 14px", overflow: "hidden" }}>
        {blocks.length === 0
          ? <div style={{ color: "#ccc", fontSize: "7px", textAlign: "center", marginTop: "30px" }}>Empty page — add content blocks</div>
          : contentHtml
        }
      </div>
      {footer}
    </div>
  );
}

// ─── Sortable Page Item ────────────────────────────────────────────────────────
const TEMPLATE_LABELS: Record<TemplateType, string> = {
  cover: "Cover Page",
  about: "About Country",
  custom: "Custom Page",
};
const TEMPLATE_ICONS: Record<TemplateType, string> = { cover: "★", about: "🌍", custom: "📄" };

function SortablePageItem({ page, idx, selectedPageIdx, onSelect }: {
  page: PageData; idx: number; selectedPageIdx: number; onSelect: (idx: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style}>
      <button onClick={() => onSelect(idx)}
        className={`w-full flex items-center gap-1.5 px-2 py-2 rounded-lg text-left transition-all text-xs ${
          selectedPageIdx === idx ? "bg-teal-600/30 border border-teal-500/50 text-white" : "hover:bg-white/5 text-gray-400 border border-transparent"
        }`}>
        <div {...attributes} {...listeners}
          className="cursor-grab active:cursor-grabbing p-0.5 text-gray-600 hover:text-gray-400 shrink-0"
          onClick={e => e.stopPropagation()} title="Drag to reorder">
          <GripVertical className="w-3 h-3" />
        </div>
        <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-white/10 text-xs">
          {TEMPLATE_ICONS[page.template]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate font-medium text-[11px]">{TEMPLATE_LABELS[page.template]}</div>
          <div className="text-[10px] text-gray-600">{getBlocks(page).length} blocks</div>
        </div>
        <span className="text-[10px] text-gray-600 shrink-0">{idx + 1}</span>
      </button>
    </div>
  );
}

// ─── Main Editor ───────────────────────────────────────────────────────────────
export default function SummaryEditor() {
  const [, params] = useRoute("/marketing/summary-generator/:id");
  const [, navigate] = useLocation();
  const id = params?.id ? parseInt(params.id) : 0;

  const { data: summary, isLoading } = trpc.marketing.getSummary.useQuery({ id }, { enabled: !!id });
  const saveMutation = trpc.marketing.saveSummary.useMutation({ onError: (err) => toast.error(err.message) });

  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [selectedPageIdx, setSelectedPageIdx] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!summary) return;
    try {
      const parsed = JSON.parse(summary.documentJson || "{}");
      if (parsed.pages && Array.isArray(parsed.pages)) {
        // Migrate old templates to custom
        const migratedPages = parsed.pages.map((p: PageData) => {
          if (p.template !== "cover" && p.template !== "about" && p.template !== "custom") {
            return { ...p, template: "custom" as TemplateType };
          }
          return p;
        });
        setDoc({ ...parsed, pages: migratedPages } as DocumentData);
        lastSavedRef.current = summary.documentJson;
        return;
      }
    } catch {}
    const now = summary.createdAt;
    setDoc({
      country: summary.country,
      programType: summary.programType,
      programSubtype: summary.programSubtype || "RESIDENCY",
      createdAt: now,
      pages: [
        { id: `cover-${now}`, template: "cover", photoUrl: null, content: { countryName: summary.country.toUpperCase(), programLabel: summary.programType, summaryLabel: "PROGRAM SUMMARY" } },
        { id: `about-${now}`, template: "about", photoUrl: null, content: { heading: `About ${summary.country}`, paragraphs: [], rankings: [], memberships: [] } },
      ],
    });
  }, [summary]);

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

  const addPage = () => {
    if (!doc) return;
    const newPage: PageData = { id: `custom-${Date.now()}`, template: "custom", photoUrl: null, content: { blocks: [] } };
    const pages = [...doc.pages];
    // Insert before the last page (About Country) if it's the last
    const insertAt = selectedPageIdx + 1;
    pages.splice(insertAt, 0, newPage);
    setDoc({ ...doc, pages });
    setSelectedPageIdx(insertAt);
  };

  const deletePage = (idx: number) => {
    if (!doc) return;
    const page = doc.pages[idx];
    if (page.template === "cover") { toast.error("Cannot delete the cover page"); return; }
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

  const handleDragStart = (event: DragStartEvent) => setActiveDragId(event.active.id as string);
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    if (!doc) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = doc.pages.findIndex(p => p.id === active.id);
    const newIdx = doc.pages.findIndex(p => p.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const newPages = arrayMove(doc.pages, oldIdx, newIdx);
    setDoc({ ...doc, pages: newPages });
    if (selectedPageIdx === oldIdx) setSelectedPageIdx(newIdx);
    else if (selectedPageIdx === newIdx) setSelectedPageIdx(oldIdx);
    toast.success(`Page moved to position ${newIdx + 1}`);
  };

  // ─── PDF Export ───────────────────────────────────────────────────────────────
  const handleExportPdf = async () => {
    if (!doc) return;
    setIsExporting(true);
    try {
      const monthYear = new Date(doc.createdAt).toLocaleString("en-US", { month: "long", year: "numeric" });
      const printWindow = window.open("", "_blank");
      if (!printWindow) { toast.error("Allow popups to export PDF"); setIsExporting(false); return; }

      const headerHtml = `<div style="background:${COLORS.navy};height:50px;display:flex;align-items:center;padding:0 28px;gap:12px;flex-shrink:0;">
        <img src="${ELEVAY_LOGO}" style="height:28px;width:auto;object-fit:contain;" />
        <div style="width:1px;height:16px;background:rgba(255,255,255,0.2);"></div>
        <div style="color:white;font-size:9px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;">${doc.country} — ${doc.programType}</div>
      </div>`;
      const footerHtml = `<div style="height:28px;border-top:1px solid ${COLORS.divider};display:flex;align-items:center;padding:0 28px;flex-shrink:0;">
        <div style="font-size:7px;color:#999;text-transform:uppercase;letter-spacing:0.08em;">ELEVAY — Citizenship & Residency by Investment</div>
      </div>`;

      const pagesHtml = doc.pages.map((page) => {
        const ps = getStyle(page);
        const hColor = ps.headingColor || COLORS.navy;
        const bColor = ps.bodyColor || COLORS.text;
        const aColor = ps.accentColor || COLORS.teal;
        const hFs = ps.headingFontSize;
        const bFs = ps.bodyFontSize;

        if (page.template === "cover") {
          const c = page.content as { countryName?: string; programLabel?: string; summaryLabel?: string };
          return `<div class="page" style="display:flex;font-family:'Montserrat',sans-serif;">
            <div style="width:50%;height:100%;background:${COLORS.navy};overflow:hidden;flex-shrink:0;">
              ${page.photoUrl ? `<img src="${page.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.2);font-size:14px;">No Photo</div>`}
            </div>
            <div style="width:50%;height:100%;background:white;display:flex;flex-direction:column;padding:40px;">
              <img src="${ELEVAY_LOGO}" style="height:36px;width:auto;object-fit:contain;margin-bottom:auto;" />
              <div style="flex:1;"></div>
              <div style="background:${aColor};padding:24px 28px;margin:0 -40px -40px -40px;">
                <div style="color:white;font-size:${hFs || 32}px;font-weight:700;letter-spacing:0.05em;margin-bottom:6px;">${c.countryName || doc.country.toUpperCase()}</div>
                <div style="color:rgba(255,255,255,0.9);font-size:${bFs || 14}px;margin-bottom:4px;">${c.programLabel || doc.programType}</div>
                <div style="color:rgba(255,255,255,0.7);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px;">${c.summaryLabel || "PROGRAM SUMMARY"}</div>
                <div style="color:rgba(255,255,255,0.5);font-size:9px;">Last updated: ${monthYear}</div>
              </div>
            </div>
          </div>`;
        }

        if (page.template === "about") {
          const c = page.content as { heading?: string; paragraphs?: string[]; rankings?: string[]; memberships?: string[] };
          const paragraphs = (c.paragraphs || []) as string[];
          const rankings = (c.rankings || []) as string[];
          const memberships = (c.memberships || []) as string[];
          return `<div class="page" style="display:flex;flex-direction:column;font-family:'Montserrat',sans-serif;">
            ${headerHtml}
            <div style="flex:1;display:flex;overflow:hidden;">
              <div style="width:45%;overflow:hidden;">
                ${page.photoUrl ? `<img src="${page.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />` : `<div style="width:100%;height:100%;background:#f0f4f8;display:flex;align-items:center;justify-content:center;color:#ccc;">No Photo</div>`}
              </div>
              <div style="width:55%;padding:24px 28px 20px 16px;border-left:1px solid ${COLORS.divider};overflow:hidden;">
                <div style="font-size:${hFs || 20}px;font-weight:700;color:${hColor};margin-bottom:10px;">${c.heading || ""}</div>
                ${paragraphs.map(p => `<div style="font-size:${bFs || 10}px;color:${bColor};line-height:1.6;margin-bottom:8px;">${p}</div>`).join("")}
                ${rankings.length > 0 ? `<div style="border:1px solid ${COLORS.divider};border-radius:4px;padding:10px;margin-top:10px;">
                  <div style="font-size:11px;font-weight:700;color:${hColor};margin-bottom:5px;">Global Rankings</div>
                  ${rankings.map(r => `<div style="font-size:${bFs || 9}px;color:${bColor};margin-bottom:2px;">• ${r}</div>`).join("")}
                </div>` : ""}
                ${memberships.length > 0 ? `<div style="border:1px solid ${COLORS.divider};border-radius:4px;padding:10px;margin-top:8px;">
                  <div style="font-size:11px;font-weight:700;color:${hColor};margin-bottom:5px;">International Memberships</div>
                  ${memberships.map(m => `<div style="font-size:${bFs || 9}px;color:${bColor};margin-bottom:2px;">• ${m}</div>`).join("")}
                </div>` : ""}
              </div>
            </div>
            ${footerHtml}
          </div>`;
        }

        // Custom page
        const blocks = getBlocks(page);
        const photoBlock = blocks.find(b => b.type === "photo" && b.photoUrl);
        const contentBlocks = blocks.filter(b => b.type !== "photo");
        const placement = photoBlock?.photoPlacement || "left-half";
        const contentHtml = renderBlocksHtml(contentBlocks, ps, COLORS);

        if (photoBlock && placement === "top-header") {
          return `<div class="page" style="display:flex;flex-direction:column;font-family:'Montserrat',sans-serif;">
            ${headerHtml}
            <div style="height:35%;overflow:hidden;flex-shrink:0;">
              <img src="${photoBlock.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />
            </div>
            <div style="flex:1;padding:20px 28px;overflow:hidden;">${contentHtml}</div>
            ${footerHtml}
          </div>`;
        }

        if (photoBlock && (placement === "left-half" || placement === "right-half")) {
          const photoLeft = placement === "left-half";
          return `<div class="page" style="display:flex;flex-direction:column;font-family:'Montserrat',sans-serif;">
            ${headerHtml}
            <div style="flex:1;display:flex;overflow:hidden;">
              ${photoLeft ? `<div style="width:45%;overflow:hidden;flex-shrink:0;"><img src="${photoBlock.photoUrl}" style="width:100%;height:100%;object-fit:cover;" /></div>` : ""}
              <div style="flex:1;padding:20px 24px;overflow:hidden;${photoLeft ? `border-left:1px solid ${COLORS.divider};` : `border-right:1px solid ${COLORS.divider};`}">${contentHtml}</div>
              ${!photoLeft ? `<div style="width:45%;overflow:hidden;flex-shrink:0;"><img src="${photoBlock.photoUrl}" style="width:100%;height:100%;object-fit:cover;" /></div>` : ""}
            </div>
            ${footerHtml}
          </div>`;
        }

        // Text only
        return `<div class="page" style="display:flex;flex-direction:column;font-family:'Montserrat',sans-serif;">
          ${headerHtml}
          <div style="flex:1;padding:24px 28px;overflow:hidden;">${contentHtml}</div>
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
        <script>window.onload=function(){setTimeout(function(){window.print();},1800);};<\/script>
      </body></html>`);
      printWindow.document.close();
      toast.success("PDF export opened — use Ctrl+P / Cmd+P to save as PDF");
    } catch {
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
  const activeDragPage = activeDragId ? doc.pages.find(p => p.id === activeDragId) : null;

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
        <div className="w-48 border-r border-white/10 bg-[#141c2e] flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Pages</span>
            <span className="text-xs text-gray-600">{doc.pages.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <SortableContext items={doc.pages.map(p => p.id)} strategy={verticalListSortingStrategy}>
                {doc.pages.map((page, idx) => (
                  <SortablePageItem key={page.id} page={page} idx={idx} selectedPageIdx={selectedPageIdx} onSelect={setSelectedPageIdx} />
                ))}
              </SortableContext>
              <DragOverlay>
                {activeDragPage ? (
                  <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-teal-600/40 border border-teal-500/60 text-white text-xs shadow-2xl">
                    <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-white/20 text-xs">{TEMPLATE_ICONS[activeDragPage.template]}</div>
                    <span className="font-medium text-[11px] truncate">{TEMPLATE_LABELS[activeDragPage.template]}</span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
          <div className="p-2 border-t border-white/10">
            <p className="text-[10px] text-gray-600 text-center mb-1.5">Drag ⠿ to reorder</p>
            <button onClick={addPage}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-teal-600/20 hover:bg-teal-600/40 text-teal-400 hover:text-teal-300 text-xs transition-colors border border-teal-500/30">
              <Plus className="w-3 h-3" /> Add Custom Page
            </button>
          </div>
        </div>

        {/* Center: Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-[#141c2e] shrink-0">
            <div className="flex items-center gap-2">
              <LayoutTemplate className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-xs font-semibold text-white">
                Page {selectedPageIdx + 1} — {TEMPLATE_LABELS[currentPage.template]}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => movePage(selectedPageIdx, -1)} disabled={selectedPageIdx === 0}
                className="p-1.5 rounded hover:bg-white/10 text-gray-500 hover:text-white disabled:opacity-30 transition-colors" title="Move up">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => movePage(selectedPageIdx, 1)} disabled={selectedPageIdx === doc.pages.length - 1}
                className="p-1.5 rounded hover:bg-white/10 text-gray-500 hover:text-white disabled:opacity-30 transition-colors" title="Move down">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {currentPage.template !== "cover" && (
                <button onClick={() => deletePage(selectedPageIdx)}
                  className="p-1.5 rounded hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors" title="Delete page">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {currentPage.template === "cover" && <CoverEditor page={currentPage} summaryId={id} onChange={updatePage} />}
            {currentPage.template === "about" && <AboutEditor page={currentPage} summaryId={id} onChange={updatePage} />}
            {currentPage.template === "custom" && <CustomEditor page={currentPage} summaryId={id} onChange={updatePage} />}
          </div>
        </div>

        {/* Right: Preview */}
        <div className="w-72 border-l border-white/10 bg-[#141c2e] flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2 border-b border-white/10">
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Live Preview</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div className="w-full shadow-lg rounded overflow-hidden">
              <PagePreview page={currentPage} doc={doc} />
            </div>
            <div className="border-t border-white/10 pt-3">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">All Pages</div>
              <div className="space-y-2">
                {doc.pages.map((page, idx) => (
                  <button key={page.id} onClick={() => setSelectedPageIdx(idx)}
                    className={`w-full rounded overflow-hidden border-2 transition-all ${selectedPageIdx === idx ? "border-teal-500" : "border-transparent hover:border-white/20"}`}>
                    <PagePreview page={page} doc={doc} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
