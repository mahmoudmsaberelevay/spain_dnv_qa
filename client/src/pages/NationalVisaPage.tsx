/**
 * NationalVisaPage.tsx
 * "التأشيرة الوطنية" — Generate a National Visa document checklist for a client's family.
 * Pulls client data from the Client Documentation module.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, FileDown, Loader2, ChevronRight, ChevronLeft, Pencil, X, Users } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChildEntry {
  name: string;
  age: number;
}

type Step = "client" | "family" | "details" | "review";

const STEP_ORDER: Step[] = ["client", "family", "details", "review"];

const STEP_LABELS: Record<Step, string> = {
  client: "اختيار العميل",
  family: "بيانات الأسرة",
  details: "بيانات إضافية",
  review: "المراجعة والحفظ",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function downloadBase64Docx(base64: string, filename: string) {
  const blob = new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const CHILD_ORDINALS = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];

function getAgeGroup(age: number): string {
  if (age < 16) return "أقل من ١٦ عاماً";
  if (age < 21) return "من ١٦ إلى ٢٠ عاماً";
  return "٢١ عاماً فأكثر";
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function NationalVisaPage() {

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: clients = [], isLoading: clientsLoading } = trpc.clientDocs.list.useQuery();
  const { data: workflows = [], refetch: refetchWorkflows } = trpc.nationalVisa.list.useQuery();

  // ── Form state ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("client");
  const [clientCaseId, setClientCaseId] = useState<number | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [wifeName, setWifeName] = useState("");
  const [children, setChildren] = useState<ChildEntry[]>([]);
  const [followUpEmail, setFollowUpEmail] = useState("");
  const [notes, setNotes] = useState("");

  // ── List filter & sort state ──────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<"all" | "in_progress" | "completed" | "submitted">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "az" | "za">("newest");

  // ── Edit state ────────────────────────────────────────────────────────────
  const [editWorkflow, setEditWorkflow] = useState<any | null>(null);
  const [editWifeName, setEditWifeName] = useState("");
  const [editChildren, setEditChildren] = useState<ChildEntry[]>([]);
  const [editFollowUpEmail, setEditFollowUpEmail] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = trpc.nationalVisa.create.useMutation({
    onSuccess: () => {
      refetchWorkflows();
      toast.success("تم حفظ التأشيرة الوطنية بنجاح");
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.nationalVisa.update.useMutation({
    onSuccess: () => {
      refetchWorkflows();
      toast.success("تم تحديث التأشيرة الوطنية بنجاح");
      setEditWorkflow(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.nationalVisa.delete.useMutation({
    onSuccess: () => { refetchWorkflows(); toast.success("تم الحذف"); },
    onError: (e) => toast.error(e.message),
  });

  const generateMutation = trpc.nationalVisa.generateDoc.useMutation({
    onSuccess: (data) => {
      downloadBase64Docx(data.base64, `التأشيرة_الوطنية_${data.clientName}.docx`);
      toast.success("تم تنزيل قائمة المستندات بنجاح");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatusMutation = trpc.nationalVisa.updateStatus.useMutation({
    onSuccess: () => { refetchWorkflows(); },
    onError: (e) => toast.error(e.message),
  });

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientCaseId),
    [clients, clientCaseId]
  );

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter((c) =>
      c.clientName.toLowerCase().includes(q)
    );
  }, [clients, clientSearch]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function resetForm() {
    setStep("client");
    setClientCaseId(null);
    setClientSearch("");
    setWifeName("");
    setChildren([]);
    setFollowUpEmail("");
    setNotes("");
  }

  function addChild() {
    setChildren((prev) => [...prev, { name: "", age: 0 }]);
  }

  function removeChild(i: number) {
    setChildren((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateChild(i: number, field: keyof ChildEntry, value: string | number) {
    setChildren((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c))
    );
  }

  function addEditChild() {
    setEditChildren((prev) => [...prev, { name: "", age: 0 }]);
  }

  function removeEditChild(i: number) {
    setEditChildren((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateEditChild(i: number, field: keyof ChildEntry, value: string | number) {
    setEditChildren((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c))
    );
  }

  function openEdit(wf: any) {
    setEditWorkflow(wf);
    setEditWifeName(wf.wifeName || "");
    setEditFollowUpEmail(wf.followUpEmail || "");
    setEditNotes(wf.notes || "");
    let ch: ChildEntry[] = [];
    if (wf.childrenData) {
      try {
        const arr = typeof wf.childrenData === "string" ? JSON.parse(wf.childrenData) : wf.childrenData;
        if (Array.isArray(arr)) ch = arr;
      } catch { /* ignore */ }
    }
    setEditChildren(ch);
  }

  function handleEditSave() {
    if (!editWorkflow) return;
    updateMutation.mutate({
      id: editWorkflow.id,
      wifeName: editWifeName || undefined,
      children: editChildren.length > 0 ? editChildren : undefined,
      followUpEmail: editFollowUpEmail || undefined,
      notes: editNotes || undefined,
    });
  }

  function goNext() {
    if (step === "client" && !clientCaseId) {
      toast.error("يرجى اختيار عميل أولاً");
      return;
    }
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) setStep(STEP_ORDER[idx + 1]);
  }

  function goBack() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  }

  function handleSave() {
    if (!clientCaseId) return;
    createMutation.mutate({
      clientCaseId,
      wifeName: wifeName || undefined,
      children: children.length > 0 ? children : undefined,
      followUpEmail: followUpEmail || undefined,
      notes: notes || undefined,
    });
  }

  const isLastStep = step === STEP_ORDER[STEP_ORDER.length - 1];
  const isFirstStep = step === STEP_ORDER[0];
  const currentStepIdx = STEP_ORDER.indexOf(step);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      <h1 className="text-2xl font-bold text-right mb-1">التأشيرة الوطنية</h1>
      <p className="text-muted-foreground text-right mb-6">قائمة مستندات لمّ الشمل — التأشيرة الوطنية الإسبانية</p>

      {/* ── Create Form ─────────────────────────────────────────────────── */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-right text-lg">إنشاء قائمة مستندات جديدة</CardTitle>
          {/* Step indicator */}
          <div className="flex gap-2 mt-2 justify-end">
            {STEP_ORDER.map((s, i) => (
              <div
                key={s}
                className={`flex items-center gap-1 text-xs px-3 py-1 rounded-full border transition-colors ${
                  s === step
                    ? "bg-primary text-primary-foreground border-primary"
                    : i < currentStepIdx
                    ? "bg-green-600 text-white border-green-600"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                <span>{i + 1}.</span>
                <span>{STEP_LABELS[s]}</span>
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Step 1: Client Selection */}
          {step === "client" && (
            <div className="space-y-3">
              <Label className="text-right block">البحث عن عميل</Label>
              <Input
                placeholder="ابحث باسم العميل..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="text-right"
                dir="rtl"
              />
              {clientsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
                  {filteredClients.length === 0 && (
                    <div className="p-4 text-center text-muted-foreground text-sm">لا يوجد عملاء مطابقون</div>
                  )}
                  {filteredClients.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setClientCaseId(c.id);
                        // Auto-populate spouse name from client record
                        const spName = (c as any).spouseName;
                        if (spName) setWifeName(spName);
                        // Auto-populate children from client record's childrenData (exact name+age)
                        const raw = (c as any).childrenData;
                        if (raw) {
                          try {
                            const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
                            if (Array.isArray(arr) && arr.length > 0) {
                              setChildren(arr.map((ch: any) => ({
                                name: ch.name || "",
                                age: typeof ch.age === "number" ? ch.age : (ch.ageRange === "18-26" ? 20 : 10),
                              })));
                            } else {
                              setChildren([]);
                            }
                          } catch { setChildren([]); }
                        } else {
                          setChildren([]);
                        }
                      }}
                      className={`w-full text-right px-4 py-3 hover:bg-muted transition-colors flex items-center justify-between ${
                        clientCaseId === c.id ? "bg-primary/10 border-r-4 border-primary" : ""
                      }`}
                    >
                      <span className="text-sm font-medium">{c.clientName}</span>
                      {clientCaseId === c.id && (
                        <span className="text-xs text-primary font-bold">✓ محدد</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {selectedClient && (
                <div className="bg-primary/5 border border-primary/20 rounded-md p-3 text-right">
                  <p className="text-sm font-semibold text-primary">العميل المحدد: {selectedClient.clientName}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    النوع: {(selectedClient as any).applicationType === "business_owner" ? "صاحب عمل" : "فريلانسر"} |
                    الحالة الاجتماعية: {(selectedClient as any).maritalStatus === "family" ? "متزوج مع أسرة" : "أعزب"}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Family Data */}
          {step === "family" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-right block">اسم الزوجة</Label>
                <Input
                  placeholder="أدخل اسم الزوجة..."
                  value={wifeName}
                  onChange={(e) => setWifeName(e.target.value)}
                  className="text-right"
                  dir="rtl"
                />
              </div>

              <div className="space-y-3">
                {children.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-right">
                    <p className="text-xs text-blue-700 font-medium">✓ تم استيراد بيانات {children.length} {children.length === 1 ? "طفل" : "أطفال"} من سجل العميل تلقائياً — يمكنك تعديل الأعمار والأسماء</p>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" onClick={addChild} className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    إضافة طفل
                  </Button>
                  <Label className="text-right">الأبناء ({children.length})</Label>
                </div>

                {children.map((child, i) => (
                  <div key={i} className="border rounded-md p-3 space-y-2 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeChild(i)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <span className="text-sm font-medium text-right">الطفل {CHILD_ORDINALS[i] ?? i + 1}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-right block">العمر (سنة)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={50}
                          value={child.age}
                          onChange={(e) => updateChild(i, "age", parseInt(e.target.value) || 0)}
                          className="text-right"
                          dir="rtl"
                        />
                        <p className="text-xs text-muted-foreground text-right">{getAgeGroup(child.age)}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-right block">الاسم (اختياري)</Label>
                        <Input
                          placeholder="اسم الطفل..."
                          value={child.name}
                          onChange={(e) => updateChild(i, "name", e.target.value)}
                          className="text-right"
                          dir="rtl"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {children.length === 0 && (
                  <p className="text-sm text-muted-foreground text-right py-2">لا يوجد أبناء مضافون — اضغط "إضافة طفل" لإضافة أبناء</p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Additional Details */}
          {step === "details" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-right block">البريد الإلكتروني للمتابعة (اختياري)</Label>
                <Input
                  type="email"
                  placeholder="example@email.com"
                  value={followUpEmail}
                  onChange={(e) => setFollowUpEmail(e.target.value)}
                  className="text-left"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-right block">ملاحظات إضافية (اختياري)</Label>
                <textarea
                  placeholder="أي ملاحظات أو تعليمات خاصة..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full min-h-[100px] border rounded-md p-3 text-right text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  dir="rtl"
                />
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === "review" && (
            <div className="space-y-4 text-right">
              <h3 className="font-semibold text-lg">مراجعة البيانات</h3>
              <div className="bg-muted/30 rounded-md p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">العميل</span>
                  <span className="font-medium">{selectedClient?.clientName ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">اسم الزوجة</span>
                  <span className="font-medium">{wifeName || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">عدد الأبناء</span>
                  <span className="font-medium">{children.length}</span>
                </div>
                {children.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {children.map((c, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">الطفل {CHILD_ORDINALS[i] ?? i + 1}</span>
                        <span>{c.name || "—"} — {c.age} سنة ({getAgeGroup(c.age)})</span>
                      </div>
                    ))}
                  </div>
                )}
                {followUpEmail && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">البريد الإلكتروني</span>
                    <span className="font-medium">{followUpEmail}</span>
                  </div>
                )}
                {notes && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ملاحظات</span>
                    <span className="font-medium">{notes}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-2">
            <Button
              variant="outline"
              onClick={isFirstStep ? resetForm : goBack}
              className="flex items-center gap-2"
            >
              {isFirstStep ? (
                <><X className="h-4 w-4" />إلغاء</>
              ) : (
                <><ChevronRight className="h-4 w-4" />السابق</>
              )}
            </Button>

            {isLastStep ? (
              <Button
                onClick={handleSave}
                disabled={createMutation.isPending}
                className="flex items-center gap-2"
              >
                {createMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />جاري الحفظ...</>
                ) : (
                  <>حفظ القائمة</>
                )}
              </Button>
            ) : (
              <Button onClick={goNext} className="flex items-center gap-2">
                التالي <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Saved Workflows List ─────────────────────────────────────────────── */}
      <div>
        {/* Header + filter/sort controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4" dir="rtl">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span>القوائم المحفوظة</span>
            <Users className="h-5 w-5" />
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="text-sm border rounded-lg px-3 py-1.5 bg-background outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">كل الحالات</option>
              <option value="in_progress">قيد التجهيز</option>
              <option value="completed">مكتمل</option>
              <option value="submitted">مُقدَم</option>
            </select>
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value as any)}
              className="text-sm border rounded-lg px-3 py-1.5 bg-background outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="newest">الأحدث أولاً</option>
              <option value="oldest">الأقدم أولاً</option>
              <option value="az">الاسم أ-ي</option>
              <option value="za">الاسم ي-أ</option>
            </select>
          </div>
        </div>

        {/* Compute filtered + sorted list */}
        {(() => {
          const filtered = (workflows as any[]).filter(wf =>
            statusFilter === "all" || (wf.status || "in_progress") === statusFilter
          );
          const sorted = [...filtered].sort((a, b) => {
            if (sortOrder === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            if (sortOrder === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            if (sortOrder === "az") return (a.clientName || "").localeCompare(b.clientName || "", "ar");
            if (sortOrder === "za") return (b.clientName || "").localeCompare(a.clientName || "", "ar");
            return 0;
          });
          if (workflows.length === 0) return (
            <Card><CardContent className="py-10 text-center text-muted-foreground">لا توجد قوائم مستندات محفوظة بعد</CardContent></Card>
          );
          if (sorted.length === 0) return (
            <Card><CardContent className="py-10 text-center text-muted-foreground">لا توجد قوائم تطابق الفلتر المحدد</CardContent></Card>
          );
          return (
          <div className="space-y-3">
            {sorted.map((wf: any) => {
              let childCount = 0;
              if (wf.childrenData) {
                try {
                  const arr = typeof wf.childrenData === "string" ? JSON.parse(wf.childrenData) : wf.childrenData;
                  childCount = Array.isArray(arr) ? arr.length : 0;
                } catch { /* ignore */ }
              }
              return (
                <Card key={wf.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateMutation.mutate({ id: wf.id })}
                          disabled={generateMutation.isPending && (generateMutation.variables as any)?.id === wf.id}
                          className="flex items-center gap-1"
                        >
                          {generateMutation.isPending && (generateMutation.variables as any)?.id === wf.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <FileDown className="h-3 w-3" />
                          )}
                          تنزيل
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(wf)}
                          className="flex items-center gap-1"
                        >
                          <Pencil className="h-3 w-3" />
                          تعديل
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("هل أنت متأكد من حذف هذه القائمة؟")) {
                              deleteMutation.mutate({ id: wf.id });
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* Info */}
                      <div className="text-right flex-1">
                        <div className="flex items-center justify-end gap-2 mb-1">
                          <select
                            value={wf.status || "in_progress"}
                            onChange={e => updateStatusMutation.mutate({ id: wf.id, status: e.target.value as any })}
                            onClick={e => e.stopPropagation()}
                            className={`text-xs font-medium px-2 py-0.5 rounded-full border cursor-pointer outline-none ${
                              wf.status === "submitted" ? "bg-green-50 text-green-700 border-green-200" :
                              wf.status === "completed" ? "bg-blue-50 text-blue-700 border-blue-200" :
                              "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            <option value="in_progress">• قيد التجهيز</option>
                            <option value="completed">✔ مكتمل</option>
                            <option value="submitted">✓✓ مُقدَم</option>
                          </select>
                          <p className="font-semibold">{wf.clientName}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {wf.wifeName ? `الزوجة: ${wf.wifeName}` : "بدون اسم زوجة"}
                          {childCount > 0 ? ` | ${childCount} أبناء` : " | بدون أبناء"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(wf.createdAt).toLocaleDateString("ar-EG")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          );
        })()}
      </div>

      {/* ── Edit Modal ───────────────────────────────────────────────────────── */}
      {editWorkflow && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setEditWorkflow(null)}>
                  <X className="h-4 w-4" />
                </Button>
                <CardTitle className="text-right">تعديل قائمة: {editWorkflow.clientName}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-right block">اسم الزوجة</Label>
                <Input
                  value={editWifeName}
                  onChange={(e) => setEditWifeName(e.target.value)}
                  className="text-right"
                  dir="rtl"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" onClick={addEditChild}>
                    <Plus className="h-4 w-4 ml-1" />
                    إضافة طفل
                  </Button>
                  <Label className="text-right">الأبناء</Label>
                </div>
                {editChildren.map((child, i) => (
                  <div key={i} className="border rounded-md p-3 space-y-2 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Button variant="ghost" size="sm" onClick={() => removeEditChild(i)} className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <span className="text-sm font-medium">الطفل {CHILD_ORDINALS[i] ?? i + 1}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-right block">العمر</Label>
                        <Input
                          type="number"
                          min={0}
                          max={50}
                          value={child.age}
                          onChange={(e) => updateEditChild(i, "age", parseInt(e.target.value) || 0)}
                          className="text-right"
                          dir="rtl"
                        />
                        <p className="text-xs text-muted-foreground text-right">{getAgeGroup(child.age)}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-right block">الاسم</Label>
                        <Input
                          value={child.name}
                          onChange={(e) => updateEditChild(i, "name", e.target.value)}
                          className="text-right"
                          dir="rtl"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label className="text-right block">البريد الإلكتروني للمتابعة</Label>
                <Input
                  type="email"
                  value={editFollowUpEmail}
                  onChange={(e) => setEditFollowUpEmail(e.target.value)}
                  className="text-left"
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-right block">ملاحظات</Label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full min-h-[80px] border rounded-md p-3 text-right text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  dir="rtl"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditWorkflow(null)}>إلغاء</Button>
                <Button onClick={handleEditSave} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ التعديلات"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
