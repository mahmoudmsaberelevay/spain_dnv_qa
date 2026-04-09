import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function FinEmployees() {
  const utils = trpc.useUtils();
  const { data: employees, isLoading } = trpc.financial.employees.list.useQuery();
  const createMut = trpc.financial.employees.create.useMutation({
    onSuccess: () => { utils.financial.employees.list.invalidate(); toast.success("Employee added"); setShowCreate(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.financial.employees.update.useMutation({
    onSuccess: () => { utils.financial.employees.list.invalidate(); toast.success("Employee updated"); setEditEmp(null); },
    onError: (e) => toast.error(e.message),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [editEmp, setEditEmp] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Employees</h1>
        <Button onClick={() => { setNewName(""); setNewRole(""); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Employee
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Team Members ({employees?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !employees?.length ? (
            <div className="text-center py-8 text-muted-foreground">No employees yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Name</th>
                    <th className="text-left py-2 font-medium">Role</th>
                    <th className="text-center py-2 font-medium">Status</th>
                    <th className="text-right py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.id} className="border-b border-muted/50 hover:bg-muted/30">
                      <td className="py-2.5 font-medium">{emp.name}</td>
                      <td className="py-2.5 text-muted-foreground">{emp.role ?? "—"}</td>
                      <td className="py-2.5 text-center">
                        <Badge variant={emp.isActive ? "default" : "secondary"} className="text-xs">
                          {emp.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right">
                        <Button variant="ghost" size="sm" onClick={() => { setEditEmp(emp); setEditName(emp.name); setEditRole(emp.role ?? ""); }}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Employee</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Employee name" />
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Input value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="e.g. Consultant, Paralegal" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate({ name: newName, role: newRole || undefined })} disabled={!newName.trim() || createMut.isPending}>
              {createMut.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editEmp} onOpenChange={() => setEditEmp(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Employee</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Input value={editRole} onChange={e => setEditRole(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEmp(null)}>Cancel</Button>
            <Button onClick={() => updateMut.mutate({ id: editEmp.id, name: editName, role: editRole || undefined })} disabled={!editName.trim() || updateMut.isPending}>
              {updateMut.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
