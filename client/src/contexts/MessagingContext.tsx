/**
 * MessagingContext — global state for:
 * - Total unread chat message count (shown in sidebar badge)
 * - Active broadcast count (shown in header)
 *
 * Polls every 10 seconds to keep counts fresh across all pages.
 */
import { createContext, useContext, ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

interface MessagingContextValue {
  unreadMessages: number;
  activeBroadcasts: number;
}

const MessagingContext = createContext<MessagingContextValue>({
  unreadMessages: 0,
  activeBroadcasts: 0,
});

export function MessagingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const { data: unreadData } = trpc.chat.getUnreadCount.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 10_000,
  });

  const { data: broadcastData } = trpc.broadcast.listActive.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const value: MessagingContextValue = {
    unreadMessages: unreadData?.count ?? 0,
    activeBroadcasts: broadcastData?.length ?? 0,
  };

  return (
    <MessagingContext.Provider value={value}>
      {children}
    </MessagingContext.Provider>
  );
}

export function useMessaging() {
  return useContext(MessagingContext);
}
