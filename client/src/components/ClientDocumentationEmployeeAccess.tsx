import { useEffect, useMemo, useState } from "react";
import { Users, UserPlus, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function ClientDocumentationEmployeeAccess({ clientCaseId }: { clientCaseId: number }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const access = trpc.clientDocs.employeeAccess.useQuery({ clientCaseId });
  const updateAccess = trpc.clientDocs.updateEmployeeAccess.useMutation({
    onSuccess: async () => {
      toast.success("Employees with access updated");
      await Promise.all([
        utils.clientDocs.employeeAccess.invalidate({ clientCaseId }),
        utils.clientChat.getForCase.invalidate({ clientCaseId }),
        utils.clientChat.messages.invalidate(),
      ]);
      setOpen(false);
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (open && access.data) setSelectedIds(access.data.filter(employee => employee.selected).map(employee => employee.id));
  }, [open, access.data]);

  const activeEmployees = access.data?.filter(employee => employee.selected) ?? [];
  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return access.data ?? [];
    return (access.data ?? []).filter(employee => `${employee.name} ${employee.email ?? ""}`.toLowerCase().includes(term));
  }, [access.data, search]);

  if (access.isError) return null;

  const toggleEmployee = (employeeId: number, mandatory: boolean) => {
    if (mandatory) return;
    setSelectedIds(current => current.includes(employeeId) ? current.filter(id => id !== employeeId) : [...current, employeeId]);
  };

  return <>
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><Users className="h-4 w-4 text-[#1e3a5f]" /><h2 className="text-sm font-semibold text-slate-900">Employees with access</h2></div>
          <p className="mt-1 text-xs text-slate-500">Selected employees can open this Client Documentation folder and participate in its Chat.</p>
        </div>
        <Button type="button" size="sm" variant="outline" className="gap-1.5 border-[#1e3a5f]/30 text-[#1e3a5f]" onClick={() => setOpen(true)} disabled={access.isLoading}>
          <UserPlus className="h-3.5 w-3.5" /> Choose employees
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {access.isLoading ? <span className="text-xs text-slate-500">Loading employee access…</span> : activeEmployees.length ? activeEmployees.map(employee => <Badge key={employee.id} variant="secondary" className="gap-1 bg-slate-100 text-slate-700"><span>{employee.name}</span>{employee.mandatory ? <ShieldCheck className="h-3 w-3 text-[#1e7184]" aria-label="Required assignment" /> : null}</Badge>) : <span className="text-xs text-slate-500">No additional employees selected.</span>}
      </div>
    </section>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Employees with access</DialogTitle><DialogDescription>Choose multiple employees who may open this folder and use its Chat. The creator, assigned consultant, and assigned paralegal remain protected.</DialogDescription></DialogHeader>
        <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search employee name or email" />
        <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
          {filteredEmployees.map(employee => {
            const checked = selectedIds.includes(employee.id) || employee.mandatory;
            return <Label key={employee.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${checked ? "border-[#5ba3b8] bg-[#5ba3b8]/10" : "border-slate-200 bg-white"}`}>
              <Checkbox checked={checked} disabled={employee.mandatory || updateAccess.isPending} onCheckedChange={() => toggleEmployee(employee.id, employee.mandatory)} />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-900">{employee.name}</span><span className="block truncate text-xs text-slate-500">{employee.email || "No email"}</span></span>
              {employee.mandatory ? <Badge variant="outline" className="text-[10px]">Required</Badge> : null}
            </Label>;
          })}
          {!filteredEmployees.length ? <p className="py-6 text-center text-sm text-slate-500">No employees match this search.</p> : null}
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" onClick={() => updateAccess.mutate({ clientCaseId, employeeIds: selectedIds })} disabled={updateAccess.isPending}>{updateAccess.isPending ? "Saving…" : "Save access"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
