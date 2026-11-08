import { z } from "zod";
import { handleApiRequest, apiSuccessResponse } from "@/lib/api/responses";
import { assertSameOrigin } from "@/lib/api/requests";
import { enforceRateLimit } from "@/features/auth/security";
import { requireCommunicationUser } from "@/features/communications/http";
import { createImageMessage } from "@/features/communications/service";
import { emitConversationEvent } from "@/features/communications/socket-server";
import { removeVendorFile, saveProductImage } from "@/lib/media/vendor-files";
import { AppError } from "@/lib/errors/app-error";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function POST(request: Request, context: RouteContext) {
  return handleApiRequest(async () => {
    const user = await requireCommunicationUser(request);
    const { conversationId } = await context.params;
    const idResult = z.uuid().safeParse(conversationId);
    if (!idResult.success) {
      throw new AppError("VALIDATION_ERROR", 400, "The conversation identifier is invalid.");
    }
    assertSameOrigin(request);
    await enforceRateLimit(
      request,
      `communication:image:${conversationId}`,
      user.id,
      8,
      60,
    );
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
      throw new AppError("UNSUPPORTED_MEDIA_TYPE", 415, "Expected multipart form data.");
    }
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 5_500_000) {
      throw new AppError("PAYLOAD_TOO_LARGE", 413, "The image must be smaller than 5 MB.");
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch (error) {
      if (error instanceof TypeError) {
        throw new AppError("INVALID_MULTIPART_BODY", 400, "The image form is invalid.");
      }
      throw error;
    }
    const clientMessageIdValue = form.get("clientMessageId");
    const fileValues = form.getAll("file");
    if (
      [...form.keys()].some((key) => key !== "file" && key !== "clientMessageId") ||
      typeof clientMessageIdValue !== "string" ||
      !z.uuid().safeParse(clientMessageIdValue).success ||
      fileValues.length !== 1 ||
      !(fileValues[0] instanceof File)
    ) {
      throw new AppError("INVALID_MULTIPART_BODY", 400, "Choose one image and a valid message identifier.");
    }
    const file = fileValues[0];
    if (file.size === 0 || file.size > 5 * 1024 * 1024) {
      throw new AppError("INVALID_FILE", 400, "The image must be smaller than 5 MB.");
    }
    const saved = await saveProductImage(file);
    let message: Awaited<ReturnType<typeof createImageMessage>>;
    try {
      message = await createImageMessage(user, conversationId, {
        clientMessageId: clientMessageIdValue,
        storageKey: saved.storageKey,
        originalName:
          saved.originalName.replace(/[\\/\u0000-\u001f\u007f]/g, "_").trim().slice(0, 255) ||
          "image",
        mimeType: file.type,
        sizeBytes: file.size,
      });
    } catch (error) {
      await removeVendorFile(saved.storageKey);
      throw error;
    }
    if (message.duplicate) {
      await removeVendorFile(saved.storageKey);
    }
    const liveDelivery = message.message
      ? emitConversationEvent(conversationId, "message:new", {
          conversationId,
          message: message.message,
        })
      : false;
    return apiSuccessResponse({
      message: message.message,
      duplicate: message.duplicate,
      liveDelivery,
    }, message.duplicate ? 200 : 201);
  });
}
