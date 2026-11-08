import type { Locale } from "@/i18n/config";

export function SupportRouteFallback({ locale }: Readonly<{ locale: Locale }>) {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="mx-auto flex min-h-[65vh] max-w-6xl items-start px-4 py-10 sm:px-8"
    >
      <div className="w-full animate-pulse rounded-3xl border border-[#e1e9e5] bg-white p-6 shadow-sm sm:p-8">
        <div className="h-4 w-32 rounded bg-[#e7ece9]" />
        <div className="mt-5 h-8 w-2/3 rounded bg-[#e7ece9]" />
        <div className="mt-3 h-4 w-full max-w-xl rounded bg-[#eef2ef]" />
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="h-28 rounded-2xl bg-[#f1f5f3]" />
          <div className="h-28 rounded-2xl bg-[#f1f5f3]" />
        </div>
        <span className="sr-only">
          {locale === "so" ? "Goobtaada gaarka ah ayaa la furayaa." : "Loading your secure workspace."}
        </span>
      </div>
    </main>
  );
}
