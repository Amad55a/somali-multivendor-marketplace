import { z } from "zod";
import { handleApiRequest, apiSuccessResponse } from "@/lib/api/responses";
import { parseJson } from "@/lib/api/requests";
import {
  prepareCommunicationWrite,
  requireCommunicationUser,
} from "@/features/communications/http";
import {
  listConversations,
  openProductConversation,
} from "@/features/communications/service";
import { emitConversationEvent } from "@/features/communications/socket-server";

export async function GET(request: Request) {
  return handleApiRequest(async () => {
    const user = await requireCommunicationUser(request);
    const search = new URL(request.url).searchParams.get("q") ?? "";
    return apiSuccessResponse(await listConversations(user, search));
  });
}

export async function POST(request: Request) {
  return handleApiRequest(async () => {
    const user = await requireCommunicationUser(request);
    await prepareCommunicationWrite(request, user, "communication:open", 12, 60);
    const input = await parseJson(request, z.object({ productId: z.uuid() }).strict());
    const result = await openProductConversation(user, input.productId);
    const liveDelivery = emitConversationEvent(
      result.conversationId,
      "conversation:updated",
      { conversationId: result.conversationId },
    );
    return apiSuccessResponse({ ...result, liveDelivery }, 201);
  });
}
