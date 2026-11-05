"use client";

type GoogleRecaptcha = {
  ready: (callback: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
};

declare global {
  interface Window {
    grecaptcha?: GoogleRecaptcha;
  }
}

let scriptPromise: Promise<void> | undefined;

export async function getRecaptchaToken(action: string): Promise<string> {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (!siteKey) {
    throw new Error("Bot protection is not configured. Please contact support.");
  }

  await loadRecaptchaScript(siteKey);
  const recaptcha = window.grecaptcha;
  if (!recaptcha) {
    throw new Error("Bot verification could not start. Please try again.");
  }

  await new Promise<void>((resolve) => recaptcha.ready(resolve));
  const token = await recaptcha.execute(siteKey, { action });
  if (!token) {
    throw new Error("Bot verification could not complete. Please try again.");
  }
  return token;
}

function loadRecaptchaScript(siteKey: string): Promise<void> {
  if (window.grecaptcha) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = undefined;
      reject(new Error("Bot verification could not load. Please try again."));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}
