import { SupportPortal } from "@/features/support/components/support-portal";

export default async function CustomerSupportTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  return (
    <SupportPortal
      audience="customer"
      page="detail"
      ticketId={ticketId}
    />
  );
}
