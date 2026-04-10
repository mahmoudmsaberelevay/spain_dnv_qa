/**
 * TeamChat — private peer-to-peer messaging page for Elevay team members.
 *
 * Features:
 * - Conversation list (left panel) with last message preview + unread count
 * - Chat window (right panel) with message bubbles (sent right / received left)
 * - Search for team members to start a new conversation
 * - Real-time polling every 3 seconds
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Search,
  Send,
  X,
  Plus,
  ArrowLeft,
  Check,
  CheckCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(date: Date | string | null) {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// ─── New Conversation Dialog ──────────────────────────────────────────────────
function NewConversationPanel({
  onSelect,
  onClose,
}: {
  onSelect: (userId: number, userName: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const { data: members } = trpc.chat.listTeamMembers.useQuery();

  const filtered = (members ?? []).filter(m =>
    m.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <h3 className="font-semibold text-white text-sm">New Conversation</h3>
        <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-3 border-b border-white/10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search team members..."
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/20"
            autoFocus
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-white/30">
            <Search className="h-6 w-6" />
            <p className="text-sm">No team members found</p>
          </div>
        ) : (
          filtered.map(member => (
            <button
              key={member.id}
              onClick={() => onSelect(member.id, member.name ?? "Unknown")}
              className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/5 transition-colors text-left"
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-violet-500 text-white text-xs font-bold">
                  {getInitials(member.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{member.name}</p>
                <p className="text-xs text-white/40 truncate">{member.email}</p>
              </div>
              {member.role === "admin" && (
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs shrink-0">Admin</Badge>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Chat Window ──────────────────────────────────────────────────────────────
function ChatWindow({
  peerId,
  peerName,
  currentUserId,
  onBack,
}: {
  peerId: number;
  peerName: string;
  currentUserId: number;
  onBack: () => void;
}) {
  const [message, setMessage] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const { data: messages, isLoading } = trpc.chat.getMessages.useQuery(
    { otherUserId: peerId },
    { refetchInterval: 3000 }
  );

  const markRead = trpc.chat.markRead.useMutation({
    onSuccess: () => utils.chat.getUnreadCount.invalidate(),
  });

  const sendMessage = trpc.chat.sendMessage.useMutation({
    onSuccess: () => {
      setMessage("");
      utils.chat.getMessages.invalidate({ otherUserId: peerId });
      utils.chat.listConversations.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Mark messages as read when window opens
  useEffect(() => {
    markRead.mutate({ senderId: peerId });
  }, [peerId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    sendMessage.mutate({ receiverId: peerId, content: trimmed });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <button
          onClick={onBack}
          className="text-white/40 hover:text-white transition-colors md:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-violet-500 text-white text-xs font-bold">
            {getInitials(peerName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{peerName}</p>
          <p className="text-xs text-emerald-400">Online</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="h-6 w-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        ) : messages?.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-white/30">
            <MessageSquare className="h-10 w-10" />
            <p className="text-sm">No messages yet</p>
            <p className="text-xs">Send a message to start the conversation</p>
          </div>
        ) : (
          messages?.map((msg) => {
            const isMine = msg.senderId === currentUserId;
            return (
              <div
                key={msg.id}
                className={cn("flex", isMine ? "justify-end" : "justify-start")}
              >
                <div className={cn("max-w-[75%] flex flex-col gap-1", isMine ? "items-end" : "items-start")}>
                  <div className={cn(
                    "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                    isMine
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-white/10 text-white rounded-bl-sm"
                  )}>
                    {msg.content}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-white/30">
                    <span>{formatTime(msg.createdAt)}</span>
                    {isMine && (
                      msg.readAt
                        ? <CheckCheck className="h-3 w-3 text-blue-400" />
                        : <Check className="h-3 w-3" />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-end gap-2">
          <Input
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${peerName}...`}
            className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/20 resize-none"
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || sendMessage.isPending}
            size="icon"
            className="bg-blue-600 hover:bg-blue-500 text-white shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TeamChat() {
  const { user } = useAuth();
  const [selectedPeer, setSelectedPeer] = useState<{ id: number; name: string } | null>(null);
  const [showNewConv, setShowNewConv] = useState(false);
  const [search, setSearch] = useState("");

  const { data: conversations, isLoading } = trpc.chat.listConversations.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const filtered = (conversations ?? []).filter(c =>
    c.peerName?.toLowerCase().includes(search.toLowerCase())
  );

  const totalUnread = (conversations ?? []).reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);

  const handleSelectPeer = (id: number, name: string) => {
    setSelectedPeer({ id, name });
    setShowNewConv(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-blue-500" />
            Team Chat
            {totalUnread > 0 && (
              <Badge className="bg-blue-500 text-white text-xs ml-1">{totalUnread}</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Private messages with your team</p>
        </div>
      </div>

      {/* Chat layout */}
      <div className="flex-1 flex gap-0 rounded-2xl border border-border overflow-hidden bg-gray-950 min-h-[600px]">
        {/* Left: Conversation list */}
        <div className={cn(
          "flex flex-col border-r border-white/10",
          "w-72 shrink-0",
          selectedPeer ? "hidden md:flex" : "flex w-full md:w-72"
        )}>
          {showNewConv ? (
            <NewConversationPanel
              onSelect={handleSelectPeer}
              onClose={() => setShowNewConv(false)}
            />
          ) : (
            <>
              {/* Search + New */}
              <div className="p-3 border-b border-white/10 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
                    <Input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search conversations..."
                      className="pl-8 h-8 text-xs bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/20"
                    />
                  </div>
                  <button
                    onClick={() => setShowNewConv(true)}
                    className="h-8 w-8 flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors shrink-0"
                    title="New conversation"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Conversation list */}
              <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-5 w-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-white/30 px-4 text-center">
                    <MessageSquare className="h-8 w-8" />
                    <p className="text-sm">No conversations yet</p>
                    <p className="text-xs">Click + to start a new conversation</p>
                  </div>
                ) : (
                  filtered.map((conv) => {
                    const isActive = selectedPeer?.id === conv.peerId;
                    return (
                      <button
                        key={conv.peerId}
                        onClick={() => handleSelectPeer(conv.peerId, conv.peerName)}
                        className={cn(
                          "flex items-center gap-3 w-full px-4 py-3 transition-colors text-left",
                          isActive ? "bg-white/10" : "hover:bg-white/5"
                        )}
                      >
                        <div className="relative shrink-0">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-violet-500 text-white text-xs font-bold">
                              {getInitials(conv.peerName)}
                            </AvatarFallback>
                          </Avatar>
                          {conv.unreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 flex items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-bold">
                              {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className={cn(
                              "text-sm truncate",
                              conv.unreadCount > 0 ? "font-semibold text-white" : "font-medium text-white/80"
                            )}>
                              {conv.peerName}
                            </p>
                            <span className="text-[10px] text-white/30 shrink-0 ml-2">
                              {formatTime(conv.lastMessageAt)}
                            </span>
                          </div>
                          <p className={cn(
                            "text-xs truncate mt-0.5",
                            conv.unreadCount > 0 ? "text-white/60" : "text-white/30"
                          )}>
                            {conv.lastMessage}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: Chat window */}
        <div className={cn(
          "flex-1 flex flex-col",
          !selectedPeer ? "hidden md:flex" : "flex"
        )}>
          {selectedPeer ? (
            <ChatWindow
              peerId={selectedPeer.id}
              peerName={selectedPeer.name}
              currentUserId={user?.id ?? 0}
              onBack={() => setSelectedPeer(null)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-white/30">
              <MessageSquare className="h-16 w-16" />
              <div className="text-center">
                <p className="text-base font-medium text-white/50">Select a conversation</p>
                <p className="text-sm mt-1">Or click + to start a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
