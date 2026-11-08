import "server-only";

import { AppError } from "@/lib/errors/app-error";
import { requirePageAccount } from "@/lib/auth/route-guards";
import { assertApprovedVendor } from "@/features/vendors/service";

export async function requireApprovedVendorPage(locale: string) {
  const user = await requirePageAccount("VENDOR", locale);
  try {
    await assertApprovedVendor(user.id, user.accountType);
  } catch (error) {
    if (error instanceof AppError && error.code === "VENDOR_NOT_APPROVED") {
      const { redirect } = await import("next/navigation");
      redirect(`/${locale}/vendor/status`);
    }
    throw error;
  }
  return user;
}
