import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  MessageSquare, Users, Search, Image, Video, Music, FileText, MapPin,
  Smile, Send, Bot, Sparkles, X, ChevronDown, Download, Loader2,
  Phone, RefreshCw,
} from "lucide-react";
import { Streamdown } from "streamdown";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function MessageTypeIcon({ type }: { type: string }) {
  const map: Record<string, React.ReactNode> = {
    image: <Image className="h-3.5 w-3.5 text-blue-400" />,
    video: <Video className="h-3.5 w-3.5 text-purple-400" />,
    audio: <Music className="h-3.5 w-3.5 text-green-400" />,
    document: <FileText className="h-3.5 w-3.5 text-orange-400" />,
    location: <MapPin className="h-3.5 w-3.5 text-red-400" />,
    reaction: <Smile className="h-3.5 w-3.5 text-yellow-400" />,
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

function formatMsgTime(ts: number | null | undefined, fallback: Date | string) {
  const d = ts ? new Date(ts) : new Date(fallback);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Outgoing messages are detected via the fromMe field set by the Baileys bridge

// ─── Media Bubble ─────────────────────────────────────────────────────────────
function MediaBubble({ msg }: { msg: any }) {
  if (msg.messageType === "image" && msg.mediaId) {
    return (
      <div className="rounded-lg overflow-hidden max-w-[240px]">
        <div className="bg-accent/30 flex items-center justify-center h-32 rounded-lg">
          <Image className="h-8 w-8 text-muted-foreground/50" />
        </div>
        {msg.caption && <p className="text-xs mt-1 text-muted-foreground">{msg.caption}</p>}
      </div>
    );
  }
  if (msg.messageType === "video" && msg.mediaId) {
    return (
      <div className="flex items-center gap-2 bg-accent/30 rounded-lg px-3 py-2">
        <Video className="h-5 w-5 text-purple-400 shrink-0" />
        <span className="text-sm">{msg.caption || "Video"}</span>
      </div>
    );
  }
  if (msg.messageType === "audio" && msg.mediaId) {
    return (
      <div className="flex items-center gap-2 bg-accent/30 rounded-lg px-3 py-2">
        <Music className="h-5 w-5 text-green-400 shrink-0" />
        <span className="text-sm">Voice / Audio</span>
      </div>
    );
  }
  if (msg.messageType === "document" && msg.mediaId) {
    return (
      <div className="flex items-center gap-2 bg-accent/30 rounded-lg px-3 py-2">
        <FileText className="h-5 w-5 text-orange-400 shrink-0" />
        <span className="text-sm">{msg.fileName || msg.caption || "Document"}</span>
      </div>
    );
  }
  if (msg.messageType === "location") {
    return (
      <div className="flex items-center gap-2 bg-accent/30 rounded-lg px-3 py-2">
        <MapPin className="h-5 w-5 text-red-400 shrink-0" />
        <span className="text-sm">{msg.locationName || `${msg.latitude}, ${msg.longitude}`}</span>
      </div>
    );
  }
  if (msg.messageType === "reaction") {
    return <span className="text-2xl">{msg.reactionEmoji}</span>;
  }
  return (
    <span className="text-sm break-words whitespace-pre-wrap">
      {msg.textContent || msg.caption || `[${msg.messageType}]`}
    </span>
  );
}

// ─── AI Panel ─────────────────────────────────────────────────────────────────
function AiPanel({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Array<{ q: string; a: string }>>([]);
  const askMutation = trpc.waQc.aiQuery.ask.useMutation({
    onSuccess: (data) => {
      const answer = typeof data.answer === "string" ? data.answer : String(data.answer);
      setHistory(prev => [...prev, { q: question, a: answer }]);
      setQuestion("");
    },
    onError: (err) => {
      toast({ title: "AI Error", description: err.message, variant: "destructive" });
    },
  });

  const suggestions = [
    "Summarize this conversation",
    "What documents were requested?",
    "Any urgent issues mentioned?",
    "What did the client ask about?",
  ];

  const handleAsk = (q?: string) => {
    const text = q || question;
    if (!text.trim() || askMutation.isPending) return;
    setQuestion(text);
    askMutation.mutate({ question: text, groupId });
  };

  return (
    <div className="flex flex-col h-full border-l border-border/50 bg-card/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-yellow-400" />
          <span className="text-sm font-semibold text-foreground">AI Assistant</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Suggestions */}
      {history.length === 0 && (
        <div className="p-3 space-y-1.5">
          <p className="text-[11px] text-muted-foreground mb-2">Ask about this conversation:</p>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleAsk(s)}
              className="w-full text-left text-xs px-3 py-2 rounded-lg bg-accent/30 hover:bg-accent/60 text-foreground transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* History */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {history.map((item, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-end">
              <div className="bg-primary/20 rounded-xl px-3 py-2 max-w-[90%]">
                <p className="text-xs text-foreground">{item.q}</p>
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bg-accent/30 rounded-xl px-3 py-2 max-w-[90%]">
                <div className="text-xs text-foreground prose prose-sm prose-invert max-w-none">
                  <Streamdown>{item.a}</Streamdown>
                </div>
              </div>
            </div>
          </div>
        ))}
        {askMutation.isPending && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            Analyzing conversation...
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border/50">
        <div className="flex gap-2">
          <Input
            placeholder="Ask about this chat..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAsk()}
            className="text-xs h-8 bg-background border-border/50"
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => handleAsk()}
            disabled={!question.trim() || askMutation.isPending}
          >
            {askMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WaQcConversations() {
  const [location] = useLocation();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [convSearch, setConvSearch] = useState("");
  const [msgSearch, setMsgSearch] = useState("");
  const [debouncedMsgSearch, setDebouncedMsgSearch] = useState("");
  const [replyText, setReplyText] = useState("");
  const [showAi, setShowAi] = useState(false);
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [msgOffset, setMsgOffset] = useState(0);
  const [allMessages, setAllMessages] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [autoRefreshCountdown, setAutoRefreshCountdown] = useState(7200);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MSG_PAGE_SIZE = 50;
  const AUTO_REFRESH_INTERVAL = 7200; // 2 hours in seconds

  // Parse groupId from URL query
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gid = params.get("groupId");
    if (gid) setSelectedGroupId(gid);
  }, [location]);

  // Reset pagination when conversation changes
  useEffect(() => {
    setMsgOffset(0);
    setAllMessages([]);
    setHasMore(false);
  }, [selectedGroupId, debouncedMsgSearch]);

  // Scroll to bottom on first load of a conversation
  useEffect(() => {
    if (msgOffset === 0 && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedGroupId]);

  const { data: conversations, isLoading: convsLoading, refetch: refetchConvs } = trpc.waQc.conversations.list.useQuery(
    undefined,
    { refetchInterval: AUTO_REFRESH_INTERVAL * 1000 }
  );

  const { data: messages, isLoading: msgsLoading, refetch: refetchMsgs } = trpc.waQc.messages.listForConversation.useQuery(
    { groupId: selectedGroupId || "", search: debouncedMsgSearch || undefined, limit: MSG_PAGE_SIZE, offset: msgOffset },
    {
      enabled: !!selectedGroupId,
      refetchInterval: msgOffset === 0 ? AUTO_REFRESH_INTERVAL * 1000 : false,
    }
  );

  // Auto-refresh countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setAutoRefreshCountdown(prev => {
        if (prev <= 1) {
          setLastRefreshed(new Date());
          return AUTO_REFRESH_INTERVAL; // reset to 2 hours
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Manual refresh handler
  const handleManualRefresh = useCallback(() => {
    refetchConvs();
    if (selectedGroupId) refetchMsgs();
    setLastRefreshed(new Date());
    setAutoRefreshCountdown(AUTO_REFRESH_INTERVAL);
  }, [refetchConvs, refetchMsgs, selectedGroupId]);

  // Accumulate messages as pages load
  useEffect(() => {
    if (!messages) return;
    if (msgOffset === 0) {
      setAllMessages(messages.rows ?? []);
    } else {
      setAllMessages(prev => {
        const existingIds = new Set(prev.map((m: any) => m.id));
        const newMsgs = (messages.rows ?? []).filter((m: any) => !existingIds.has(m.id));
        return [...newMsgs, ...prev];
      });
    }
    setHasMore((messages.rows?.length ?? 0) === MSG_PAGE_SIZE);
  }, [messages, msgOffset]);

  const sendReplyMutation = trpc.waQc.sendReply.useMutation({
    onSuccess: () => {
      setReplyText("");
      toast({ title: "Message sent", description: "Your reply was sent successfully." });
      setTimeout(() => refetchMsgs(), 1500);
    },
    onError: (err) => {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    },
  });

  const filteredConvs = conversations?.filter((c) =>
    !convSearch || c.name.toLowerCase().includes(convSearch.toLowerCase())
  );

  const selectedConv = conversations?.find((c) => c.id === selectedGroupId);

  // The "to phone" is the groupId itself (which is the sender's phone number for 1:1 chats)
  const toPhone = selectedGroupId || "";

  const handleSendReply = () => {
    if (!replyText.trim() || !toPhone) return;
    sendReplyMutation.mutate({ toPhone, message: replyText.trim() });
  };

  const handleMsgSearchChange = useCallback((v: string) => {
    setMsgSearch(v);
    if (msgSearchTimer.current) clearTimeout(msgSearchTimer.current);
    msgSearchTimer.current = setTimeout(() => setDebouncedMsgSearch(v), 400);
  }, []);

  const sortedMessages = [...allMessages].sort((a, b) => {
    const ta = a.whatsappTimestamp ?? new Date(a.createdAt).getTime();
    const tb = b.whatsappTimestamp ?? new Date(b.createdAt).getTime();
    return ta - tb;
  });

  return (
    <div className="p-4 space-y-3 h-[calc(100vh-64px)] flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground">Conversations</h1>
          <p className="text-sm text-muted-foreground">Browse, reply, and analyze WhatsApp conversations</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchConvs()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        {/* ── Conversation List ── */}
        <Card className="border-border/50 flex flex-col w-72 shrink-0 overflow-hidden">
          <div className="p-3 border-b border-border/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={convSearch}
                onChange={(e) => setConvSearch(e.target.value)}
                className="pl-8 h-8 text-sm bg-card border-border/50"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convsLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...
              </div>
            ) : !filteredConvs?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No conversations yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Messages will appear here once received</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {filteredConvs.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => { setSelectedGroupId(conv.id); setShowAi(false); setMsgSearch(""); setDebouncedMsgSearch(""); }}
                    className={`w-full flex items-start gap-3 px-3 py-3 hover:bg-accent/30 transition-colors text-left ${selectedGroupId === conv.id ? "bg-accent/50 border-l-2 border-primary" : ""}`}
                  >
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      {conv.isGroup ? <Users className="h-4 w-4 text-primary" /> : (
                        <span className="text-sm font-bold text-primary">
                          {(conv.name || "?").charAt(0).toUpperCase()}
                        </span>
                      )}
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
                      <div className="flex items-center gap-1 mt-0.5">
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                          {conv.messageCount} msgs
                        </Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* ── Chat View ── */}
        <div className="flex-1 min-w-0 flex gap-3">
          <Card className="border-border/50 flex flex-col flex-1 min-w-0 overflow-hidden">
            {!selectedGroupId ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <MessageSquare className="h-14 w-14 text-muted-foreground/20 mb-4" />
                <p className="text-base font-medium text-muted-foreground">Select a conversation</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Choose a chat from the left to view messages</p>
              </div>
            ) : (
              <>
                {/* Chat Header */}
                <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                      {selectedConv?.isGroup ? <Users className="h-4 w-4 text-primary" /> : (
                        <span className="text-sm font-bold text-primary">
                          {(selectedConv?.name || "?").charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{selectedConv?.name || selectedGroupId}</p>
                      <div className="flex items-center gap-2">
                        <Phone className="h-3 w-3 text-muted-foreground/60" />
                        <p className="text-xs text-muted-foreground">{selectedGroupId}</p>
                        <span className="text-muted-foreground/40">·</span>
                        <p className="text-xs text-muted-foreground">{selectedConv?.messageCount?.toLocaleString()} messages</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={showMsgSearch ? "secondary" : "ghost"}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => { setShowMsgSearch(!showMsgSearch); if (showMsgSearch) { setMsgSearch(""); setDebouncedMsgSearch(""); } }}
                      title="Search in chat"
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={showAi ? "secondary" : "ghost"}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setShowAi(!showAi)}
                      title="AI Assistant"
                    >
                      <Bot className="h-4 w-4 text-yellow-400" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => refetchMsgs()}
                      title="Refresh messages"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* In-chat search bar */}
                {showMsgSearch && (
                  <div className="px-4 py-2 border-b border-border/50 bg-accent/10">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search messages in this chat..."
                        value={msgSearch}
                        onChange={(e) => handleMsgSearchChange(e.target.value)}
                        className="pl-8 h-8 text-sm bg-background border-border/50"
                        autoFocus
                      />
                      {msgSearch && (
                        <button
                          onClick={() => { setMsgSearch(""); setDebouncedMsgSearch(""); }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {debouncedMsgSearch && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {messages?.total ?? 0} result(s) for "{debouncedMsgSearch}"
                      </p>
                    )}
                  </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {/* Load More button at top */}
                  {hasMore && !msgsLoading && (
                    <div className="flex justify-center pb-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1.5"
                        onClick={() => setMsgOffset(prev => prev + MSG_PAGE_SIZE)}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                        Load older messages
                      </Button>
                    </div>
                  )}
                  {msgsLoading && msgOffset > 0 && (
                    <div className="flex justify-center pb-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {msgsLoading && msgOffset === 0 ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading messages...
                    </div>
                  ) : !sortedMessages.length ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {debouncedMsgSearch ? `No messages matching "${debouncedMsgSearch}"` : "No messages in this conversation"}
                      </p>
                    </div>
                  ) : (
                    <>
                      {sortedMessages.map((msg, idx) => {
                        // Determine if this is an outgoing message (sent by us)
                        const isOutgoing = msg.fromMe === true || msg.fromMe === 1;
                        const showSender = !isOutgoing && (idx === 0 || sortedMessages[idx - 1]?.senderId !== msg.senderId);

                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isOutgoing ? "justify-end" : "justify-start"} items-end gap-2`}
                          >
                            {/* Avatar for incoming */}
                            {!isOutgoing && (
                              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mb-0.5">
                                <span className="text-[10px] font-bold text-primary">
                                  {(msg.senderName || msg.senderPhone || "?").charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}

                            <div className={`max-w-[70%] ${isOutgoing ? "items-end" : "items-start"} flex flex-col`}>
                              {showSender && (
                                <span className="text-[11px] font-semibold text-primary/80 mb-0.5 px-1">
                                  {msg.senderName || msg.senderPhone}
                                </span>
                              )}
                              <div
                                className={`rounded-2xl px-3 py-2 text-sm ${
                                  isOutgoing
                                    ? "bg-primary text-primary-foreground rounded-br-sm"
                                    : "bg-accent/50 text-foreground rounded-bl-sm"
                                }`}
                              >
                                <MediaBubble msg={msg} />
                              </div>
                              <span className={`text-[10px] text-muted-foreground/60 mt-0.5 px-1 ${isOutgoing ? "text-right" : "text-left"}`}>
                                {formatMsgTime(msg.whatsappTimestamp, msg.createdAt)}
                              </span>
                            </div>

                            {/* Avatar placeholder for outgoing alignment */}
                            {isOutgoing && <div className="w-7 shrink-0" />}
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>

                {/* Reply Box */}
                <div className="px-4 py-3 border-t border-border/50 shrink-0">
                  <div className="flex gap-2 items-end">
                    <Textarea
                      placeholder="Type a reply..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                      className="resize-none min-h-[40px] max-h-[120px] text-sm bg-background border-border/50"
                      rows={1}
                    />
                    <Button
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      onClick={handleSendReply}
                      disabled={!replyText.trim() || sendReplyMutation.isPending}
                      title="Send reply (Enter)"
                    >
                      {sendReplyMutation.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground/50 mt-1">Press Enter to send · Shift+Enter for new line</p>
                </div>
              </>
            )}
          </Card>

          {/* ── AI Panel ── */}
          {showAi && selectedGroupId && (
            <Card className="border-border/50 w-72 shrink-0 overflow-hidden flex flex-col">
              <AiPanel groupId={selectedGroupId} onClose={() => setShowAi(false)} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
