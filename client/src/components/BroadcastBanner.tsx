/**
 * BroadcastBanner — shows active admin broadcasts as a pinned banner at the top
 * of the main content area. Users can dismiss individual banners.
 * Polls every 30 seconds for new broadcasts.
 */
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Megaphone, X } from "lucide-react";

export default function BroadcastBanner() {
  const utils = trpc.useUtils();
  const { data: broadcasts } = trpc.broadcast.listActive.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const dismiss = trpc.broadcast.dismiss.useMutation({
    onSuccess: () => utils.broadcast.listActive.invalidate(),
  });

  if (!broadcasts || broadcasts.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 mb-4">
      {broadcasts.map((b) => (
        <div
          key={b.id}
          className={cn(
            "flex items-start gap-3 px-4 py-3 rounded-xl border",
            "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
          )}
        >
          <Megaphone className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                Admin Broadcast
              </span>
              <span className="text-xs text-amber-600/60 dark:text-amber-400/60">
                from {b.authorName}
              </span>
            </div>
            <p className="text-sm leading-relaxed">{b.content}</p>
          </div>
          <button
            onClick={() => dismiss.mutate({ broadcastId: b.id })}
            className="shrink-0 text-amber-500/60 hover:text-amber-500 transition-colors"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
