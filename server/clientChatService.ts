import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, gte, inArray, isNull, like, lt, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import { getUserModuleAccess, isOwner } from "./permissionsRouter";
import {
  clientCases,
  clientDocuments,
  clientEmployeeSessions,
  clientChatAttachments,
  clientChatAuditEvents,
  clientChatConversations,
  clientChatDrafts,
  clientChatEvents,
  clientChatHiddenMessages,
  clientChatMessageReports,
  clientChatMessageReceipts,
  clientChatMessageMentions,
  clientChatMessageStars,
  clientChatMessageVersions,
  clientChatMessages,
  clientChatParticipants,
  clientChatReactions,
  clientChatScheduledMessages,
  clientPortalApplications,
  clientPortalDocuments,
  clientPortalDeliveryOutbox,
  clientPortalMessages,
  clientPortalNotifications,
  clientPortalUsers,
  users,
} from "../drizzle/schema";
import { storageGet, storagePut } from "./storage";
import { decodeChatAttachment, transcribeChatVoice } from "./clientChatMedia";
import { encodeEmployeeFolderId } from "./clientEmployeeDocuments";
import { ENV } from "./_core/env";

const MESSAGE_LIMIT = 100;
const EVENT_LIMIT = 250;
const TYPING_TTL_MS = 7_000;
const EDIT_WINDOW_MS = 15 * 60_000;
const DELETE_WINDOW_MS = 60 * 60_000;
const CHAT_CONVERSATION_QUOTA_BYTES = 500 * 1024 * 1024;
const CLIENT_CHAT_RESPONSE_TARGET_MS = 4 * 60 * 60_000;
const PLAYBACK_COMPLETION_TOLERANCE_MS = 750;
const PLAYBACK_PROOF_GRACE_MS = 10 * 60_000;
const FASTEST_SUPPORTED_PLAYBACK_RATE = 2;
export const CLIENT_CHAT_REACTIONS = ["👍", "❤️", "🙏", "✅", "🎉", "👀"] as const;

type PlaybackProof = {
  version: 1;
  conversationScope: string;
  messageScope: string;
  participantScope: string;
  startedAt: number;
  durationMs: number;
};

function playbackProofSignature(payload: string) {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is required for chat playback receipts");
  return createHmac("sha256", ENV.cookieSecret).update(`client-chat-playback:${payload}`).digest("base64url");
}

function createPlaybackProof(proof: PlaybackProof) {
  const payload = Buffer.from(JSON.stringify(proof)).toString("base64url");
  return `${payload}.${playbackProofSignature(payload)}`;
}

function playbackScope(kind: "conversation" | "message" | "participant", id: number) {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is required for chat playback receipts");
  return createHmac("sha256", ENV.cookieSecret).update(`client-chat-playback:${kind}:${id}`).digest("base64url").slice(0, 24);
}

function assertCompletedPlayback(token: string | null | undefined, expected: { conversationId: number; messageId: number; participantId: number }) {
  if (!token) throw new TRPCError({ code: "BAD_REQUEST", message: "Playback completion proof is required" });
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid playback completion proof" });
  const expectedSignature = playbackProofSignature(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (supplied.length !== expectedBuffer.length || !timingSafeEqual(supplied, expectedBuffer)) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid playback completion proof" });
  let proof: PlaybackProof;
  try {
    proof = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PlaybackProof;
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid playback completion proof" });
  }
  if (proof.version !== 1
    || proof.conversationScope !== playbackScope("conversation", expected.conversationId)
    || proof.messageScope !== playbackScope("message", expected.messageId)
    || proof.participantScope !== playbackScope("participant", expected.participantId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Playback completion proof does not match this message" });
  }
  const now = Date.now();
  const minimumCompleteAt = proof.startedAt + Math.max(500, Math.floor(proof.durationMs / FASTEST_SUPPORTED_PLAYBACK_RATE) - PLAYBACK_COMPLETION_TOLERANCE_MS);
  const expiresAt = proof.startedAt + Math.max(proof.durationMs + PLAYBACK_PROOF_GRACE_MS, PLAYBACK_PROOF_GRACE_MS);
  if (!Number.isFinite(proof.startedAt) || !Number.isFinite(proof.durationMs) || proof.durationMs < 0 || now < minimumCompleteAt || now > expiresAt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Audio playback has not completed" });
  }
}

function compactChatPreview(value: string | null | undefined, fallback: string) {
  const normalizedValue = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalizedValue) return fallback;
  return normalizedValue.length > 240 ? `${normalizedValue.slice(0, 237)}…` : normalizedValue;
}

async function getChatNotificationCopy(db: Awaited<ReturnType<typeof requireDb>>, messagePublicId: string, kind: "message" | "attachment") {
  const [message] = await db.select({
    id: clientChatMessages.id,
    senderName: clientChatMessages.senderNameSnapshot,
    body: clientChatMessages.body,
  }).from(clientChatMessages).where(eq(clientChatMessages.publicId, messagePublicId)).limit(1);
  if (!message) return { senderName: "ELEVAY", preview: kind === "attachment" ? "Secure attachment" : "New message" };
  const [attachment] = kind === "attachment"
    ? await db.select({ fileName: clientChatAttachments.originalFileName }).from(clientChatAttachments).where(eq(clientChatAttachments.messageId, message.id)).limit(1)
    : [];
  const fallback = kind === "attachment"
    ? `Secure attachment${attachment?.fileName ? `: ${attachment.fileName}` : ""}`
    : "New message";
  return { senderName: message.senderName || "ELEVAY", preview: compactChatPreview(message.body, fallback) };
}

function affectedRows(result: unknown) {
  const metadata = Array.isArray(result) ? result[0] : result;
  return Number((metadata as { affectedRows?: number } | undefined)?.affectedRows || 0);
}

async function listMessageReceiptDetails(
  db: Awaited<ReturnType<typeof requireDb>>,
  conversationId: number,
  messageId: number,
  senderParticipantId: number | null,
) {
  const rows = await db.select({
    participantId: clientChatParticipants.id,
    participantPublicId: clientChatParticipants.publicId,
    participantType: clientChatParticipants.participantType,
    role: clientChatParticipants.role,
    staffUserId: clientChatParticipants.staffUserId,
    portalUserId: clientChatParticipants.portalUserId,
    deliveredAt: clientChatMessageReceipts.deliveredAt,
    readAt: clientChatMessageReceipts.readAt,
    listenedAt: clientChatMessageReceipts.listenedAt,
    deviceName: clientChatMessageReceipts.deviceName,
  }).from(clientChatMessageReceipts)
    .innerJoin(clientChatParticipants, eq(clientChatMessageReceipts.participantId, clientChatParticipants.id))
    .where(and(
      eq(clientChatMessageReceipts.messageId, messageId),
      eq(clientChatParticipants.conversationId, conversationId),
    ));
  const staffIds = rows.map(row => row.staffUserId).filter((id): id is number => id != null);
  const portalIds = rows.map(row => row.portalUserId).filter((id): id is number => id != null);
  const [conversation] = await db.select({ clientCaseId: clientChatConversations.clientCaseId }).from(clientChatConversations).where(eq(clientChatConversations.id, conversationId)).limit(1);
  const [staffRows, portalRows] = await Promise.all([
    staffIds.length ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, staffIds)) : [],
    portalIds.length && conversation ? db.select({ id: clientPortalUsers.id, username: clientPortalUsers.username, clientName: clientCases.clientName })
      .from(clientPortalUsers)
      .leftJoin(clientPortalApplications, and(eq(clientPortalApplications.portalUserId, clientPortalUsers.id), eq(clientPortalApplications.clientCaseId, conversation.clientCaseId)))
      .leftJoin(clientCases, eq(clientCases.id, clientPortalApplications.clientCaseId))
      .where(inArray(clientPortalUsers.id, portalIds)) : [],
  ]);
  const staffNames = new Map(staffRows.map(row => [row.id, row.name || row.email || "ELEVAY Team"]));
  const portalNames = new Map(portalRows.map(row => [row.id, row.clientName || row.username || "Client"]));
  return rows.filter(row => row.participantId !== senderParticipantId).map(row => ({
    participantPublicId: row.participantPublicId,
    participantType: row.participantType,
    role: row.role,
    displayName: row.participantType === "staff"
      ? staffNames.get(row.staffUserId ?? -1) || "ELEVAY Team"
      : portalNames.get(row.portalUserId ?? -1) || "Client",
    deliveredAt: row.deliveredAt,
    readAt: row.readAt,
    listenedAt: row.listenedAt,
    deviceName: row.deviceName,
  })).sort((left, right) => (right.listenedAt || right.readAt || right.deliveredAt || 0) - (left.listenedAt || left.readAt || left.deliveredAt || 0));
}

async function markParticipantDelivered(
  db: Awaited<ReturnType<typeof requireDb>>,
  input: { conversationId: number; messageId: number; participantId: number; now: number },
) {
  return db.transaction(async tx => {
    const updated = await tx.update(clientChatMessageReceipts).set({ deliveredAt: input.now, updatedAt: input.now }).where(and(
      eq(clientChatMessageReceipts.messageId, input.messageId),
      eq(clientChatMessageReceipts.participantId, input.participantId),
      isNull(clientChatMessageReceipts.deliveredAt),
    ));
    let changed = affectedRows(updated) === 1;
    if (!changed) {
      const inserted = await tx.insert(clientChatMessageReceipts).ignore().values({
        messageId: input.messageId,
        participantId: input.participantId,
        deliveredAt: input.now,
        updatedAt: input.now,
      });
      changed = affectedRows(inserted) === 1;
    }
    if (!changed) return false;
    await tx.insert(clientChatEvents).values({
      conversationId: input.conversationId,
      eventType: "receipt_changed",
      entityId: input.messageId,
      actorParticipantId: input.participantId,
      metadata: { delivered: true },
      createdAt: input.now,
    });
    return true;
  });
}

type StaffActor = {
  id: number;
  openId: string | null;
  email?: string | null;
  name?: string | null;
  role?: "user" | "admin";
};

function normalized(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

async function insertAudit(
  executor: any,
  input: {
    conversationId?: number | null;
    messageId?: number | null;
    actorStaffUserId?: number | null;
    actorPortalUserId?: number | null;
    action: string;
    outcome?: "success" | "denied" | "failure";
    metadata?: Record<string, unknown>;
  },
) {
  await executor.insert(clientChatAuditEvents).values({
    publicId: randomUUID(),
    conversationId: input.conversationId ?? null,
    messageId: input.messageId ?? null,
    actorStaffUserId: input.actorStaffUserId ?? null,
    actorPortalUserId: input.actorPortalUserId ?? null,
    action: input.action,
    outcome: input.outcome ?? "success",
    metadata: input.metadata ?? null,
    createdAt: Date.now(),
  });
}

async function resolveAssignedStaff(executor: any, consultant: string | null, paralegal: string | null) {
  const rows = await executor.select({ id: users.id, name: users.name, email: users.email }).from(users);
  const consultantLabel = normalized(consultant);
  const paralegalLabel = normalized(paralegal);
  const assigned = new Map<number, "consultant" | "paralegal">();
  for (const row of rows) {
    const identity = `${normalized(row.name)} ${normalized(row.email)}`;
    if (paralegalLabel && identity.includes(paralegalLabel)) assigned.set(row.id, "paralegal");
    else if (consultantLabel && identity.includes(consultantLabel)) assigned.set(row.id, "consultant");
  }
  return Array.from(assigned.entries()).map(([id, role]) => ({ id, role }));
}

export async function ensureClientChatConversationForCase(clientCaseId: number, actorStaffUserId: number) {
  const db = await requireDb();
  try {
    return await db.transaction(async tx => {
    const [clientCase] = await tx.select().from(clientCases).where(eq(clientCases.id, clientCaseId)).limit(1);
    if (!clientCase) throw new TRPCError({ code: "NOT_FOUND", message: "Client Documentation folder not found" });

    let [conversation] = await tx
      .select()
      .from(clientChatConversations)
      .where(eq(clientChatConversations.clientCaseId, clientCaseId))
      .limit(1);

    const now = Date.now();
    let created = false;
    if (!conversation) {
      const [primaryApplication] = await tx
        .select({ id: clientPortalApplications.id })
        .from(clientPortalApplications)
        .where(and(
          eq(clientPortalApplications.clientCaseId, clientCaseId),
          isNull(clientPortalApplications.accessRevokedAt),
        ))
        .orderBy(desc(clientPortalApplications.isPrimary), desc(clientPortalApplications.id))
        .limit(1);

      await tx.insert(clientChatConversations).values({
        publicId: randomUUID(),
        clientCaseId,
        primaryPortalApplicationId: primaryApplication?.id ?? null,
        status: "active",
        assignedStaffUserId: actorStaffUserId,
        waitingOn: "none",
        createdByStaffUserId: actorStaffUserId,
        createdAt: now,
        updatedAt: now,
      });
      [conversation] = await tx
        .select()
        .from(clientChatConversations)
        .where(eq(clientChatConversations.clientCaseId, clientCaseId))
        .limit(1);
      created = true;
    }

    if (!conversation) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to initialize client chat" });

    const assignedStaff = await resolveAssignedStaff(tx, clientCase.consultant, clientCase.paralegal);
    if (created && !assignedStaff.some(staff => staff.id === actorStaffUserId)) {
      assignedStaff.push({ id: actorStaffUserId, role: "consultant" });
    }
    for (const staff of assignedStaff) {
      await tx.insert(clientChatParticipants).values({
        publicId: randomUUID(),
        conversationId: conversation.id,
        participantType: "staff",
        staffUserId: staff.id,
        role: created && staff.id === actorStaffUserId ? "admin" : staff.role,
        status: "active",
        canSend: true,
        canViewInternal: true,
        canManage: created && staff.id === actorStaffUserId,
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      }).onDuplicateKeyUpdate({ set: { status: "active", leftAt: null, updatedAt: now } });
    }

    const portalAssignments = await tx
      .select({ userId: clientPortalApplications.portalUserId })
      .from(clientPortalApplications)
      .where(and(
        eq(clientPortalApplications.clientCaseId, clientCaseId),
        isNull(clientPortalApplications.accessRevokedAt),
      ));
    for (const assignment of portalAssignments) {
      await tx.insert(clientChatParticipants).values({
        publicId: randomUUID(),
        conversationId: conversation.id,
        participantType: "portal",
        portalUserId: assignment.userId,
        role: "client",
        status: "active",
        canSend: true,
        canViewInternal: false,
        canManage: false,
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      }).onDuplicateKeyUpdate({ set: { status: "active", leftAt: null, updatedAt: now } });
    }

    if (created) {
      await insertAudit(tx, {
        conversationId: conversation.id,
        actorStaffUserId,
        action: "conversation_created",
        metadata: { clientCaseId },
      });
    }
      return conversation;
    });
  } catch (error) {
    console.error("[ClientChat] Conversation provisioning failed", {
      clientCaseId,
      actorStaffUserId,
      error: error instanceof Error ? error.message : "Unknown database error",
    });
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to initialize client chat" });
  }
}

export async function requireStaffConversation(clientCaseId: number, actor: StaffActor, write = false) {
  const access = await getUserModuleAccess(actor.id);
  const elevated = actor.role === "admin" || isOwner(actor);
  if (access.clientDocs === "none" && !elevated) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Client Documentation access is required" });
  }
  if (write && access.clientDocs !== "full" && !elevated) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Full Client Documentation access is required" });
  }

  const conversation = await ensureClientChatConversationForCase(clientCaseId, actor.id);
  if (write && conversation.status !== "active") throw new TRPCError({ code: "CONFLICT", message: `This conversation is ${conversation.status} and cannot accept changes` });
  const db = await requireDb();
  let [participant] = await db
    .select()
    .from(clientChatParticipants)
    .where(and(
      eq(clientChatParticipants.conversationId, conversation.id),
      eq(clientChatParticipants.staffUserId, actor.id),
      eq(clientChatParticipants.status, "active"),
    ))
    .limit(1);
  if (!participant && elevated) {
    const now = Date.now();
    await db.insert(clientChatParticipants).values({
      publicId: randomUUID(),
      conversationId: conversation.id,
      participantType: "staff",
      staffUserId: actor.id,
      role: "admin",
      status: "active",
      canSend: true,
      canViewInternal: true,
      canManage: true,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    }).onDuplicateKeyUpdate({ set: { status: "active", canSend: true, canViewInternal: true, canManage: true, leftAt: null, updatedAt: now } });
    [participant] = await db.select().from(clientChatParticipants).where(and(
      eq(clientChatParticipants.conversationId, conversation.id),
      eq(clientChatParticipants.staffUserId, actor.id),
      eq(clientChatParticipants.status, "active"),
    )).limit(1);
  }
  if (!participant) throw new TRPCError({ code: "FORBIDDEN", message: "You are not an assigned participant in this client conversation" });
  if (write && !participant.canSend) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot send messages in this conversation" });
  return { db, conversation, participant };
}

export async function getStaffConversation(clientCaseId: number, actor: StaffActor) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, false);
  const [clientCase] = await db.select().from(clientCases).where(eq(clientCases.id, clientCaseId)).limit(1);
  const [draft] = await db.select().from(clientChatDrafts).where(and(
    eq(clientChatDrafts.conversationId, conversation.id),
    eq(clientChatDrafts.participantId, participant.id),
  )).limit(1);
  const participants = await db
    .select({
      id: clientChatParticipants.id,
      publicId: clientChatParticipants.publicId,
      type: clientChatParticipants.participantType,
      staffUserId: clientChatParticipants.staffUserId,
      portalUserId: clientChatParticipants.portalUserId,
      role: clientChatParticipants.role,
      status: clientChatParticipants.status,
      lastSeenAt: clientChatParticipants.lastSeenAt,
      typingExpiresAt: clientChatParticipants.typingExpiresAt,
    })
    .from(clientChatParticipants)
    .where(and(eq(clientChatParticipants.conversationId, conversation.id), eq(clientChatParticipants.status, "active")));
  const staffIds = participants.map(row => row.staffUserId).filter((id): id is number => id != null);
  const portalIds = participants.map(row => row.portalUserId).filter((id): id is number => id != null);
  const [staffRows, portalRows] = await Promise.all([
    staffIds.length ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, staffIds)) : [],
    portalIds.length ? db.select({ id: clientPortalUsers.id, username: clientPortalUsers.username }).from(clientPortalUsers).where(inArray(clientPortalUsers.id, portalIds)) : [],
  ]);
  const staffNames = new Map(staffRows.map(row => [row.id, row.name || row.email || "ELEVAY Team"]));
  const portalNames = new Map(portalRows.map(row => [row.id, row.username || "Client"]));
  const now = Date.now();
  const publicParticipants = participants.map(row => ({
    id: row.id,
    publicId: row.publicId,
    type: row.type,
    role: row.role,
    status: row.status,
    displayName: row.type === "staff" ? staffNames.get(row.staffUserId ?? -1) || "ELEVAY Team" : portalNames.get(row.portalUserId ?? -1) || "Client",
    lastSeenAt: row.lastSeenAt,
    presence: row.typingExpiresAt && row.typingExpiresAt > now ? "typing" as const : row.lastSeenAt && row.lastSeenAt > now - 120_000 ? "recently_active" as const : "offline" as const,
  }));
  return {
    conversation: { ...conversation, clientName: clientCase?.clientName ?? "Client", clientCode: clientCase?.clientCode ?? "" },
    participant,
    participants: publicParticipants,
    draft: draft ?? null,
    polling: { openMs: 2_000, listMs: 10_000, typingTtlMs: TYPING_TTL_MS },
  };
}

export async function listStaffConversationSummaries(actor: StaffActor) {
  const access = await getUserModuleAccess(actor.id);
  if (access.clientDocs === "none" && actor.role !== "admin" && !isOwner(actor)) throw new TRPCError({ code: "FORBIDDEN", message: "Client Documentation access is required" });
  const db = await requireDb();
  const memberships = await db.select({
    clientCaseId: clientChatConversations.clientCaseId,
    conversationId: clientChatConversations.id,
    status: clientChatConversations.status,
    waitingOn: clientChatConversations.waitingOn,
    assignedStaffUserId: clientChatConversations.assignedStaffUserId,
    lastMessageId: clientChatConversations.lastMessageId,
    lastMessageAt: clientChatConversations.lastMessageAt,
    participantId: clientChatParticipants.id,
    lastReadMessageId: clientChatParticipants.lastReadMessageId,
    muteUntil: clientChatParticipants.muteUntil,
    notificationPreferences: clientChatParticipants.notificationPreferences,
  }).from(clientChatParticipants)
    .innerJoin(clientChatConversations, eq(clientChatParticipants.conversationId, clientChatConversations.id))
    .where(and(eq(clientChatParticipants.staffUserId, actor.id), eq(clientChatParticipants.participantType, "staff"), eq(clientChatParticipants.status, "active")));
  if (!memberships.length) return [];
  const conversationIds = memberships.map(row => row.conversationId);
  const lastMessageIds = memberships.map(row => row.lastMessageId).filter((id): id is number => id != null);
  const lastMessages = lastMessageIds.length ? await db.select({ id: clientChatMessages.id, publicId: clientChatMessages.publicId, body: clientChatMessages.body, messageType: clientChatMessages.messageType, senderType: clientChatMessages.senderType, senderName: clientChatMessages.senderNameSnapshot, deletedAt: clientChatMessages.deletedAt }).from(clientChatMessages).where(inArray(clientChatMessages.id, lastMessageIds)) : [];
  const lastById = new Map(lastMessages.map(message => [message.id, message]));
  const unreadRows = await db.select({ conversationId: clientChatMessages.conversationId, unreadCount: sql<number>`count(*)` })
    .from(clientChatMessages)
    .innerJoin(clientChatParticipants, and(eq(clientChatParticipants.conversationId, clientChatMessages.conversationId), eq(clientChatParticipants.staffUserId, actor.id), eq(clientChatParticipants.status, "active")))
    .where(and(
      inArray(clientChatMessages.conversationId, conversationIds),
      gt(clientChatMessages.id, sql`coalesce(${clientChatParticipants.lastReadMessageId}, 0)`),
      or(isNull(clientChatMessages.senderParticipantId), ne(clientChatMessages.senderParticipantId, clientChatParticipants.id)),
      isNull(clientChatMessages.deletedAt),
    )).groupBy(clientChatMessages.conversationId);
  const unreadByConversation = new Map(unreadRows.map(row => [row.conversationId, Number(row.unreadCount)]));
  const now = Date.now();
  return memberships.map(row => {
    const last = row.lastMessageId ? lastById.get(row.lastMessageId) : null;
    return {
      clientCaseId: row.clientCaseId,
      status: row.status,
      waitingOn: row.waitingOn,
      assignedStaffUserId: row.assignedStaffUserId,
      lastMessageAt: row.lastMessageAt,
      lastMessagePublicId: last?.publicId ?? null,
      lastMessagePreview: !last ? null : last.deletedAt ? "Message deleted" : last.body?.trim() || (last.messageType === "text" ? "New message" : `New ${last.messageType}`),
      lastSenderType: last?.senderType ?? null,
      lastSenderName: last?.senderName ?? null,
      unreadCount: unreadByConversation.get(row.conversationId) ?? 0,
      muted: row.muteUntil != null && row.muteUntil > now,
      muteUntil: row.muteUntil,
      notificationPreferences: row.notificationPreferences ?? { inApp: true, email: true, push: true },
    };
  });
}

export async function updateStaffChatPreferences(clientCaseId: number, actor: StaffActor, input: { muteUntil: number | null; inApp: boolean; email: boolean; push: boolean }) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, false);
  const now = Date.now();
  const muteUntil = input.muteUntil != null && input.muteUntil > now ? input.muteUntil : null;
  const notificationPreferences = { inApp: input.inApp, email: input.email, push: input.push };
  await db.update(clientChatParticipants).set({ muteUntil, notificationPreferences, updatedAt: now }).where(eq(clientChatParticipants.id, participant.id));
  await insertAudit(db, { conversationId: conversation.id, actorStaffUserId: actor.id, action: "notification_preferences_changed", metadata: { muted: Boolean(muteUntil), inApp: input.inApp, email: input.email, push: input.push } });
  await db.insert(clientChatEvents).values({ conversationId: conversation.id, eventType: "participant_changed", entityId: participant.id, actorParticipantId: participant.id, metadata: { preferenceChanged: true }, createdAt: now });
  return { muteUntil, notificationPreferences };
}

export async function listAssignableChatStaff(clientCaseId: number, actor: StaffActor) {
  const { db, participant } = await requireStaffConversation(clientCaseId, actor, false);
  if (!participant.canManage && actor.role !== "admin" && !isOwner(actor)) throw new TRPCError({ code: "FORBIDDEN", message: "Only conversation managers can manage participants" });
  const rows = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).orderBy(asc(users.name));
  const eligible = await Promise.all(rows.map(async user => ({ user, access: await getUserModuleAccess(user.id) })));
  return eligible.filter(item => item.access.clientDocs !== "none" || item.user.role === "admin").map(item => ({ id: item.user.id, name: item.user.name || item.user.email || "ELEVAY Team", role: item.user.role }));
}

export async function setStaffChatParticipant(clientCaseId: number, actor: StaffActor, input: { staffUserId: number; role: "consultant" | "paralegal" | "manager" | "observer"; active: boolean; makeAssignee: boolean }) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, true);
  if (!participant.canManage && actor.role !== "admin" && !isOwner(actor)) throw new TRPCError({ code: "FORBIDDEN", message: "Only conversation managers can manage participants" });
  if (input.staffUserId === actor.id && !input.active) throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot remove yourself while managing this conversation" });
  const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, input.staffUserId)).limit(1);
  if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found" });
  const targetAccess = await getUserModuleAccess(target.id);
  if (targetAccess.clientDocs === "none" && target.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "This staff member does not have Client Documentation access" });
  const now = Date.now();
  await db.insert(clientChatParticipants).values({ publicId: randomUUID(), conversationId: conversation.id, participantType: "staff", staffUserId: target.id, role: input.role, status: input.active ? "active" : "revoked", canSend: input.active, canViewInternal: input.active, canManage: input.role === "manager", joinedAt: now, leftAt: input.active ? null : now, createdAt: now, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { role: input.role, status: input.active ? "active" : "revoked", canSend: input.active, canViewInternal: input.active, canManage: input.role === "manager", leftAt: input.active ? null : now, updatedAt: now } });
  if (input.makeAssignee || (!input.active && conversation.assignedStaffUserId === target.id)) await db.update(clientChatConversations).set({ assignedStaffUserId: input.makeAssignee && input.active ? target.id : null, updatedAt: now }).where(eq(clientChatConversations.id, conversation.id));
  const [targetParticipant] = await db.select({ id: clientChatParticipants.id }).from(clientChatParticipants).where(and(eq(clientChatParticipants.conversationId, conversation.id), eq(clientChatParticipants.staffUserId, target.id))).limit(1);
  await insertAudit(db, { conversationId: conversation.id, actorStaffUserId: actor.id, action: input.active ? "participant_assigned" : "participant_revoked", metadata: { targetStaffUserId: target.id, role: input.role, primaryAssignee: input.makeAssignee && input.active } });
  await db.insert(clientChatEvents).values({ conversationId: conversation.id, eventType: "participant_changed", entityId: targetParticipant?.id ?? null, actorParticipantId: participant.id, metadata: { active: input.active, role: input.role, primaryAssignee: input.makeAssignee && input.active }, createdAt: now });
  return { staffUserId: target.id, active: input.active, role: input.role, primaryAssignee: input.makeAssignee && input.active };
}

async function requireClientDocumentationAccessManager(clientCaseId: number, actor: StaffActor) {
  const access = await getUserModuleAccess(actor.id);
  const elevated = actor.role === "admin" || isOwner(actor);
  if (access.clientDocs !== "full" && !elevated) throw new TRPCError({ code: "FORBIDDEN", message: "Full Client Documentation access is required to manage employees" });
  const db = await requireDb();
  const [clientCase] = await db.select().from(clientCases).where(eq(clientCases.id, clientCaseId)).limit(1);
  if (!clientCase) throw new TRPCError({ code: "NOT_FOUND", message: "Client Documentation folder not found" });
  const conversation = await ensureClientChatConversationForCase(clientCaseId, actor.id);
  return { db, clientCase, conversation };
}

export async function listClientDocumentationEmployeeAccess(clientCaseId: number, actor: StaffActor) {
  const { db, clientCase, conversation } = await requireClientDocumentationAccessManager(clientCaseId, actor);
  const employeeRows = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).orderBy(asc(users.name), asc(users.email));
  const eligibleRows = await Promise.all(employeeRows.map(async employee => ({ employee, access: await getUserModuleAccess(employee.id) })));
  const eligible = eligibleRows.filter(row => row.employee.role === "admin" || row.access.clientDocs === "full");
  const activeParticipants = await db.select({ staffUserId: clientChatParticipants.staffUserId, role: clientChatParticipants.role })
    .from(clientChatParticipants)
    .where(and(eq(clientChatParticipants.conversationId, conversation.id), eq(clientChatParticipants.participantType, "staff"), eq(clientChatParticipants.status, "active")));
  const activeRoleByUser = new Map(activeParticipants.filter(row => row.staffUserId != null).map(row => [row.staffUserId!, row.role]));
  const assigned = await resolveAssignedStaff(db, clientCase.consultant, clientCase.paralegal);
  const mandatoryIds = new Set<number>([clientCase.userId, ...assigned.map(item => item.id)]);
  return eligible.map(row => ({
    id: row.employee.id,
    name: row.employee.name || row.employee.email || "ELEVAY Team",
    email: row.employee.email,
    selected: activeRoleByUser.has(row.employee.id),
    mandatory: mandatoryIds.has(row.employee.id),
    chatRole: activeRoleByUser.get(row.employee.id) ?? "observer",
  }));
}

export async function updateClientDocumentationEmployeeAccess(clientCaseId: number, actor: StaffActor, employeeIds: number[]) {
  const { db, clientCase, conversation } = await requireClientDocumentationAccessManager(clientCaseId, actor);
  const requestedIds = Array.from(new Set(employeeIds)).slice(0, 100);
  const employeeRows = await db.select({ id: users.id, role: users.role }).from(users).where(requestedIds.length ? inArray(users.id, requestedIds) : sql`false`);
  if (employeeRows.length !== requestedIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "One or more selected employees no longer exist" });
  for (const employee of employeeRows) {
    const access = await getUserModuleAccess(employee.id);
    if (employee.role !== "admin" && access.clientDocs !== "full") throw new TRPCError({ code: "FORBIDDEN", message: "Every selected employee must have full Client Documentation access" });
  }
  const assigned = await resolveAssignedStaff(db, clientCase.consultant, clientCase.paralegal);
  const requiredRoles = new Map<number, "admin" | "consultant" | "paralegal" | "observer">([
    [clientCase.userId, "admin"],
    [actor.id, actor.role === "admin" || isOwner(actor) ? "admin" : "observer"],
    ...assigned.map(item => [item.id, item.role] as const),
  ]);
  const targetIds = new Set<number>([...requestedIds, ...Array.from(requiredRoles.keys())]);
  const now = Date.now();
  const existing = await db.select({ staffUserId: clientChatParticipants.staffUserId, role: clientChatParticipants.role, canManage: clientChatParticipants.canManage })
    .from(clientChatParticipants)
    .where(and(eq(clientChatParticipants.conversationId, conversation.id), eq(clientChatParticipants.participantType, "staff")));
  const existingByUser = new Map(existing.filter(row => row.staffUserId != null).map(row => [row.staffUserId!, row]));

  await db.transaction(async tx => {
    for (const staffUserId of Array.from(targetIds)) {
      const previous = existingByUser.get(staffUserId);
      const role = requiredRoles.get(staffUserId) ?? previous?.role ?? "observer";
      const canManage = role === "admin" || role === "manager" || Boolean(previous?.canManage);
      await tx.insert(clientChatParticipants).values({
        publicId: randomUUID(), conversationId: conversation.id, participantType: "staff", staffUserId,
        role, status: "active", canSend: true, canViewInternal: true, canManage,
        joinedAt: now, leftAt: null, createdAt: now, updatedAt: now,
      }).onDuplicateKeyUpdate({ set: { role, status: "active", canSend: true, canViewInternal: true, canManage, leftAt: null, updatedAt: now } });
    }
    const removableIds = existing.map(row => row.staffUserId).filter((id): id is number => id != null && !targetIds.has(id));
    if (removableIds.length) await tx.update(clientChatParticipants).set({ status: "revoked", canSend: false, canViewInternal: false, canManage: false, leftAt: now, typingExpiresAt: null, updatedAt: now }).where(and(
      eq(clientChatParticipants.conversationId, conversation.id),
      eq(clientChatParticipants.participantType, "staff"),
      inArray(clientChatParticipants.staffUserId, removableIds),
    ));
    await insertAudit(tx, { conversationId: conversation.id, actorStaffUserId: actor.id, action: "folder_employee_access_updated", metadata: { activeEmployeeCount: targetIds.size, removedEmployeeCount: removableIds.length } });
    await tx.insert(clientChatEvents).values({ conversationId: conversation.id, eventType: "participant_changed", actorParticipantId: null, metadata: { folderAccessUpdated: true }, createdAt: now });
  });
  return { employeeIds: Array.from(targetIds).sort((a, b) => a - b) };
}

export async function updateStaffConversationState(clientCaseId: number, actor: StaffActor, input: { status: "active" | "archived" | "blocked"; waitingOn: "none" | "client" | "staff" }) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, false);
  if (!participant.canManage && actor.role !== "admin" && !isOwner(actor)) throw new TRPCError({ code: "FORBIDDEN", message: "Only conversation managers can change conversation status" });
  const now = Date.now();
  await db.update(clientChatConversations).set({ status: input.status, waitingOn: input.status === "active" ? input.waitingOn : "none", updatedAt: now }).where(eq(clientChatConversations.id, conversation.id));
  await db.insert(clientChatEvents).values({ conversationId: conversation.id, eventType: "conversation_changed", actorParticipantId: participant.id, metadata: { status: input.status, waitingOn: input.status === "active" ? input.waitingOn : "none" }, createdAt: now });
  await insertAudit(db, { conversationId: conversation.id, actorStaffUserId: actor.id, action: "conversation_state_changed", metadata: { status: input.status, waitingOn: input.status === "active" ? input.waitingOn : "none" } });
  return { status: input.status, waitingOn: input.status === "active" ? input.waitingOn : "none" as const };
}

export async function updateStaffChatGovernance(clientCaseId: number, actor: StaffActor, input: { retentionPolicy: "indefinite"; legalHold: boolean; legalHoldReason?: string | null }) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, false);
  if (!participant.canManage && actor.role !== "admin" && !isOwner(actor)) throw new TRPCError({ code: "FORBIDDEN", message: "Only conversation managers can change retention or legal hold" });
  const reason = input.legalHold ? input.legalHoldReason?.trim() ?? "" : "";
  if (input.legalHold && reason.length < 5) throw new TRPCError({ code: "BAD_REQUEST", message: "Provide a legal hold reason" });
  const now = Date.now();
  await db.update(clientChatConversations).set({
    retentionPolicy: input.retentionPolicy,
    legalHoldAt: input.legalHold ? now : null,
    legalHoldReason: input.legalHold ? reason.slice(0, 500) : null,
    legalHoldByStaffUserId: input.legalHold ? actor.id : null,
    updatedAt: now,
  }).where(eq(clientChatConversations.id, conversation.id));
  await insertAudit(db, { conversationId: conversation.id, actorStaffUserId: actor.id, action: input.legalHold ? "legal_hold_enabled" : "chat_governance_changed", metadata: { retentionPolicy: input.retentionPolicy, legalHold: input.legalHold } });
  await db.insert(clientChatEvents).values({ conversationId: conversation.id, eventType: "conversation_changed", actorParticipantId: participant.id, metadata: { governanceChanged: true }, createdAt: now });
  return { retentionPolicy: input.retentionPolicy, legalHoldAt: input.legalHold ? now : null, legalHoldReason: input.legalHold ? reason.slice(0, 500) : null };
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function exportStaffConversation(clientCaseId: number, actor: StaffActor) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, false);
  const [clientCase] = await db.select({ clientCode: clientCases.clientCode }).from(clientCases).where(eq(clientCases.id, clientCaseId)).limit(1);
  let messages = await db.select().from(clientChatMessages).where(eq(clientChatMessages.conversationId, conversation.id)).orderBy(asc(clientChatMessages.id)).limit(10_000);
  if (!participant.canViewInternal) messages = messages.filter(message => message.visibility === "client");
  const enriched = await enrichStaffMessages(db, participant.id, messages);
  const rows = [
    ["Timestamp UTC", "Sender", "Sender type", "Visibility", "Message type", "Message", "Attachments", "Edited", "Deleted"],
    ...enriched.map(message => [new Date(message.createdAt).toISOString(), message.senderNameSnapshot, message.senderType, message.visibility, message.messageType, message.deletedAt ? "This message was deleted" : message.body ?? "", message.attachments.map(attachment => attachment.originalFileName).join(" | "), message.editedAt ? "yes" : "no", message.deletedAt ? "yes" : "no"]),
  ];
  const content = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const safeCode = (clientCase?.clientCode || `case-${clientCaseId}`).replace(/[^A-Za-z0-9_-]+/g, "-");
  await insertAudit(db, { conversationId: conversation.id, actorStaffUserId: actor.id, action: "conversation_exported", metadata: { format: "csv", recordCount: enriched.length } });
  return { fileName: `elevay-client-chat-${safeCode}.csv`, mimeType: "text/csv;charset=utf-8", content, recordCount: enriched.length };
}

export async function createStaffScheduledMessage(clientCaseId: number, actor: StaffActor, input: { body: string; visibility: "client" | "internal"; scheduledFor: number }) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, true);
  const body = input.body.trim();
  if (!body || body.length > 10_000) throw new TRPCError({ code: "BAD_REQUEST", message: "Scheduled message must contain 1 to 10,000 characters" });
  const now = Date.now();
  if (input.scheduledFor < now + 60_000 || input.scheduledFor > now + 366 * 24 * 60 * 60_000) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a delivery time between one minute and one year from now" });
  const publicId = randomUUID();
  await db.insert(clientChatScheduledMessages).values({ publicId, conversationId: conversation.id, senderParticipantId: participant.id, body, visibility: input.visibility, scheduledFor: input.scheduledFor, status: "scheduled", createdAt: now, updatedAt: now });
  await insertAudit(db, { conversationId: conversation.id, actorStaffUserId: actor.id, action: "scheduled_message_created", metadata: { scheduledMessagePublicId: publicId, scheduledFor: input.scheduledFor, visibility: input.visibility } });
  return { publicId, scheduledFor: input.scheduledFor, visibility: input.visibility };
}

export async function attachHeartbeatToScheduledMessage(clientCaseId: number, actor: StaffActor, publicId: string, taskUid: string) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, false);
  const [scheduled] = await db.select().from(clientChatScheduledMessages).where(and(eq(clientChatScheduledMessages.publicId, publicId), eq(clientChatScheduledMessages.conversationId, conversation.id), eq(clientChatScheduledMessages.senderParticipantId, participant.id), eq(clientChatScheduledMessages.status, "scheduled"))).limit(1);
  if (!scheduled) throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled message not found" });
  await db.update(clientChatScheduledMessages).set({ heartbeatTaskUid: taskUid, updatedAt: Date.now() }).where(eq(clientChatScheduledMessages.id, scheduled.id));
  return { ...scheduled, heartbeatTaskUid: taskUid };
}

export async function failScheduledMessageProvisioning(clientCaseId: number, actor: StaffActor, publicId: string) {
  const { db, conversation } = await requireStaffConversation(clientCaseId, actor, false);
  await db.update(clientChatScheduledMessages).set({ status: "failed", failureReason: "Scheduling service unavailable", updatedAt: Date.now() }).where(and(eq(clientChatScheduledMessages.publicId, publicId), eq(clientChatScheduledMessages.conversationId, conversation.id), eq(clientChatScheduledMessages.status, "scheduled")));
}

export async function listStaffScheduledMessages(clientCaseId: number, actor: StaffActor) {
  const { db, conversation } = await requireStaffConversation(clientCaseId, actor, false);
  return db.select({ publicId: clientChatScheduledMessages.publicId, body: clientChatScheduledMessages.body, visibility: clientChatScheduledMessages.visibility, scheduledFor: clientChatScheduledMessages.scheduledFor, status: clientChatScheduledMessages.status, failureReason: clientChatScheduledMessages.failureReason }).from(clientChatScheduledMessages).where(eq(clientChatScheduledMessages.conversationId, conversation.id)).orderBy(desc(clientChatScheduledMessages.scheduledFor)).limit(100);
}

export async function prepareStaffScheduledMessageCancellation(clientCaseId: number, actor: StaffActor, publicId: string) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, false);
  const [scheduled] = await db.select().from(clientChatScheduledMessages).where(and(eq(clientChatScheduledMessages.publicId, publicId), eq(clientChatScheduledMessages.conversationId, conversation.id))).limit(1);
  if (!scheduled || (scheduled.senderParticipantId !== participant.id && !participant.canManage && actor.role !== "admin" && !isOwner(actor))) throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled message not found" });
  if (scheduled.status !== "scheduled") throw new TRPCError({ code: "CONFLICT", message: "Only pending scheduled messages can be cancelled" });
  return { heartbeatTaskUid: scheduled.heartbeatTaskUid };
}

export async function completeStaffScheduledMessageCancellation(clientCaseId: number, actor: StaffActor, publicId: string) {
  const { db, conversation } = await requireStaffConversation(clientCaseId, actor, false);
  const now = Date.now();
  await db.update(clientChatScheduledMessages).set({ status: "cancelled", heartbeatTaskUid: null, updatedAt: now }).where(and(eq(clientChatScheduledMessages.publicId, publicId), eq(clientChatScheduledMessages.conversationId, conversation.id), eq(clientChatScheduledMessages.status, "scheduled")));
  await insertAudit(db, { conversationId: conversation.id, actorStaffUserId: actor.id, action: "scheduled_message_cancelled", metadata: { scheduledMessagePublicId: publicId } });
  return { cancelled: true };
}

export async function executeScheduledChatMessageByTaskUid(taskUid: string) {
  const db = await requireDb();
  const [scheduled] = await db.select({ scheduled: clientChatScheduledMessages, conversation: clientChatConversations, participant: clientChatParticipants, staffName: users.name, staffEmail: users.email }).from(clientChatScheduledMessages)
    .innerJoin(clientChatConversations, eq(clientChatScheduledMessages.conversationId, clientChatConversations.id))
    .innerJoin(clientChatParticipants, eq(clientChatScheduledMessages.senderParticipantId, clientChatParticipants.id))
    .leftJoin(users, eq(clientChatParticipants.staffUserId, users.id))
    .where(eq(clientChatScheduledMessages.heartbeatTaskUid, taskUid)).limit(1);
  if (!scheduled) return { ok: true, skipped: "orphan" as const };
  if (scheduled.scheduled.status === "sent") return { ok: true, skipped: "already_sent" as const };
  if (scheduled.scheduled.status !== "scheduled" && scheduled.scheduled.status !== "sending") return { ok: true, skipped: scheduled.scheduled.status };
  if (scheduled.conversation.status !== "active" || scheduled.participant.status !== "active" || !scheduled.participant.canSend) {
    await db.update(clientChatScheduledMessages).set({ status: "failed", failureReason: "Conversation or sender is no longer active", updatedAt: Date.now() }).where(eq(clientChatScheduledMessages.id, scheduled.scheduled.id));
    return { ok: true, skipped: "inactive" as const };
  }
  if (scheduled.scheduled.scheduledFor > Date.now() + 60_000) return { ok: true, skipped: "not_due" as const };
  const now = Date.now();
  const clientMessageId = `scheduled:${scheduled.scheduled.publicId}`;
  try {
    await db.update(clientChatScheduledMessages).set({ status: "sending", failureReason: null, updatedAt: now }).where(and(eq(clientChatScheduledMessages.id, scheduled.scheduled.id), eq(clientChatScheduledMessages.status, "scheduled")));
    await db.insert(clientChatMessages).values({ publicId: randomUUID(), conversationId: scheduled.conversation.id, clientMessageId, senderParticipantId: scheduled.participant.id, senderType: "staff", senderNameSnapshot: scheduled.staffName || scheduled.staffEmail || "ELEVAY Team", visibility: scheduled.scheduled.visibility, messageType: "text", body: scheduled.scheduled.body, createdAt: now, updatedAt: now }).onDuplicateKeyUpdate({ set: { updatedAt: now } });
    const [message] = await db.select().from(clientChatMessages).where(eq(clientChatMessages.clientMessageId, clientMessageId)).limit(1);
    if (!message) throw new Error("scheduled message lookup failed");
    await db.update(clientChatScheduledMessages).set({ status: "sent", sentMessageId: message.id, failureReason: null, updatedAt: now }).where(eq(clientChatScheduledMessages.id, scheduled.scheduled.id));
    await db.update(clientChatConversations).set({ lastMessageId: message.id, lastMessageAt: now, lastStaffMessageAt: now, waitingOn: scheduled.scheduled.visibility === "client" ? "client" : scheduled.conversation.waitingOn, updatedAt: now }).where(eq(clientChatConversations.id, scheduled.conversation.id));
    await db.insert(clientChatEvents).values({ conversationId: scheduled.conversation.id, eventType: "message_created", entityId: message.id, actorParticipantId: scheduled.participant.id, metadata: { visibility: scheduled.scheduled.visibility, scheduled: true }, createdAt: now });
    await insertAudit(db, { conversationId: scheduled.conversation.id, messageId: message.id, actorStaffUserId: scheduled.participant.staffUserId, action: "scheduled_message_sent", metadata: { scheduledMessagePublicId: scheduled.scheduled.publicId } });
    if (scheduled.scheduled.visibility === "client") await notifyPortalChatParticipants({ clientCaseId: scheduled.conversation.clientCaseId, conversationId: scheduled.conversation.id, messagePublicId: message.publicId, kind: "message" });
    await notifyEmployeeChatParticipants({ clientCaseId: scheduled.conversation.clientCaseId, conversationId: scheduled.conversation.id, messagePublicId: message.publicId, kind: "message", senderStaffUserId: scheduled.participant.staffUserId });
    return { ok: true, sent: true };
  } catch (error) {
    await db.update(clientChatScheduledMessages).set({ status: "scheduled", failureReason: "Delivery retry required", updatedAt: Date.now() }).where(eq(clientChatScheduledMessages.id, scheduled.scheduled.id));
    throw error;
  }
}

export async function getStaffChatMonitoring(clientCaseId: number, actor: StaffActor) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, false);
  const messages = await db.select({ id: clientChatMessages.id, visibility: clientChatMessages.visibility, senderParticipantId: clientChatMessages.senderParticipantId, deletedAt: clientChatMessages.deletedAt }).from(clientChatMessages).where(eq(clientChatMessages.conversationId, conversation.id));
  const messageIds = messages.map(message => message.id);
  const attachments = messageIds.length ? await db.select({ fileSize: clientChatAttachments.fileSize, scanStatus: clientChatAttachments.scanStatus, transcriptStatus: clientChatAttachments.transcriptStatus }).from(clientChatAttachments).where(inArray(clientChatAttachments.messageId, messageIds)) : [];
  const [latestEvent] = await db.select({ id: clientChatEvents.id, createdAt: clientChatEvents.createdAt }).from(clientChatEvents).where(eq(clientChatEvents.conversationId, conversation.id)).orderBy(desc(clientChatEvents.id)).limit(1);
  const responseDueAt = conversation.waitingOn === "staff" && conversation.lastClientMessageAt ? conversation.lastClientMessageAt + CLIENT_CHAT_RESPONSE_TARGET_MS : null;
  return {
    status: conversation.status,
    waitingOn: conversation.waitingOn,
    lastMessageAt: conversation.lastMessageAt,
    lastClientMessageAt: conversation.lastClientMessageAt,
    lastStaffMessageAt: conversation.lastStaffMessageAt,
    eventCursor: latestEvent?.id ?? 0,
    lastEventAt: latestEvent?.createdAt ?? null,
    messageCount: messages.length,
    internalMessageCount: messages.filter(message => message.visibility === "internal").length,
    unreadCount: messages.filter(message => message.id > (participant.lastReadMessageId ?? 0) && message.senderParticipantId !== participant.id && !message.deletedAt).length,
    attachmentCount: attachments.length,
    storageBytesUsed: attachments.reduce((sum, attachment) => sum + Number(attachment.fileSize || 0), 0),
    storageQuotaBytes: CHAT_CONVERSATION_QUOTA_BYTES,
    pendingTranscriptCount: attachments.filter(attachment => attachment.transcriptStatus === "pending").length,
    failedTranscriptCount: attachments.filter(attachment => attachment.transcriptStatus === "failed").length,
    responseTargetMinutes: CLIENT_CHAT_RESPONSE_TARGET_MS / 60_000,
    responseDueAt,
    responseOverdue: responseDueAt != null && responseDueAt < Date.now(),
  };
}

export async function getStaffChatEmailRecipients(clientCaseId: number) {
  const db = await requireDb();
  const now = Date.now();
  const rows = await db.select({ email: users.email, muteUntil: clientChatParticipants.muteUntil, preferences: clientChatParticipants.notificationPreferences })
    .from(clientChatParticipants)
    .innerJoin(clientChatConversations, eq(clientChatParticipants.conversationId, clientChatConversations.id))
    .innerJoin(users, eq(clientChatParticipants.staffUserId, users.id))
    .where(and(eq(clientChatConversations.clientCaseId, clientCaseId), eq(clientChatParticipants.participantType, "staff"), eq(clientChatParticipants.status, "active")));
  return Array.from(new Set(rows.filter(row => {
    const preferences = row.preferences && typeof row.preferences === "object" ? row.preferences as Record<string, boolean> : {};
    return Boolean(row.email) && preferences.email !== false && !(row.muteUntil != null && row.muteUntil > now);
  }).map(row => row.email!).filter(email => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))));
}

async function notifyPortalChatParticipants(input: { clientCaseId: number; conversationId: number; messagePublicId: string; kind: "message" | "attachment" }) {
  try {
    const db = await requireDb();
    const now = Date.now();
    const copy = await getChatNotificationCopy(db, input.messagePublicId, input.kind);
    const recipients = await db.select({ portalUserId: clientChatParticipants.portalUserId, muteUntil: clientChatParticipants.muteUntil, preferences: clientChatParticipants.notificationPreferences, applicationPublicId: clientPortalApplications.publicId })
      .from(clientChatParticipants)
      .innerJoin(clientPortalApplications, and(eq(clientPortalApplications.portalUserId, clientChatParticipants.portalUserId), eq(clientPortalApplications.clientCaseId, input.clientCaseId), isNull(clientPortalApplications.accessRevokedAt)))
      .where(and(eq(clientChatParticipants.conversationId, input.conversationId), eq(clientChatParticipants.participantType, "portal"), eq(clientChatParticipants.status, "active")));
    for (const recipient of recipients) {
      if (!recipient.portalUserId) continue;
      const idempotencyKey = `client-chat:${input.messagePublicId}:u:${recipient.portalUserId}`.slice(0, 191);
      const titleEn = `${input.kind === "attachment" ? "Attachment" : "Message"} from ${copy.senderName}`;
      const titleAr = `${input.kind === "attachment" ? "مرفق" : "رسالة"} من ${copy.senderName}`;
      const bodyEn = copy.preview;
      const bodyAr = copy.preview;
      await db.insert(clientPortalNotifications).ignore().values({ publicId: randomUUID(), portalUserId: recipient.portalUserId, idempotencyKey, type: "client_chat_message", titleEn, titleAr, bodyEn, bodyAr, entityType: "chat_message", entityPublicId: input.messagePublicId, createdAt: now });
      const preferences = recipient.preferences && typeof recipient.preferences === "object" ? recipient.preferences as Record<string, boolean> : {};
      const muted = recipient.muteUntil != null && recipient.muteUntil > now;
      if (!muted && preferences.push !== false && preferences.inApp !== false) {
        const { pushClientNotification } = await import("./clientPortalRoutes");
        await pushClientNotification(recipient.portalUserId, titleEn, bodyEn, { type: "client_chat_message", applicationPublicId: recipient.applicationPublicId, entityType: "chat_message", entityPublicId: input.messagePublicId }, `client-chat-push:${input.messagePublicId}:u:${recipient.portalUserId}`);
      }
    }
  } catch (error) {
    console.error("[ClientChat] Client notification failed", { clientCaseId: input.clientCaseId, messagePublicId: input.messagePublicId, error: error instanceof Error ? error.message : "Unknown notification error" });
  }
}

async function claimChatPushDelivery(
  db: Awaited<ReturnType<typeof requireDb>>,
  input: { idempotencyKey: string; recipient: string; payload: Record<string, unknown> },
) {
  await db.insert(clientPortalDeliveryOutbox).ignore().values({
    idempotencyKey: input.idempotencyKey,
    eventType: "client_chat_message",
    channel: "push",
    recipient: input.recipient,
    payload: input.payload,
  });
  const [delivery] = await db.select().from(clientPortalDeliveryOutbox)
    .where(eq(clientPortalDeliveryOutbox.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (!delivery || delivery.status === "sent" || delivery.attempts >= 3) return null;
  const claim = await db.update(clientPortalDeliveryOutbox).set({
    status: "pending",
    attempts: delivery.attempts + 1,
    lastError: null,
  }).where(and(
    eq(clientPortalDeliveryOutbox.id, delivery.id),
    eq(clientPortalDeliveryOutbox.status, delivery.status),
    eq(clientPortalDeliveryOutbox.attempts, delivery.attempts),
  ));
  return affectedRows(claim) === 1 ? { id: delivery.id, attempts: delivery.attempts + 1 } : null;
}

export async function notifyEmployeeChatParticipants(input: {
  clientCaseId: number;
  conversationId: number;
  messagePublicId: string;
  kind: "message" | "attachment";
  senderStaffUserId?: number | null;
}) {
  try {
    const db = await requireDb();
    const now = Date.now();
    const copy = await getChatNotificationCopy(db, input.messagePublicId, input.kind);
    const participants = await db.select({
      staffUserId: clientChatParticipants.staffUserId,
      muteUntil: clientChatParticipants.muteUntil,
      preferences: clientChatParticipants.notificationPreferences,
    }).from(clientChatParticipants).where(and(
      eq(clientChatParticipants.conversationId, input.conversationId),
      eq(clientChatParticipants.participantType, "staff"),
      eq(clientChatParticipants.status, "active"),
    ));
    const staffIds = Array.from(new Set(participants
      .map(row => row.staffUserId)
      .filter((id): id is number => id != null && id !== input.senderStaffUserId)));
    if (!staffIds.length) return { notified: 0 };
    const sessions = await db.select({
      staffUserId: clientEmployeeSessions.staffUserId,
      pushToken: clientEmployeeSessions.pushToken,
    }).from(clientEmployeeSessions).where(and(
      inArray(clientEmployeeSessions.staffUserId, staffIds),
      isNull(clientEmployeeSessions.revokedAt),
      gt(clientEmployeeSessions.expiresAt, new Date()),
    ));
    const preferenceByStaff = new Map(participants.map(row => [row.staffUserId, row]));
    const title = `${input.kind === "attachment" ? "Attachment" : "Message"} from ${copy.senderName}`;
    const body = copy.preview;
    const data = {
      type: "client_chat_message",
      entityType: "chat_message",
      entityPublicId: input.messagePublicId,
      employeeFolderId: encodeEmployeeFolderId(input.clientCaseId),
      target: "chat",
    };
    let notified = 0;
    for (const session of sessions) {
      const participant = preferenceByStaff.get(session.staffUserId);
      const preferences = participant?.preferences && typeof participant.preferences === "object"
        ? participant.preferences as Record<string, boolean>
        : {};
      if (!session.pushToken || Boolean(participant?.muteUntil && participant.muteUntil > now) || preferences.push === false) continue;
      if (!/^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(session.pushToken)) continue;
      const tokenHash = createHash("sha256").update(session.pushToken).digest("hex").slice(0, 16);
      const idempotencyKey = `employee-chat:${input.messagePublicId}:s:${session.staffUserId}:t:${tokenHash}`.slice(0, 191);
      while (true) {
        const delivery = await claimChatPushDelivery(db, { idempotencyKey, recipient: session.pushToken, payload: { title, body, data } });
        if (!delivery) break;
        try {
          const response = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ to: session.pushToken, title, body, data, sound: "default", channelId: "chat" }),
          });
          if (!response.ok) throw new Error(`push_${response.status}`);
          await db.update(clientPortalDeliveryOutbox).set({ status: "sent", attempts: delivery.attempts, processedAt: new Date(), lastError: null }).where(eq(clientPortalDeliveryOutbox.id, delivery.id));
          notified += 1;
          break;
        } catch (pushError) {
          await db.update(clientPortalDeliveryOutbox).set({ status: "failed", attempts: delivery.attempts, lastError: String(pushError).slice(0, 4000) }).where(eq(clientPortalDeliveryOutbox.id, delivery.id));
          if (delivery.attempts >= 3) break;
        }
      }
    }
    return { notified };
  } catch (error) {
    console.error("[ClientChat] Employee push failed", { clientCaseId: input.clientCaseId, messagePublicId: input.messagePublicId, error: error instanceof Error ? error.message : "Unknown notification error" });
    return { notified: 0 };
  }
}

export async function listStaffMessages(clientCaseId: number, actor: StaffActor, beforeId?: number, limit = 50) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, false);
  const hidden = await db
    .select({ messageId: clientChatHiddenMessages.messageId })
    .from(clientChatHiddenMessages)
    .where(eq(clientChatHiddenMessages.participantId, participant.id));
  const hiddenIds = hidden.map(row => row.messageId);
  const predicates = [eq(clientChatMessages.conversationId, conversation.id)];
  if (beforeId) predicates.push(lt(clientChatMessages.id, beforeId));
  if (!participant.canViewInternal) predicates.push(eq(clientChatMessages.visibility, "client"));
  if (hiddenIds.length) predicates.push(notInArray(clientChatMessages.id, hiddenIds));

  const rows = await db
    .select()
    .from(clientChatMessages)
    .where(and(...predicates))
    .orderBy(desc(clientChatMessages.id))
    .limit(Math.min(Math.max(limit, 1), MESSAGE_LIMIT));
  const now = Date.now();
  for (const message of rows) {
    if (message.senderParticipantId === participant.id) continue;
    await markParticipantDelivered(db, { conversationId: conversation.id, messageId: message.id, participantId: participant.id, now });
  }
  return enrichStaffMessages(db, participant.id, rows.reverse());
}

async function enrichStaffMessages(
  db: Awaited<ReturnType<typeof requireDb>>,
  participantId: number,
  rows: Array<typeof clientChatMessages.$inferSelect>,
) {
  const messageIds = rows.map(row => row.id);
  if (!messageIds.length) return rows.map(row => ({ ...row, isStarred: false, mentionedMe: false, reactions: [], attachments: [], receiptSummary: { delivered: 0, read: 0, listened: 0 }, receiptDetails: [] }));
  const [reactionRows, starRows, receiptRows, attachmentRows, mentionRows] = await Promise.all([
    db.select().from(clientChatReactions).where(inArray(clientChatReactions.messageId, messageIds)),
    db.select({ messageId: clientChatMessageStars.messageId }).from(clientChatMessageStars).where(and(
      inArray(clientChatMessageStars.messageId, messageIds),
      eq(clientChatMessageStars.participantId, participantId),
    )),
    db.select().from(clientChatMessageReceipts).where(inArray(clientChatMessageReceipts.messageId, messageIds)),
    db.select().from(clientChatAttachments).where(and(
      inArray(clientChatAttachments.messageId, messageIds),
      eq(clientChatAttachments.scanStatus, "clean"),
    )),
    db.select({ messageId: clientChatMessageMentions.messageId, participantId: clientChatMessageMentions.participantId }).from(clientChatMessageMentions).where(inArray(clientChatMessageMentions.messageId, messageIds)),
  ]);
  const stars = new Set(starRows.map(row => row.messageId));
  const reactionMap = new Map<number, Map<string, { count: number; reactedByMe: boolean }>>();
  for (const row of reactionRows) {
    const messageReactions = reactionMap.get(row.messageId) ?? new Map();
    const aggregate = messageReactions.get(row.reaction) ?? { count: 0, reactedByMe: false };
    aggregate.count += 1;
    if (row.participantId === participantId) aggregate.reactedByMe = true;
    messageReactions.set(row.reaction, aggregate);
    reactionMap.set(row.messageId, messageReactions);
  }
  const receiptMap = new Map<number, { delivered: number; read: number; listened: number }>();
  for (const row of receiptRows) {
    const aggregate = receiptMap.get(row.messageId) ?? { delivered: 0, read: 0, listened: 0 };
    if (row.deliveredAt) aggregate.delivered += 1;
    if (row.readAt) aggregate.read += 1;
    if (row.listenedAt) aggregate.listened += 1;
    receiptMap.set(row.messageId, aggregate);
  }
  const receiptParticipantIds = Array.from(new Set(receiptRows.map(row => row.participantId)));
  const receiptParticipants = receiptParticipantIds.length ? await db.select({
    id: clientChatParticipants.id,
    publicId: clientChatParticipants.publicId,
    conversationId: clientChatParticipants.conversationId,
    participantType: clientChatParticipants.participantType,
    role: clientChatParticipants.role,
    staffUserId: clientChatParticipants.staffUserId,
    portalUserId: clientChatParticipants.portalUserId,
  }).from(clientChatParticipants).where(inArray(clientChatParticipants.id, receiptParticipantIds)) : [];
  const receiptStaffIds = receiptParticipants.map(row => row.staffUserId).filter((id): id is number => id != null);
  const receiptPortalIds = receiptParticipants.map(row => row.portalUserId).filter((id): id is number => id != null);
  const receiptConversationIds = Array.from(new Set(receiptParticipants.map(row => row.conversationId)));
  const [receiptStaffRows, receiptPortalRows, receiptClientRows] = await Promise.all([
    receiptStaffIds.length ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, receiptStaffIds)) : [],
    receiptPortalIds.length ? db.select({ id: clientPortalUsers.id, username: clientPortalUsers.username }).from(clientPortalUsers).where(inArray(clientPortalUsers.id, receiptPortalIds)) : [],
    receiptConversationIds.length ? db.select({ conversationId: clientChatConversations.id, clientName: clientCases.clientName })
      .from(clientChatConversations)
      .innerJoin(clientCases, eq(clientChatConversations.clientCaseId, clientCases.id))
      .where(inArray(clientChatConversations.id, receiptConversationIds)) : [],
  ]);
  const receiptParticipantById = new Map(receiptParticipants.map(row => [row.id, row]));
  const receiptStaffNameById = new Map(receiptStaffRows.map(row => [row.id, row.name || row.email || "ELEVAY Team"]));
  const receiptPortalNameById = new Map(receiptPortalRows.map(row => [row.id, row.username || "Client"]));
  const receiptClientNameByConversation = new Map(receiptClientRows.map(row => [row.conversationId, row.clientName || "Client"]));
  const senderParticipantByMessage = new Map(rows.map(row => [row.id, row.senderParticipantId]));
  const receiptDetailsByMessage = new Map<number, Array<{
    participantPublicId: string;
    participantType: "staff" | "portal";
    role: string;
    displayName: string;
    deliveredAt: number | null;
    readAt: number | null;
    listenedAt: number | null;
    deviceName: string | null;
  }>>();
  for (const receipt of receiptRows) {
    const receiptParticipant = receiptParticipantById.get(receipt.participantId);
    if (!receiptParticipant || receipt.participantId === senderParticipantByMessage.get(receipt.messageId)) continue;
    const current = receiptDetailsByMessage.get(receipt.messageId) ?? [];
    current.push({
      participantPublicId: receiptParticipant.publicId,
      participantType: receiptParticipant.participantType,
      role: receiptParticipant.role,
      displayName: receiptParticipant.participantType === "staff"
        ? receiptStaffNameById.get(receiptParticipant.staffUserId ?? -1) || "ELEVAY Team"
        : receiptClientNameByConversation.get(receiptParticipant.conversationId) || receiptPortalNameById.get(receiptParticipant.portalUserId ?? -1) || "Client",
      deliveredAt: receipt.deliveredAt,
      readAt: receipt.readAt,
      listenedAt: receipt.listenedAt,
      deviceName: receipt.deviceName,
    });
    receiptDetailsByMessage.set(receipt.messageId, current);
  }
  const attachmentMap = new Map<number, Array<{
    publicId: string;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    width: number | null;
    height: number | null;
    durationMs: number | null;
    transcriptStatus: string;
    transcriptOriginal: string | null;
    transcriptArabic: string | null;
    transcriptEnglish: string | null;
    savedToDocuments: boolean;
  }>>();
  for (const row of attachmentRows) {
    const current = attachmentMap.get(row.messageId) ?? [];
    current.push({
      publicId: row.publicId,
      originalFileName: row.originalFileName,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      width: row.width,
      height: row.height,
      durationMs: row.durationMs,
      transcriptStatus: row.transcriptStatus,
      transcriptOriginal: row.transcriptOriginal,
      transcriptArabic: row.transcriptArabic,
      transcriptEnglish: row.transcriptEnglish,
      savedToDocuments: Boolean(row.savedClientDocumentId),
    });
    attachmentMap.set(row.messageId, current);
  }
  return rows.map(row => ({
    ...row,
    isStarred: stars.has(row.id),
    mentionedMe: mentionRows.some(mention => mention.messageId === row.id && mention.participantId === participantId),
    reactions: Array.from(reactionMap.get(row.id)?.entries() ?? []).map(([reaction, aggregate]) => ({ reaction, ...aggregate })),
    attachments: row.deletedAt ? [] : attachmentMap.get(row.id) ?? [],
    receiptSummary: receiptMap.get(row.id) ?? { delivered: 0, read: 0, listened: 0 },
    receiptDetails: (receiptDetailsByMessage.get(row.id) ?? [])
      .sort((left, right) => (right.listenedAt || right.readAt || right.deliveredAt || 0) - (left.listenedAt || left.readAt || left.deliveredAt || 0)),
  }));
}

async function requireStaffMessage(clientCaseId: number, actor: StaffActor, messagePublicId: string, write = false) {
  const context = await requireStaffConversation(clientCaseId, actor, write);
  const [message] = await context.db.select().from(clientChatMessages).where(and(
    eq(clientChatMessages.publicId, messagePublicId),
    eq(clientChatMessages.conversationId, context.conversation.id),
  )).limit(1);
  if (!message || (message.visibility === "internal" && !context.participant.canViewInternal)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
  }
  return { ...context, message };
}

async function preserveMessageVersion(executor: any, message: typeof clientChatMessages.$inferSelect, participantId: number, reason: string) {
  const [latest] = await executor.select({ versionNumber: clientChatMessageVersions.versionNumber })
    .from(clientChatMessageVersions)
    .where(eq(clientChatMessageVersions.messageId, message.id))
    .orderBy(desc(clientChatMessageVersions.versionNumber))
    .limit(1);
  await executor.insert(clientChatMessageVersions).values({
    messageId: message.id,
    versionNumber: (latest?.versionNumber ?? 0) + 1,
    body: message.body,
    editedByParticipantId: participantId,
    editReason: reason,
    createdAt: Date.now(),
  });
}

export async function editStaffMessage(clientCaseId: number, actor: StaffActor, messagePublicId: string, bodyInput: string) {
  const { db, conversation, participant, message } = await requireStaffMessage(clientCaseId, actor, messagePublicId, true);
  const body = bodyInput.trim();
  if (!body) throw new TRPCError({ code: "BAD_REQUEST", message: "Message cannot be empty" });
  if (message.deletedAt) throw new TRPCError({ code: "CONFLICT", message: "Deleted messages cannot be edited" });
  if (message.senderParticipantId !== participant.id || message.senderType !== "staff") {
    throw new TRPCError({ code: "FORBIDDEN", message: "You can edit only your own messages" });
  }
  if (Date.now() - message.createdAt > EDIT_WINDOW_MS) {
    throw new TRPCError({ code: "FORBIDDEN", message: "The 15-minute edit window has closed" });
  }
  const now = Date.now();
  await db.transaction(async tx => {
    await preserveMessageVersion(tx, message, participant.id, "edited");
    await tx.update(clientChatMessages).set({ body, editedAt: now, updatedAt: now }).where(eq(clientChatMessages.id, message.id));
    await tx.insert(clientChatEvents).values({ conversationId: conversation.id, eventType: "message_edited", entityId: message.id, actorParticipantId: participant.id, metadata: { visibility: message.visibility }, createdAt: now });
    await insertAudit(tx, { conversationId: conversation.id, messageId: message.id, actorStaffUserId: actor.id, action: "message_edited" });
  });
  const [updated] = await db.select().from(clientChatMessages).where(eq(clientChatMessages.id, message.id)).limit(1);
  return updated;
}

export async function deleteStaffMessage(clientCaseId: number, actor: StaffActor, messagePublicId: string) {
  const { db, conversation, participant, message } = await requireStaffMessage(clientCaseId, actor, messagePublicId, true);
  if (message.deletedAt) return { deletedAt: message.deletedAt };
  const ownMessage = message.senderParticipantId === participant.id && message.senderType === "staff";
  if (!ownMessage && !participant.canManage) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot delete this message" });
  if (ownMessage && !participant.canManage && Date.now() - message.createdAt > DELETE_WINDOW_MS) {
    throw new TRPCError({ code: "FORBIDDEN", message: "The one-hour delete window has closed" });
  }
  const now = Date.now();
  await db.transaction(async tx => {
    const [lockedConversation] = await tx.select({ legalHoldAt: clientChatConversations.legalHoldAt })
      .from(clientChatConversations)
      .where(eq(clientChatConversations.id, conversation.id))
      .for("update");
    if (lockedConversation?.legalHoldAt) throw new TRPCError({ code: "FORBIDDEN", message: "Messages cannot be removed while this conversation is under legal hold" });
    await preserveMessageVersion(tx, message, participant.id, "deleted_for_everyone");
    await tx.update(clientChatMessages).set({ body: null, deletedAt: now, deletedByParticipantId: participant.id, updatedAt: now }).where(eq(clientChatMessages.id, message.id));
    await tx.insert(clientChatEvents).values({ conversationId: conversation.id, eventType: "message_deleted", entityId: message.id, actorParticipantId: participant.id, metadata: { visibility: message.visibility }, createdAt: now });
    await insertAudit(tx, { conversationId: conversation.id, messageId: message.id, actorStaffUserId: actor.id, action: "message_deleted_for_everyone" });
  });
  return { deletedAt: now };
}

export async function hideStaffMessage(clientCaseId: number, actor: StaffActor, messagePublicId: string) {
  const { db, conversation, participant, message } = await requireStaffMessage(clientCaseId, actor, messagePublicId, false);
  const now = Date.now();
  await db.insert(clientChatHiddenMessages).values({ messageId: message.id, participantId: participant.id, hiddenAt: now })
    .onDuplicateKeyUpdate({ set: { hiddenAt: now } });
  await insertAudit(db, { conversationId: conversation.id, messageId: message.id, actorStaffUserId: actor.id, action: "message_hidden_for_self" });
  return { hiddenAt: now };
}

export async function toggleStaffStar(clientCaseId: number, actor: StaffActor, messagePublicId: string) {
  const { db, conversation, participant, message } = await requireStaffMessage(clientCaseId, actor, messagePublicId, false);
  const [existing] = await db.select({ id: clientChatMessageStars.id }).from(clientChatMessageStars).where(and(
    eq(clientChatMessageStars.messageId, message.id),
    eq(clientChatMessageStars.participantId, participant.id),
  )).limit(1);
  if (existing) await db.delete(clientChatMessageStars).where(eq(clientChatMessageStars.id, existing.id));
  else await db.insert(clientChatMessageStars).values({ messageId: message.id, participantId: participant.id, createdAt: Date.now() });
  await insertAudit(db, { conversationId: conversation.id, messageId: message.id, actorStaffUserId: actor.id, action: existing ? "message_unstarred" : "message_starred" });
  return { starred: !existing };
}

export async function toggleStaffReaction(clientCaseId: number, actor: StaffActor, messagePublicId: string, reaction: typeof CLIENT_CHAT_REACTIONS[number]) {
  const { db, conversation, participant, message } = await requireStaffMessage(clientCaseId, actor, messagePublicId, true);
  if (message.deletedAt) throw new TRPCError({ code: "CONFLICT", message: "Deleted messages cannot receive reactions" });
  const [existing] = await db.select({ id: clientChatReactions.id }).from(clientChatReactions).where(and(
    eq(clientChatReactions.messageId, message.id),
    eq(clientChatReactions.participantId, participant.id),
    eq(clientChatReactions.reaction, reaction),
  )).limit(1);
  if (existing) await db.delete(clientChatReactions).where(eq(clientChatReactions.id, existing.id));
  else await db.insert(clientChatReactions).values({ messageId: message.id, participantId: participant.id, reaction, createdAt: Date.now() });
  const now = Date.now();
  await db.insert(clientChatEvents).values({ conversationId: conversation.id, eventType: "reaction_changed", entityId: message.id, actorParticipantId: participant.id, metadata: { visibility: message.visibility }, createdAt: now });
  await insertAudit(db, { conversationId: conversation.id, messageId: message.id, actorStaffUserId: actor.id, action: existing ? "reaction_removed" : "reaction_added", metadata: { reaction } });
  return { reacted: !existing, reaction };
}

export async function setStaffMessageFlag(clientCaseId: number, actor: StaffActor, messagePublicId: string, flag: "important" | "pinned", value: boolean) {
  const { db, conversation, participant, message } = await requireStaffMessage(clientCaseId, actor, messagePublicId, true);
  if (flag === "pinned" && !participant.canManage) throw new TRPCError({ code: "FORBIDDEN", message: "Only conversation managers can pin messages" });
  const now = Date.now();
  await db.update(clientChatMessages).set(flag === "pinned" ? { isPinned: value, updatedAt: now } : { isImportant: value, updatedAt: now })
    .where(eq(clientChatMessages.id, message.id));
  await db.insert(clientChatEvents).values({ conversationId: conversation.id, eventType: "conversation_changed", entityId: message.id, actorParticipantId: participant.id, metadata: { visibility: message.visibility, flag }, createdAt: now });
  await insertAudit(db, { conversationId: conversation.id, messageId: message.id, actorStaffUserId: actor.id, action: `message_${flag}_${value ? "enabled" : "disabled"}` });
  return { flag, value };
}

export type StaffMessageSearchFilters = {
  query?: string;
  dateFrom?: number;
  dateTo?: number;
  senderType?: "client" | "staff" | "system";
  messageType?: "text" | "image" | "video" | "file" | "voice" | "audio" | "system";
  visibility?: "client" | "internal";
  starredOnly?: boolean;
  importantOnly?: boolean;
  pinnedOnly?: boolean;
  mentionedMeOnly?: boolean;
  limit?: number;
};

export async function searchStaffMessages(clientCaseId: number, actor: StaffActor, filters: StaffMessageSearchFilters) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, false);
  const query = filters.query?.trim() ?? "";
  const hasFilter = query.length >= 2 || filters.dateFrom != null || filters.dateTo != null || filters.senderType != null || filters.messageType != null || filters.visibility != null || filters.starredOnly || filters.importantOnly || filters.pinnedOnly || filters.mentionedMeOnly;
  if (!hasFilter) return [];
  if (filters.dateFrom != null && filters.dateTo != null && filters.dateFrom > filters.dateTo) throw new TRPCError({ code: "BAD_REQUEST", message: "The start date must be before the end date" });
  if (filters.visibility === "internal" && !participant.canViewInternal) return [];
  const hiddenRows = await db.select({ messageId: clientChatHiddenMessages.messageId }).from(clientChatHiddenMessages)
    .where(eq(clientChatHiddenMessages.participantId, participant.id));
  const predicates = [eq(clientChatMessages.conversationId, conversation.id)];
  if (query.length >= 2) predicates.push(like(clientChatMessages.body, `%${query}%`));
  if (filters.dateFrom != null) predicates.push(gte(clientChatMessages.createdAt, filters.dateFrom));
  if (filters.dateTo != null) predicates.push(lte(clientChatMessages.createdAt, filters.dateTo));
  if (filters.senderType) predicates.push(eq(clientChatMessages.senderType, filters.senderType));
  if (filters.messageType) predicates.push(eq(clientChatMessages.messageType, filters.messageType));
  if (filters.visibility) predicates.push(eq(clientChatMessages.visibility, filters.visibility));
  if (filters.importantOnly) predicates.push(eq(clientChatMessages.isImportant, true));
  if (filters.pinnedOnly) predicates.push(eq(clientChatMessages.isPinned, true));
  if (!participant.canViewInternal) predicates.push(eq(clientChatMessages.visibility, "client"));
  if (hiddenRows.length) predicates.push(notInArray(clientChatMessages.id, hiddenRows.map(row => row.messageId)));
  if (filters.starredOnly) {
    const stars = await db.select({ messageId: clientChatMessageStars.messageId }).from(clientChatMessageStars).where(eq(clientChatMessageStars.participantId, participant.id));
    if (!stars.length) return [];
    predicates.push(inArray(clientChatMessages.id, stars.map(row => row.messageId)));
  }
  if (filters.mentionedMeOnly) {
    const mentions = await db.select({ messageId: clientChatMessageMentions.messageId }).from(clientChatMessageMentions).where(eq(clientChatMessageMentions.participantId, participant.id));
    if (!mentions.length) return [];
    predicates.push(inArray(clientChatMessages.id, mentions.map(row => row.messageId)));
  }
  const rows = await db.select().from(clientChatMessages).where(and(...predicates)).orderBy(desc(clientChatMessages.createdAt)).limit(Math.min(Math.max(filters.limit ?? 50, 1), 100));
  await insertAudit(db, { conversationId: conversation.id, actorStaffUserId: actor.id, action: "messages_searched", metadata: { resultCount: rows.length, filtered: true } });
  return enrichStaffMessages(db, participant.id, rows);
}

export async function reportStaffMessage(clientCaseId: number, actor: StaffActor, messagePublicId: string, reasonInput: string) {
  const { db, conversation, participant, message } = await requireStaffMessage(clientCaseId, actor, messagePublicId, false);
  const reason = reasonInput.trim();
  if (reason.length < 5) throw new TRPCError({ code: "BAD_REQUEST", message: "Please provide a clear report reason" });
  const publicId = randomUUID();
  const now = Date.now();
  await db.insert(clientChatMessageReports).values({ publicId, messageId: message.id, reporterParticipantId: participant.id, reason, status: "open", createdAt: now });
  await insertAudit(db, { conversationId: conversation.id, messageId: message.id, actorStaffUserId: actor.id, action: "message_reported" });
  return { publicId, status: "open" as const };
}

export async function listStaffMessageReports(clientCaseId: number, actor: StaffActor) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, false);
  if (!participant.canManage && actor.role !== "admin" && !isOwner(actor)) throw new TRPCError({ code: "FORBIDDEN", message: "Only conversation managers can review reports" });
  return db.select({ publicId: clientChatMessageReports.publicId, messagePublicId: clientChatMessages.publicId, senderName: clientChatMessages.senderNameSnapshot, reason: clientChatMessageReports.reason, status: clientChatMessageReports.status, createdAt: clientChatMessageReports.createdAt, reviewedAt: clientChatMessageReports.reviewedAt }).from(clientChatMessageReports)
    .innerJoin(clientChatMessages, eq(clientChatMessageReports.messageId, clientChatMessages.id))
    .where(eq(clientChatMessages.conversationId, conversation.id)).orderBy(desc(clientChatMessageReports.createdAt)).limit(100);
}

export async function resolveStaffMessageReport(clientCaseId: number, actor: StaffActor, reportPublicId: string, status: "reviewed" | "dismissed" | "actioned") {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, false);
  if (!participant.canManage && actor.role !== "admin" && !isOwner(actor)) throw new TRPCError({ code: "FORBIDDEN", message: "Only conversation managers can review reports" });
  const [report] = await db.select({ id: clientChatMessageReports.id, messageId: clientChatMessageReports.messageId }).from(clientChatMessageReports)
    .innerJoin(clientChatMessages, eq(clientChatMessageReports.messageId, clientChatMessages.id))
    .where(and(eq(clientChatMessageReports.publicId, reportPublicId), eq(clientChatMessages.conversationId, conversation.id))).limit(1);
  if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Message report not found" });
  const now = Date.now();
  await db.update(clientChatMessageReports).set({ status, reviewedByStaffUserId: actor.id, reviewedAt: now }).where(eq(clientChatMessageReports.id, report.id));
  await insertAudit(db, { conversationId: conversation.id, messageId: report.messageId, actorStaffUserId: actor.id, action: "message_report_reviewed", metadata: { reportPublicId, status } });
  await db.insert(clientChatEvents).values({ conversationId: conversation.id, eventType: "conversation_changed", entityId: report.messageId, actorParticipantId: participant.id, metadata: { reportReviewed: true }, createdAt: now });
  return { publicId: reportPublicId, status, reviewedAt: now };
}

export async function getStaffMessageInfo(clientCaseId: number, actor: StaffActor, messagePublicId: string) {
  const { db, conversation, participant, message } = await requireStaffMessage(clientCaseId, actor, messagePublicId, false);
  const [enriched] = await enrichStaffMessages(db, participant.id, [message]);
  const versions = await db.select({ versionNumber: clientChatMessageVersions.versionNumber, createdAt: clientChatMessageVersions.createdAt, editReason: clientChatMessageVersions.editReason })
    .from(clientChatMessageVersions).where(eq(clientChatMessageVersions.messageId, message.id)).orderBy(desc(clientChatMessageVersions.versionNumber));
  const receiptDetails = await listMessageReceiptDetails(db, conversation.id, message.id, message.senderParticipantId);
  return { message: enriched, receiptDetails, versions };
}

async function insertMessageMentions(executor: any, input: { conversationId: number; messageId: number; senderParticipantId: number; visibility: "client" | "internal"; participantPublicIds?: string[] }) {
  const requested = Array.from(new Set((input.participantPublicIds ?? []).filter(Boolean))).slice(0, 20);
  if (!requested.length) return 0;
  const predicates = [eq(clientChatParticipants.conversationId, input.conversationId), eq(clientChatParticipants.status, "active"), inArray(clientChatParticipants.publicId, requested)];
  if (input.visibility === "internal") predicates.push(eq(clientChatParticipants.participantType, "staff"), eq(clientChatParticipants.canViewInternal, true));
  const participants = await executor.select({ id: clientChatParticipants.id }).from(clientChatParticipants).where(and(...predicates));
  const now = Date.now();
  for (const mentioned of participants) {
    if (mentioned.id === input.senderParticipantId) continue;
    await executor.insert(clientChatMessageMentions).values({ messageId: input.messageId, participantId: mentioned.id, createdAt: now }).onDuplicateKeyUpdate({ set: { createdAt: now } });
  }
  return participants.filter((mentioned: { id: number }) => mentioned.id !== input.senderParticipantId).length;
}

export async function sendStaffMessage(input: {
  clientCaseId: number;
  actor: StaffActor;
  clientMessageId: string;
  body: string;
  visibility: "client" | "internal";
  replyToPublicId?: string | null;
  mentionParticipantPublicIds?: string[];
}) {
  const { db, conversation, participant } = await requireStaffConversation(input.clientCaseId, input.actor, true);
  if (input.visibility === "internal" && !participant.canViewInternal) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Internal notes are restricted to staff" });
  }
  const body = input.body.trim();
  if (!body) throw new TRPCError({ code: "BAD_REQUEST", message: "Message cannot be empty" });

  const result = await db.transaction(async tx => {
    const [duplicate] = await tx.select().from(clientChatMessages)
      .where(eq(clientChatMessages.clientMessageId, input.clientMessageId)).limit(1);
    if (duplicate) {
      if (duplicate.conversationId !== conversation.id || duplicate.senderParticipantId !== participant.id) {
        throw new TRPCError({ code: "CONFLICT", message: "Message retry identifier is already in use" });
      }
      return { ...duplicate, isDuplicate: true as const };
    }

    let replyToMessageId: number | null = null;
    if (input.replyToPublicId) {
      const [reply] = await tx.select({ id: clientChatMessages.id, conversationId: clientChatMessages.conversationId })
        .from(clientChatMessages).where(eq(clientChatMessages.publicId, input.replyToPublicId)).limit(1);
      if (!reply || reply.conversationId !== conversation.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reply target is not in this conversation" });
      }
      replyToMessageId = reply.id;
    }

    const now = Date.now();
    await tx.insert(clientChatMessages).values({
      publicId: randomUUID(),
      conversationId: conversation.id,
      clientMessageId: input.clientMessageId,
      senderParticipantId: participant.id,
      senderType: "staff",
      senderNameSnapshot: input.actor.name?.trim() || input.actor.email?.trim() || "ELEVAY Team",
      visibility: input.visibility,
      messageType: "text",
      body,
      replyToMessageId,
      createdAt: now,
      updatedAt: now,
    });
    const [created] = await tx.select().from(clientChatMessages)
      .where(eq(clientChatMessages.clientMessageId, input.clientMessageId)).limit(1);
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create message" });
    const messageId = created.id;
    await tx.update(clientChatConversations).set({
      lastMessageId: messageId,
      lastMessageAt: now,
      lastStaffMessageAt: now,
      waitingOn: input.visibility === "client" ? "client" : conversation.waitingOn,
      updatedAt: now,
    }).where(eq(clientChatConversations.id, conversation.id));
    await tx.insert(clientChatEvents).values({
      conversationId: conversation.id,
      eventType: "message_created",
      entityId: messageId,
      actorParticipantId: participant.id,
      metadata: { visibility: input.visibility },
      createdAt: now,
    });
    const mentionCount = await insertMessageMentions(tx, { conversationId: conversation.id, messageId, senderParticipantId: participant.id, visibility: input.visibility, participantPublicIds: input.mentionParticipantPublicIds });
    await insertAudit(tx, {
      conversationId: conversation.id,
      messageId,
      actorStaffUserId: input.actor.id,
      action: input.visibility === "internal" ? "internal_note_created" : "message_created",
      metadata: mentionCount ? { mentionCount } : undefined,
    });
    return { ...created, isDuplicate: false as const };
  });
  if (!result.isDuplicate) {
    if (input.visibility === "client") await notifyPortalChatParticipants({ clientCaseId: input.clientCaseId, conversationId: conversation.id, messagePublicId: result.publicId, kind: "message" });
    await notifyEmployeeChatParticipants({ clientCaseId: input.clientCaseId, conversationId: conversation.id, messagePublicId: result.publicId, kind: "message", senderStaffUserId: input.actor.id });
  }
  return result;
}

type ChatAttachmentUpload = {
  clientMessageId: string;
  body?: string | null;
  replyToPublicId?: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  base64: string;
  durationMs?: number | null;
};

async function assertConversationStorageQuota(db: Awaited<ReturnType<typeof requireDb>>, conversationId: number, nextFileBytes: number) {
  const [usage] = await db.select({ usedBytes: sql<number>`coalesce(sum(${clientChatAttachments.fileSize}), 0)` })
    .from(clientChatAttachments)
    .innerJoin(clientChatMessages, eq(clientChatAttachments.messageId, clientChatMessages.id))
    .where(eq(clientChatMessages.conversationId, conversationId));
  const usedBytes = Number(usage?.usedBytes ?? 0);
  if (usedBytes + nextFileBytes > CHAT_CONVERSATION_QUOTA_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "This conversation has reached its secure attachment storage quota" });
  return { usedBytes, remainingBytes: CHAT_CONVERSATION_QUOTA_BYTES - usedBytes };
}

export async function sendStaffAttachment(input: ChatAttachmentUpload & {
  clientCaseId: number;
  actor: StaffActor;
  visibility: "client" | "internal";
}) {
  const { db, conversation, participant } = await requireStaffConversation(input.clientCaseId, input.actor, true);
  if (input.visibility === "internal" && !participant.canViewInternal) throw new TRPCError({ code: "FORBIDDEN", message: "Internal notes are restricted to staff" });
  const [duplicate] = await db.select().from(clientChatMessages).where(eq(clientChatMessages.clientMessageId, input.clientMessageId)).limit(1);
  if (duplicate) {
    if (duplicate.conversationId !== conversation.id || duplicate.senderParticipantId !== participant.id) throw new TRPCError({ code: "CONFLICT", message: "Message retry identifier is already in use" });
    const enriched = (await enrichStaffMessages(db, participant.id, [duplicate]))[0];
    return enriched ? { ...enriched, isDuplicate: true as const } : null;
  }
  const media = decodeChatAttachment(input);
  await assertConversationStorageQuota(db, conversation.id, media.buffer.length);
  let replyToMessageId: number | null = null;
  if (input.replyToPublicId) {
    const [reply] = await db.select({ id: clientChatMessages.id, conversationId: clientChatMessages.conversationId }).from(clientChatMessages)
      .where(eq(clientChatMessages.publicId, input.replyToPublicId)).limit(1);
    if (!reply || reply.conversationId !== conversation.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Reply target is not in this conversation" });
    replyToMessageId = reply.id;
  }
  const messagePublicId = randomUUID();
  const attachmentPublicId = randomUUID();
  const storageKey = `client-chat/${conversation.publicId}/${messagePublicId}/${attachmentPublicId}.${media.extension}`;
  const stored = await storagePut(storageKey, media.buffer, media.mimeType);
  const now = Date.now();
  let createdMessageId = 0;
  await db.transaction(async tx => {
    await tx.insert(clientChatMessages).values({
      publicId: messagePublicId,
      conversationId: conversation.id,
      clientMessageId: input.clientMessageId,
      senderParticipantId: participant.id,
      senderType: "staff",
      senderNameSnapshot: input.actor.name?.trim() || input.actor.email?.trim() || "ELEVAY Team",
      visibility: input.visibility,
      messageType: media.messageType,
      body: input.body?.trim() || null,
      replyToMessageId,
      createdAt: now,
      updatedAt: now,
    });
    const [created] = await tx.select({ id: clientChatMessages.id }).from(clientChatMessages).where(eq(clientChatMessages.clientMessageId, input.clientMessageId)).limit(1);
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create attachment message" });
    createdMessageId = created.id;
    await tx.insert(clientChatAttachments).values({
      publicId: attachmentPublicId,
      messageId: created.id,
      fileKey: stored.key,
      originalFileName: media.originalFileName,
      safeFileName: media.safeFileName,
      mimeType: media.mimeType,
      fileSize: media.buffer.length,
      sha256: media.sha256,
      durationMs: input.durationMs ?? null,
      scanStatus: "clean",
      transcriptStatus: media.messageType === "voice" ? "pending" : "not_applicable",
      createdAt: now,
      updatedAt: now,
    });
    await tx.update(clientChatConversations).set({ lastMessageId: created.id, lastMessageAt: now, lastStaffMessageAt: now, waitingOn: input.visibility === "client" ? "client" : conversation.waitingOn, updatedAt: now }).where(eq(clientChatConversations.id, conversation.id));
    await tx.insert(clientChatEvents).values({ conversationId: conversation.id, eventType: "message_created", entityId: created.id, actorParticipantId: participant.id, metadata: { visibility: input.visibility, hasAttachment: true }, createdAt: now });
    await insertAudit(tx, { conversationId: conversation.id, messageId: created.id, actorStaffUserId: input.actor.id, action: input.visibility === "internal" ? "internal_attachment_created" : "attachment_created", metadata: { mimeType: media.mimeType, fileSize: media.buffer.length } });
  });
  if (media.messageType === "voice") await completeVoiceTranscription(db, conversation.id, createdMessageId, attachmentPublicId, stored.key, participant.id, input.visibility);
  const [created] = await db.select().from(clientChatMessages).where(eq(clientChatMessages.id, createdMessageId)).limit(1);
  const enriched = created ? (await enrichStaffMessages(db, participant.id, [created]))[0] : null;
  if (enriched) {
    if (input.visibility === "client") await notifyPortalChatParticipants({ clientCaseId: input.clientCaseId, conversationId: conversation.id, messagePublicId: enriched.publicId, kind: "attachment" });
    await notifyEmployeeChatParticipants({ clientCaseId: input.clientCaseId, conversationId: conversation.id, messagePublicId: enriched.publicId, kind: "attachment", senderStaffUserId: input.actor.id });
  }
  return enriched ? { ...enriched, isDuplicate: false as const } : null;
}

async function completeVoiceTranscription(
  db: Awaited<ReturnType<typeof requireDb>>,
  conversationId: number,
  messageId: number,
  attachmentPublicId: string,
  storageKey: string,
  participantId: number,
  visibility: "client" | "internal",
) {
  try {
    const access = await storageGet(storageKey);
    const transcript = await transcribeChatVoice(access.url);
    const now = Date.now();
    await db.update(clientChatAttachments).set({ ...transcript, transcriptStatus: "complete", updatedAt: now }).where(eq(clientChatAttachments.publicId, attachmentPublicId));
    await db.insert(clientChatEvents).values({ conversationId, eventType: "attachment_changed", entityId: messageId, actorParticipantId: participantId, metadata: { visibility, transcriptStatus: "complete" }, createdAt: now });
  } catch (error) {
    console.error("[ClientChat] Voice transcription failed", { attachmentPublicId, error: error instanceof Error ? error.message : "Unknown transcription error" });
    const now = Date.now();
    await db.update(clientChatAttachments).set({ transcriptStatus: "failed", updatedAt: now }).where(eq(clientChatAttachments.publicId, attachmentPublicId));
    await db.insert(clientChatEvents).values({ conversationId, eventType: "attachment_changed", entityId: messageId, actorParticipantId: participantId, metadata: { visibility, transcriptStatus: "failed" }, createdAt: now });
  }
}

export async function getStaffAttachmentAccess(clientCaseId: number, actor: StaffActor, attachmentPublicId: string) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, false);
  const [row] = await db.select({ attachment: clientChatAttachments, message: clientChatMessages }).from(clientChatAttachments)
    .innerJoin(clientChatMessages, eq(clientChatAttachments.messageId, clientChatMessages.id))
    .where(and(eq(clientChatAttachments.publicId, attachmentPublicId), eq(clientChatMessages.conversationId, conversation.id), eq(clientChatAttachments.scanStatus, "clean"))).limit(1);
  if (!row || (row.message.visibility === "internal" && !participant.canViewInternal)) throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
  const file = await storageGet(row.attachment.fileKey);
  await insertAudit(db, { conversationId: conversation.id, messageId: row.message.id, actorStaffUserId: actor.id, action: "attachment_accessed" });
  return { url: file.url, expiresSoon: true, fileName: row.attachment.originalFileName, mimeType: row.attachment.mimeType };
}

export async function saveStaffAttachmentToDocuments(clientCaseId: number, actor: StaffActor, attachmentPublicId: string, documentKey: string) {
  const { db, conversation } = await requireStaffConversation(clientCaseId, actor, true);
  const [row] = await db.select({ attachment: clientChatAttachments, message: clientChatMessages }).from(clientChatAttachments)
    .innerJoin(clientChatMessages, eq(clientChatAttachments.messageId, clientChatMessages.id))
    .where(and(eq(clientChatAttachments.publicId, attachmentPublicId), eq(clientChatMessages.conversationId, conversation.id), eq(clientChatAttachments.scanStatus, "clean"))).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
  const [document] = await db.select().from(clientDocuments).where(and(eq(clientDocuments.clientCaseId, clientCaseId), eq(clientDocuments.docKey, documentKey))).limit(1);
  if (!document) throw new TRPCError({ code: "BAD_REQUEST", message: "Select a valid Client Documentation checklist item" });
  if (row.attachment.savedClientDocumentId === document.id) return { saved: true, documentKey };
  const [application] = await db.select({ id: clientPortalApplications.id }).from(clientPortalApplications).where(and(eq(clientPortalApplications.clientCaseId, clientCaseId), isNull(clientPortalApplications.accessRevokedAt))).orderBy(desc(clientPortalApplications.isPrimary), desc(clientPortalApplications.id)).limit(1);
  if (!application) throw new TRPCError({ code: "CONFLICT", message: "Assign this folder to a Client Portal account before saving chat files to Documents" });
  const now = Date.now();
  await db.transaction(async tx => {
    const [existing] = await tx.select({ id: clientPortalDocuments.id }).from(clientPortalDocuments).where(and(eq(clientPortalDocuments.portalApplicationId, application.id), eq(clientPortalDocuments.fileKey, row.attachment.fileKey), eq(clientPortalDocuments.clientDocumentId, document.id))).limit(1);
    if (!existing) await tx.insert(clientPortalDocuments).values({ publicId: randomUUID(), portalApplicationId: application.id, clientDocumentId: document.id, documentType: document.docName, fileName: row.attachment.originalFileName, fileKey: row.attachment.fileKey, mimeType: row.attachment.mimeType, fileSize: row.attachment.fileSize, source: "staff", visibleToClient: row.message.visibility === "client", reviewStatus: "submitted", uploadedByStaffUserId: actor.id, sourceChatMessageId: row.message.id, sourceChatAttachmentId: row.attachment.id });
    await tx.update(clientChatAttachments).set({ savedClientDocumentId: document.id, updatedAt: now }).where(eq(clientChatAttachments.id, row.attachment.id));
    const notificationClientMessageId = `system:docs-save:${row.attachment.publicId}:${document.id}`;
    await tx.insert(clientChatMessages).values({ publicId: randomUUID(), conversationId: conversation.id, clientMessageId: notificationClientMessageId, senderParticipantId: null, senderType: "system", senderNameSnapshot: "ELEVAY System", visibility: "internal", messageType: "system", body: `Secure chat attachment saved to ${document.docName}.`, createdAt: now, updatedAt: now }).onDuplicateKeyUpdate({ set: { updatedAt: now } });
    const [notificationMessage] = await tx.select({ id: clientChatMessages.id }).from(clientChatMessages).where(eq(clientChatMessages.clientMessageId, notificationClientMessageId)).limit(1);
    if (notificationMessage) await tx.insert(clientChatEvents).values({ conversationId: conversation.id, eventType: "message_created", entityId: notificationMessage.id, actorParticipantId: null, metadata: { visibility: "internal", savedToDocuments: true }, createdAt: now });
    await insertAudit(tx, { conversationId: conversation.id, messageId: row.message.id, actorStaffUserId: actor.id, action: "attachment_saved_to_documents", metadata: { documentKey } });
  });
  return { saved: true, documentKey };
}

export async function listStaffDocumentTargets(clientCaseId: number, actor: StaffActor) {
  const { db } = await requireStaffConversation(clientCaseId, actor, false);
  return db.select({ documentKey: clientDocuments.docKey, documentName: clientDocuments.docName, category: clientDocuments.category })
    .from(clientDocuments).where(eq(clientDocuments.clientCaseId, clientCaseId)).orderBy(asc(clientDocuments.category), asc(clientDocuments.id));
}

export async function pollStaffConversation(clientCaseId: number, actor: StaffActor, afterEventId = 0) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, false);
  const now = Date.now();
  const events = await db
    .select()
    .from(clientChatEvents)
    .where(and(eq(clientChatEvents.conversationId, conversation.id), gt(clientChatEvents.id, afterEventId)))
    .orderBy(asc(clientChatEvents.id))
    .limit(EVENT_LIMIT);

  const messageIds = Array.from(new Set(events.filter(event => event.eventType === "message_created" && event.entityId).map(event => event.entityId!)));
  let messages = messageIds.length
    ? await db.select().from(clientChatMessages).where(inArray(clientChatMessages.id, messageIds)).orderBy(asc(clientChatMessages.id))
    : [];
  if (!participant.canViewInternal) messages = messages.filter(message => message.visibility === "client");

  for (const message of messages) {
    if (message.senderParticipantId === participant.id) continue;
    await markParticipantDelivered(db, { conversationId: conversation.id, messageId: message.id, participantId: participant.id, now });
  }
  await db.update(clientChatParticipants).set({ lastSeenAt: now, updatedAt: now })
    .where(eq(clientChatParticipants.id, participant.id));

  return {
    events,
    messages,
    cursor: events.length ? Number(events[events.length - 1].id) : afterEventId,
    serverTime: now,
    typingParticipantIds: (await db.select({ id: clientChatParticipants.id }).from(clientChatParticipants)
      .where(and(
        eq(clientChatParticipants.conversationId, conversation.id),
        eq(clientChatParticipants.status, "active"),
        gt(clientChatParticipants.typingExpiresAt, now),
        ne(clientChatParticipants.id, participant.id),
      ))).map(row => row.id),
  };
}

export async function updateStaffTyping(clientCaseId: number, actor: StaffActor, typing: boolean) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, true);
  const now = Date.now();
  await db.update(clientChatParticipants).set({ typingExpiresAt: typing ? now + TYPING_TTL_MS : null, lastSeenAt: now, updatedAt: now })
    .where(eq(clientChatParticipants.id, participant.id));
  await db.insert(clientChatEvents).values({
    conversationId: conversation.id,
    eventType: "typing_changed",
    actorParticipantId: participant.id,
    metadata: { typing },
    createdAt: now,
  });
  return { typing, expiresAt: typing ? now + TYPING_TTL_MS : null };
}

async function issueAudioPlaybackProof(
  db: Awaited<ReturnType<typeof requireDb>>,
  input: { conversationId: number; participantId: number; messagePublicId: string; clientVisibleOnly: boolean },
) {
  const predicates = [
    eq(clientChatMessages.publicId, input.messagePublicId),
    eq(clientChatMessages.conversationId, input.conversationId),
    isNull(clientChatMessages.deletedAt),
  ];
  if (input.clientVisibleOnly) predicates.push(eq(clientChatMessages.visibility, "client"));
  const [message] = await db.select().from(clientChatMessages).where(and(...predicates)).limit(1);
  if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
  if (message.senderParticipantId === input.participantId) throw new TRPCError({ code: "BAD_REQUEST", message: "A sender cannot listen-receipt their own message" });
  if (!["voice", "audio"].includes(message.messageType)) throw new TRPCError({ code: "BAD_REQUEST", message: "Only audio messages can start playback tracking" });
  const [attachment] = await db.select({ durationMs: clientChatAttachments.durationMs }).from(clientChatAttachments).where(and(
    eq(clientChatAttachments.messageId, message.id),
    eq(clientChatAttachments.scanStatus, "clean"),
  )).limit(1);
  if (!attachment) throw new TRPCError({ code: "NOT_FOUND", message: "Audio attachment not found" });
  const startedAt = Date.now();
  const durationMs = Math.max(500, Math.min(Number(attachment.durationMs || 1_000), 6 * 60 * 60_000));
  return {
    playbackToken: createPlaybackProof({
      version: 1,
      conversationScope: playbackScope("conversation", input.conversationId),
      messageScope: playbackScope("message", message.id),
      participantScope: playbackScope("participant", input.participantId),
      startedAt,
      durationMs,
    }),
    minimumCompleteAt: startedAt + Math.max(500, Math.floor(durationMs / FASTEST_SUPPORTED_PLAYBACK_RATE) - PLAYBACK_COMPLETION_TOLERANCE_MS),
  };
}

export async function startStaffAudioPlayback(clientCaseId: number, actor: StaffActor, messagePublicId: string) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, false);
  return issueAudioPlaybackProof(db, { conversationId: conversation.id, participantId: participant.id, messagePublicId, clientVisibleOnly: false });
}

export async function markStaffRead(clientCaseId: number, actor: StaffActor, messagePublicId: string, listened = false, playbackToken?: string | null) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, false);
  const [message] = await db.select().from(clientChatMessages)
    .where(and(eq(clientChatMessages.publicId, messagePublicId), eq(clientChatMessages.conversationId, conversation.id))).limit(1);
  if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
  if (message.senderParticipantId === participant.id) return { readAt: null, listenedAt: null, ownMessage: true };
  if (listened && !["voice", "audio"].includes(message.messageType)) throw new TRPCError({ code: "BAD_REQUEST", message: "Only audio messages can be marked as listened" });
  if (listened) assertCompletedPlayback(playbackToken, { conversationId: conversation.id, messageId: message.id, participantId: participant.id });
  const now = Date.now();
  const [existing] = await db.select({
    deliveredAt: clientChatMessageReceipts.deliveredAt,
    readAt: clientChatMessageReceipts.readAt,
    listenedAt: clientChatMessageReceipts.listenedAt,
  }).from(clientChatMessageReceipts).where(and(
    eq(clientChatMessageReceipts.messageId, message.id),
    eq(clientChatMessageReceipts.participantId, participant.id),
  )).limit(1);
  const deliveredAt = existing?.deliveredAt ?? now;
  const readAt = existing?.readAt ?? now;
  const listenedAt = existing?.listenedAt ?? (listened ? now : null);
  await db.insert(clientChatMessageReceipts).values({
    messageId: message.id,
    participantId: participant.id,
    deliveredAt,
    readAt,
    listenedAt,
    updatedAt: now,
  }).onDuplicateKeyUpdate({ set: { deliveredAt, readAt, listenedAt, updatedAt: now } });
  await db.update(clientChatParticipants).set({ lastReadMessageId: message.id, lastSeenAt: now, updatedAt: now })
    .where(eq(clientChatParticipants.id, participant.id));
  if (!existing?.readAt || (listened && !existing?.listenedAt)) {
    await db.insert(clientChatEvents).values({
      conversationId: conversation.id,
      eventType: "receipt_changed",
      entityId: message.id,
      actorParticipantId: participant.id,
      metadata: { read: true, listened: Boolean(listenedAt) },
      createdAt: now,
    });
  }
  return { readAt, listenedAt, ownMessage: false };
}

export async function upsertStaffDraft(clientCaseId: number, actor: StaffActor, body: string, replyToMessageId?: number | null) {
  const { db, conversation, participant } = await requireStaffConversation(clientCaseId, actor, false);
  const now = Date.now();
  await db.insert(clientChatDrafts).values({ conversationId: conversation.id, participantId: participant.id, body, replyToMessageId: replyToMessageId ?? null, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { body, replyToMessageId: replyToMessageId ?? null, updatedAt: now } });
  return { savedAt: now };
}

async function ensureLegacyPortalMessages(
  db: any,
  conversationId: number,
  applicationId: number,
  portalParticipantId: number,
) {
  const legacyRows = await db.select().from(clientPortalMessages)
    .where(eq(clientPortalMessages.portalApplicationId, applicationId))
    .orderBy(asc(clientPortalMessages.createdAt));
  if (!legacyRows.length) return 0;

  const staffParticipantByUser = new Map<number, number>();
  let migrated = 0;
  for (const legacy of legacyRows) {
    const [exists] = await db.select({ id: clientChatMessages.id }).from(clientChatMessages)
      .where(eq(clientChatMessages.legacyPortalMessageId, legacy.id)).limit(1);
    if (exists) continue;

    let senderParticipantId = portalParticipantId;
    if (legacy.senderType === "staff" && legacy.senderStaffUserId) {
      if (!staffParticipantByUser.has(legacy.senderStaffUserId)) {
        const [existingStaff] = await db.select({ id: clientChatParticipants.id }).from(clientChatParticipants)
          .where(and(
            eq(clientChatParticipants.conversationId, conversationId),
            eq(clientChatParticipants.staffUserId, legacy.senderStaffUserId),
          )).limit(1);
        if (existingStaff) staffParticipantByUser.set(legacy.senderStaffUserId, existingStaff.id);
        else {
          const now = Date.now();
          await db.insert(clientChatParticipants).values({
            publicId: randomUUID(),
            conversationId,
            participantType: "staff",
            staffUserId: legacy.senderStaffUserId,
            role: "observer",
            status: "left",
            canSend: false,
            canViewInternal: true,
            canManage: false,
            joinedAt: now,
            leftAt: now,
            createdAt: now,
            updatedAt: now,
          }).onDuplicateKeyUpdate({ set: { updatedAt: now } });
          const [historicalStaff] = await db.select({ id: clientChatParticipants.id }).from(clientChatParticipants)
            .where(and(
              eq(clientChatParticipants.conversationId, conversationId),
              eq(clientChatParticipants.staffUserId, legacy.senderStaffUserId),
            )).limit(1);
          if (!historicalStaff) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to preserve historical sender" });
          staffParticipantByUser.set(legacy.senderStaffUserId, historicalStaff.id);
        }
      }
      senderParticipantId = staffParticipantByUser.get(legacy.senderStaffUserId)!;
    }

    const createdAt = legacy.createdAt instanceof Date ? legacy.createdAt.getTime() : Number(legacy.createdAt || Date.now());
    await db.insert(clientChatMessages).values({
      publicId: legacy.publicId,
      conversationId,
      clientMessageId: `legacy-portal:${legacy.id}`,
      legacyPortalMessageId: legacy.id,
      senderParticipantId,
      senderType: legacy.senderType,
      senderNameSnapshot: legacy.senderType === "client" ? "Client" : "ELEVAY Team",
      visibility: legacy.visibility,
      messageType: "text",
      body: legacy.body,
      createdAt,
      updatedAt: createdAt,
    }).onDuplicateKeyUpdate({ set: { legacyPortalMessageId: legacy.id } });
    const [migratedMessage] = await db.select({ id: clientChatMessages.id }).from(clientChatMessages)
      .where(eq(clientChatMessages.legacyPortalMessageId, legacy.id)).limit(1);
    if (migratedMessage) {
      const messageId = migratedMessage.id;
      await db.insert(clientChatEvents).values({
        conversationId,
        eventType: "message_created",
        entityId: messageId,
        actorParticipantId: senderParticipantId,
        metadata: { migratedFrom: "client_portal_messages", visibility: legacy.visibility },
        createdAt,
      });
      migrated += 1;
    }
  }
  if (migrated > 0) {
    const [lastMessage] = await db.select().from(clientChatMessages)
      .where(eq(clientChatMessages.conversationId, conversationId))
      .orderBy(desc(clientChatMessages.createdAt), desc(clientChatMessages.id)).limit(1);
    if (lastMessage) {
      await db.update(clientChatConversations).set({
        lastMessageId: lastMessage.id,
        lastMessageAt: lastMessage.createdAt,
        lastClientMessageAt: lastMessage.senderType === "client" ? lastMessage.createdAt : undefined,
        lastStaffMessageAt: lastMessage.senderType === "staff" ? lastMessage.createdAt : undefined,
        waitingOn: lastMessage.visibility === "client" ? (lastMessage.senderType === "client" ? "staff" : "client") : "none",
        updatedAt: Date.now(),
      }).where(eq(clientChatConversations.id, conversationId));
    }
  }
  return migrated;
}

export async function requirePortalConversation(applicationPublicId: string, portalUserId: number, write = false) {
  const db = await requireDb();
  const [owned] = await db.select({ application: clientPortalApplications, clientCase: clientCases })
    .from(clientPortalApplications)
    .innerJoin(clientCases, eq(clientPortalApplications.clientCaseId, clientCases.id))
    .where(and(
      eq(clientPortalApplications.publicId, applicationPublicId),
      eq(clientPortalApplications.portalUserId, portalUserId),
      isNull(clientPortalApplications.accessRevokedAt),
    )).limit(1);
  if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });

  const conversation = await ensureClientChatConversationForCase(owned.clientCase.id, owned.clientCase.userId);
  if (write && conversation.status !== "active") throw new TRPCError({ code: "CONFLICT", message: "This conversation is not accepting new messages" });
  const now = Date.now();
  await db.insert(clientChatParticipants).values({
    publicId: randomUUID(),
    conversationId: conversation.id,
    participantType: "portal",
    portalUserId,
    role: "client",
    status: "active",
    canSend: true,
    canViewInternal: false,
    canManage: false,
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  }).onDuplicateKeyUpdate({ set: { status: "active", canSend: true, leftAt: null, updatedAt: now } });
  const [participant] = await db.select().from(clientChatParticipants).where(and(
    eq(clientChatParticipants.conversationId, conversation.id),
    eq(clientChatParticipants.portalUserId, portalUserId),
    eq(clientChatParticipants.status, "active"),
  )).limit(1);
  if (!participant || (write && !participant.canSend)) throw new TRPCError({ code: "FORBIDDEN", message: "Chat access is unavailable" });
  await ensureLegacyPortalMessages(db, conversation.id, owned.application.id, participant.id);
  return { db, conversation, participant, owned };
}

export async function getPortalChatPreferences(applicationPublicId: string, portalUserId: number) {
  const { participant, conversation } = await requirePortalConversation(applicationPublicId, portalUserId, false);
  const preferences = participant.notificationPreferences && typeof participant.notificationPreferences === "object" ? participant.notificationPreferences as Record<string, boolean> : {};
  return { muteUntil: participant.muteUntil, inApp: preferences.inApp !== false, push: preferences.push !== false, conversationStatus: conversation.status };
}

export async function updatePortalChatPreferences(applicationPublicId: string, portalUserId: number, input: { muteUntil: number | null; inApp: boolean; push: boolean }) {
  const { db, conversation, participant } = await requirePortalConversation(applicationPublicId, portalUserId, false);
  const now = Date.now();
  const muteUntil = input.muteUntil != null && input.muteUntil > now ? input.muteUntil : null;
  const notificationPreferences = { inApp: input.inApp, email: false, push: input.push };
  await db.update(clientChatParticipants).set({ muteUntil, notificationPreferences, updatedAt: now }).where(eq(clientChatParticipants.id, participant.id));
  await insertAudit(db, { conversationId: conversation.id, actorPortalUserId: portalUserId, action: "notification_preferences_changed", metadata: { muted: Boolean(muteUntil), inApp: input.inApp, push: input.push } });
  await db.insert(clientChatEvents).values({ conversationId: conversation.id, eventType: "participant_changed", entityId: participant.id, actorParticipantId: participant.id, metadata: { preferenceChanged: true }, createdAt: now });
  return { muteUntil, inApp: input.inApp, push: input.push, conversationStatus: conversation.status };
}

export async function listPortalConversationMessages(applicationPublicId: string, portalUserId: number, beforePublicId?: string, limit = 50) {
  const { db, conversation, participant } = await requirePortalConversation(applicationPublicId, portalUserId, false);
  const hidden = await db.select({ messageId: clientChatHiddenMessages.messageId }).from(clientChatHiddenMessages)
    .where(eq(clientChatHiddenMessages.participantId, participant.id));
  const hiddenIds = new Set(hidden.map(row => row.messageId));
  let beforeId: number | undefined;
  if (beforePublicId) {
    const [before] = await db.select({ id: clientChatMessages.id }).from(clientChatMessages).where(and(
      eq(clientChatMessages.publicId, beforePublicId),
      eq(clientChatMessages.conversationId, conversation.id),
      eq(clientChatMessages.visibility, "client"),
    )).limit(1);
    if (!before) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid message cursor" });
    beforeId = before.id;
  }
  const predicates = [eq(clientChatMessages.conversationId, conversation.id), eq(clientChatMessages.visibility, "client")];
  if (beforeId) predicates.push(lt(clientChatMessages.id, beforeId));
  const rows = await db.select().from(clientChatMessages).where(and(...predicates)).orderBy(desc(clientChatMessages.id)).limit(Math.min(Math.max(limit, 1), MESSAGE_LIMIT));
  const now = Date.now();
  for (const message of rows) {
    if (message.senderParticipantId === participant.id) continue;
    await markParticipantDelivered(db, { conversationId: conversation.id, messageId: message.id, participantId: participant.id, now });
  }
  return projectPortalMessages(db, rows.filter(row => !hiddenIds.has(row.id)).reverse(), participant.id);
}

export async function getPortalMessageInfo(applicationPublicId: string, portalUserId: number, messagePublicId: string) {
  const { db, conversation, participant } = await requirePortalConversation(applicationPublicId, portalUserId, false);
  const [message] = await db.select().from(clientChatMessages).where(and(
    eq(clientChatMessages.publicId, messagePublicId),
    eq(clientChatMessages.conversationId, conversation.id),
    eq(clientChatMessages.visibility, "client"),
  )).limit(1);
  if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
  const [projected] = await projectPortalMessages(db, [message], participant.id);
  const receiptDetails = message.senderType === "client" && message.senderParticipantId === participant.id
    ? (await listMessageReceiptDetails(db, conversation.id, message.id, message.senderParticipantId))
      .filter(receipt => receipt.participantType === "staff")
      .map(receipt => ({
        participantPublicId: receipt.participantPublicId,
        participantType: receipt.participantType,
        displayName: receipt.displayName,
        deliveredAt: receipt.deliveredAt,
        readAt: receipt.readAt,
        listenedAt: receipt.listenedAt,
      }))
    : [];
  return { message: projected, receiptDetails, versions: [] };
}

async function projectPortalMessages(db: Awaited<ReturnType<typeof requireDb>>, rows: Array<typeof clientChatMessages.$inferSelect>, viewerParticipantId?: number) {
  const publicIdById = new Map(rows.map(row => [row.id, row.publicId]));
  const messageIds = rows.map(row => row.id);
  const receiptMessageIds = rows.filter(row => row.senderType === "client" && row.senderParticipantId === viewerParticipantId).map(row => row.id);
  const [attachmentRows, receiptRows] = await Promise.all([
    messageIds.length ? db.select().from(clientChatAttachments).where(and(
      inArray(clientChatAttachments.messageId, messageIds),
      eq(clientChatAttachments.scanStatus, "clean"),
    )) : [],
    receiptMessageIds.length ? db.select({
      messageId: clientChatMessageReceipts.messageId,
      deliveredAt: clientChatMessageReceipts.deliveredAt,
      readAt: clientChatMessageReceipts.readAt,
      listenedAt: clientChatMessageReceipts.listenedAt,
    }).from(clientChatMessageReceipts)
      .innerJoin(clientChatParticipants, eq(clientChatMessageReceipts.participantId, clientChatParticipants.id))
      .where(and(
        inArray(clientChatMessageReceipts.messageId, receiptMessageIds),
        eq(clientChatParticipants.participantType, "staff"),
      )) : [],
  ]);
  const attachmentMap = new Map<number, Array<{
    publicId: string;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    durationMs: number | null;
    transcriptStatus: string;
    transcriptOriginal: string | null;
    transcriptArabic: string | null;
    transcriptEnglish: string | null;
  }>>();
  for (const attachment of attachmentRows) {
    const current = attachmentMap.get(attachment.messageId) ?? [];
    current.push({
      publicId: attachment.publicId,
      originalFileName: attachment.originalFileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      durationMs: attachment.durationMs,
      transcriptStatus: attachment.transcriptStatus,
      transcriptOriginal: attachment.transcriptOriginal,
      transcriptArabic: attachment.transcriptArabic,
      transcriptEnglish: attachment.transcriptEnglish,
    });
    attachmentMap.set(attachment.messageId, current);
  }
  const receiptMap = new Map<number, { delivered: number; read: number; listened: number }>();
  for (const receipt of receiptRows) {
    const aggregate = receiptMap.get(receipt.messageId) ?? { delivered: 0, read: 0, listened: 0 };
    if (receipt.deliveredAt) aggregate.delivered += 1;
    if (receipt.readAt) aggregate.read += 1;
    if (receipt.listenedAt) aggregate.listened += 1;
    receiptMap.set(receipt.messageId, aggregate);
  }
  return rows.map(row => ({
    publicId: row.publicId,
    senderType: row.senderType,
    senderName: row.senderNameSnapshot,
    isMine: viewerParticipantId != null && row.senderParticipantId === viewerParticipantId,
    messageType: row.messageType,
    body: row.body,
    attachments: row.deletedAt ? [] : attachmentMap.get(row.id) ?? [],
    replyToPublicId: row.replyToMessageId ? publicIdById.get(row.replyToMessageId) ?? null : null,
    isImportant: row.isImportant,
    isPinned: row.isPinned,
    receiptSummary: row.senderType === "client" && row.senderParticipantId === viewerParticipantId
      ? receiptMap.get(row.id) ?? { delivered: 0, read: 0, listened: 0 }
      : { delivered: 0, read: 0, listened: 0 },
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function sendPortalConversationMessage(input: {
  applicationPublicId: string;
  portalUserId: number;
  senderName: string;
  clientMessageId: string;
  body: string;
  replyToPublicId?: string | null;
}) {
  const { db, conversation, participant, owned } = await requirePortalConversation(input.applicationPublicId, input.portalUserId, true);
  const body = input.body.trim();
  if (!body) throw new TRPCError({ code: "BAD_REQUEST", message: "Message cannot be empty" });
  const result = await db.transaction(async tx => {
    const [duplicate] = await tx.select().from(clientChatMessages).where(eq(clientChatMessages.clientMessageId, input.clientMessageId)).limit(1);
    if (duplicate) {
      if (duplicate.conversationId !== conversation.id || duplicate.senderParticipantId !== participant.id) {
        throw new TRPCError({ code: "CONFLICT", message: "Message retry identifier is already in use" });
      }
      return { ...duplicate, isDuplicate: true };
    }
    let replyToMessageId: number | null = null;
    if (input.replyToPublicId) {
      const [reply] = await tx.select({ id: clientChatMessages.id, conversationId: clientChatMessages.conversationId, visibility: clientChatMessages.visibility })
        .from(clientChatMessages).where(eq(clientChatMessages.publicId, input.replyToPublicId)).limit(1);
      if (!reply || reply.conversationId !== conversation.id || reply.visibility !== "client") throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid reply target" });
      replyToMessageId = reply.id;
    }
    const now = Date.now();
    await tx.insert(clientChatMessages).values({
      publicId: randomUUID(),
      conversationId: conversation.id,
      clientMessageId: input.clientMessageId,
      senderParticipantId: participant.id,
      senderType: "client",
      senderNameSnapshot: input.senderName.trim() || "Client",
      visibility: "client",
      messageType: "text",
      body,
      replyToMessageId,
      createdAt: now,
      updatedAt: now,
    });
    const [created] = await tx.select().from(clientChatMessages)
      .where(eq(clientChatMessages.clientMessageId, input.clientMessageId)).limit(1);
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create message" });
    const messageId = created.id;
    await tx.update(clientChatConversations).set({ lastMessageId: messageId, lastMessageAt: now, lastClientMessageAt: now, waitingOn: "staff", updatedAt: now })
      .where(eq(clientChatConversations.id, conversation.id));
    await tx.insert(clientChatEvents).values({ conversationId: conversation.id, eventType: "message_created", entityId: messageId, actorParticipantId: participant.id, metadata: { visibility: "client" }, createdAt: now });
    await insertAudit(tx, { conversationId: conversation.id, messageId, actorPortalUserId: input.portalUserId, action: "message_created" });
    return { ...created, isDuplicate: false };
  });
  if (!result.isDuplicate) await notifyEmployeeChatParticipants({ clientCaseId: owned.clientCase.id, conversationId: conversation.id, messagePublicId: result.publicId, kind: "message" });
  return result;
}

export async function sendPortalConversationAttachment(input: ChatAttachmentUpload & {
  applicationPublicId: string;
  portalUserId: number;
  senderName: string;
}) {
  const { db, conversation, participant, owned } = await requirePortalConversation(input.applicationPublicId, input.portalUserId, true);
  const [duplicate] = await db.select().from(clientChatMessages).where(eq(clientChatMessages.clientMessageId, input.clientMessageId)).limit(1);
  if (duplicate) {
    if (duplicate.conversationId !== conversation.id || duplicate.senderParticipantId !== participant.id) throw new TRPCError({ code: "CONFLICT", message: "Message retry identifier is already in use" });
    const [projected] = await projectPortalMessages(db, [duplicate], participant.id);
    return projected ? { ...projected, isDuplicate: true } : null;
  }
  const media = decodeChatAttachment(input);
  await assertConversationStorageQuota(db, conversation.id, media.buffer.length);
  let replyToMessageId: number | null = null;
  if (input.replyToPublicId) {
    const [reply] = await db.select({ id: clientChatMessages.id, conversationId: clientChatMessages.conversationId, visibility: clientChatMessages.visibility }).from(clientChatMessages)
      .where(eq(clientChatMessages.publicId, input.replyToPublicId)).limit(1);
    if (!reply || reply.conversationId !== conversation.id || reply.visibility !== "client") throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid reply target" });
    replyToMessageId = reply.id;
  }
  const messagePublicId = randomUUID();
  const attachmentPublicId = randomUUID();
  const storageKey = `client-chat/${conversation.publicId}/${messagePublicId}/${attachmentPublicId}.${media.extension}`;
  const stored = await storagePut(storageKey, media.buffer, media.mimeType);
  const now = Date.now();
  let createdMessageId = 0;
  await db.transaction(async tx => {
    await tx.insert(clientChatMessages).values({ publicId: messagePublicId, conversationId: conversation.id, clientMessageId: input.clientMessageId, senderParticipantId: participant.id, senderType: "client", senderNameSnapshot: input.senderName.trim() || "Client", visibility: "client", messageType: media.messageType, body: input.body?.trim() || null, replyToMessageId, createdAt: now, updatedAt: now });
    const [created] = await tx.select({ id: clientChatMessages.id }).from(clientChatMessages).where(eq(clientChatMessages.clientMessageId, input.clientMessageId)).limit(1);
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create attachment message" });
    createdMessageId = created.id;
    await tx.insert(clientChatAttachments).values({ publicId: attachmentPublicId, messageId: created.id, fileKey: stored.key, originalFileName: media.originalFileName, safeFileName: media.safeFileName, mimeType: media.mimeType, fileSize: media.buffer.length, sha256: media.sha256, durationMs: input.durationMs ?? null, scanStatus: "clean", transcriptStatus: media.messageType === "voice" ? "pending" : "not_applicable", createdAt: now, updatedAt: now });
    await tx.update(clientChatConversations).set({ lastMessageId: created.id, lastMessageAt: now, lastClientMessageAt: now, waitingOn: "staff", updatedAt: now }).where(eq(clientChatConversations.id, conversation.id));
    await tx.insert(clientChatEvents).values({ conversationId: conversation.id, eventType: "message_created", entityId: created.id, actorParticipantId: participant.id, metadata: { visibility: "client", hasAttachment: true }, createdAt: now });
    await insertAudit(tx, { conversationId: conversation.id, messageId: created.id, actorPortalUserId: input.portalUserId, action: "attachment_created", metadata: { mimeType: media.mimeType, fileSize: media.buffer.length } });
  });
  if (media.messageType === "voice") await completeVoiceTranscription(db, conversation.id, createdMessageId, attachmentPublicId, stored.key, participant.id, "client");
  const [created] = await db.select().from(clientChatMessages).where(eq(clientChatMessages.id, createdMessageId)).limit(1);
  const [projected] = created ? await projectPortalMessages(db, [created], participant.id) : [];
  if (projected) await notifyEmployeeChatParticipants({ clientCaseId: owned.clientCase.id, conversationId: conversation.id, messagePublicId: projected.publicId, kind: "attachment" });
  return projected ? { ...projected, isDuplicate: false } : null;
}

export async function getPortalAttachmentAccess(applicationPublicId: string, portalUserId: number, attachmentPublicId: string) {
  const { db, conversation } = await requirePortalConversation(applicationPublicId, portalUserId, false);
  const [row] = await db.select({ attachment: clientChatAttachments, message: clientChatMessages }).from(clientChatAttachments)
    .innerJoin(clientChatMessages, eq(clientChatAttachments.messageId, clientChatMessages.id))
    .where(and(eq(clientChatAttachments.publicId, attachmentPublicId), eq(clientChatMessages.conversationId, conversation.id), eq(clientChatMessages.visibility, "client"), eq(clientChatAttachments.scanStatus, "clean"))).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
  const file = await storageGet(row.attachment.fileKey);
  await insertAudit(db, { conversationId: conversation.id, messageId: row.message.id, actorPortalUserId: portalUserId, action: "attachment_accessed" });
  return { url: file.url, expiresSoon: true, fileName: row.attachment.originalFileName, mimeType: row.attachment.mimeType };
}

export async function pollPortalConversation(applicationPublicId: string, portalUserId: number, afterEventId = 0) {
  const { db, conversation, participant } = await requirePortalConversation(applicationPublicId, portalUserId, false);
  const now = Date.now();
  const events = await db.select().from(clientChatEvents).where(and(
    eq(clientChatEvents.conversationId, conversation.id),
    gt(clientChatEvents.id, afterEventId),
  )).orderBy(asc(clientChatEvents.id)).limit(EVENT_LIMIT);
  const eventMessageIds = Array.from(new Set(events.filter(event => event.eventType === "message_created" && event.entityId).map(event => event.entityId!)));
  const eventMessages = eventMessageIds.length
    ? await db.select().from(clientChatMessages).where(inArray(clientChatMessages.id, eventMessageIds)).orderBy(asc(clientChatMessages.id))
    : [];
  const visibleMessageIds = new Set(eventMessages.filter(message => message.visibility === "client").map(message => message.id));
  const visibleEvents = events.filter(event => event.eventType !== "message_created" || (event.entityId != null && visibleMessageIds.has(event.entityId)));
  const messageIds = Array.from(visibleMessageIds);
  const messages = messageIds.length
    ? await db.select().from(clientChatMessages).where(and(inArray(clientChatMessages.id, messageIds), eq(clientChatMessages.visibility, "client"))).orderBy(asc(clientChatMessages.id))
    : [];
  for (const message of messages) {
    if (message.senderParticipantId === participant.id) continue;
    await markParticipantDelivered(db, { conversationId: conversation.id, messageId: message.id, participantId: participant.id, now });
  }
  await db.update(clientChatParticipants).set({ lastSeenAt: now, updatedAt: now }).where(eq(clientChatParticipants.id, participant.id));
  const typingStaffCount = (await db.select({ id: clientChatParticipants.id }).from(clientChatParticipants).where(and(
    eq(clientChatParticipants.conversationId, conversation.id),
    eq(clientChatParticipants.participantType, "staff"),
    eq(clientChatParticipants.status, "active"),
    gt(clientChatParticipants.typingExpiresAt, now),
  ))).length;
  const publicMessages = await projectPortalMessages(db, messages, participant.id);
  const publicIdByMessageId = new Map(messages.map(message => [message.id, message.publicId]));
  return {
    events: visibleEvents.map(event => ({
      eventType: event.eventType,
      entityPublicId: event.entityId ? publicIdByMessageId.get(event.entityId) ?? null : null,
      createdAt: event.createdAt,
    })),
    messages: publicMessages,
    cursor: events.length ? Number(events[events.length - 1].id) : afterEventId,
    serverTime: now,
    typingStaffCount,
  };
}

export async function updatePortalTyping(applicationPublicId: string, portalUserId: number, typing: boolean) {
  const { db, conversation, participant } = await requirePortalConversation(applicationPublicId, portalUserId, true);
  const now = Date.now();
  await db.update(clientChatParticipants).set({ typingExpiresAt: typing ? now + TYPING_TTL_MS : null, lastSeenAt: now, updatedAt: now }).where(eq(clientChatParticipants.id, participant.id));
  await db.insert(clientChatEvents).values({ conversationId: conversation.id, eventType: "typing_changed", actorParticipantId: participant.id, metadata: { typing }, createdAt: now });
  return { typing, expiresAt: typing ? now + TYPING_TTL_MS : null };
}

export async function startPortalAudioPlayback(applicationPublicId: string, portalUserId: number, messagePublicId: string) {
  const { db, conversation, participant } = await requirePortalConversation(applicationPublicId, portalUserId, false);
  return issueAudioPlaybackProof(db, { conversationId: conversation.id, participantId: participant.id, messagePublicId, clientVisibleOnly: true });
}

export async function markPortalRead(applicationPublicId: string, portalUserId: number, messagePublicId: string, listened = false, deviceName?: string | null, playbackToken?: string | null) {
  const { db, conversation, participant } = await requirePortalConversation(applicationPublicId, portalUserId, false);
  const [message] = await db.select().from(clientChatMessages).where(and(
    eq(clientChatMessages.publicId, messagePublicId),
    eq(clientChatMessages.conversationId, conversation.id),
    eq(clientChatMessages.visibility, "client"),
  )).limit(1);
  if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
  if (message.senderParticipantId === participant.id) return { readAt: null, listenedAt: null, ownMessage: true };
  if (listened && !["voice", "audio"].includes(message.messageType)) throw new TRPCError({ code: "BAD_REQUEST", message: "Only audio messages can be marked as listened" });
  if (listened) assertCompletedPlayback(playbackToken, { conversationId: conversation.id, messageId: message.id, participantId: participant.id });
  const now = Date.now();
  const [existing] = await db.select({
    deliveredAt: clientChatMessageReceipts.deliveredAt,
    readAt: clientChatMessageReceipts.readAt,
    listenedAt: clientChatMessageReceipts.listenedAt,
  }).from(clientChatMessageReceipts).where(and(
    eq(clientChatMessageReceipts.messageId, message.id),
    eq(clientChatMessageReceipts.participantId, participant.id),
  )).limit(1);
  const deliveredAt = existing?.deliveredAt ?? now;
  const readAt = existing?.readAt ?? now;
  const listenedAt = existing?.listenedAt ?? (listened ? now : null);
  await db.insert(clientChatMessageReceipts).values({
    messageId: message.id,
    participantId: participant.id,
    deliveredAt,
    readAt,
    listenedAt,
    deviceName: deviceName?.slice(0, 255) || null,
    updatedAt: now,
  }).onDuplicateKeyUpdate({ set: { deliveredAt, readAt, listenedAt, deviceName: deviceName?.slice(0, 255) || null, updatedAt: now } });
  await db.update(clientChatParticipants).set({ lastReadMessageId: message.id, lastSeenAt: now, updatedAt: now }).where(eq(clientChatParticipants.id, participant.id));
  if (!existing?.readAt || (listened && !existing?.listenedAt)) {
    await db.insert(clientChatEvents).values({ conversationId: conversation.id, eventType: "receipt_changed", entityId: message.id, actorParticipantId: participant.id, metadata: { read: true, listened: Boolean(listenedAt), visibility: "client" }, createdAt: now });
  }
  return { readAt, listenedAt, ownMessage: false };
}

export async function listPortalChatUnread(portalUserId: number) {
  const db = await requireDb();
  const participants = await db.select({
    participantId: clientChatParticipants.id,
    conversationId: clientChatParticipants.conversationId,
    lastReadMessageId: clientChatParticipants.lastReadMessageId,
    applicationPublicId: clientPortalApplications.publicId,
  }).from(clientChatParticipants)
    .innerJoin(clientChatConversations, eq(clientChatParticipants.conversationId, clientChatConversations.id))
    .innerJoin(clientPortalApplications, and(
      eq(clientPortalApplications.clientCaseId, clientChatConversations.clientCaseId),
      eq(clientPortalApplications.portalUserId, portalUserId),
      isNull(clientPortalApplications.accessRevokedAt),
    ))
    .where(and(eq(clientChatParticipants.portalUserId, portalUserId), eq(clientChatParticipants.status, "active")));
  const items: Array<{ applicationPublicId: string; unreadCount: number }> = [];
  for (const participant of participants) {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(clientChatMessages).where(and(
      eq(clientChatMessages.conversationId, participant.conversationId),
      eq(clientChatMessages.visibility, "client"),
      gt(clientChatMessages.id, participant.lastReadMessageId ?? 0),
      or(isNull(clientChatMessages.senderParticipantId), ne(clientChatMessages.senderParticipantId, participant.participantId)),
      isNull(clientChatMessages.deletedAt),
    ));
    items.push({ applicationPublicId: participant.applicationPublicId, unreadCount: Number(row?.count ?? 0) });
  }
  return { total: items.reduce((sum, item) => sum + item.unreadCount, 0), items };
}

export async function resolvePortalChatMessageApplications(portalUserId: number, messagePublicIds: string[]) {
  const unique = Array.from(new Set(messagePublicIds.filter(Boolean))).slice(0, 100);
  if (!unique.length) return {} as Record<string, string>;
  const db = await requireDb();
  const rows = await db.select({
    messagePublicId: clientChatMessages.publicId,
    applicationPublicId: clientPortalApplications.publicId,
  }).from(clientChatMessages)
    .innerJoin(clientChatConversations, eq(clientChatMessages.conversationId, clientChatConversations.id))
    .innerJoin(clientPortalApplications, and(
      eq(clientPortalApplications.clientCaseId, clientChatConversations.clientCaseId),
      eq(clientPortalApplications.portalUserId, portalUserId),
      isNull(clientPortalApplications.accessRevokedAt),
    ))
    .where(and(inArray(clientChatMessages.publicId, unique), eq(clientChatMessages.visibility, "client")));
  return Object.fromEntries(rows.map(row => [row.messagePublicId, row.applicationPublicId]));
}

export async function listEmployeeChatUnread(actor: StaffActor) {
  const summaries = await listStaffConversationSummaries(actor);
  const items = summaries.filter(item => item.unreadCount > 0 && !item.muted).map(item => ({
    folderPublicId: encodeEmployeeFolderId(item.clientCaseId),
    unreadCount: item.unreadCount,
    lastMessageAt: item.lastMessageAt,
    lastMessagePublicId: item.lastMessagePublicId,
    lastMessagePreview: item.lastMessagePreview,
    lastSenderName: item.lastSenderName,
    inApp: (item.notificationPreferences as Record<string, boolean>).inApp !== false,
  })).filter(item => item.inApp);
  return { total: items.reduce((sum, item) => sum + item.unreadCount, 0), items };
}
