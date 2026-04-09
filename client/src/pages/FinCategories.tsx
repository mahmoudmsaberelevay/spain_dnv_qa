import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function FinCategories() {
  const utils = trpc.useUtils();
  const { data: incCats } = trpc.financial.categories.list.useQuery({ type: "income" });
  const { data: expCats } = trpc.financial.categories.list.useQuery({ type: "expense" });
  const createMut = trpc.financial.categories.create.useMutation({
    onSuccess: () => { utils.financial.categories.list.invalidate(); toast.success("Category added"); setShowCreate(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.financial.categories.update.useMutation({
    onSuccess: () => { utils.financial.categories.list.invalidate(); toast.success("Category updated"); setEditCat(null); },
    onError: (e) => toast.error(e.message),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"income" | "expense">("expense");
  const [editCat, setEditCat] = useState<any>(null);
  const [editName, setEditName] = useState("");

  function CatTable({ cats, type }: { cats: any[]; type: string }) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 font-medium">Name</th>
              <th className="text-center py-2 font-medium">Status</th>
              <th className="text-right py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cats.map(c => (
              <tr key={c.id} className="border-b border-muted/50 hover:bg-muted/30">
                <td className="py-2.5 font-medium">{c.name}</td>
                <td className="py-2.5 text-center">
                  <Badge variant={c.isActive ? "default" : "secondary"} className="text-xs">
                    {c.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="py-2.5 text-right">
                  <Button variant="ghost" size="sm" onClick={() => { setEditCat(c); setEditName(c.name); }}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Categories</h1>
        <Button onClick={() => { setNewName(""); setNewType("expense"); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Category
        </Button>
      </div>

      <Tabs defaultValue="expense">
        <TabsList>
          <TabsTrigger value="expense">Expense ({expCats?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="income">Income ({incCats?.length ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="expense">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4">
              {expCats?.length ? <CatTable cats={expCats} type="expense" /> : <p className="text-center py-8 text-muted-foreground">No expense categories</p>}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="income">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4">
              {incCats?.length ? <CatTable cats={incCats} type="income" /> : <p className="text-center py-8 text-muted-foreground">No income categories</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Category name" />
            </div>
            <div>
              <label className="text-sm font-medium">Type</label>
              <Select value={newType} onValueChange={(v: any) => setNewType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate({ name: newName, type: newType })} disabled={!newName.trim() || createMut.isPending}>
              {createMut.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editCat} onOpenChange={() => setEditCat(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Category</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCat(null)}>Cancel</Button>
            <Button onClick={() => updateMut.mutate({ id: editCat.id, name: editName })} disabled={!editName.trim() || updateMut.isPending}>
              {updateMut.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
