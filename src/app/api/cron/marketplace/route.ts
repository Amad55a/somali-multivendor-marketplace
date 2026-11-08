import { NextRequest } from "next/server";
import { expireReservations } from "@/features/commerce/inventory";
import { expireStaleVendorOrders } from "@/features/commerce/service";
import { createWeeklyPayoutBatch } from "@/features/commerce/financial-service";
import { apiErrorResponse, apiSuccessResponse } from "@/lib/api/responses";
import { AppError } from "@/lib/errors/app-error";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if ((!expected && process.env.NODE_ENV === "production") ||
    (expected && request.headers.get("authorization") !== `Bearer ${expected}`)) {
    return apiErrorResponse(new AppError("UNAUTHENTICATED", 401, "Unauthorized."));
  }
  await expireReservations();
  await expireStaleVendorOrders();
  const payoutBatch = await createWeeklyPayoutBatch(null);
  return apiSuccessResponse({ ok: true, payoutBatchId: payoutBatch.id, simulated: true });
}
