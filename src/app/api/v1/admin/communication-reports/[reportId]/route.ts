import { z } from "zod";
import { handleApiRequest, apiSuccessResponse } from "@/lib/api/responses";
import { parseJson } from "@/lib/api/requests";
import {
  parseCommunicationId,
  prepareCommunicationWrite,
  requireCommunicationAdmin,
} from "@/features/communications/http";
import { reviewCommunicationReport } from "@/features/communications/service";

type RouteContext = { params: Promise<{ reportId: string }> };

const reviewSchema = z.object({
  status: z.enum(["INVESTIGATING", "DISMISSED", "ACTIONED"]),
  decisionReason: z.string().trim().min(1).max(1000),
}).strict();

export async function PATCH(request: Request, context: RouteContext) {
  return handleApiRequest(async () => {
    const admin = await requireCommunicationAdmin(request);
    const { reportId: rawId } = await context.params;
    const reportId = parseCommunicationId(rawId);
    await prepareCommunicationWrite(request, admin, "admin:communication-report", 30, 60);
    const input = await parseJson(request, reviewSchema);
    return apiSuccessResponse(
      await reviewCommunicationReport(admin, reportId, input),
    );
  });
}
