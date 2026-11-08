import { handleApiRequest, apiSuccessResponse } from "@/lib/api/responses";
import {
  parseCommunicationId,
  prepareCommunicationWrite,
  requireCommunicationUser,
} from "@/features/communications/http";
import { blockConversationParticipant } from "@/features/communications/service";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function POST(request: Request, context: RouteContext) {
  return handleApiRequest(async () => {
    const user = await requireCommunicationUser(request);
    const { conversationId: rawId } = await context.params;
    const conversationId = parseCommunicationId(rawId);
    await prepareCommunicationWrite(request, user, "communication:block", 10, 3600);
    return apiSuccessResponse(await blockConversationParticipant(user, conversationId), 201);
  });
}
