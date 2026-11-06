"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import { getRecaptchaToken } from "@/lib/recaptcha/client";

export function SwaggerDocumentation() {
  return (
    <div aria-label="Interactive API reference">
      <SwaggerUI
        url="/api/openapi.json"
        deepLinking
        displayRequestDuration
        filter
        tryItOutEnabled
        withCredentials
        requestInterceptor={async (request) => {
          request.credentials = "include";
          const action = recaptchaAction(request.url, request.body);
          if (action) {
            let body: unknown;
            try {
              body =
                typeof request.body === "string"
                  ? JSON.parse(request.body)
                  : request.body;
            } catch {
              body = undefined;
            }
            const fields =
              typeof body === "object" && body !== null && !Array.isArray(body)
                ? (body as Record<string, unknown>)
                : {};
            request.body = JSON.stringify({
              ...fields,
              recaptchaToken: await getRecaptchaToken(action),
            });
          }
          return request;
        }}
      />
    </div>
  );
}

function recaptchaAction(url: string, requestBody: unknown): string | null {
  const path = new URL(url, window.location.origin).pathname;
  if (path === "/api/v1/auth/customer/register") return "customer_register";
  if (path === "/api/v1/auth/vendor/register") return "vendor_register";
  if (path === "/api/v1/auth/login" || path === "/api/v1/auth/amazon") {
    let body: unknown;
    try {
      body = typeof requestBody === "string" ? JSON.parse(requestBody) : requestBody;
    } catch {
      return null;
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return null;
    }
    return (body as Record<string, unknown>).accountType === "VENDOR"
      ? "vendor_login"
      : "customer_login";
  }
  if (path === "/api/v1/auth/email/resend") return "email_resend";
  if (path === "/api/v1/auth/password/forgot") return "password_forgot";
  if (path === "/api/v1/admin/auth/login") return "admin_login";
  if (path === "/api/v1/vendor/onboarding/submit") {
    return "vendor_onboarding_submit";
  }
  if (path === "/api/v1/vendor/profile-changes/submit") {
    return "vendor_profile_change_submit";
  }
  if (path === "/api/v1/checkout/simulate") return "checkout_simulate";
  return null;
}
