"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "@/i18n/hooks/use-translation";

const THEME_STORAGE_KEY = "somsuuq-theme";
const THEME_CHANGE_EVENT = "somsuuq-theme-change";

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}

function getSnapshot() {
  return document.documentElement.dataset.theme === "dark";
}

function getServerSnapshot() {
  return false;
}

function applyTheme(isDark: boolean, persist: boolean) {
  const theme = isDark ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  if (persist) {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function ThemeToggle() {
  const { t } = useTranslation();
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "dark" || savedTheme === "light") {
      applyTheme(savedTheme === "dark", false);
    }
  }, []);

  return (
    <button
      type="button"
      aria-label={isDark ? t("header.lightTheme") : t("header.darkTheme")}
      onClick={() => applyTheme(!isDark, true)}
      className="grid size-10 shrink-0 place-items-center rounded-lg text-[#123b35] transition-colors hover:bg-[#f1f5f3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123b35]"
    >
      {isDark ? (
        <Sun aria-hidden="true" className="size-5" />
      ) : (
        <Moon aria-hidden="true" className="size-5" />
      )}
    </button>
  );
}
