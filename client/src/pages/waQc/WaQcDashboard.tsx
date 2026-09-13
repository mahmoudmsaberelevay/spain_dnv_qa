import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MessageSquare, Users, Image, Bot, TrendingUp, Clock,
  Wifi, WifiOff, FileText, Music, Video, RefreshCw, AlertTriangle, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

function formatTime(date: Date | string | null | undefined) {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

function MessageTypeIcon({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = {
    image: <Image className="h-3 w-3 text-blue-400" />,
    video: <Video className="h-3 w-3 text-purple-400" />,
    audio: <Music className="h-3 w-3 text-green-400" />,
    document: <FileText className="h-3 w-3 text-orange-400" />,
  };
  return icons[type] ? <span>{icons[type]}</span> : null;
}

export default function WaQcDashboard() {
  const [, setLocation] = useLocation();
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = trpc.waQc.stats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: messages, refetch: refetchMessages } = trpc.waQc.messages.list.useQuery({ limit: 10, offset: 0 }, { refetchInterval: 30000 });
  const { data: groups, refetch: refetchGroups } = trpc.waQc.groups.list.useQuery(undefined, { refetchInterval: 30000 });
  const { data: health, isFetching: healthLoading, refetch: refetchHealth } = trpc.waQc.bridgeHealth.useQuery(undefined, { refetchInterval: 30000 });
  const { data: qr } = trpc.waQc.bridgeQrUrl.useQuery();
  const retryEnrichment = trpc.waQc.media.retryEnrichmentBacklog.useMutation({
    onSuccess: result => {
      toast.success(`Media recovery complete: ${result.processed} processed, ${result.failed} failed`);
      void refetchHealth();
    },
    onError: error => toast.error(error.message),
  });
  const state = health?.state ?? "checking";
  const statusLabel = state === "connected" ? "Bridge connected" : state === "connected_stale" ? "Connected, no recent chats" : state === "disconnected" ? "Bridge disconnected" : state === "unreachable" ? "Bridge unreachable" : "Checking bridge";
  const statusColor = state === "connected" ? "text-green-500" : state === "connected_stale" ? "text-amber-500" : "text-red-500";
  const refreshAll = () => { void Promise.all([refetchStats(), refetchMessages(), refetchGroups(), refetchHealth()]); };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-green-500" />
            WhatsApp Quality Control
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor and analyze ELEVAY WhatsApp group communications</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${statusColor}`}>
            {state === "connected" ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            <span>{statusLabel}</span>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={refreshAll} disabled={healthLoading}><RefreshCw className={`h-3.5 w-3.5 ${healthLoading ? "animate-spin" : ""}`} />Refresh</Button>
        </div>
      </div>

      <Card className={`border ${state === "connected" ? "border-green-500/30" : state === "connected_stale" ? "border-amber-500/30" : "border-red-500/30"}`}>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:justify-between">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 ${statusColor}`}>{state === "connected" ? <Wifi className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}</div>
              <div>
                <p className="font-semibold text-foreground">{statusLabel}</p>
                <p className="text-xs text-muted-foreground mt-1">Last inbound: {formatTime(health?.lastInboundAt)} · Last outbound: {formatTime(health?.lastOutboundAt)} · Checked every 30 seconds</p>
                {health?.bridge.usesLegacySecret && <p className="text-xs text-amber-600 mt-1">Bridge connected. Credential rotation remains a recommended maintenance task.</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div><p className="text-lg font-bold text-foreground">{health?.last24Hours?.accepted ?? 0}</p><p className="text-[10px] text-muted-foreground">Accepted 24h</p></div>
              <div><p className="text-lg font-bold text-foreground">{health?.last24Hours?.duplicates ?? 0}</p><p className="text-[10px] text-muted-foreground">Duplicates 24h</p></div>
              <div><p className="text-lg font-bold text-foreground">{health?.last24Hours?.failed ?? 0}</p><p className="text-[10px] text-muted-foreground">Failed 24h</p></div>
              <div><p className="text-lg font-bold text-foreground">{(health?.media?.pending ?? 0) + (health?.media?.failed ?? 0)}</p><p className="text-[10px] text-muted-foreground">Media backlog</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              {((health?.media?.audioWithoutTranscript ?? 0) + (health?.media?.documentsWithoutText ?? 0)) > 0 && <Button variant="outline" className="gap-2" disabled={retryEnrichment.isPending} onClick={() => retryEnrichment.mutate({ limit: 10 })}><RefreshCw className={`h-4 w-4 ${retryEnrichment.isPending ? "animate-spin" : ""}`} />Retry media processing</Button>}
              {state !== "connected" && qr?.qrUrl && <Button variant="outline" className="gap-2" onClick={() => window.open(qr.qrUrl, "_blank", "noopener,noreferrer")}><ExternalLink className="h-4 w-4" />Open QR login</Button>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Messages", value: stats?.total ?? 0, icon: MessageSquare, color: "text-green-400", bg: "bg-green-400/10" },
          { label: "Today", value: stats?.today ?? 0, icon: TrendingUp, color: "text-blue-400", bg: "bg-blue-400/10" },
          { label: "Active Groups", value: stats?.groups ?? 0, icon: Users, color: "text-purple-400", bg: "bg-purple-400/10" },
          { label: "Media Files", value: stats?.media ?? 0, icon: Image, color: "text-orange-400", bg: "bg-orange-400/10" },
        ].map((s) => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {statsLoading ? "—" : s.value.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Messages + Groups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Messages */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Recent Messages</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7" onClick={() => setLocation("/wa-qc/chats")}>
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!messages?.rows?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No messages yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Messages will appear once the webhook receives data</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {messages.rows.slice(0, 8).map((msg) => (
                  <div key={msg.id} className="flex items-start gap-3 px-4 py-3 hover:bg-accent/30 transition-colors">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] font-semibold text-primary">
                        {(msg.senderName || msg.senderPhone || "?").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-medium text-foreground truncate">
                          {msg.senderName || msg.senderPhone}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0 border-border/50">
                          {msg.groupId.slice(-8)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MessageTypeIcon type={msg.messageType} />
                        <p className="text-xs text-muted-foreground truncate">
                          {msg.textContent || msg.caption || `[${msg.messageType}]`}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0 mt-0.5">
                      {formatTime(msg.whatsappTimestamp ? new Date(msg.whatsappTimestamp) : msg.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Groups */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Active Groups</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7" onClick={() => setLocation("/wa-qc/groups")}>
                Manage
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!groups?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No groups yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Groups appear automatically when messages arrive</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {groups.slice(0, 8).map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors cursor-pointer"
                    onClick={() => setLocation(`/wa-qc/conversations?groupId=${encodeURIComponent(group.groupId)}`)}
                  >
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{group.name || group.groupId.slice(-12)}</p>
                      <p className="text-xs text-muted-foreground">{group.messageCount.toLocaleString()} messages</p>
                    </div>
                    <div className={`h-2 w-2 rounded-full shrink-0 ${group.isActive ? "bg-green-400" : "bg-muted-foreground/30"}`} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Browse Conversations", icon: MessageSquare, path: "/wa-qc/conversations", color: "text-green-400" },
          { label: "Ask AI", icon: Bot, path: "/wa-qc/ai-query", color: "text-yellow-400" },
          { label: "View Media", icon: Image, path: "/wa-qc/media", color: "text-purple-400" },
          { label: "Configure API", icon: Users, path: "/wa-qc/settings", color: "text-blue-400" },
        ].map((action) => (
          <button
            key={action.path}
            onClick={() => setLocation(action.path)}
            className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card hover:bg-accent/30 transition-colors text-left"
          >
            <action.icon className={`h-4 w-4 ${action.color} shrink-0`} />
            <span className="text-sm font-medium text-foreground">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
