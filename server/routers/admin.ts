import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { users, modulePermissions } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const adminRouter = router({
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
});
