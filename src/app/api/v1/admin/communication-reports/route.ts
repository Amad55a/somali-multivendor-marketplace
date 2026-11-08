import { z } from "zod";
import { handleApiRequest, apiSuccessResponse } from "@/lib/api/responses";
import {
  requireCommunicationAdmin,
} from "@/features/communications/http";
import {
  listCommunicationReports,
  reportDate,
} from "@/features/communications/service";
import { createValidationError } from "@/lib/api/requests";

const reportFilters = z.object({
  status: z.enum(["OPEN", "INVESTIGATING", "DISMISSED", "ACTIONED"]).optional(),
  reason: z.enum([
    "SPAM",
    "HARASSMENT",
    "FRAUD",
    "IMPERSONATION",
    "INAPPROPRIATE_CONTENT",
    "OTHER",
  ]).optional(),
  since: z.iso.datetime().optional(),
});

export async function GET(request: Request) {
  return handleApiRequest(async () => {
    await requireCommunicationAdmin(request);
    const params = new URL(request.url).searchParams;
    const parsed = reportFilters.safeParse({
      status: params.get("status") ?? undefined,
      reason: params.get("reason") ?? undefined,
      since: params.get("since") ?? undefined,
    });
    if (!parsed.success) throw createValidationError(parsed.error);
    return apiSuccessResponse(
      await listCommunicationReports({
        status: parsed.data.status,
        reason: parsed.data.reason,
        since: reportDate(parsed.data.since ?? null),
      }),
    );
  });
}
