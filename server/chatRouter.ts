/**
 * chatRouter — private peer-to-peer messaging + admin broadcast system
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { chatMessages, broadcasts, broadcastDismissals, users } from "../drizzle/schema";
import { eq, or, and, desc, sql, inArray, isNull } from "drizzle-orm";

// ─── Chat Procedures ──────────────────────────────────────────────────────────

const chatRouter = router({
  /**
   * Send a private message to another user
   */
  sendMessage: protectedProcedure
    .input(z.object({
      receiverId: z.number(),
      content: z.string().min(1).max(4000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(chatMessages).values({
        senderId: ctx.user.id,
        receiverId: input.receiverId,
        content: input.content,
      });
      return { success: true };
    }),

  /**
   * Get all messages in a conversation between the current user and another user
   */
  getMessages: protectedProcedure
    .input(z.object({
      otherUserId: z.number(),
      limit: z.number().optional().default(100),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const myId = ctx.user.id;
      const msgs = await db
        .select()
        .from(chatMessages)
        .where(
          or(
            and(eq(chatMessages.senderId, myId), eq(chatMessages.receiverId, input.otherUserId)),
            and(eq(chatMessages.senderId, input.otherUserId), eq(chatMessages.receiverId, myId))
          )
        )
        .orderBy(chatMessages.createdAt)
        .limit(input.limit);
      return msgs;
    }),

  /**
   * List all conversations for the current user (one entry per unique peer)
   */
  listConversations: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const myId = ctx.user.id;

    // Get all messages involving the current user
    const msgs = await db
      .select()
      .from(chatMessages)
      .where(
        or(
          eq(chatMessages.senderId, myId),
          eq(chatMessages.receiverId, myId)
        )
      )
      .orderBy(desc(chatMessages.createdAt));

    // Build conversation map: peerId → last message
    const convMap = new Map<number, typeof msgs[0]>();
    for (const m of msgs) {
      const peerId = m.senderId === myId ? m.receiverId : m.senderId;
      if (!convMap.has(peerId)) convMap.set(peerId, m);
    }

    if (convMap.size === 0) return [];

    // Fetch peer user info
    const peerIds = Array.from(convMap.keys());
    const peerUsers = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.id, peerIds));

    const peerMap = new Map(peerUsers.map(u => [u.id, u]));

    // Count unread (messages FROM peer that haven't been read)
    const unreadCounts = await db
      .select({
        senderId: chatMessages.senderId,
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.receiverId, myId),
          isNull(chatMessages.readAt)
        )
      )
      .groupBy(chatMessages.senderId);

    const unreadMap = new Map(unreadCounts.map(r => [r.senderId, Number(r.count)]));

    return Array.from(convMap.entries()).map(([peerId, lastMsg]) => ({
      peerId,
      peerName: peerMap.get(peerId)?.name ?? "Unknown",
      peerEmail: peerMap.get(peerId)?.email ?? "",
      lastMessage: lastMsg.content,
      lastMessageAt: lastMsg.createdAt,
      unreadCount: unreadMap.get(peerId) ?? 0,
    }));
  }),

  /**
   * Mark all messages from a specific sender as read
   */
  markRead: protectedProcedure
    .input(z.object({ senderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(chatMessages)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(chatMessages.senderId, input.senderId),
            eq(chatMessages.receiverId, ctx.user.id),
            isNull(chatMessages.readAt)
          )
        );
      return { success: true };
    }),

  /**
   * Get total unread message count for the current user
   */
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db
      .select({ count: sql<number>`COUNT(*)`.as("count") })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.receiverId, ctx.user.id),
          isNull(chatMessages.readAt)
        )
      );
    return { count: Number(rows[0]?.count ?? 0) };
  }),

  /**
   * List all team members (users) for starting a new conversation
   */
  listTeamMembers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const allUsers = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .orderBy(users.name);
    // Exclude self
    return allUsers.filter(u => u.id !== ctx.user.id);
  }),
});

// ─── Broadcast Procedures ─────────────────────────────────────────────────────

const broadcastRouter = router({
  /**
   * Create a new broadcast (admin only)
   */
  create: protectedProcedure
    .input(z.object({ content: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can send broadcasts" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(broadcasts).values({
        authorId: ctx.user.id,
        content: input.content,
        isActive: true,
      });
      return { success: true };
    }),

  /**
   * List all active broadcasts (not dismissed by the current user)
   */
  listActive: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Get all active broadcasts
    const activeBroadcasts = await db
      .select({
        id: broadcasts.id,
        content: broadcasts.content,
        createdAt: broadcasts.createdAt,
        authorId: broadcasts.authorId,
      })
      .from(broadcasts)
      .where(eq(broadcasts.isActive, true))
      .orderBy(desc(broadcasts.createdAt));

    if (activeBroadcasts.length === 0) return [];

    // Get dismissals by this user
    const dismissals = await db
      .select({ broadcastId: broadcastDismissals.broadcastId })
      .from(broadcastDismissals)
      .where(eq(broadcastDismissals.userId, ctx.user.id));

    const dismissedIds = new Set(dismissals.map(d => d.broadcastId));

    // Get author names
    const authorIds = Array.from(new Set(activeBroadcasts.map(b => b.authorId)));
    const authorUsers = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, authorIds));
    const authorMap = new Map(authorUsers.map(u => [u.id, u.name]));

    return activeBroadcasts
      .filter(b => !dismissedIds.has(b.id))
      .map(b => ({
        ...b,
        authorName: authorMap.get(b.authorId) ?? "Admin",
      }));
  }),

  /**
   * List ALL broadcasts (for admin broadcast center page)
   */
  listAll: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const all = await db
      .select()
      .from(broadcasts)
      .orderBy(desc(broadcasts.createdAt));
    return all;
  }),

  /**
   * Dismiss a broadcast for the current user
   */
  dismiss: protectedProcedure
    .input(z.object({ broadcastId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      try {
        await db.insert(broadcastDismissals).values({
          userId: ctx.user.id,
          broadcastId: input.broadcastId,
        });
      } catch {
        // Already dismissed — ignore duplicate
      }
      return { success: true };
    }),

  /**
   * Deactivate a broadcast (admin only)
   */
  deactivate: protectedProcedure
    .input(z.object({ broadcastId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(broadcasts)
        .set({ isActive: false })
        .where(eq(broadcasts.id, input.broadcastId));
      return { success: true };
    }),
});

export { chatRouter, broadcastRouter };
