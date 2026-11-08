import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import {
  finEmployees,
  modulePermissions,
  userPermissions,
} from "../drizzle/schema";
import { getDb } from "./db";

/** Employee names for commission forms only; never grants Financial-admin access. */
export async function listCommissionEmployeeOptions(input: {
  userId: number;
  isFinancialAdmin: boolean;
}): Promise<{ id: number; name: string }[]> {
  try {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to load employee options",
      });
    }

    // Preserve the existing Financial-admin picker, but fail closed for everyone else.
    if (!input.isFinancialAdmin) {
      const [modulePermission] = await db
        .select({ accessLevel: modulePermissions.accessLevel })
        .from(modulePermissions)
        .where(
          and(
            eq(modulePermissions.userId, input.userId),
            eq(modulePermissions.module, "financial")
          )
        )
        .limit(1);
      if (modulePermission?.accessLevel !== "full") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Employee selection is not permitted",
        });
      }

      const [pagePermission] = await db
        .select({
          canAccess: userPermissions.canAccess,
          canCreate: userPermissions.canCreate,
          canEdit: userPermissions.canEdit,
        })
        .from(userPermissions)
        .where(
          and(
            eq(userPermissions.userId, input.userId),
            eq(userPermissions.pageKey, "fin_commission_receipts")
          )
        )
        .limit(1);
      if (
        !pagePermission?.canAccess ||
        !(pagePermission.canCreate || pagePermission.canEdit)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Employee selection is not permitted",
        });
      }
    }

    const employees = await db
      .select({ id: finEmployees.id, name: finEmployees.name })
      .from(finEmployees)
      .where(eq(finEmployees.isActive, true))
      .orderBy(asc(finEmployees.name));

    // Explicit response projection is defense in depth against adapter over-returning.
    return employees.map(({ id, name }) => ({ id, name }));
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    // Do not expose database details, employee data, or connection information.
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unable to load employee options",
    });
  }
}
