import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, Loader2, MessageSquare, Sparkles } from "lucide-react";
import { Streamdown } from "streamdown";

const SUGGESTIONS = [
  "What are the most discussed topics today?",
  "Summarize the last 24 hours of activity",
  "Which clients sent documents recently?",
  "What questions did clients ask about Spain DNV?",
  "List any complaints or urgent issues",
  "Who are the most active participants?",
];

interface QueryResult {
  question: string;
  answer: string;
  quotes: Array<{
    messageId: string;
    senderName: string | null | undefined;
    groupId: string;
    content: string;
    timestamp: string;
    messageType: string;
  }>;
}

export default function WaQcAIQuery() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QueryResult[]>([]);

  const { data: groups } = trpc.waQc.groups.list.useQuery();
  const [selectedGroup, setSelectedGroup] = useState<string | undefined>(undefined);

  const askMutation = trpc.waQc.aiQuery.ask.useMutation({
    onSuccess: (data) => {
      const answer = typeof data.answer === "string" ? data.answer : String(data.answer);
      setResults(prev => [{ question: query || "", answer, quotes: data.quotes }, ...prev]);
      setQuery("");
    },
  });

  const handleSubmit = (q?: string) => {
    const text = q || query;
    if (!text.trim() || askMutation.isPending) return;
    setQuery(text);
    askMutation.mutate({ question: text, groupId: selectedGroup });
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Bot className="h-5 w-5 text-yellow-400" />
            AI Query
          </h1>
          <p className="text-sm text-muted-foreground">Ask questions about your WhatsApp group conversations</p>
        </div>
        {groups && groups.length > 0 && (
          <select
            value={selectedGroup || ""}
            onChange={(e) => setSelectedGroup(e.target.value || undefined)}
            className="text-xs bg-card border border-border/50 rounded-md px-2 py-1.5 text-foreground"
          >
            <option value="">All Groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.groupId}>{g.name || g.groupId.slice(-12)}</option>
            ))}
          </select>
        )}
      </div>

      {/* Query Input */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ask anything about your WhatsApp groups..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                className="pl-9 bg-card border-border/50"
                disabled={askMutation.isPending}
              />
            </div>
            <Button
              onClick={() => handleSubmit()}
              disabled={!query.trim() || askMutation.isPending}
              className="bg-yellow-500 hover:bg-yellow-600 text-black"
            >
              {askMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          {/* Suggestions */}
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSubmit(s)}
                disabled={askMutation.isPending}
                className="text-xs px-2.5 py-1 rounded-full border border-border/50 bg-accent/20 hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {askMutation.isPending && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-yellow-400 animate-pulse" />
              <span className="text-sm font-medium text-yellow-400">Analyzing conversations...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {askMutation.isError && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4">
            <p className="text-sm text-red-400">Error: {askMutation.error?.message || "Failed to get response"}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((item, idx) => (
            <Card key={idx} className="border-border/50">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-start gap-2">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-sm font-medium text-foreground">{item.question}</p>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-sm text-muted-foreground prose prose-sm prose-invert max-w-none">
                  <Streamdown>{item.answer}</Streamdown>
                </div>
                {item.quotes.length > 0 && (
                  <Badge variant="outline" className="mt-2 text-[10px]">
                    {item.quotes.length} messages referenced
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {results.length === 0 && !askMutation.isPending && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Bot className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No queries yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Ask a question above to get started</p>
        </div>
      )}
    </div>
  );
}
