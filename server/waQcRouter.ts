import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import {
  getActiveConfig, getAllConfigs, upsertConfig, deleteConfig,
  getAllGroups, upsertGroup, getGroupById,
  getWaMessages, getWaMessageStats,
  getWaMediaFiles,
  getWaConversations,
} from "./db";
import { invokeLLM } from "./_core/llm";

// ─── Access Guard ─────────────────────────────────────────────────────────────
const waQcProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const { getUserModuleAccess } = await import("./permissionsRouter");
  const perms = await getUserModuleAccess(ctx.user.id);
  if (!perms || perms.waQc === "none") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Access to WhatsApp Quality Control is restricted." });
  }
  return next({ ctx });
});

// ─── Router ───────────────────────────────────────────────────────────────────
export const waQcRouter = router({
  // Dashboard stats
  stats: waQcProcedure.query(async () => {
    return getWaMessageStats();
  }),

  // Messages
  messages: router({
    list: waQcProcedure
      .input(z.object({
        groupId: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ input }) => {
        return getWaMessages(input);
      }),
  }),

  // Conversations
  conversations: router({
    list: waQcProcedure.query(async () => {
      return getWaConversations();
    }),
  }),

  // Groups
  groups: router({
    list: waQcProcedure.query(async () => {
      return getAllGroups();
    }),
    upsert: waQcProcedure
      .input(z.object({
        groupId: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        isActive: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        await upsertGroup(input);
        return { success: true };
      }),
  }),

  // Media
  media: router({
    list: waQcProcedure
      .input(z.object({
        type: z.enum(["all", "image", "video", "audio", "document"]).default("all"),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ input }) => {
        const mimeTypePrefix = input.type === "all" ? undefined :
          input.type === "image" ? "image/" :
          input.type === "video" ? "video/" :
          input.type === "audio" ? "audio/" : "application/";
        return getWaMediaFiles({ mimeTypePrefix, limit: input.limit, offset: input.offset });
      }),
  }),

  // AI Query
  aiQuery: router({
    ask: waQcProcedure
      .input(z.object({
        question: z.string().min(1).max(1000),
        groupId: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Fetch recent messages as context
        const { rows: allMessages } = await getWaMessages({
          groupId: input.groupId,
          search: undefined,
          limit: 200,
          offset: 0,
        });

        const contextText = allMessages
          .slice(0, 100)
          .map((m) => {
            const sender = m.senderName || m.senderPhone || "Unknown";
            const time = m.whatsappTimestamp
              ? new Date(m.whatsappTimestamp).toLocaleString()
              : new Date(m.createdAt).toLocaleString();
            const content = m.textContent || m.caption || `[${m.messageType}]`;
            return `[${time}] ${sender}: ${content}`;
          })
          .join("\n");

        const systemPrompt = `You are an AI assistant analyzing WhatsApp group messages for ELEVAY, a citizenship and residency consultation company. 
Answer questions about the conversations, identify patterns, summarize discussions, and provide insights.
Be concise and professional. If asked about specific clients or documents, reference the actual message content.

Here are the recent messages:
${contextText}`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.question },
          ],
        });

        const answer = response.choices[0]?.message?.content || "No response generated.";

        // Build quotes from relevant messages
        const quotes = allMessages.slice(0, 10).map((m) => ({
          messageId: m.messageId,
          senderName: m.senderName || m.senderPhone,
          groupId: m.groupId,
          content: m.textContent || m.caption || `[${m.messageType}]`,
          timestamp: m.whatsappTimestamp
            ? new Date(m.whatsappTimestamp).toISOString()
            : m.createdAt.toISOString(),
          messageType: m.messageType,
        }));

        return { answer, quotes };
      }),
  }),

  // Send a free-form text reply to a contact
  sendReply: waQcProcedure
    .input(z.object({
      toPhone: z.string().min(7),
      message: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const config = await getActiveConfig();
      if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active WhatsApp configuration found. Please configure it in Settings." });
      if (!config.accessToken) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Access token is missing. Please update it in Settings." });
      if (!config.phoneNumberId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Phone Number ID is missing. Please update it in Settings." });
      const to = input.toPhone.replace(/[^0-9]/g, "");
      const axiosLib = (await import("axios")).default;
      const url = `https://graph.facebook.com/v22.0/${config.phoneNumberId}/messages`;
      try {
        const response = await axiosLib.post(url, {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: input.message },
        }, {
          headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
          timeout: 15000,
        });
        return { success: true, messageId: response.data?.messages?.[0]?.id, to };
      } catch (err: any) {
        const metaError = err?.response?.data?.error;
        const msg = metaError ? `Meta API error ${metaError.code}: ${metaError.message}` : err.message;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }
    }),

  // Config
  config: router({
    list: waQcProcedure.query(async () => {
      const configs = await getAllConfigs();
      return configs.map((c) => ({
        ...c,
        accessToken: c.accessToken ? "••••••••" + c.accessToken.slice(-6) : null,
      }));
    }),
    save: waQcProcedure
      .input(z.object({
        phoneNumberId: z.string().min(1),
        displayName: z.string().optional(),
        accessToken: z.string().optional(),
        webhookVerifyToken: z.string().optional(),
        isActive: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        await upsertConfig(input);
        return { success: true };
      }),
    delete: waQcProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteConfig(input.id);
        return { success: true };
      }),
    getWebhookUrl: waQcProcedure.query(({ ctx }) => {
      const host = (ctx.req.headers["x-forwarded-host"] || ctx.req.headers.host || "localhost:3000") as string;
      const protocol = (ctx.req.headers["x-forwarded-proto"] || "https") as string;
      return { webhookUrl: `${protocol}://${host}/api/webhook/whatsapp` };
    }),
    sendTestMessage: waQcProcedure
      .input(z.object({
        toPhone: z.string().min(7),
        configId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        let config;
        if (input.configId) {
          const all = await getAllConfigs();
          config = all.find((c) => c.id === input.configId);
        } else {
          config = await getActiveConfig();
        }
        if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active WhatsApp configuration found." });
        if (!config.accessToken) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Access token is missing." });
        if (!config.phoneNumberId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Phone Number ID is missing." });
        const to = input.toPhone.replace(/[^0-9]/g, "");
        const axiosLib = (await import("axios")).default;
        const url = `https://graph.facebook.com/v22.0/${config.phoneNumberId}/messages`;
        try {
          const response = await axiosLib.post(url, {
            messaging_product: "whatsapp",
            to,
            type: "template",
            template: { name: "hello_world", language: { code: "en_US" } },
          }, {
            headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
            timeout: 15000,
          });
          return { success: true, messageId: response.data?.messages?.[0]?.id, to };
        } catch (err: any) {
          const metaError = err?.response?.data?.error;
          const msg = metaError ? `Meta API error ${metaError.code}: ${metaError.message}` : err.message;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
        }
      }),
  }),
});
