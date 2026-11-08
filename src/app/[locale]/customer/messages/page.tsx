import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requirePageAccount } from "@/lib/auth/route-guards";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ConversationInbox } from "@/features/communications/components/conversation-inbox";

export const instant = false;

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ conversationId?: string | string[] }>;
};

export default async function CustomerMessagesPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requirePageAccount("CUSTOMER", locale);
  const query = await searchParams;
  const initialConversationId =
    typeof query.conversationId === "string" ? query.conversationId : undefined;
  return (
    <div className="site-chrome">
      <SiteHeader
        authenticated
        customerName={user.displayName ?? null}
        customerEmail={user.email}
        customerHasPhoto={user.hasProfilePhoto}
      />
      <ConversationInbox
        audience="CUSTOMER"
        locale={locale}
        userId={user.id}
        initialConversationId={initialConversationId}
      />
      <SiteFooter />
    </div>
  );
}
