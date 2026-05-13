import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Search, MessageSquare, TrendingUp, Clock } from "lucide-react";
import { useLocation } from "wouter";

function formatTime(date: Date | string | null | undefined) {
  if (!date) return "Never";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

export default function WaQcGroups() {
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();
  const { data: groups, isLoading } = trpc.waQc.groups.list.useQuery();

  const filtered = groups?.filter((g) =>
    !search || (g.name || g.groupId).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Groups</h1>
          <p className="text-sm text-muted-foreground">Manage monitored WhatsApp groups</p>
        </div>
        <Badge variant="outline" className="text-xs">{groups?.length ?? "—"} groups</Badge>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search groups..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-card border-border/50"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading groups...</div>
      ) : !filtered?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No groups found</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Groups appear automatically when the webhook receives messages</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((group) => (
            <Card key={group.id} className="border-border/50 hover:border-primary/30 transition-colors cursor-pointer"
              onClick={() => setLocation(`/wa-qc/conversations?groupId=${encodeURIComponent(group.groupId)}`)}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{group.name || "Unnamed Group"}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{group.groupId}</p>
                  </div>
                  <div className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${group.isActive ? "bg-green-400" : "bg-muted-foreground/30"}`} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-accent/20 rounded-lg p-2">
                    <p className="text-base font-bold text-foreground">{group.messageCount.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">Messages</p>
                  </div>
                  <div className="bg-accent/20 rounded-lg p-2">
                    <p className="text-base font-bold text-foreground">—</p>
                    <p className="text-[10px] text-muted-foreground">Members</p>
                  </div>
                  <div className="bg-accent/20 rounded-lg p-2">
                    <p className="text-[10px] font-medium text-foreground">{formatTime(group.lastMessageAt)}</p>
                    <p className="text-[10px] text-muted-foreground">Last msg</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3 h-7 text-xs"
                  onClick={(e) => { e.stopPropagation(); setLocation(`/wa-qc/conversations?groupId=${encodeURIComponent(group.groupId)}`); }}
                >
                  <MessageSquare className="h-3 w-3 mr-1.5" />
                  View Conversations
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
