import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const schema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");
const migration = readFileSync(resolve(root, "drizzle/0076_unified_client_chat.sql"), "utf8");
const governanceMigration = readFileSync(resolve(root, "drizzle/0077_client_chat_governance.sql"), "utf8");
const permanentRetentionMigration = readFileSync(resolve(root, "drizzle/0080_client_chat_permanent_retention.sql"), "utf8");
const service = readFileSync(resolve(root, "server/clientChatService.ts"), "utf8");
const router = readFileSync(resolve(root, "server/clientChatRouter.ts"), "utf8");
const portalRoutes = readFileSync(resolve(root, "server/clientPortalRoutes.ts"), "utf8");
const portalAdmin = readFileSync(resolve(root, "server/clientPortalAdminRouter.ts"), "utf8");
const detailPage = readFileSync(resolve(root, "client/src/pages/ClientDocDetail.tsx"), "utf8");
const listPage = readFileSync(resolve(root, "client/src/pages/ClientDocs.tsx"), "utf8");
const panel = readFileSync(resolve(root, "client/src/components/ClientChatPanel.tsx"), "utf8");
const scheduledHandler = readFileSync(resolve(root, "server/scheduledClientChatMessageHandler.ts"), "utf8");
const serverIndex = readFileSync(resolve(root, "server/_core/index.ts"), "utf8");

describe("standalone ELEVAY client chat integration", () => {
  it("creates an additive one-conversation-per-folder schema with retry and legacy idempotency", () => {
    expect(schema).toContain('uniqueClientCase: uniqueIndex("client_chat_conversations_case_unique")');
    expect(schema).toContain('uniqueClientMessage: uniqueIndex("client_chat_messages_client_id_unique")');
    expect(schema).toContain('uniqueLegacyPortal: uniqueIndex("client_chat_messages_legacy_portal_unique")');
    expect(schema).toContain('uniqueMessageParticipant: uniqueIndex("client_chat_receipts_message_participant_unique")');
    expect(service).toMatch(/insert\(clientChatConversations\)[\s\S]{0,1200}where\(eq\(clientChatConversations\.clientCaseId, clientCaseId\)\)/);
    expect(migration).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
  });

  it("keeps staff chat behind Client Documentation authorization and assigned participation", () => {
    expect(service).toContain('access.clientDocs === "none"');
    expect(service).toContain('access.clientDocs !== "full"');
    expect(service).toContain('actor.role === "admin" || isOwner(actor)');
    expect(service).toContain('You are not an assigned participant in this client conversation');
    expect(router.match(/protectedProcedure/g)?.length).toBeGreaterThanOrEqual(7);
  });

  it("uses clear cursor pagination, adaptive polling, typing TTL, drafts, and receipts", () => {
    expect(service).toContain('lt(clientChatMessages.id, beforeId)');
    expect(service).toContain('gt(clientChatEvents.id, afterEventId)');
    expect(service).toContain('const TYPING_TTL_MS = 7_000');
    expect(service).toContain('clientChatMessageReceipts');
    expect(service).toContain('clientChatDrafts');
    expect(panel).toContain('refetchInterval: active ? 2_000 : false');
    expect(panel).toContain('refetchInterval: active ? 5_000 : false');
    expect(panel).toContain('refetchInterval: active ? 10_000 : false');
  });

  it("prevents portal access after assignment revocation and never exposes internal messages", () => {
    expect(service).toContain('eq(clientPortalApplications.portalUserId, portalUserId)');
    expect(service).toContain('isNull(clientPortalApplications.accessRevokedAt)');
    expect(service).toContain('eq(clientChatMessages.visibility, "client")');
    expect(service).toContain('visibleMessageIds.has(event.entityId)');
    expect(service).toContain('reply.visibility !== "client"');
    expect(service).toContain('entityPublicId: event.entityId ? publicIdByMessageId.get(event.entityId)');
    expect(service).toContain('replyToPublicId: row.replyToMessageId ? publicIdById.get(row.replyToMessageId)');
    expect(service).not.toContain('return { events: visibleEvents, messages');
  });

  it("migrates legacy portal history idempotently without deleting its source rows", () => {
    expect(service).toContain('legacyPortalMessageId: legacy.id');
    expect(service).toContain('clientMessageId: `legacy-portal:${legacy.id}`');
    expect(service).toContain('migratedFrom: "client_portal_messages"');
    expect(service).not.toMatch(/delete\(clientPortalMessages\)|DELETE FROM clientPortalMessages/);
  });

  it("routes portal and administrator sends into the shared authoritative service", () => {
    expect(portalRoutes).toContain('listPortalConversationMessages');
    expect(portalRoutes).toContain('sendPortalConversationMessage');
    expect(portalRoutes).toContain('/messages/poll');
    expect(portalRoutes).toContain('/messages/typing');
    expect(portalAdmin).toContain('listStaffMessages(application.clientCaseId, ctx.user)');
    expect(portalAdmin).toContain('sendStaffMessage({');
  });

  it("renders chat inside every Client Documentation folder with optimistic replies and internal notes", () => {
    expect(detailPage).toContain('<TabsTrigger value="chat"');
    expect(detailPage).toContain('<ClientChatPanel clientCaseId={clientId}');
    expect(panel).toContain('utils.clientChat.messages.setData');
    expect(panel).toContain('replyToMessageId: replyTo?.id ?? null');
    expect(panel).toContain('Internal note');
    expect(panel).toContain('one shared history across CRM, Client Portal, and mobile');
  });

  it("preserves message history while enforcing bounded edit and delete-for-everyone controls", () => {
    expect(service).toContain('const EDIT_WINDOW_MS = 15 * 60_000');
    expect(service).toContain('const DELETE_WINDOW_MS = 60 * 60_000');
    expect(service).toContain('preserveMessageVersion');
    expect(service).toContain('clientChatMessageVersions');
    expect(service).toContain('body: null, deletedAt: now');
    expect(service).toContain('You can edit only your own messages');
    expect(service).toContain('The 15-minute edit window has closed');
    expect(service).toContain('The one-hour delete window has closed');
    expect(router).toContain('deleteForEveryone: protectedProcedure');
    expect(panel).toContain('Delete this message for everyone?');
  });

  it("supports reactions, personal stars, manager pinning, importance, hiding, reports, and message information", () => {
    expect(service).toContain('export const CLIENT_CHAT_REACTIONS');
    expect(service).toContain('clientChatReactions');
    expect(service).toContain('clientChatMessageStars');
    expect(service).toContain('Only conversation managers can pin messages');
    expect(service).toContain('clientChatHiddenMessages');
    expect(service).toContain('clientChatMessageReports');
    expect(service).toContain('receiptSummary');
    expect(router).toContain('react: protectedProcedure');
    expect(router).toContain('star: protectedProcedure');
    expect(router).toContain('setFlag: protectedProcedure');
    expect(router).toContain('report: protectedProcedure');
    expect(router).toContain('info: protectedProcedure');
  });

  it("searches only the authorized conversation with bounded text, date, sender, type, visibility, flag, and mention filters", () => {
    expect(service).toContain('eq(clientChatMessages.conversationId, conversation.id)');
    expect(service).toContain('like(clientChatMessages.body, `%${query}%`)');
    expect(service).toContain('gte(clientChatMessages.createdAt, filters.dateFrom)');
    expect(service).toContain('lte(clientChatMessages.createdAt, filters.dateTo)');
    expect(service).toContain('eq(clientChatMessages.senderType, filters.senderType)');
    expect(service).toContain('eq(clientChatMessages.messageType, filters.messageType)');
    expect(service).toContain('filters.starredOnly');
    expect(service).toContain('filters.mentionedMeOnly');
    expect(service).toContain('if (!participant.canViewInternal) predicates.push(eq(clientChatMessages.visibility, "client"))');
    expect(router).toContain('search: protectedProcedure');
    expect(panel).toContain('placeholder="Search message text…"');
    expect(panel).toContain('Messages from date');
    expect(panel).toContain('Mentions me');
    expect(panel).toContain('aria-label="Message actions"');
    expect(panel).toContain('Message information');
  });

  it("persists authorized participant mentions and exposes approximate presence without leaking internal notes", () => {
    expect(service).toContain('insertMessageMentions');
    expect(service).toContain('inArray(clientChatParticipants.publicId, requested)');
    expect(service).toContain('eq(clientChatParticipants.participantType, "staff")');
    expect(service).toContain('eq(clientChatParticipants.canViewInternal, true)');
    expect(service).toContain('mentionedMe: mentionRows.some');
    expect(service).toContain('presence: row.typingExpiresAt');
    expect(router).toContain('mentionParticipantPublicIds: z.array(z.string().uuid()).max(20).optional()');
    expect(panel).toContain('>Mention</Button>');
    expect(panel).toContain('active recently');
    expect(panel).toContain('Message mentioning you');
  });

  it("keeps archived and blocked conversations readable but prevents staff and portal writes", () => {
    expect(service).toContain('conversation.status !== "active"');
    expect(service).toContain('This conversation is not accepting new messages');
    expect(service).toContain('updateStaffConversationState');
    expect(service).toContain('Only conversation managers can change conversation status');
    expect(service).toContain('conversation_state_changed');
    expect(router).toContain('updateConversationState: protectedProcedure');
    expect(panel).toContain('Archived and blocked conversations remain readable but cannot accept new messages');
    expect(panel).toContain('disabled={!canWrite}');
  });

  it("stores and exposes attachments through private identifiers and secure access only", () => {
    expect(service).toContain('storagePut(storageKey, media.buffer, media.mimeType)');
    expect(service).toContain('getStaffAttachmentAccess');
    expect(service).toContain('getPortalAttachmentAccess');
    expect(service).toContain('eq(clientChatAttachments.scanStatus, "clean")');
    expect(service).not.toMatch(/attachments:[\s\S]{0,1000}fileKey:/);
    expect(router).toContain('sendAttachment: protectedProcedure');
    expect(router).toContain('attachmentAccess: protectedProcedure');
    expect(portalRoutes).toContain('/messages/attachments');
    expect(portalRoutes).toContain('/messages/attachments/:attachmentId/access');
    expect(service).toContain('const CHAT_CONVERSATION_QUOTA_BYTES = 500 * 1024 * 1024');
    expect(service).toContain('assertConversationStorageQuota');
    expect(service).toContain('This conversation has reached its secure attachment storage quota');
    expect(service).toContain('storageBytesUsed:');
    expect(service).toContain('storageQuotaBytes: CHAT_CONVERSATION_QUOTA_BYTES');
    expect(panel).toContain('type="file" multiple');
    expect(panel).toContain('5 - current.length');
    expect(panel).toContain('status: "reading"');
    expect(panel).toContain('status: "uploading"');
    expect(panel).toContain('status: "failed"');
    expect(panel).toContain('uploadQueuedAttachments([item.id])');
  });

  it("supports voice notes, bilingual transcripts, inline previews, listened receipts, and Save to Documents", () => {
    expect(service).toContain('transcribeChatVoice');
    expect(service).toContain('transcriptStatus: "complete"');
    expect(service).toContain('saveStaffAttachmentToDocuments');
    expect(service).toContain('savedClientDocumentId: document.id');
    expect(panel).toContain('Record voice note');
    expect(panel).toContain('Voice transcript');
    expect(panel).toContain('listened: true');
    expect(panel).toContain('startPlaybackMutation.mutateAsync');
    expect(panel).toContain('onPlay={onPlaybackStart} onEnded={onListened}');
    expect(service).toContain('Playback completion proof is required');
    expect(panel).toContain('Save to Docs');
    expect(panel).toContain('<audio ref={audioRef} controls');
    expect(panel).toContain('<video controls');
    expect(panel).toContain('Voice-note playback speed');
    expect(panel).toContain('[1, 1.5, 2].map');
  });

  it("shows named delivery, read, and listening receipts and sends message-preview push notifications", () => {
    expect(service).toContain('receiptDetailsByMessage');
    expect(service).toContain('displayName: receiptParticipant.participantType === "staff"');
    expect(service).toContain('deliveredAt: receipt.deliveredAt');
    expect(service).toContain('readAt: receipt.readAt');
    expect(service).toContain('listenedAt: receipt.listenedAt');
    expect(panel).toContain('Listened by ${listened}');
    expect(panel).toContain('Read by ${read}');
    expect(panel).toContain('Delivered to ${delivered}');
    expect(panel).toContain('setInfoMessagePublicId(message.publicId)');
    expect(service).toContain('getChatNotificationCopy');
    expect(service).toContain('preview: compactChatPreview(message.body, fallback)');
    expect(service).toContain('normalizedValue.length > 240');
    expect(service).toContain('Secure attachment${attachment?.fileName ? `: ${attachment.fileName}` : ""}');
    expect(service).toContain('pushClientNotification(recipient.portalUserId');
    expect(service).toContain('applicationPublicId: recipient.applicationPublicId');
    expect(service).toContain('entityPublicId: input.messagePublicId');
    expect(service).toContain('client-chat-push:${input.messagePublicId}:u:${recipient.portalUserId}');
  });

  it("provides per-participant unread summaries, mute preferences, and direct folder-chat links", () => {
    expect(service).toContain('listStaffConversationSummaries');
    expect(service).toContain('coalesce(${clientChatParticipants.lastReadMessageId}, 0)');
    expect(service).toContain('updateStaffChatPreferences');
    expect(service).toContain('notification_preferences_changed');
    expect(router).toContain('summaries: protectedProcedure');
    expect(router).toContain('updatePreferences: protectedProcedure');
    expect(listPage).toContain('trpc.clientChat.summaries.useQuery');
    expect(listPage).toContain('?tab=chat');
    expect(listPage).toContain('Reply needed');
    expect(detailPage).toContain('get("tab") === "chat"');
  });

  it("supports manager-only assignment and privacy-safe operational monitoring", () => {
    expect(service).toContain('Only conversation managers can manage participants');
    expect(service).toContain('This staff member does not have Client Documentation access');
    expect(service).toContain('participant_assigned');
    expect(service).toContain('getStaffChatMonitoring');
    expect(router).toContain('setParticipant: protectedProcedure');
    expect(router).toContain('monitoring: protectedProcedure');
    expect(panel).toContain('Chat settings and monitoring');
    expect(panel).toContain('Assign staff participant');
    expect(panel).toContain('Transcript failures');
  });

  it("de-duplicates client alerts, honors mute and email preferences, and omits message content from email", () => {
    expect(service).toContain('client-chat:${input.messagePublicId}:u:${recipient.portalUserId}');
    expect(service).toContain('preferences.email !== false');
    expect(service).toContain('recipient.muteUntil != null && recipient.muteUntil > now');
    expect(portalRoutes).toContain('getStaffChatEmailRecipients');
    expect(portalRoutes).toContain('Message content is intentionally omitted from email');
    expect(portalRoutes).toContain('?tab=chat');
    expect(portalAdmin).not.toContain('type: "new_message"');
  });

  it("gives the assigned Client Portal user audited mute, in-app, and push preferences", () => {
    expect(service).toContain("getPortalChatPreferences");
    expect(service).toContain("updatePortalChatPreferences");
    expect(service).toContain('email: false, push: input.push');
    expect(portalRoutes).toContain('/messages/preferences');
    expect(portalRoutes).toContain('app.patch("/client-api/applications/:applicationId/messages/preferences"');
    expect(portalRoutes).toContain('invalid_mute_until');
  });

  it("preserves Save-to-Documents source references and alerts only the assigned conversation team", () => {
    expect(schema).toContain('sourceChatMessageId: int("sourceChatMessageId")');
    expect(schema).toContain('sourceChatAttachmentId: int("sourceChatAttachmentId")');
    expect(service).toContain('sourceChatMessageId: row.message.id');
    expect(service).toContain('sourceChatAttachmentId: row.attachment.id');
    expect(service).toContain('visibility: "internal", messageType: "system"');
    expect(service).toContain('savedToDocuments: true');
    expect(governanceMigration).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
  });

  it("enforces permanent history, manual-only removal, legal hold, and sanitized audited CSV export", () => {
    expect(schema).toContain('retentionPolicy: mysqlEnum("retentionPolicy", ["indefinite"])');
    expect(schema).not.toContain('"seven_years"');
    expect(router).toContain('retentionPolicy: z.literal("indefinite")');
    expect(permanentRetentionMigration).toContain("SET `retentionPolicy` = 'indefinite'");
    expect(permanentRetentionMigration).toContain("enum('indefinite') NOT NULL DEFAULT 'indefinite'");
    expect(service).not.toMatch(/delete\(clientChatMessages\)|delete\(clientChatAttachments\)/);
    expect(scheduledHandler).not.toMatch(/delete|purge|cleanup|retention|expire|ttl/i);
    expect(service).toContain('This conversation has reached its secure attachment storage quota');
    expect(service).toContain('Messages cannot be removed while this conversation is under legal hold');
    expect(service).toMatch(/deleteStaffMessage[\s\S]{0,1600}\.for\("update"\)/);
    expect(schema).toContain('legalHoldAt: bigint("legalHoldAt"');
    expect(service).toContain('Only conversation managers can change retention or legal hold');
    expect(service).toContain('action: "conversation_exported"');
    expect(service).toContain('message.attachments.map(attachment => attachment.originalFileName)');
    expect(service).not.toMatch(/exportStaffConversation[\s\S]{0,3500}fileKey/);
    expect(router).toContain('updateGovernance: protectedProcedure');
    expect(router).toContain('exportConversation: protectedProcedure');
    expect(panel).toContain('Chat retention and legal hold');
    expect(panel).toContain('There is no automatic deletion, expiration, TTL, retention cutoff, or quota cleanup');
    expect(panel).toContain('storage quotas may block new uploads, but never delete existing messages or attachments');
    expect(panel).toContain('Export CSV');
  });

  it("delivers scheduled messages through an authenticated task-UID-only Heartbeat callback", () => {
    expect(schema).toContain('heartbeatTaskUid: varchar("heartbeatTaskUid", { length: 65 })');
    expect(schema).toContain('client_chat_scheduled_task_uid_unique');
    expect(router).toContain('createHeartbeatJob');
    expect(router).toContain('path: "/api/scheduled/clientChatMessage"');
    expect(service).toContain('where(eq(clientChatScheduledMessages.heartbeatTaskUid, taskUid))');
    expect(service).toContain('clientMessageId = `scheduled:${scheduled.scheduled.publicId}`');
    expect(scheduledHandler).toContain('identity.isCron');
    expect(scheduledHandler).toContain('executeScheduledChatMessageByTaskUid(identity.taskUid)');
    expect(scheduledHandler).not.toMatch(/req\.body/);
    expect(serverIndex).toContain('app.post("/api/scheduled/clientChatMessage", scheduledClientChatMessageHandler)');
    expect(panel).toContain('Schedule a chat message');
    expect(panel).toContain('Recent scheduled messages');
  });

  it("supports manager-only report moderation and privacy-safe response-target monitoring", () => {
    expect(service).toContain('const CLIENT_CHAT_RESPONSE_TARGET_MS = 4 * 60 * 60_000');
    expect(service).toContain('Only conversation managers can review reports');
    expect(service).toContain('action: "message_report_reviewed"');
    expect(service).toContain('responseOverdue: responseDueAt != null && responseDueAt < Date.now()');
    expect(router).toContain('reports: protectedProcedure');
    expect(router).toContain('resolveReport: protectedProcedure');
    expect(panel).toContain('Message reports and response target');
    expect(panel).toContain('Staff response target:');
    expect(panel).toContain('status: "actioned"');
  });

  it("does not introduce WhatsApp, Meta, WebSocket, or socket dependencies", () => {
    const combined = `${service}\n${router}\n${panel}`;
    expect(combined).not.toMatch(/whatsapp|meta cloud/i);
    expect(combined).not.toMatch(/from\s+["'](?:ws|socket\.io)["']|new\s+WebSocket\s*\(|\bio\s*\(/i);
  });
});
