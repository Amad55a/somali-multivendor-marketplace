# OpenAPI 3.0.3 Specification & Swagger UI

Somsuuq generates its OpenAPI contract directly from executable route definitions using `@asteasolutions/zod-to-openapi`. This ensures that documentation and actual runtime request validation can never drift out of sync.

---

## 1. Specification Endpoints

- **Specification Route:** `GET /api/openapi.json`
- **Interactive UI Route:** `GET /api-docs`
- **Source Code Generator:** [`generateOpenApiDocument()` in `src/lib/api/v1.ts`](../../src/lib/api/v1.ts)

The OpenAPI endpoint sends `Cache-Control: no-store` to ensure that API changes in development or staging are immediately visible to clients and tooling.

---

## 2. Interactive Swagger UI & Authentication

The Swagger documentation interface is implemented in [`src/app/api-docs/swagger-ui.tsx`](../../src/app/api-docs/swagger-ui.tsx) with custom enhancements for Somsuuq security requirements:

1. **Session Cookie Propagation:**  
   Configured with `withCredentials = true` and `request.credentials = "include"`. When you sign in via `POST /api/v1/auth/login` or `POST /api/v1/admin/auth/mfa/verify`, your browser stores the HttpOnly session cookie, which is automatically included in subsequent Swagger requests.
2. **Automatic reCAPTCHA v3 Interceptor:**  
   Protected endpoints require bot verification. The custom Swagger request interceptor inspects the outgoing URL and automatically injects a fresh reCAPTCHA token into the request body for:
   - `customer_register` (`/api/v1/auth/customer/register`)
   - `vendor_register` (`/api/v1/auth/vendor/register`)
   - `customer_login` / `vendor_login` (`/api/v1/auth/login`)
   - `admin_login` (`/api/v1/admin/auth/login`)
   - `email_resend` (`/api/v1/auth/email/resend`)
   - `password_forgot` (`/api/v1/auth/password/forgot`)
   - `vendor_onboarding_submit` (`/api/v1/vendor/onboarding/submit`)
   - `vendor_profile_change_submit` (`/api/v1/vendor/profile-changes/submit`)
   - `checkout_simulate` (`/api/v1/checkout/pay`)

---

## 3. OpenAPI Tag Taxonomy

Endpoints in the generated specification are grouped into distinct domain tags:

| Tag | Domain Coverage |
|---|---|
| `Authentication` | Customer/vendor registration, login, logout, password recovery, email verification, Amazon OAuth |
| `Customer` | Customer profile management, profile photos, notifications, orders, returns, cart, reviews |
| `Vendor Onboarding` | Vendor draft creation, document uploads, application status, review lifecycle |
| `Vendor` | Vendor storefront, product management, inventory updates, sub-order fulfillment, payouts, coupons |
| `Marketplace` | Public product browsing, categories, images, logos, verified review viewing |
| `Admin` | Platform overview, user management, audit logs, vendor reviews, category administration |
| `Admin Support` | Support inbox management, ticket assignment, internal notes, resolution |
| `Support` | Customer and vendor support ticket filing, messages, private attachments, AI assistance |
| `Users` | Public user profile and photo lookups |

---

## 4. Contract Testing & Validation

The OpenAPI contract is continuously tested in the unit test suite (`tests/unit/openapi.test.ts`):

```bash
npm run test -- tests/unit/openapi.test.ts
```

The test asserts:
- Valid OpenAPI version `3.0.3`.
- Correct cookie security schemes (`sessionCookie: []`).
- Path parameters and query parameters are documented.
- No sensitive environment secrets (e.g., `AUTH_SECRET`, `ADMIN_MFA_ENCRYPTION_KEY`) or raw refresh tokens are exposed.
