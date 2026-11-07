import "server-only";

import { cookies } from "next/headers";
import { AppError } from "@/lib/errors/app-error";
import { requireUser } from "@/features/auth/sessions";
import { SiteHeader } from "@/components/layout/site-header";

async function getOptionalUser() {
  const cookieStore = await cookies();
  const request = new Request("https://somsuuq.internal/", {
    headers: {
      cookie: cookieStore.getAll().map(({ name, value }) => `${name}=${value}`).join("; "),
    },
  });

  try {
    return await requireUser(request);
  } catch (error) {
    if (error instanceof AppError && error.status === 401) return null;
    throw error;
  }
}

export async function CustomerAwareSiteHeader() {
  const user = await getOptionalUser();
  const isVerifiedCustomer =
    user?.accountType === "CUSTOMER" && (user.emailVerifiedAt !== null || user.hasAmazonIdentity);
  return (
    <SiteHeader
      authenticated={isVerifiedCustomer}
      customerName={isVerifiedCustomer ? user.displayName : null}
      customerEmail={isVerifiedCustomer ? user.email : null}
      customerHasPhoto={isVerifiedCustomer ? user.hasProfilePhoto : false}
    />
  );
}
