import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import {
  requirePlaudActor,
  requirePlaudSameOrigin,
  requirePlaudLead,
  requirePlaudImportLead,
  plaudSessionHash,
} from "./plaudAccess";
import { PlaudProvider } from "./plaudProvider";
import { listPlaudCatalogue, storePlaudImport } from "./plaudTranscriptDb";
import { parsePlaudRange, resolvePlaudTimeZone } from "./plaudTranscriptFormat";
const provider = new PlaudProvider();
const signed = publicProcedure.use(async ({ ctx, next }) =>
  next({ ctx: { ...ctx, plaudActor: await requirePlaudActor(ctx.req) } })
);
const mutable = signed.use(async ({ ctx, next }) => {
  requirePlaudSameOrigin(ctx.req);
  return next();
});
const leadId = z.number().int().positive();
/** Never attach a raw provider exception, body, credential, transcript or URL. */
export function safePlaudMessage(error: unknown): string {
  const message =
    typeof (error as any)?.message === "string" ? (error as any).message : "";
  return /^PLAUD_[A-Z0-9_]{1,80}$/.test(message)
    ? message
    : "PLAUD_OPERATION_FAILED";
}
async function safe<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const code =
      error instanceof TRPCError &&
      [
        "UNAUTHORIZED",
        "FORBIDDEN",
        "NOT_FOUND",
        "BAD_REQUEST",
        "CONFLICT",
      ].includes(error.code)
        ? error.code
        : "PRECONDITION_FAILED";
    throw new TRPCError({ code, message: safePlaudMessage(error) });
  }
}
export const plaudRouter = router({
  connection: signed.query(({ ctx }) =>
    safe(() => provider.status(ctx.plaudActor.id))
  ),
  connect: mutable
    .input(z.object({ leadId, acknowledgedSharing: z.literal(true) }).strict())
    .mutation(({ ctx, input }) =>
      safe(async () => {
        await requirePlaudImportLead(ctx.plaudActor, input.leadId);
        return provider.start(
          ctx.plaudActor.id,
          plaudSessionHash(ctx.req),
          `/leads/${input.leadId}`
        );
      })
    ),
  disconnect: mutable.mutation(({ ctx }) =>
    safe(async () => {
      await provider.disconnect(ctx.plaudActor.id);
      return { success: true as const };
    })
  ),
  recordings: signed
    .input(
      z
        .object({
          leadId,
          page: z.number().int().min(1).max(1_000_000).default(1),
        })
        .strict()
    )
    .query(({ ctx, input }) =>
      safe(async () => {
        await requirePlaudImportLead(ctx.plaudActor, input.leadId);
        return provider.listRecordings(ctx.plaudActor.id, input.page);
      })
    ),
  importRecording: mutable
    .input(
      z
        .object({
          leadId,
          recordingId: z.string().min(1).max(255),
          acknowledgedSharing: z.literal(true),
        })
        .strict()
    )
    .mutation(({ ctx, input }) =>
      safe(async () => {
        await requirePlaudImportLead(ctx.plaudActor, input.leadId);
        const recording = await provider.readRecording(
          ctx.plaudActor.id,
          input.recordingId
        );
        return storePlaudImport(ctx.plaudActor, input.leadId, recording);
      })
    ),
  catalogue: signed
    .input(
      z
        .object({
          from: z.string().optional(),
          to: z.string().optional(),
          page: z.number().int().positive().max(1_000_000).default(1),
          pageSize: z
            .union([z.literal(10), z.literal(20), z.literal(50)])
            .default(20),
        })
        .strict()
    )
    .query(({ ctx, input }) =>
      safe(async () => {
        try {
          parsePlaudRange(input, resolvePlaudTimeZone());
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "PLAUD_DATE_RANGE_INVALID",
          });
        }
        return listPlaudCatalogue(ctx.plaudActor, input);
      })
    ),
});
