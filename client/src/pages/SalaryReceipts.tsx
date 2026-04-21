import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Download, Edit, Trash2, CheckCircle, FileText } from "lucide-react";

// ─── PDF generation (client-side, no dependencies) ──────────────────────────
function generateSalaryReceiptPdf(receipt: {
  employeeName: string;
  forMonth: string;
  salaryAmount: number;
  deductionAmount: number;
  netPaidSalary: number;
  receiptDate: Date | string;
}) {
  const date = new Date(receipt.receiptDate).toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const fmt = (n: number) => n.toLocaleString("en-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Build HTML that matches the Elevay template
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #222; background: #fff; }
  .header { background: #b8c4d8; padding: 28px 36px 20px; }
  .header h1 { font-size: 42px; font-weight: 900; letter-spacing: 1px; color: #111; }
  .body { padding: 36px 60px; }
  .meta { margin-bottom: 28px; }
  .meta p { margin-bottom: 4px; line-height: 1.6; }
  .meta .label { display: inline-block; width: 120px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  table td { border: 1px solid #555; padding: 7px 12px; }
  table td:last-child { text-align: right; }
  .net-row td { font-weight: bold; }
</style>
</head>
<body>
  <div class="header"><h1>ELEVAY</h1></div>
  <div class="body">
    <div class="meta">
      <p><span class="label">Date</span>${date}</p>
      <p>&nbsp;</p>
      <p>Salary Receipt</p>
      <p>For</p>
      <p>${receipt.employeeName}</p>
    </div>
    <table>
      <tr>
        <td>Salary for ${receipt.forMonth}</td>
        <td>${fmt(receipt.salaryAmount)} EGP</td>
      </tr>
      <tr>
        <td>Total Deduction</td>
        <td>${fmt(receipt.deductionAmount)} EGP</td>
      </tr>
      <tr class="net-row">
        <td>Net Paid Salary</td>
        <td>${fmt(receipt.netPaidSalary)} EGP</td>
      </tr>
    </table>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.onload = () => {
      setTimeout(() => {
        win.print();
        URL.revokeObjectURL(url);
      }, 500);
    };
  }
}

// ─── Month helper ────────────────────────────────────────────────────────────
function currentMonthLabel() {
  return new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SalaryReceipts() {
  const utils = trpc.useUtils();

  const { data: receipts = [], isLoading } = trpc.financial.salaryReceipts.list.useQuery();
  const { data: employees = [] } = trpc.financial.employees.list.useQuery();

  const [showModal, setShowModal] = useState(false);
  const [editReceipt, setEditReceipt] = useState<null | typeof receipts[0]>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Form state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [deduction, setDeduction] = useState<string>("0");
  const [forMonth, setForMonth] = useState(currentMonthLabel());
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0]);

  const selectedEmployee = useMemo(
    () => employees.find(e => e.id === Number(selectedEmployeeId)),
    [employees, selectedEmployeeId]
  );
  const salary = selectedEmployee ? Number(selectedEmployee.salary) : 0;
  const deductionNum = Number(deduction) || 0;
  const netSalary = salary - deductionNum;

  function resetForm() {
    setSelectedEmployeeId("");
    setDeduction("0");
    setForMonth(currentMonthLabel());
    setReceiptDate(new Date().toISOString().split("T")[0]);
    setEditReceipt(null);
  }

  function openCreate() {
    resetForm();
    setShowModal(true);
  }

  function openEdit(r: typeof receipts[0]) {
    setEditReceipt(r);
    setSelectedEmployeeId(String(r.employeeId));
    setDeduction(String(Number(r.deductionAmount)));
    setForMonth(r.forMonth);
    setReceiptDate(new Date(r.receiptDate).toISOString().split("T")[0]);
    setShowModal(true);
  }

  const createMutation = trpc.financial.salaryReceipts.create.useMutation({
    onSuccess: () => {
      utils.financial.salaryReceipts.list.invalidate();
      toast.success("Receipt created");
      setShowModal(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.financial.salaryReceipts.update.useMutation({
    onSuccess: () => {
      utils.financial.salaryReceipts.list.invalidate();
      toast.success("Receipt updated");
      setShowModal(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.financial.salaryReceipts.delete.useMutation({
    onSuccess: () => {
      utils.financial.salaryReceipts.list.invalidate();
      toast.success("Receipt deleted");
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const markPaidMutation = trpc.financial.salaryReceipts.markAsPaid.useMutation({
    onSuccess: () => {
      utils.financial.salaryReceipts.list.invalidate();
      utils.financial.transactions.list.invalidate();
      utils.financial.accounts.list.invalidate();
      toast.success("Marked as paid — expense entry created in Cash EGP");
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit() {
    if (!selectedEmployeeId) {
      toast.error("Select an employee");
      return;
    }
    const emp = employees.find(e => e.id === Number(selectedEmployeeId));
    if (!emp) return;
    const payload = {
      employeeId: emp.id,
      employeeName: emp.name,
      salaryAmount: Number(emp.salary),
      deductionAmount: deductionNum,
      forMonth,
      receiptDate: new Date(receiptDate).getTime(),
    };
    if (editReceipt) {
      updateMutation.mutate({ id: editReceipt.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Salary Receipts</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage employee salary receipts and payments</p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> New Receipt
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Employee</th>
                <th className="text-left px-4 py-3 font-medium">Month</th>
                <th className="text-right px-4 py-3 font-medium">Salary (EGP)</th>
                <th className="text-right px-4 py-3 font-medium">Deduction</th>
                <th className="text-right px-4 py-3 font-medium">Net Paid</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-center px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
              ) : receipts.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">No salary receipts yet</td></tr>
              ) : receipts.map(r => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{r.employeeName}</td>
                  <td className="px-4 py-3">{r.forMonth}</td>
                  <td className="px-4 py-3 text-right">{Number(r.salaryAmount).toLocaleString("en-EG", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right text-red-600">
                    {Number(r.deductionAmount) > 0 ? `-${Number(r.deductionAmount).toLocaleString("en-EG", { minimumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{Number(r.netPaidSalary).toLocaleString("en-EG", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3">{new Date(r.receiptDate).toLocaleDateString("en-GB")}</td>
                  <td className="px-4 py-3">
                    {r.status === "paid"
                      ? <Badge className="bg-green-100 text-green-800 border-green-200">Paid</Badge>
                      : <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">Draft</Badge>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {/* Download PDF */}
                      <Button size="icon" variant="ghost" title="Download PDF"
                        onClick={() => generateSalaryReceiptPdf({
                          employeeName: r.employeeName,
                          forMonth: r.forMonth,
                          salaryAmount: Number(r.salaryAmount),
                          deductionAmount: Number(r.deductionAmount),
                          netPaidSalary: Number(r.netPaidSalary),
                          receiptDate: r.receiptDate,
                        })}>
                        <Download className="w-4 h-4" />
                      </Button>
                      {/* Edit (always visible) */}
                      <Button size="icon" variant="ghost" title="Edit" onClick={() => openEdit(r)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      {/* Mark as Paid (draft only) */}
                      {r.status === "draft" && (
                        <Button size="icon" variant="ghost" title="Mark as Paid"
                          className="text-green-600 hover:text-green-700"
                          onClick={() => {
                            if (confirm(`Mark ${r.employeeName}'s salary for ${r.forMonth} as paid? This will create an expense entry in Cash EGP.`)) {
                              markPaidMutation.mutate({ id: r.id });
                            }
                          }}>
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                      )}
                      {/* Delete (always visible) */}
                      <Button size="icon" variant="ghost" title="Delete"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => setDeleteId(r.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Create / Edit Modal */}
        <Dialog open={showModal} onOpenChange={(o) => { if (!o) { setShowModal(false); resetForm(); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {editReceipt ? "Edit Salary Receipt" : "New Salary Receipt"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {/* Employee picker */}
              <div>
                <Label>Employee</Label>
                <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select employee..." />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.filter(e => e.isActive).map(e => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.name} — {e.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Salary (auto-filled) */}
              {selectedEmployee && (
                <div className="rounded-md bg-muted/50 px-4 py-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base Salary</span>
                    <span className="font-semibold">{Number(selectedEmployee.salary).toLocaleString("en-EG")} EGP</span>
                  </div>
                </div>
              )}

              {/* Deduction */}
              <div>
                <Label>Deduction (EGP) <span className="text-muted-foreground text-xs">— optional</span></Label>
                <Input
                  type="number"
                  min="0"
                  value={deduction}
                  onChange={e => setDeduction(e.target.value)}
                  className="mt-1"
                  placeholder="0"
                />
              </div>

              {/* Net salary preview */}
              {selectedEmployee && (
                <div className={`rounded-md px-4 py-3 text-sm font-medium flex justify-between ${netSalary < 0 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>
                  <span>Net Paid Salary</span>
                  <span>{netSalary.toLocaleString("en-EG", { minimumFractionDigits: 2 })} EGP</span>
                </div>
              )}

              {/* Month */}
              <div>
                <Label>For Month</Label>
                <Input
                  value={forMonth}
                  onChange={e => setForMonth(e.target.value)}
                  className="mt-1"
                  placeholder="e.g. April 2026"
                />
              </div>

              {/* Date */}
              <div>
                <Label>Receipt Date</Label>
                <Input
                  type="date"
                  value={receiptDate}
                  onChange={e => setReceiptDate(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setShowModal(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editReceipt ? "Save Changes" : "Create Receipt"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm */}
        <Dialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Receipt?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1"
                onClick={() => deleteId !== null && deleteMutation.mutate({ id: deleteId })}
                disabled={deleteMutation.isPending}>
                Delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
