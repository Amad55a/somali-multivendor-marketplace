import { SupportPortal } from "@/features/support/components/support-portal";

export default async function VendorSupportTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  return <SupportPortal audience="vendor" page="detail" ticketId={ticketId} />;
}
