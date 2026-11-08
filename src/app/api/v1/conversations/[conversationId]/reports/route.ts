import { z } from "zod";
import { handleApiRequest, apiSuccessResponse } from "@/lib/api/responses";
import { parseJson } from "@/lib/api/requests";
import {
  parseCommunicationId,
  prepareCommunicationWrite,
  requireCommunicationUser,
} from "@/features/communications/http";
import { createCommunicationReport } from "@/features/communications/service";

type RouteContext = { params: Promise<{ conversationId: string }> };

const reportSchema = z.object({
  reason: z.enum([
    "SPAM",
    "HARASSMENT",
    "FRAUD",
    "IMPERSONATION",
    "INAPPROPRIATE_CONTENT",
    "OTHER",
  ]),
  explanation: z.string().trim().max(2000).optional(),
}).strict();

export async function POST(request: Request, context: RouteContext) {
  return handleApiRequest(async () => {
    const user = await requireCommunicationUser(request);
    const { conversationId: rawId } = await context.params;
    const conversationId = parseCommunicationId(rawId);
    await prepareCommunicationWrite(request, user, "communication:report", 3, 3600);
    const input = await parseJson(request, reportSchema);
    return apiSuccessResponse(
      await createCommunicationReport(user, conversationId, input),
      201,
    );
  });
}
