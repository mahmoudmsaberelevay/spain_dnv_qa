/**
 * BroadcastCenter — admin-only page for sending and managing global broadcasts.
 *
 * - Admin can compose and send a broadcast message
 * - Table of all past broadcasts with active/inactive status
 * - Admin can deactivate any broadcast
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Megaphone,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLocation } from "wouter";

function formatDateTime(date: Date | string | null) {
  if (!date) return "";
  return new Date(date).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BroadcastCenter() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [content, setContent] = useState("");

  const utils = trpc.useUtils();
  const { data: broadcasts, isLoading } = trpc.broadcast.listAll.useQuery();

  const createBroadcast = trpc.broadcast.create.useMutation({
    onSuccess: () => {
      setContent("");
      toast.success("Broadcast sent to all team members");
      utils.broadcast.listAll.invalidate();
      utils.broadcast.listActive.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deactivate = trpc.broadcast.deactivate.useMutation({
    onSuccess: () => {
      toast.success("Broadcast deactivated");
      utils.broadcast.listAll.invalidate();
      utils.broadcast.listActive.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Guard: redirect non-admins
  if (user && user.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="h-12 w-12 text-amber-500" />
        <h2 className="text-xl font-bold text-foreground">Access Restricted</h2>
        <p className="text-muted-foreground text-sm">Only administrators can access the Broadcast Center.</p>
        <Button variant="outline" onClick={() => setLocation("/")}>Go Home</Button>
      </div>
    );
  }

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    createBroadcast.mutate({ content: trimmed });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-amber-500" />
          Broadcast Center
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Send global announcements to all team members
        </p>
      </div>

      {/* Compose area */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <Send className="h-4 w-4 text-amber-500" />
          Compose Broadcast
        </h2>
        <div className="space-y-3">
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Type your broadcast message here... All team members will see this as a pinned banner."
            className="min-h-[120px] resize-none text-sm"
            maxLength={2000}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{content.length}/2000 characters</span>
            <Button
              onClick={handleSend}
              disabled={!content.trim() || createBroadcast.isPending}
              className="bg-amber-500 hover:bg-amber-400 text-white font-semibold"
            >
              {createBroadcast.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
              ) : (
                <><Megaphone className="h-4 w-4 mr-2" />Send Broadcast</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Broadcast history */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Broadcast History</h2>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !broadcasts || broadcasts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <Megaphone className="h-10 w-10 opacity-30" />
            <p className="text-sm">No broadcasts sent yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {broadcasts.map((b) => (
              <div key={b.id} className="flex items-start gap-4 px-6 py-4">
                <div className={cn(
                  "mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                  b.isActive ? "bg-amber-500/10" : "bg-muted"
                )}>
                  {b.isActive
                    ? <Megaphone className="h-4 w-4 text-amber-500" />
                    : <XCircle className="h-4 w-4 text-muted-foreground" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={cn(
                      "text-xs",
                      b.isActive
                        ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                        : "bg-muted text-muted-foreground border-border"
                    )}>
                      {b.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDateTime(b.createdAt)}</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{b.content}</p>
                </div>
                {b.isActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deactivate.mutate({ broadcastId: b.id })}
                    disabled={deactivate.isPending}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Deactivate
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
