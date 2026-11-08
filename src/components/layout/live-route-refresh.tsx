"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

export function LiveRouteRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  const enabled = /^\/[a-z]{2}\/(customer|vendor|admin)(\/|$)/.test(pathname);
  const refresh = useCallback(() => router.refresh(), [router]);

  useVisiblePolling(refresh, 30_000, enabled);
  return null;
}
