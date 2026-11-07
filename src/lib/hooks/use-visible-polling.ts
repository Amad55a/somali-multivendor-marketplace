"use client";

import { useEffect, useRef } from "react";

export function useVisiblePolling(
  callback: () => void | Promise<void>,
  intervalMs = 30_000,
  enabled = true,
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let inFlight = false;
    const refresh = () => {
      if (!active || document.visibilityState === "hidden" || inFlight) return;
      inFlight = true;
      void Promise.resolve(callbackRef.current())
        .catch((error: unknown) => console.error("[live-update] Refresh failed", error))
        .finally(() => {
          inFlight = false;
        });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    const interval = window.setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [enabled, intervalMs]);
}
