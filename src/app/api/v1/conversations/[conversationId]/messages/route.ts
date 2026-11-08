import { z } from "zod";
import { handleApiRequest, apiSuccessResponse } from "@/lib/api/responses";
import { parseJson } from "@/lib/api/requests";
import {
  parseCommunicationId,
  prepareCommunicationWrite,
  requireCommunicationUser,
} from "@/features/communications/http";
import {
  listConversationMessages,
  sendConversationMessage,
} from "@/features/communications/service";
import {
  emitConversationEvent,
} from "@/features/communications/socket-server";
import { locationCoordinatesSchema } from "@/features/communications/location";

type RouteContext = { params: Promise<{ conversationId: string }> };

const messageSchema = z.object({
  clientMessageId: z.uuid(),
  content: z.string().trim().min(1).max(4000).optional(),
  productId: z.uuid().optional(),
  orderId: z.uuid().optional(),
  location: locationCoordinatesSchema.optional(),
}).strict();

export async function GET(request: Request, context: RouteContext) {
  return handleApiRequest(async () => {
    const user = await requireCommunicationUser(request);
    const { conversationId: rawId } = await context.params;
    const conversationId = parseCommunicationId(rawId);
    const beforeIdValue = new URL(request.url).searchParams.get("before");
    const beforeId = beforeIdValue ? parseCommunicationId(beforeIdValue) : undefined;
    const result = await listConversationMessages(user, conversationId, beforeId);
    return apiSuccessResponse(result);
  });
}

export async function POST(request: Request, context: RouteContext) {
  return handleApiRequest(async () => {
    const user = await requireCommunicationUser(request);
    const { conversationId: rawId } = await context.params;
    const conversationId = parseCommunicationId(rawId);
    await prepareCommunicationWrite(
      request,
      user,
      `communication:message:${conversationId}`,
      20,
      60,
    );
    const input = await parseJson(request, messageSchema);
    const result = await sendConversationMessage(user, conversationId, input);
    const liveDelivery = result.message
      ? emitConversationEvent(conversationId, "message:new", {
          conversationId,
          message: result.message,
        })
      : false;
    return apiSuccessResponse({
      message: result.message,
      duplicate: result.duplicate,
      liveDelivery,
    }, result.duplicate ? 200 : 201);
  });
}
