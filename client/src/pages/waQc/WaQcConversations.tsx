import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MessageSquare, Users, Search, Image, Video, Music, FileText, MapPin, Smile } from "lucide-react";

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

export default function WaQcConversations() {
  const [location] = useLocation();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Parse groupId from URL query
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gid = params.get("groupId");
    if (gid) setSelectedGroupId(gid);
  }, [location]);

  const { data: conversations, isLoading: convsLoading } = trpc.waQc.conversations.list.useQuery();
  const { data: messages, isLoading: msgsLoading } = trpc.waQc.messages.list.useQuery(
    { groupId: selectedGroupId || undefined, limit: 100, offset: 0 },
    { enabled: !!selectedGroupId }
  );

  const filteredConvs = conversations?.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedConv = conversations?.find((c) => c.id === selectedGroupId);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Conversations</h1>
        <p className="text-sm text-muted-foreground">Browse full conversation threads by group</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-220px)]">
        {/* Conversation List */}
        <Card className="border-border/50 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search groups..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm bg-card border-border/50"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convsLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">Loading...</div>
            ) : !filteredConvs?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No conversations yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {filteredConvs.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedGroupId(conv.id)}
                    className={`w-full flex items-start gap-3 px-3 py-3 hover:bg-accent/30 transition-colors text-left ${selectedGroupId === conv.id ? "bg-accent/50" : ""}`}
                  >
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      {conv.isGroup ? <Users className="h-4 w-4 text-primary" /> : <MessageSquare className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-medium text-foreground truncate">{conv.name}</span>
                        <span className="text-[10px] text-muted-foreground/60 shrink-0 ml-1">{formatTime(conv.lastMessageAt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {conv.lastSender && <span className="font-medium">{conv.lastSender}: </span>}
                        {conv.lastMessage}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Message Thread */}
        <Card className="border-border/50 lg:col-span-2 flex flex-col overflow-hidden">
          {!selectedGroupId ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Select a conversation to view messages</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border/50 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  {selectedConv?.isGroup ? <Users className="h-4 w-4 text-primary" /> : <MessageSquare className="h-4 w-4 text-primary" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{selectedConv?.name || selectedGroupId}</p>
                  <p className="text-xs text-muted-foreground">{selectedConv?.messageCount?.toLocaleString()} messages</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgsLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">Loading messages...</div>
                ) : !messages?.rows?.length ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No messages in this conversation</p>
                  </div>
                ) : (
                  [...messages.rows].reverse().map((msg) => (
                    <div key={msg.id} className="flex items-start gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[10px] font-semibold text-primary">
                          {(msg.senderName || msg.senderPhone || "?").charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-xs font-semibold text-foreground">{msg.senderName || msg.senderPhone}</span>
                          <span className="text-[10px] text-muted-foreground/60">
                            {new Date(msg.whatsappTimestamp ? msg.whatsappTimestamp : msg.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className={`inline-block max-w-full rounded-xl px-3 py-2 text-sm ${msg.messageType === "text" ? "bg-accent/40 text-foreground" : "bg-primary/10 text-foreground"}`}>
                          <div className="flex items-center gap-1.5">
                            <MessageTypeIcon type={msg.messageType} />
                            <span className="break-words">{msg.textContent || msg.caption || `[${msg.messageType}]`}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
