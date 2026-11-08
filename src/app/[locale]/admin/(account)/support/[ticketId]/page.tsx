import { Suspense } from "react";
import { SupportPortal } from "@/features/support/components/support-portal";

export default function AdminSupportTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="mx-auto min-h-[65vh] max-w-6xl px-4 py-10 sm:px-8"
        >
          <div className="animate-pulse rounded-3xl border border-[#e1e9e5] bg-white p-6 shadow-sm sm:p-8">
            <div className="h-4 w-32 rounded bg-[#e7ece9]" />
            <div className="mt-5 h-8 w-2/3 rounded bg-[#e7ece9]" />
            <div className="mt-3 h-4 w-full max-w-xl rounded bg-[#eef2ef]" />
            <div className="mt-8 h-48 rounded-2xl bg-[#f1f5f3]" />
            <span className="sr-only">Loading support ticket.</span>
          </div>
        </main>
      }
    >
      <AdminSupportTicketContent params={params} />
    </Suspense>
  );
}

async function AdminSupportTicketContent({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  return (
    <SupportPortal
      audience="admin"
      page="detail"
      ticketId={ticketId}
    />
  );
}
