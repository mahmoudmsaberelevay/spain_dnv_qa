/**
 * WorkflowPage.tsx
 * "خطة العمل" — Generate a new workflow plan for a client.
 * Allows selecting a client, setting submission stage, income schedule,
 * and generates an Arabic Word document.
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
import { Plus, Trash2, FileDown, Loader2, ChevronRight, ChevronLeft } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PaymentEntry {
  date: string;
  amount: number;
}

interface ChildNameEntry {
  name: string;
  ageRange: "0-17" | "18-26";
}

type Step = "client" | "children" | "stage" | "income" | "review";

const STEP_ORDER: Step[] = ["client", "children", "stage", "income", "review"];

const STEP_LABELS: Record<Step, string> = {
  client: "اختيار العميل",
  children: "بيانات الأطفال",
  stage: "مرحلة التقديم",
  income: "جدول الدخل",
  review: "المراجعة والحفظ",
};

const FREQ_LABELS: Record<string, string> = {
  monthly: "شهري",
  quarterly: "ربع سنوي",
  biannual: "نصف سنوي",
  yearly: "سنوي",
  task: "بالمهمة",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function toArabicDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = [
    "يناير","فبراير","مارس","أبريل","مايو","يونيو",
    "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

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

// Ordinal labels for children in Arabic
const CHILD_ORDINALS = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];

// ── Main Component ────────────────────────────────────────────────────────────
export default function WorkflowPage() {

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: clients = [], isLoading: clientsLoading } = trpc.clientDocs.list.useQuery();
  const { data: workflows = [], refetch: refetchWorkflows } = trpc.workflow.list.useQuery();

  // ── Form state ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("client");
  const [clientCaseId, setClientCaseId] = useState<number | null>(null);
  const [childrenNames, setChildrenNames] = useState<ChildNameEntry[]>([]);
  const [submissionStage, setSubmissionStage] = useState<"one" | "two">("two");
  const [submissionDate, setSubmissionDate] = useState(todayStr());
  const [schengenStatus, setSchengenStatus] = useState("");
  const [schengenExpiry, setSchengenExpiry] = useState("");
  const [yearlyIncome, setYearlyIncome] = useState<number>(0);
  const [incomeFrequency, setIncomeFrequency] = useState<"monthly" | "quarterly" | "biannual" | "yearly" | "task">("monthly");
  const [payments, setPayments] = useState<PaymentEntry[]>([{ date: todayStr(), amount: 0 }]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = trpc.workflow.create.useMutation({
    onSuccess: () => {
      refetchWorkflows();
      toast.success("تم حفظ خطة العمل بنجاح");
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.workflow.delete.useMutation({
    onSuccess: () => { refetchWorkflows(); toast.success("تم الحذف"); },
    onError: (e) => toast.error(e.message),
  });

  const generateMutation = trpc.workflow.generateDoc.useMutation({
    onSuccess: (data) => {
      downloadBase64Docx(data.base64, `خطة_عمل_${data.clientName}.docx`);
      toast.success("تم تنزيل خطة العمل بنجاح");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientCaseId),
    [clients, clientCaseId]
  );

  // Derive children count from the selected client's childrenData
  const clientChildrenCount = useMemo(() => {
    if (!selectedClient) return 0;
    const raw = (selectedClient as any).childrenData;
    if (!raw) return 0;
    try {
      const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(arr) ? arr.length : 0;
    } catch { return 0; }
  }, [selectedClient]);

  // When client changes, sync childrenNames array length to match client's children count
  function handleClientSelect(id: number) {
    setClientCaseId(id);
    const client = clients.find((c) => c.id === id);
    if (!client) return;
    const raw = (client as any).childrenData;
    let count = 0;
    let existingAgeRanges: Array<"0-17" | "18-26"> = [];
    if (raw) {
      try {
        const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(arr)) {
          count = arr.length;
          existingAgeRanges = arr.map((c: any) => c.ageRange || "0-17");
        }
      } catch { /* ignore */ }
    }
    setChildrenNames(
      Array.from({ length: count }, (_, i) => ({
        name: "",
        ageRange: existingAgeRanges[i] || "0-17",
      }))
    );
  }

  const approvalDate = submissionDate ? addDays(submissionDate, 45) : "";
  const cardDate = approvalDate ? addDays(approvalDate, 20) : "";
  const familySubmDate = submissionStage === "two" && cardDate ? addDays(cardDate, 10) : "";

  function resetForm() {
    setStep("client");
    setClientCaseId(null);
    setChildrenNames([]);
    setSubmissionStage("two");
    setSubmissionDate(todayStr());
    setSchengenStatus("");
    setSchengenExpiry("");
    setYearlyIncome(0);
    setIncomeFrequency("monthly");
    setPayments([{ date: todayStr(), amount: 0 }]);
  }

  function addPayment() {
    setPayments((prev) => [...prev, { date: todayStr(), amount: 0 }]);
  }

  function removePayment(i: number) {
    setPayments((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updatePayment(i: number, field: keyof PaymentEntry, value: string | number) {
    setPayments((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p))
    );
  }

  function updateChildName(i: number, name: string) {
    setChildrenNames((prev) => prev.map((c, idx) => idx === i ? { ...c, name } : c));
  }

  function updateChildAgeRange(i: number, ageRange: "0-17" | "18-26") {
    setChildrenNames((prev) => prev.map((c, idx) => idx === i ? { ...c, ageRange } : c));
  }

  const currentStepIdx = STEP_ORDER.indexOf(step);

  // Determine effective steps — skip "children" step if no children
  const effectiveSteps = useMemo(() => {
    if (clientChildrenCount === 0) return STEP_ORDER.filter(s => s !== "children");
    return STEP_ORDER;
  }, [clientChildrenCount]);

  function goNext() {
    if (step === "client" && !clientCaseId) {
      toast.error("يرجى اختيار عميل أولاً");
      return;
    }
    if (step === "income" && payments.some((p) => !p.date || p.amount <= 0)) {
      toast.error("يرجى إدخال تاريخ ومبلغ صحيح لكل دفعة");
      return;
    }
    const idx = effectiveSteps.indexOf(step);
    if (idx < effectiveSteps.length - 1) {
      setStep(effectiveSteps[idx + 1]);
    }
  }

  function goBack() {
    const idx = effectiveSteps.indexOf(step);
    if (idx > 0) setStep(effectiveSteps[idx - 1]);
  }

  function handleSave() {
    if (!clientCaseId) return;
    createMutation.mutate({
      clientCaseId,
      submissionStage,
      submissionDate,
      schengenStatus: schengenStatus || undefined,
      schengenExpiry: schengenExpiry || undefined,
      yearlyIncome,
      incomeFrequency,
      incomePayments: payments,
      childrenNamesData: childrenNames.length > 0 ? childrenNames : undefined,
    });
  }

  const isLastStep = step === effectiveSteps[effectiveSteps.length - 1];
  const isFirstStep = step === effectiveSteps[0];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      <h1 className="text-2xl font-bold text-right mb-6" style={{ color: "#1e3a5f" }}>
        خطة العمل — إعداد ملف الإقامة الإسبانية
      </h1>

      {/* ── Step indicator ── */}
      <div className="flex items-center gap-2 mb-8 justify-end flex-wrap">
        {effectiveSteps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={`text-sm font-medium px-3 py-1 rounded-full ${
                s === step
                  ? "bg-blue-900 text-white"
                  : effectiveSteps.indexOf(step) > i
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {STEP_LABELS[s]}
            </span>
            {i < effectiveSteps.length - 1 && <ChevronLeft className="w-4 h-4 text-gray-400" />}
          </div>
        ))}
      </div>

      {/* ── Step 1: Client selection ── */}
      {step === "client" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-right">اختيار العميل</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {clientsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
            ) : (
              <div>
                <Label className="block text-right mb-2">اسم العميل</Label>
                <Select
                  value={clientCaseId ? String(clientCaseId) : ""}
                  onValueChange={(v) => handleClientSelect(Number(v))}
                >
                  <SelectTrigger className="text-right">
                    <SelectValue placeholder="اختر عميلاً..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.clientName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {selectedClient && (
              <div className="bg-blue-50 rounded-lg p-4 text-right space-y-1 text-sm">
                <p><strong>نوع الطلب:</strong> {selectedClient.applicationType === "freelancer" ? "فريلانسر" : "صاحب عمل"}</p>
                <p><strong>الحالة الاجتماعية:</strong> {selectedClient.maritalStatus === "family" ? "أسرة" : "منفرد"}</p>
                <p><strong>المرحلة الحالية:</strong> {selectedClient.stage}</p>
                {clientChildrenCount > 0 && (
                  <p><strong>عدد الأطفال:</strong> {clientChildrenCount}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Children names & ages ── */}
      {step === "children" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-right">بيانات الأطفال</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500 text-right">
              أدخل اسم كل طفل وتأكد من الفئة العمرية الصحيحة. ستظهر هذه البيانات في وثيقة خطة العمل.
            </p>
            {childrenNames.map((child, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-4 space-y-3 border">
                <p className="font-semibold text-right text-blue-900">
                  الطفل {CHILD_ORDINALS[i] || `${i + 1}`}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="block text-right mb-1 text-sm">الفئة العمرية</Label>
                    <Select
                      value={child.ageRange}
                      onValueChange={(v) => updateChildAgeRange(i, v as "0-17" | "18-26")}
                    >
                      <SelectTrigger className="text-right">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0-17">من 0 إلى 17 سنة</SelectItem>
                        <SelectItem value="18-26">من 18 إلى 26 سنة</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="block text-right mb-1 text-sm">الاسم</Label>
                    <Input
                      value={child.name}
                      onChange={(e) => updateChildName(i, e.target.value)}
                      placeholder={`اسم الطفل ${CHILD_ORDINALS[i] || i + 1}`}
                      className="text-right"
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Submission stage & dates ── */}
      {step === "stage" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-right">مرحلة التقديم والجدول الزمني</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="block text-right mb-2">مرحلة التقديم</Label>
              <Select value={submissionStage} onValueChange={(v) => setSubmissionStage(v as "one" | "two")}>
                <SelectTrigger className="text-right">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="two">مرحلتان — تقديم رئيسي ثم تقديم الأسرة</SelectItem>
                  <SelectItem value="one">مرحلة واحدة — تقديم كامل الأسرة معاً</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="block text-right mb-2">تاريخ التقديم المتوقع (تقريبي)</Label>
              <Input
                type="date"
                value={submissionDate}
                onChange={(e) => setSubmissionDate(e.target.value)}
                className="text-right"
              />
            </div>
            <div>
              <Label className="block text-right mb-2">حالة تأشيرة شنغن (اختياري)</Label>
              <Input
                value={schengenStatus}
                onChange={(e) => setSchengenStatus(e.target.value)}
                placeholder="مثال: لديه تأشيرة شنغن سارية"
                className="text-right"
              />
            </div>
            {/* Schengen expiry date — shown only when schengenStatus is filled */}
            {schengenStatus && (
              <div>
                <Label className="block text-right mb-2">تاريخ انتهاء تأشيرة شنغن</Label>
                <Input
                  type="date"
                  value={schengenExpiry}
                  onChange={(e) => setSchengenExpiry(e.target.value)}
                  className="text-right"
                />
                {schengenExpiry && (
                  <p className="text-xs text-gray-500 text-right mt-1">
                    تنتهي في: {toArabicDate(schengenExpiry)}
                  </p>
                )}
              </div>
            )}

            {/* Timeline preview */}
            {submissionDate && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm text-right border">
                <p className="font-semibold text-blue-900">الجدول الزمني المتوقع :</p>
                <p>📅 تقديم الطلب الرئيسي : {toArabicDate(submissionDate)}</p>
                <p>✅ الحصول على الموافقة : {toArabicDate(approvalDate)}</p>
                <p>💳 استلام البطاقات : {toArabicDate(cardDate)}</p>
                {submissionStage === "two" && familySubmDate && (
                  <p>👨‍👩‍👧 تقديم طلب الأسرة : {toArabicDate(familySubmDate)}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 4: Income schedule ── */}
      {step === "income" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-right">جدول الدخل السنوي</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="block text-right mb-2">الدخل السنوي المطلوب (جنيه مصري)</Label>
              <Input
                type="number"
                min={0}
                value={yearlyIncome || ""}
                onChange={(e) => setYearlyIncome(Number(e.target.value))}
                placeholder="مثال: 240000"
                className="text-right"
              />
            </div>
            <div>
              <Label className="block text-right mb-2">طريقة إثبات الدخل</Label>
              <Select value={incomeFrequency} onValueChange={(v) => setIncomeFrequency(v as any)}>
                <SelectTrigger className="text-right">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQ_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <Button variant="outline" size="sm" onClick={addPayment} className="flex items-center gap-1">
                  <Plus className="w-4 h-4" /> إضافة دفعة
                </Button>
                <Label className="text-right font-semibold">جدول الدفعات</Label>
              </div>
              <div className="space-y-3">
                {payments.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removePayment(i)}
                      disabled={payments.length === 1}
                      className="text-red-500 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Input
                      type="number"
                      min={0}
                      value={p.amount || ""}
                      onChange={(e) => updatePayment(i, "amount", Number(e.target.value))}
                      placeholder="المبلغ (جنيه)"
                      className="text-right w-40"
                    />
                    <Input
                      type="date"
                      value={p.date}
                      onChange={(e) => updatePayment(i, "date", e.target.value)}
                      className="text-right flex-1"
                    />
                    <span className="text-sm text-gray-500 shrink-0">الدفعة {i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 5: Review & save ── */}
      {step === "review" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-right">مراجعة البيانات والحفظ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-right text-sm">
            <div className="bg-blue-50 rounded-lg p-4 space-y-2 border border-blue-200">
              <p><strong>العميل :</strong> {selectedClient?.clientName}</p>
              <p><strong>نوع الطلب :</strong> {selectedClient?.applicationType === "freelancer" ? "فريلانسر" : "صاحب عمل"}</p>
              <p><strong>مرحلة التقديم :</strong> {submissionStage === "two" ? "مرحلتان" : "مرحلة واحدة"}</p>
              <p><strong>تاريخ التقديم :</strong> {toArabicDate(submissionDate)}</p>
              {schengenStatus && <p><strong>شنغن :</strong> {schengenStatus}</p>}
              {schengenExpiry && <p><strong>انتهاء تأشيرة شنغن :</strong> {toArabicDate(schengenExpiry)}</p>}
              <p><strong>الدخل السنوي :</strong> {yearlyIncome.toLocaleString("ar-EG")} جنيه</p>
              <p><strong>طريقة الإثبات :</strong> {FREQ_LABELS[incomeFrequency]}</p>
              <p><strong>عدد الدفعات :</strong> {payments.length}</p>
              {childrenNames.length > 0 && (
                <div>
                  <strong>الأطفال :</strong>
                  <ul className="mt-1 space-y-1 pr-4">
                    {childrenNames.map((c, i) => (
                      <li key={i} className="text-xs">
                        الطفل {CHILD_ORDINALS[i] || i + 1} : {c.name || "(بدون اسم)"} — {c.ageRange === "0-17" ? "0-17 سنة" : "18-26 سنة"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <p className="text-gray-500 text-xs">
              بعد الحفظ، يمكنك توليد وثيقة خطة العمل بصيغة Word من قائمة خطط العمل أدناه.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Navigation buttons ── */}
      <div className="flex justify-between mt-6">
        <Button variant="outline" onClick={goBack} disabled={isFirstStep} className="flex items-center gap-2">
          <ChevronRight className="w-4 h-4" /> السابق
        </Button>
        {!isLastStep ? (
          <Button onClick={goNext} className="flex items-center gap-2" style={{ backgroundColor: "#1e3a5f" }}>
            التالي <ChevronLeft className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSave}
            disabled={createMutation.isPending}
            className="flex items-center gap-2"
            style={{ backgroundColor: "#1e3a5f" }}
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            حفظ خطة العمل
          </Button>
        )}
      </div>

      {/* ── Saved workflows list ── */}
      {workflows.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-bold text-right mb-4" style={{ color: "#1e3a5f" }}>
            خطط العمل المحفوظة
          </h2>
          <div className="space-y-3">
            {workflows.map((wf: any) => (
              <div
                key={wf.id}
                className="flex items-center justify-between bg-white border rounded-lg p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate({ id: wf.id })}
                    disabled={deleteMutation.isPending}
                    className="text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateMutation.mutate({ id: wf.id })}
                    disabled={generateMutation.isPending && generateMutation.variables?.id === wf.id}
                    className="flex items-center gap-2"
                  >
                    {generateMutation.isPending && generateMutation.variables?.id === wf.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileDown className="w-4 h-4" />
                    )}
                    تنزيل خطة العمل
                  </Button>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{wf.clientName}</p>
                  <p className="text-sm text-gray-500">
                    {wf.submissionStage === "two" ? "مرحلتان" : "مرحلة واحدة"} — تقديم:{" "}
                    {toArabicDate(wf.submissionDate)} — دخل:{" "}
                    {Number(wf.yearlyIncome).toLocaleString("ar-EG")} جنيه
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
