import { handleApiRequest } from "@/lib/api/responses";
import { parseCommunicationId, requireCommunicationUser } from "@/features/communications/http";
import { getConversationImage } from "@/features/communications/service";
import { readVendorFile } from "@/lib/media/vendor-files";

type RouteContext = {
  params: Promise<{ conversationId: string; attachmentId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return handleApiRequest(async () => {
    const user = await requireCommunicationUser(request);
    const { conversationId: rawConversationId, attachmentId: rawAttachmentId } =
      await context.params;
    const conversationId = parseCommunicationId(rawConversationId);
    const attachmentId = parseCommunicationId(rawAttachmentId);
    const attachment = await getConversationImage(user, conversationId, attachmentId);
    const bytes = await readVendorFile(attachment.storageKey);
    return new Response(bytes, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  });
}
