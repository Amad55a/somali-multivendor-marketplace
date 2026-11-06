import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getAdminPaymentAttempt } from "@/features/commerce/marketplace-workflow";
import { isLocale } from "@/i18n/config";
import { requirePageAccount } from "@/lib/auth/route-guards";

export default async function AdminPaymentAttemptPage({
  params,
}: {
  params: Promise<{ locale: string; paymentId: string }>;
}) {
  const { locale, paymentId } = await params;
  if (!isLocale(locale) || !z.uuid().safeParse(paymentId).success) notFound();
  await requirePageAccount("ADMIN", locale);
  const payment = await getAdminPaymentAttempt(paymentId);
  if (!payment) notFound();
  const somali = locale === "so";

  return (
    <main className="mx-auto max-w-4xl">
      <Link href={`/${locale}/admin/sms-outbox`} className="text-sm font-semibold text-[#8b5e08]">
        {somali ? "Ku noqo sanduuqa SMS-ka" : "Back to SMS outbox"}
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-[#123b35]">{somali ? "Faahfaahinta lacag-bixinta" : "Payment attempt details"}</h1>
      <p className="mt-2 text-sm font-bold text-amber-800">{somali ? "LACAG-BIXIN LA MATALAY OO KELIYA" : "SIMULATED PAYMENT ONLY"}</p>
      <section className="mt-5 grid gap-3 rounded-2xl border bg-white p-5 sm:grid-cols-2">
        <p><strong>ID:</strong> <span className="break-all font-mono text-sm">{payment.id}</span></p>
        <p><strong>{somali ? "Xaalad" : "Status"}:</strong> {payment.status}</p>
        <p><strong>{somali ? "Macmiil" : "Customer"}:</strong> {payment.customer.displayName ?? payment.customer.email} ({payment.customer.email})</p>
        <p><strong>{somali ? "Habka" : "Method"}:</strong> {payment.method?.replace("_", " ") ?? "—"}</p>
        <p><strong>{somali ? "Telefoon la qariyey" : "Masked phone"}:</strong> {payment.maskedPhone ?? "—"}</p>
        <p><strong>{somali ? "Lacagta" : "Amount"}:</strong> {payment.currency} {payment.amount}</p>
        <p><strong>{somali ? "Bixiye" : "Adapter"}:</strong> {payment.provider}</p>
        <p><strong>{somali ? "Tixraac" : "Transaction reference"}:</strong> {payment.transactionReference ?? "—"}</p>
        <p><strong>{somali ? "La sameeyay" : "Created"}:</strong> {new Date(payment.createdAt).toLocaleString(locale)}</p>
        <p><strong>{somali ? "Sababta fashilka" : "Failure reason"}:</strong> {payment.failureReason ?? "—"}</p>
      </section>
      {payment.order && (
        <section className="mt-6 rounded-2xl border bg-white p-5">
          <h2 className="text-xl font-bold">{somali ? "Dalab" : "Order"} {payment.order.orderNumber}</h2>
          <p className="mt-1 text-sm text-slate-600">{payment.order.status} · {payment.order.paymentStatus} · {payment.currency} {payment.order.total}</p>
          {payment.receipt && <p className="mt-2 text-sm">{somali ? "Rasiid" : "Receipt"}: {payment.receipt.receiptNumber}</p>}
          <div className="mt-4 grid gap-3">
            {payment.order.vendorOrders.map((vendorOrder) => (
              <article key={vendorOrder.id} className="rounded-xl bg-slate-50 p-3">
                <p className="font-semibold">{vendorOrder.storeName ?? vendorOrder.id} · {vendorOrder.status}</p>
                <ul className="mt-2 grid gap-1 text-sm">
                  {vendorOrder.lines.map((line, index) => <li key={`${line.productName}-${index}`}>{line.productName} · {line.variantName} × {line.quantity} · {payment.currency} {line.unitPrice}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
