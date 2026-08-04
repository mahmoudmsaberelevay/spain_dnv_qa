/**
 * supportRouter — Public procedures for support tickets and account deletion requests.
 * These are accessible without authentication for Apple App Store compliance.
 */
import { z } from "zod";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { deletionRequests, supportTickets, users } from "../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";

export const supportRouter = router({
  // Public: Submit a support ticket (no auth required)
  submitTicket: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      category: z.enum(["login_issue", "technical_bug", "account_deletion", "feature_request", "billing", "general", "other"]).default("general"),
      subject: z.string().min(1),
      description: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new Error("DB unavailable");
      await db.insert(supportTickets).values({
        name: input.name,
        email: input.email,
        category: input.category,
        subject: input.subject,
        description: input.description,
      });

      // Send notification email to support
      try {
        const { sendEmail } = await import("./backupEmailService");
        await sendEmail({
          to: "support@elevay.com",
          subject: `[Support] ${input.category}: ${input.subject}`,
          html: `
            <h2>New Support Ticket</h2>
            <p><strong>From:</strong> ${input.name} (${input.email})</p>
            <p><strong>Category:</strong> ${input.category}</p>
            <p><strong>Subject:</strong> ${input.subject}</p>
            <p><strong>Description:</strong></p>
            <p>${input.description.replace(/\n/g, "<br>")}</p>
          `,
        });
      } catch (e) {
        console.error("[Support] Failed to send notification email:", e);
      }

      return { success: true };
    }),

  // Public: Submit an account deletion request (no auth required)
  submitDeletionRequest: publicProcedure
    .input(z.object({
      fullName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new Error("DB unavailable");
      await db.insert(deletionRequests).values({
        fullName: input.fullName,
        email: input.email,
        phone: input.phone || null,
        reason: input.reason || null,
      });

      // Send notification to admin
      try {
        const { sendEmail } = await import("./backupEmailService");
        await sendEmail({
          to: "mahmoud.saber@elevay.com",
          subject: `[URGENT] Account Deletion Request: ${input.fullName}`,
          html: `
            <h2>Account Deletion Request</h2>
            <p><strong>Name:</strong> ${input.fullName}</p>
            <p><strong>Email:</strong> ${input.email}</p>
            <p><strong>Phone:</strong> ${input.phone || "Not provided"}</p>
            <p><strong>Reason:</strong> ${input.reason || "Not provided"}</p>
            <p>Please process this request within 30 days as per our Privacy Policy.</p>
            <p><a href="https://elevay.vip/admin/privacy">View in Admin Panel</a></p>
          `,
        });
      } catch (e) {
        console.error("[Support] Failed to send deletion notification:", e);
      }

      return { success: true };
    }),

  // Protected: In-app account deletion request (logged-in user)
  requestMyDeletion: protectedProcedure
    .input(z.object({
      reason: z.string().optional(),
      confirmed: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!input.confirmed) {
        throw new Error("You must confirm the deletion request.");
      }
      const db = await getDb(); if (!db) throw new Error("DB unavailable");
      await db.insert(deletionRequests).values({
        userId: ctx.user.id,
        fullName: ctx.user.name || "Unknown",
        email: ctx.user.email || "unknown@unknown.com",
        reason: input.reason || null,
      });

      // Notify admin
      try {
        const { sendEmail } = await import("./backupEmailService");
        await sendEmail({
          to: "mahmoud.saber@elevay.com",
          subject: `[URGENT] In-App Account Deletion: ${ctx.user.name}`,
          html: `
            <h2>In-App Account Deletion Request</h2>
            <p><strong>User:</strong> ${ctx.user.name} (ID: ${ctx.user.id})</p>
            <p><strong>Email:</strong> ${ctx.user.email}</p>
            <p><strong>Reason:</strong> ${input.reason || "Not provided"}</p>
            <p>This was submitted from within the app by an authenticated user.</p>
            <p><a href="https://elevay.vip/admin/privacy">View in Admin Panel</a></p>
          `,
        });
      } catch (e) {
        console.error("[Support] Failed to send deletion notification:", e);
      }

      return { success: true };
    }),

  // Admin: List all deletion requests
  listDeletionRequests: adminProcedure
    .input(z.object({
      status: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb(); if (!db) return [];
      const conditions = [];
      if (input?.status) {
        conditions.push(sql`status = ${input.status}`);
      }
      const rows = await db.select().from(deletionRequests).orderBy(desc(deletionRequests.createdAt));
      if (input?.status) {
        return rows.filter(r => r.status === input.status);
      }
      return rows;
    }),

  // Admin: Update deletion request status
  updateDeletionRequest: adminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["new", "identity_verification", "under_review", "approved", "processing", "completed", "rejected", "cancelled"]),
      adminNotes: z.string().optional(),
      deletedData: z.string().optional(),
      retainedData: z.string().optional(),
      retainedReason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("DB unavailable");
      const updateData: any = {
        status: input.status,
        processedBy: ctx.user.id,
      };
      if (input.adminNotes !== undefined) updateData.adminNotes = input.adminNotes;
      if (input.deletedData !== undefined) updateData.deletedData = input.deletedData;
      if (input.retainedData !== undefined) updateData.retainedData = input.retainedData;
      if (input.retainedReason !== undefined) updateData.retainedReason = input.retainedReason;
      if (input.status === "completed") updateData.completedAt = new Date();

      await db.update(deletionRequests).set(updateData).where(eq(deletionRequests.id, input.id));
      return { success: true };
    }),

  // Admin: List support tickets
  listTickets: adminProcedure
    .input(z.object({
      status: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb(); if (!db) return [];
      const rows = await db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
      if (input?.status) {
        return rows.filter(r => r.status === input.status);
      }
      return rows;
    }),

  // Admin: Update support ticket
  updateTicket: adminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["open", "in_progress", "resolved", "closed"]),
      adminNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("DB unavailable");
      const updateData: any = { status: input.status };
      if (input.adminNotes !== undefined) updateData.adminNotes = input.adminNotes;
      if (input.status === "resolved" || input.status === "closed") updateData.resolvedAt = new Date();
      await db.update(supportTickets).set(updateData).where(eq(supportTickets.id, input.id));
      return { success: true };
    }),
});
