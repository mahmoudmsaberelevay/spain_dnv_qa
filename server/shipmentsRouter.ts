import { TRPCError } from "@trpc/server";
import {
  EMPTY_SHIPMENT_FILTERS,
  safeShipmentIssuer,
  shipmentCreateSchema,
  shipmentListSchema,
  shipmentReportSchema,
  type ShipmentReport,
} from "../shared/shipments";
import { protectedProcedure, router } from "./_core/trpc";
import { writeAuditLog } from "./auditLog";
import {
  createShipment,
  getShipmentReportRows,
  listShipments,
  ShipmentError,
} from "./shipmentsService";

async function shipmentAction<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ShipmentError) {
      throw new TRPCError({
        code:
          error.reason === "REPORT_TOO_LARGE" ? "BAD_REQUEST" : error.reason,
        message: error.message,
      });
    }
    // Never expose raw driver errors, SQL, bound params or Drive URL content.
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "The shipment action could not be completed. Please try again or contact support.",
    });
  }
}

// Ordinary authenticated CRM users can use all three procedures. This does not
// change session verification, special module/page grants, or call authorization.
export const shipmentsRouter = router({
  list: protectedProcedure
    .input(shipmentListSchema)
    .query(({ input }) => shipmentAction(() => listShipments(input))),
  create: protectedProcedure
    .input(shipmentCreateSchema)
    .mutation(({ input, ctx }) =>
      shipmentAction(async () => {
        const result = await createShipment(input, ctx.user.id);
        if (result.created) {
          await writeAuditLog(
            { userId: ctx.user.id },
            "create",
            "crm_shipment",
            result.row.id
          );
        }
        return result;
      })
    ),
  report: protectedProcedure
    .input(shipmentReportSchema)
    .query(({ input, ctx }) =>
      shipmentAction(
        async (): Promise<ShipmentReport> => ({
          rows: await getShipmentReportRows(input),
          generatedAt: new Date(),
          generatedBy: safeShipmentIssuer(ctx.user.name),
          ...(input.shipmentId !== undefined
            ? { shipmentId: input.shipmentId }
            : {}),
          filters: { ...(input.filters ?? EMPTY_SHIPMENT_FILTERS) },
        })
      )
    ),
});
