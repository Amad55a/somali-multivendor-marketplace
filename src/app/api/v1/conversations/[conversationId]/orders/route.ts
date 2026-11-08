import { handleApiRequest, apiSuccessResponse } from "@/lib/api/responses";
import {
  parseCommunicationId,
  requireCommunicationUser,
} from "@/features/communications/http";
import { listShareableOrders } from "@/features/communications/service";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function GET(request: Request, context: RouteContext) {
  return handleApiRequest(async () => {
    const user = await requireCommunicationUser(request);
    const { conversationId: rawId } = await context.params;
    const conversationId = parseCommunicationId(rawId);
    return apiSuccessResponse(await listShareableOrders(user, conversationId));
  });
}
