import { handleApiRequest, apiSuccessResponse } from "@/lib/api/responses";
import {
  parseCommunicationId,
  prepareCommunicationWrite,
  requireCommunicationUser,
} from "@/features/communications/http";
import {
  getConversationPresence,
  recordConversationHeartbeat,
} from "@/features/communications/service";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function GET(request: Request, context: RouteContext) {
  return handleApiRequest(async () => {
    const user = await requireCommunicationUser(request);
    const { conversationId: rawId } = await context.params;
    const conversationId = parseCommunicationId(rawId);
    return apiSuccessResponse(await getConversationPresence(user, conversationId));
  });
}

export async function POST(request: Request, context: RouteContext) {
  return handleApiRequest(async () => {
    const user = await requireCommunicationUser(request);
    const { conversationId: rawId } = await context.params;
    const conversationId = parseCommunicationId(rawId);
    await prepareCommunicationWrite(request, user, "communication:presence", 120, 60);
    return apiSuccessResponse(await recordConversationHeartbeat(user, conversationId));
  });
}
