/**
 * AdminPrivacy — Admin page for managing deletion requests and support tickets.
 * Only accessible by admin users.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, MessageSquare, Clock, CheckCircle, XCircle, AlertTriangle, User } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  identity_verification: "bg-yellow-100 text-yellow-800",
  under_review: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  processing: "bg-purple-100 text-purple-800",
  completed: "bg-gray-100 text-gray-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-500",
  open: "bg-blue-100 text-blue-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-500",
};

export default function AdminPrivacy() {
  const [tab, setTab] = useState<"deletion" | "tickets">("deletion");
  const [selectedRequest, setSelectedRequest] = useState<number | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [newStatus, setNewStatus] = useState("");

  const { data: deletionRequests, refetch: refetchDeletions } = trpc.support.listDeletionRequests.useQuery();
  const { data: tickets, refetch: refetchTickets } = trpc.support.listTickets.useQuery();

  const updateDeletion = trpc.support.updateDeletionRequest.useMutation({
    onSuccess: () => {
      toast.success("Deletion request updated.");
      refetchDeletions();
      setSelectedRequest(null);
      setAdminNotes("");
      setNewStatus("");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateTicket = trpc.support.updateTicket.useMutation({
    onSuccess: () => {
      toast.success("Ticket updated.");
      refetchTickets();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Trash2 className="w-7 h-7 text-[#5BA3B8]" />
        <h1 className="text-2xl font-bold text-[#1A3A5C]">Privacy & Data Management</h1>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setTab("deletion")}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            tab === "deletion" ? "border-[#5BA3B8] text-[#5BA3B8]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Deletion Requests ({deletionRequests?.length || 0})
        </button>
        <button
          onClick={() => setTab("tickets")}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            tab === "tickets" ? "border-[#5BA3B8] text-[#5BA3B8]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Support Tickets ({tickets?.length || 0})
        </button>
      </div>

      {/* Deletion Requests Tab */}
      {tab === "deletion" && (
        <div className="space-y-4">
          {!deletionRequests?.length && (
            <div className="text-center py-12 text-gray-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-300" />
              <p>No deletion requests pending.</p>
            </div>
          )}
          {deletionRequests?.map((req: any) => (
            <Card key={req.id} className="border-l-4 border-l-red-300">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">{req.fullName}</span>
                      <Badge className={STATUS_COLORS[req.status] || "bg-gray-100"}>{req.status}</Badge>
                    </div>
                    <p className="text-sm text-gray-600">{req.email} {req.phone && `• ${req.phone}`}</p>
                    {req.reason && <p className="text-sm text-gray-500 mt-1">Reason: {req.reason}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      <Clock className="w-3 h-3 inline mr-1" />
                      Submitted: {new Date(req.createdAt).toLocaleDateString()} {new Date(req.createdAt).toLocaleTimeString()}
                      {req.userId && <span className="ml-2">(In-app, User ID: {req.userId})</span>}
                    </p>
                    {req.adminNotes && <p className="text-sm text-blue-600 mt-1">Admin notes: {req.adminNotes}</p>}
                  </div>
                  <div className="flex gap-2">
                    {selectedRequest === req.id ? (
                      <div className="flex flex-col gap-2 min-w-[200px]">
                        <Select value={newStatus} onValueChange={setNewStatus}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="New status..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="identity_verification">Identity Verification</SelectItem>
                            <SelectItem value="under_review">Under Review</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="processing">Processing</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <Textarea
                          value={adminNotes}
                          onChange={(e) => setAdminNotes(e.target.value)}
                          placeholder="Admin notes..."
                          rows={2}
                          className="text-xs"
                        />
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            className="text-xs h-7"
                            disabled={!newStatus || updateDeletion.isPending}
                            onClick={() => updateDeletion.mutate({
                              id: req.id,
                              status: newStatus as any,
                              adminNotes: adminNotes || undefined,
                            })}
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setSelectedRequest(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => setSelectedRequest(req.id)}>
                        Update
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Support Tickets Tab */}
      {tab === "tickets" && (
        <div className="space-y-4">
          {!tickets?.length && (
            <div className="text-center py-12 text-gray-500">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No support tickets.</p>
            </div>
          )}
          {tickets?.map((ticket: any) => (
            <Card key={ticket.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">{ticket.subject}</span>
                      <Badge className={STATUS_COLORS[ticket.status] || "bg-gray-100"}>{ticket.status}</Badge>
                      <Badge variant="outline" className="text-xs">{ticket.category}</Badge>
                    </div>
                    <p className="text-sm text-gray-600">{ticket.name} ({ticket.email})</p>
                    <p className="text-sm text-gray-500 mt-1">{ticket.description}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {new Date(ticket.createdAt).toLocaleDateString()} {new Date(ticket.createdAt).toLocaleTimeString()}
                    </p>
                    {ticket.adminNotes && <p className="text-sm text-blue-600 mt-1">Admin: {ticket.adminNotes}</p>}
                  </div>
                  <div className="flex gap-1">
                    {ticket.status === "open" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => updateTicket.mutate({ id: ticket.id, status: "in_progress" })}
                      >
                        Start
                      </Button>
                    )}
                    {(ticket.status === "open" || ticket.status === "in_progress") && (
                      <Button
                        size="sm"
                        className="text-xs bg-green-600 hover:bg-green-700"
                        onClick={() => updateTicket.mutate({ id: ticket.id, status: "resolved" })}
                      >
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
