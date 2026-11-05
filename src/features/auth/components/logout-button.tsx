"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import { postJson, requestApi } from "@/lib/api/client";

export function LogoutButton({
  locale,
  admin = false,
}: Readonly<{ locale: Locale; admin?: boolean }>) {
  const { t } = useTranslation();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setError(null);
    try {
      await requestApi(
        admin ? "/api/v1/admin/auth/logout" : "/api/v1/auth/logout",
        z.object({ loggedOut: z.literal(true) }),
        t("auth.requestFailed"),
        postJson({}),
      );
      router.replace(`/${locale}`);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={logout}
        className="rounded-lg border border-[#d5dfda] px-3 py-2 text-sm font-semibold text-[#123b35] hover:bg-[#f5f8f6]"
      >
        {t("auth.logout")}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
