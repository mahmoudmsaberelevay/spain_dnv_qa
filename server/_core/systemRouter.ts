import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, protectedProcedure, router } from "./trpc";
import { getDb } from "../db";
import { users, modulePermissions } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import bcryptjs from "bcryptjs";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  getAllUsers: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    return await db.select().from(users).orderBy(users.name);
  }),

  getUserPermissions: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      return await db
        .select()
        .from(modulePermissions)
        .where(eq(modulePermissions.userId, input.userId));
    }),

  updateUserPermissions: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
        permissions: z.array(
          z.object({
            module: z.string(),
            accessLevel: z.enum(["none", "level1", "full"]),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.id !== 120001) {
        throw new Error("Unauthorized");
      }

      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      await db.delete(modulePermissions).where(eq(modulePermissions.userId, input.userId));

      for (const perm of input.permissions) {
        await db.insert(modulePermissions).values({
          userId: input.userId,
          module: perm.module,
          accessLevel: perm.accessLevel,
        });
      }

      return { success: true };
    }),

  resetUserPassword: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
        newPassword: z.string().min(6, "Password must be at least 6 characters"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only owner (Mahmoud) can reset passwords
      if (ctx.user?.id !== 120001) {
        throw new Error("Unauthorized: Only owner can reset passwords");
      }

      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      // Hash the new password
      const hashedPassword = await bcryptjs.hash(input.newPassword, 10);

      // Update user password
      await db
        .update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, input.userId));

      return { success: true, message: "Password reset successfully" };
    }),
});
