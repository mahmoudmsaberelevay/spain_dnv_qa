import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { router, protectedProcedure } from "./_core/trpc";
import { createHeartbeatJob, deleteHeartbeatJob } from "./_core/heartbeat";
import {
  CLIENT_CHAT_REACTIONS,
  attachHeartbeatToScheduledMessage,
  completeStaffScheduledMessageCancellation,
  createStaffScheduledMessage,
  deleteStaffMessage,
  editStaffMessage,
  exportStaffConversation,
  failScheduledMessageProvisioning,
  getStaffConversation,
  getStaffAttachmentAccess,
  getStaffChatMonitoring,
  getStaffMessageInfo,
  hideStaffMessage,
  listStaffDocumentTargets,
  listAssignableChatStaff,
  listStaffConversationSummaries,
  listStaffMessageReports,
  listStaffMessages,
  listStaffScheduledMessages,
  markStaffRead,
  pollStaffConversation,
  prepareStaffScheduledMessageCancellation,
  reportStaffMessage,
  resolveStaffMessageReport,
  searchStaffMessages,
  sendStaffAttachment,
  sendStaffMessage,
  saveStaffAttachmentToDocuments,
  setStaffMessageFlag,
  setStaffChatParticipant,
  startStaffAudioPlayback,
  toggleStaffReaction,
  toggleStaffStar,
  updateStaffTyping,
  updateStaffChatPreferences,
  updateStaffConversationState,
  updateStaffChatGovernance,
  upsertStaffDraft,
} from "./clientChatService";

const clientMessageId = z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9:_-]+$/);

function heartbeatCronForTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return `0 ${date.getUTCMinutes()} ${date.getUTCHours()} ${date.getUTCDate()} ${date.getUTCMonth() + 1} *`;
}

export const clientChatRouter = router({
  summaries: protectedProcedure
    .query(({ ctx }) => listStaffConversationSummaries(ctx.user)),

  getForCase: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive() }))
    .query(({ ctx, input }) => getStaffConversation(input.clientCaseId, ctx.user)),

  messages: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), beforeId: z.number().int().positive().optional(), limit: z.number().int().min(1).max(100).default(50) }))
    .query(({ ctx, input }) => listStaffMessages(input.clientCaseId, ctx.user, input.beforeId, input.limit)),

  poll: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), afterEventId: z.number().int().min(0).default(0) }))
    .query(({ ctx, input }) => pollStaffConversation(input.clientCaseId, ctx.user, input.afterEventId)),

  send: protectedProcedure
    .input(z.object({
      clientCaseId: z.number().int().positive(),
      clientMessageId,
      body: z.string().trim().min(1).max(10_000),
      visibility: z.enum(["client", "internal"]).default("client"),
      replyToPublicId: z.string().uuid().nullable().optional(),
      mentionParticipantPublicIds: z.array(z.string().uuid()).max(20).optional(),
    }))
    .mutation(({ ctx, input }) => sendStaffMessage({ ...input, actor: ctx.user })),

  typing: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), typing: z.boolean() }))
    .mutation(({ ctx, input }) => updateStaffTyping(input.clientCaseId, ctx.user, input.typing)),

  startPlayback: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), messagePublicId: z.string().uuid() }))
    .mutation(({ ctx, input }) => startStaffAudioPlayback(input.clientCaseId, ctx.user, input.messagePublicId)),

  markRead: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), messagePublicId: z.string().uuid(), listened: z.boolean().default(false), playbackToken: z.string().max(2_000).nullable().optional() }))
    .mutation(({ ctx, input }) => markStaffRead(input.clientCaseId, ctx.user, input.messagePublicId, input.listened, input.playbackToken)),

  saveDraft: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), body: z.string().max(10_000), replyToMessageId: z.number().int().positive().nullable().optional() }))
    .mutation(({ ctx, input }) => upsertStaffDraft(input.clientCaseId, ctx.user, input.body, input.replyToMessageId)),

  search: protectedProcedure
    .input(z.object({
      clientCaseId: z.number().int().positive(),
      query: z.string().trim().max(200).optional(),
      dateFrom: z.number().int().nonnegative().optional(),
      dateTo: z.number().int().positive().optional(),
      senderType: z.enum(["client", "staff", "system"]).optional(),
      messageType: z.enum(["text", "image", "video", "file", "voice", "audio", "system"]).optional(),
      visibility: z.enum(["client", "internal"]).optional(),
      starredOnly: z.boolean().optional(),
      importantOnly: z.boolean().optional(),
      pinnedOnly: z.boolean().optional(),
      mentionedMeOnly: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(({ ctx, input }) => searchStaffMessages(input.clientCaseId, ctx.user, input)),

  edit: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), messagePublicId: z.string().uuid(), body: z.string().trim().min(1).max(10_000) }))
    .mutation(({ ctx, input }) => editStaffMessage(input.clientCaseId, ctx.user, input.messagePublicId, input.body)),

  deleteForEveryone: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), messagePublicId: z.string().uuid() }))
    .mutation(({ ctx, input }) => deleteStaffMessage(input.clientCaseId, ctx.user, input.messagePublicId)),

  hideForMe: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), messagePublicId: z.string().uuid() }))
    .mutation(({ ctx, input }) => hideStaffMessage(input.clientCaseId, ctx.user, input.messagePublicId)),

  star: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), messagePublicId: z.string().uuid() }))
    .mutation(({ ctx, input }) => toggleStaffStar(input.clientCaseId, ctx.user, input.messagePublicId)),

  react: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), messagePublicId: z.string().uuid(), reaction: z.enum(CLIENT_CHAT_REACTIONS) }))
    .mutation(({ ctx, input }) => toggleStaffReaction(input.clientCaseId, ctx.user, input.messagePublicId, input.reaction)),

  setFlag: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), messagePublicId: z.string().uuid(), flag: z.enum(["important", "pinned"]), value: z.boolean() }))
    .mutation(({ ctx, input }) => setStaffMessageFlag(input.clientCaseId, ctx.user, input.messagePublicId, input.flag, input.value)),

  report: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), messagePublicId: z.string().uuid(), reason: z.string().trim().min(5).max(500) }))
    .mutation(({ ctx, input }) => reportStaffMessage(input.clientCaseId, ctx.user, input.messagePublicId, input.reason)),

  reports: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive() }))
    .query(({ ctx, input }) => listStaffMessageReports(input.clientCaseId, ctx.user)),

  resolveReport: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), reportPublicId: z.string().uuid(), status: z.enum(["reviewed", "dismissed", "actioned"]) }))
    .mutation(({ ctx, input }) => resolveStaffMessageReport(input.clientCaseId, ctx.user, input.reportPublicId, input.status)),

  info: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), messagePublicId: z.string().uuid() }))
    .query(({ ctx, input }) => getStaffMessageInfo(input.clientCaseId, ctx.user, input.messagePublicId)),

  sendAttachment: protectedProcedure
    .input(z.object({
      clientCaseId: z.number().int().positive(),
      clientMessageId,
      body: z.string().trim().max(10_000).nullable().optional(),
      visibility: z.enum(["client", "internal"]).default("client"),
      replyToPublicId: z.string().uuid().nullable().optional(),
      fileName: z.string().trim().min(1).max(255),
      mimeType: z.string().trim().min(3).max(128),
      fileSize: z.number().int().positive().max(25 * 1024 * 1024),
      base64: z.string().min(8).max(36 * 1024 * 1024),
      durationMs: z.number().int().positive().max(6 * 60 * 60_000).nullable().optional(),
    }))
    .mutation(({ ctx, input }) => sendStaffAttachment({ ...input, actor: ctx.user })),

  attachmentAccess: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), attachmentPublicId: z.string().uuid() }))
    .mutation(({ ctx, input }) => getStaffAttachmentAccess(input.clientCaseId, ctx.user, input.attachmentPublicId)),

  documentTargets: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive() }))
    .query(({ ctx, input }) => listStaffDocumentTargets(input.clientCaseId, ctx.user)),

  saveAttachmentToDocuments: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), attachmentPublicId: z.string().uuid(), documentKey: z.string().trim().min(1).max(64) }))
    .mutation(({ ctx, input }) => saveStaffAttachmentToDocuments(input.clientCaseId, ctx.user, input.attachmentPublicId, input.documentKey)),

  updatePreferences: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), muteUntil: z.number().int().positive().nullable(), inApp: z.boolean(), email: z.boolean(), push: z.boolean() }))
    .mutation(({ ctx, input }) => updateStaffChatPreferences(input.clientCaseId, ctx.user, input)),

  assignableStaff: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive() }))
    .query(({ ctx, input }) => listAssignableChatStaff(input.clientCaseId, ctx.user)),

  setParticipant: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), staffUserId: z.number().int().positive(), role: z.enum(["consultant", "paralegal", "manager", "observer"]), active: z.boolean(), makeAssignee: z.boolean().default(false) }))
    .mutation(({ ctx, input }) => setStaffChatParticipant(input.clientCaseId, ctx.user, input)),

  monitoring: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive() }))
    .query(({ ctx, input }) => getStaffChatMonitoring(input.clientCaseId, ctx.user)),

  updateConversationState: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), status: z.enum(["active", "archived", "blocked"]), waitingOn: z.enum(["none", "client", "staff"]) }))
    .mutation(({ ctx, input }) => updateStaffConversationState(input.clientCaseId, ctx.user, input)),

  updateGovernance: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), retentionPolicy: z.literal("indefinite"), legalHold: z.boolean(), legalHoldReason: z.string().trim().max(500).nullable().optional() }))
    .mutation(({ ctx, input }) => updateStaffChatGovernance(input.clientCaseId, ctx.user, input)),

  exportConversation: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => exportStaffConversation(input.clientCaseId, ctx.user)),

  scheduledMessages: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive() }))
    .query(({ ctx, input }) => listStaffScheduledMessages(input.clientCaseId, ctx.user)),

  scheduleMessage: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), body: z.string().trim().min(1).max(10_000), visibility: z.enum(["client", "internal"]), scheduledFor: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const sessionToken = ctx.req.cookies?.[COOKIE_NAME] ?? "";
      if (!sessionToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in again before scheduling a message" });
      const scheduled = await createStaffScheduledMessage(input.clientCaseId, ctx.user, input);
      let taskUid: string | null = null;
      try {
        const job = await createHeartbeatJob({ name: `client-chat-${scheduled.publicId}`, cron: heartbeatCronForTimestamp(input.scheduledFor), path: "/api/scheduled/clientChatMessage", description: "Deliver one scheduled ELEVAY client conversation message; later annual matches no-op after durable sent status" }, sessionToken);
        taskUid = job.taskUid;
        await attachHeartbeatToScheduledMessage(input.clientCaseId, ctx.user, scheduled.publicId, job.taskUid);
        return { ...scheduled, nextExecutionAt: job.nextExecutionAt ?? null };
      } catch (error) {
        if (taskUid) await deleteHeartbeatJob(taskUid, sessionToken).catch(() => undefined);
        await failScheduledMessageProvisioning(input.clientCaseId, ctx.user, scheduled.publicId);
        throw error;
      }
    }),

  cancelScheduledMessage: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), scheduledMessagePublicId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const sessionToken = ctx.req.cookies?.[COOKIE_NAME] ?? "";
      if (!sessionToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in again before cancelling a scheduled message" });
      const scheduled = await prepareStaffScheduledMessageCancellation(input.clientCaseId, ctx.user, input.scheduledMessagePublicId);
      if (scheduled.heartbeatTaskUid) await deleteHeartbeatJob(scheduled.heartbeatTaskUid, sessionToken);
      return completeStaffScheduledMessageCancellation(input.clientCaseId, ctx.user, input.scheduledMessagePublicId);
    }),
});
