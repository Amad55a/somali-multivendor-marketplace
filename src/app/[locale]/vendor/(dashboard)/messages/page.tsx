import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireApprovedVendorPage } from "@/lib/auth/vendor-route-guards";
import { ConversationInbox } from "@/features/communications/components/conversation-inbox";

export const instant = false;

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ conversationId?: string | string[] }>;
};

export default async function VendorMessagesPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requireApprovedVendorPage(locale);
  const query = await searchParams;
  const initialConversationId =
    typeof query.conversationId === "string" ? query.conversationId : undefined;
  return (
    <ConversationInbox
      audience="VENDOR"
      locale={locale}
      userId={user.id}
      initialConversationId={initialConversationId}
    />
  );
}
