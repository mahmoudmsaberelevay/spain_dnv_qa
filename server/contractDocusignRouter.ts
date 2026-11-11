import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { requireDocusignActor, requireSigningOrigin } from "./contractDocusignAccess";
import { configReadiness, DocusignError } from "./contractDocusignConfig";
import { getContractDocusignService } from "./contractDocusignService";
const staffRead = publicProcedure.use(async ({ ctx, next }) => next({ ctx: { ...ctx, docusignActor: await requireDocusignActor(ctx.req) } }));
const staffManage = publicProcedure.use(async ({ ctx, next }) => next({ ctx: { ...ctx, docusignActor: await requireDocusignActor(ctx.req, true) } }));
const contractInput = z.object({ contractId: z.number().int().positive() }).strict();
const envelopeInput = z.object({ id: z.string().uuid() }).strict();
async function safe<T>(operation: () => Promise<T>, publicRequest = false): Promise<T> {
  try { return await operation(); } catch (error) {
    // Never attach cause/provider body, credentials, URLs, raw DB exceptions or tokens.
    const code = error instanceof DocusignError ? error.safeCode : "DOCUSIGN_OPERATION_FAILED";
    throw new TRPCError({ code: publicRequest ? "BAD_REQUEST" : "PRECONDITION_FAILED", message: publicRequest ? "Signing link unavailable. Please contact ELEVAY." : code });
  }
}
export const contractDocusignRouter = router({
  readiness: staffRead.query(({ ctx }) => ({ ...configReadiness(), canManage: ctx.docusignActor.canManage })),
  history: staffRead.input(contractInput).query(({ input }) => safe(async () => {
    // History is available before credentials are configured; never contacts provider.
    const { docusignStore } = await import("./contractDocusignStore");
    const { safeEnvelope } = await import("./contractDocusignService");
    if (!await docusignStore.contract(input.contractId)) throw new DocusignError("CONTRACT_UNAVAILABLE");
    return (await docusignStore.list(input.contractId)).map(row => safeEnvelope(row));
  })),
  prepare: staffManage.input(contractInput.extend({ requestId: z.string().uuid(), recipientName: z.string().trim().min(1).max(100).refine(value => !/[\x00-\x1f\x7f]/.test(value)), recipientEmail: z.string().trim().email().max(254), confirmed: z.literal(true) })).mutation(({ input, ctx }) => safe(() => getContractDocusignService().prepare(input, ctx.docusignActor))),
  senderView: staffManage.input(envelopeInput).mutation(({ input }) => safe(() => getContractDocusignService().senderView(input.id))),
  refresh: staffManage.input(envelopeInput).mutation(({ input }) => safe(() => getContractDocusignService().refresh(input.id))),
  signingLink: staffManage.input(envelopeInput).mutation(({ input }) => safe(() => getContractDocusignService().signingLink(input.id))),
  revokeLink: staffManage.input(envelopeInput).mutation(({ input }) => safe(async () => {
    const { docusignStore } = await import("./contractDocusignStore");
    await docusignStore.withEnvelopeLock(input.id, async (_row, ledger) => ledger.patch(input.id, { revokedAt: new Date(), updatedAt: new Date() }));
    return { success: true as const };
  })),
  startSigning: publicProcedure.input(envelopeInput.extend({ token: z.string().regex(/^[0-9a-f]{64}$/i) })).mutation(({ input, ctx }) => {
    requireSigningOrigin(ctx.req);
    ctx.res.setHeader("Cache-Control", "no-store, private");
    ctx.res.setHeader("Referrer-Policy", "no-referrer");
    return safe(() => getContractDocusignService().startSigning(input.id, input.token), true);
  }),
});
