import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function FinCommissions() {
  const utils = trpc.useUtils();
  const { data: commissions, isLoading } = trpc.financial.commissions.list.useQuery();

  const createMut = trpc.financial.commissions.create.useMutation({
    onSuccess: () => { utils.financial.commissions.list.invalidate(); toast.success("Commission recorded"); setShowCreate(false); },
    onError: (e) => toast.error(e.message),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    clientName: "", consultant: "", contractValue: "",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Commissions</h1>
        <Button onClick={() => { setForm({ clientName: "", consultant: "", contractValue: "" }); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Record Commission
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Commission Records</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !commissions?.length ? (
            <div className="text-center py-8 text-muted-foreground">No commissions recorded yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Date</th>
                    <th className="text-left py-2 font-medium">Client</th>
                    <th className="text-left py-2 font-medium">Consultant</th>
                    <th className="text-right py-2 font-medium">Contract Value</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((c) => (
                    <tr key={c.id} className="border-b border-muted/50 hover:bg-muted/30">
                      <td className="py-2">{new Date(c.createdAt).toLocaleDateString()}</td>
                      <td className="py-2 font-medium">{c.clientName}</td>
                      <td className="py-2 text-muted-foreground">{c.consultant ?? "—"}</td>
                      <td className="py-2 text-right font-semibold">{c.contractValue ? `€ ${fmt(Number(c.contractValue))}` : "—"}</td>
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
          <DialogHeader><DialogTitle>Record Commission</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Client Name *</label>
              <Input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="Client name" />
            </div>
            <div>
              <label className="text-sm font-medium">Consultant</label>
              <Input value={form.consultant} onChange={e => setForm(f => ({ ...f, consultant: e.target.value }))} placeholder="Consultant name" />
            </div>
            <div>
              <label className="text-sm font-medium">Contract Value (EUR)</label>
              <Input type="number" step="0.01" value={form.contractValue} onChange={e => setForm(f => ({ ...f, contractValue: e.target.value }))} placeholder="0.00" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!form.clientName) { toast.error("Client name is required"); return; }
              createMut.mutate({
                clientName: form.clientName,
                consultant: form.consultant || undefined,
                contractValue: form.contractValue ? Number(form.contractValue) : undefined,
              });
            }} disabled={createMut.isPending}>
              {createMut.isPending ? "Recording..." : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
