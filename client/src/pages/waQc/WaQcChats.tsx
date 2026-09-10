import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Search, Image, Video, Music, FileText, MapPin, Smile, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 50;

function MessageTypeIcon({ type }: { type: string }) {
  const map: Record<string, React.ReactNode> = {
    image: <Image className="h-3 w-3 text-blue-400" />,
    video: <Video className="h-3 w-3 text-purple-400" />,
    audio: <Music className="h-3 w-3 text-green-400" />,
    document: <FileText className="h-3 w-3 text-orange-400" />,
    location: <MapPin className="h-3 w-3 text-red-400" />,
    reaction: <Smile className="h-3 w-3 text-yellow-400" />,
  };
  return map[type] ? <span className="shrink-0">{map[type]}</span> : null;
}

function formatDateTime(date: Date | string | null | undefined) {
  if (!date) return "";
  return new Date(date).toLocaleString();
}

export default function WaQcChats() {
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const { data: groups } = trpc.waQc.groups.list.useQuery(undefined, { refetchInterval: 15000 });
  const { data, isLoading } = trpc.waQc.messages.list.useQuery({
    groupId: groupFilter === "all" ? undefined : groupFilter,
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }, { refetchInterval: page === 0 ? 15000 : false });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout((window as any)._waSearchTimer);
    (window as any)._waSearchTimer = setTimeout(() => {
      setDebouncedSearch(v);
      setPage(0);
    }, 400);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Chats</h1>
          <p className="text-sm text-muted-foreground">Browse all individual messages</p>
        </div>
        <Badge variant="outline" className="text-xs">{data?.total?.toLocaleString() ?? "—"} messages</Badge>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search messages..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 bg-card border-border/50"
          />
        </div>
        <Select value={groupFilter} onValueChange={(v) => { setGroupFilter(v); setPage(0); }}>
          <SelectTrigger className="w-52 bg-card border-border/50">
            <SelectValue placeholder="All Groups" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            {groups?.map((g) => (
              <SelectItem key={g.id} value={g.groupId}>{g.name || g.groupId.slice(-12)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Messages Table */}
      <Card className="border-border/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading messages...</div>
          ) : !data?.rows?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No messages found</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border/50">
                {data.rows.map((msg) => (
                  <div key={msg.id} className="flex items-start gap-3 px-4 py-3 hover:bg-accent/20 transition-colors">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-semibold text-primary">
                        {(msg.senderName || msg.senderPhone || "?").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{msg.senderName || msg.senderPhone}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{msg.groupId.slice(-12)}</Badge>
                        <span className="text-[10px] text-muted-foreground/60">{formatDateTime(msg.whatsappTimestamp ? new Date(msg.whatsappTimestamp) : msg.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MessageTypeIcon type={msg.messageType} />
                        <p className="text-sm text-muted-foreground break-words">
                          {msg.textContent || msg.caption || `[${msg.messageType}]`}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
