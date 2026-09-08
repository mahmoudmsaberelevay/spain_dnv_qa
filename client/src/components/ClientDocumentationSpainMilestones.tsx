import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CalendarDays, CheckCircle2, Circle, ExternalLink, Plane, ScanFace, University, Languages, CreditCard } from "lucide-react";
import { toast } from "sonner";

type Milestone = "translator_submitted" | "travel_booked" | "arrival_confirmed" | "biometrics_appointment" | "biometrics_completed" | "bank_account_completed" | "residency_card_ready";

function cairoDateKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const MILESTONES: Array<{ key: Milestone; label: string; field: string; icon: typeof CalendarDays }> = [
  { key: "translator_submitted", label: "Submitted to Spanish Sworn Translator", field: "translationDate", icon: Languages },
  { key: "travel_booked", label: "Travel to Spain", field: "travelDate", icon: Plane },
  { key: "arrival_confirmed", label: "Arrival Confirmed", field: "arrivalConfirmedDate", icon: CheckCircle2 },
  { key: "biometrics_appointment", label: "Biometrics Appointment", field: "biometricsAppointmentDate", icon: CalendarDays },
  { key: "biometrics_completed", label: "Biometrics Completed", field: "biometricsDate", icon: ScanFace },
  { key: "bank_account_completed", label: "Bank Account Completed", field: "bankAccountCompletedDate", icon: University },
  { key: "residency_card_ready", label: "Residency Card Ready for Collection", field: "residencyCardReadyDate", icon: CreditCard },
];

export function ClientDocumentationSpainMilestones({ clientCaseId, clientCase }: { clientCaseId: number; clientCase: any }) {
  const utils = trpc.useUtils();
  const [active, setActive] = useState<Milestone | null>(null);
  const [date, setDate] = useState(cairoDateKey());
  const [ticketLink, setTicketLink] = useState(clientCase.ticketLink ?? "");
  const [hotelLink, setHotelLink] = useState(clientCase.hotelLink ?? "");
  const mutation = trpc.clientDocs.recordSpainMilestone.useMutation({
    onSuccess: async () => {
      toast.success("Spain milestone saved");
      setActive(null);
      await Promise.all([utils.clientDocs.get.invalidate({ id: clientCaseId }), utils.clientDocs.report.invalidate({ id: clientCaseId }), utils.clientDocs.dashboard.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });

  const open = (milestone: Milestone) => {
    const definition = MILESTONES.find(item => item.key === milestone);
    const current = definition ? clientCase[definition.field] : null;
    setDate(current ? (typeof current === "string" ? current.slice(0, 10) : new Date(current).toISOString().slice(0, 10)) : cairoDateKey());
    setTicketLink(clientCase.ticketLink ?? "");
    setHotelLink(clientCase.hotelLink ?? "");
    setActive(milestone);
  };

  return (
    <section className="rounded-xl border border-[#5ba3b8]/25 bg-gradient-to-br from-[#f6fbfc] to-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[#1e3a5f]">Spain Application Milestones</h2>
          <p className="text-xs text-gray-500">Travel, translator, biometrics, bank account, and residency-card progress.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {clientCase.submissionReceiptLink ? <a href={clientCase.submissionReceiptLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700"><ExternalLink className="h-3 w-3" />Submission receipt</a> : null}
          {clientCase.approvalLetterLink ? <a href={clientCase.approvalLetterLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700"><ExternalLink className="h-3 w-3" />Approval letter</a> : null}
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {MILESTONES.map(item => {
          const value = clientCase[item.field];
          const Icon = item.icon;
          return (
            <button key={item.key} type="button" onClick={() => open(item.key)} className={`flex min-h-[78px] items-start gap-3 rounded-lg border p-3 text-left transition-colors ${value ? "border-emerald-200 bg-emerald-50/70" : "border-gray-200 bg-white hover:border-[#5ba3b8]"}`}>
              <span className={`rounded-md p-2 ${value ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-800">{item.label}</span>
                <span className="mt-1 block text-xs text-gray-500">{value ? new Date(value).toLocaleDateString() : "Not recorded"}</span>
                {item.key === "travel_booked" && value ? <span className="mt-1 flex gap-2 text-[11px] text-[#1e7184]">{clientCase.ticketLink ? "Ticket linked" : ""}{clientCase.hotelLink ? "Hotel linked" : ""}</span> : null}
              </span>
              {value ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-gray-300" />}
            </button>
          );
        })}
      </div>

      <Dialog open={active !== null} onOpenChange={openState => !openState && setActive(null)}>
        <DialogContent className="bg-white text-gray-900 sm:max-w-lg">
          <DialogHeader><DialogTitle>{MILESTONES.find(item => item.key === active)?.label ?? "Spain Milestone"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input type="date" value={date} onChange={event => setDate(event.target.value)} />
            {active === "travel_booked" ? <>
              <Input type="url" placeholder="Ticket Drive link" value={ticketLink} onChange={event => setTicketLink(event.target.value)} />
              <Input type="url" placeholder="Hotel Drive link" value={hotelLink} onChange={event => setHotelLink(event.target.value)} />
            </> : null}
            <Button disabled={!active || !date || (active === "travel_booked" && (!ticketLink.trim() || !hotelLink.trim())) || mutation.isPending} onClick={() => active && mutation.mutate({ clientCaseId, milestone: active, date, ticketLink: active === "travel_booked" ? ticketLink.trim() : null, hotelLink: active === "travel_booked" ? hotelLink.trim() : null })} className="w-full bg-[#1e3a5f] text-white hover:bg-[#16304f]">{mutation.isPending ? "Saving..." : "Confirm Milestone"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
