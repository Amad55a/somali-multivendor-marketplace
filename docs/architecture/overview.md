# Application architecture

## Current implementation

- Next.js App Router, strict TypeScript, PostgreSQL, Prisma ORM 7, and Zod validation.
- Customer/vendor authentication, Amazon OAuth, email verification, password reset, session revocation, administrator OTP/TOTP/recovery-code flows, and vendor onboarding/review are implemented.
- The application uses a short-lived access JWT and a separate rotating refresh token, both held only in HttpOnly cookies. Refresh tokens are stored as hashes in `UserSession` and expire after a bounded persistent-session window.
- API route dispatch is handled by `src/app/api/v1/[...segments]/route.ts`; the shared registry and request/response contracts are in `src/lib/api/v1.ts`.
- OpenAPI 3.0.3 is generated from that registry and served at `/api/openapi.json`; Swagger UI is served at `/api-docs`.
- Prisma models and migrations cover authentication, administrator security, vendor onboarding, product catalogue, marketplace orders, stock reservations, simulated mobile-money payment attempts and receipts, notifications, and an SMS outbox. Payments and SMS are simulation-only; no real provider integrations are implemented.
- Customer, vendor, and administrator screens use authenticated, visibility-aware polling and App Router refreshes for changing counts, orders, stock, and analytics. Polling pauses in hidden tabs and refreshes on visibility, focus, or reconnect.
- Checkout reservations are based on server timestamps, validated again on every payment, and expired by both normal server-side commerce requests and the scheduled `/api/cron/marketplace` job. Production cron requests require `CRON_SECRET`.
- The approved storefront homepage is implemented under `src/features/homepage` and served under the locale routes.

When developing through ngrok, keep the local Next.js server and the current ngrok tunnel running. Cookies are host-only (and production cookies use the `__Host-` prefix), so changing the tunnel hostname starts a new cookie scope; HTTPS must remain enabled for production-like secure-cookie testing.

## Boundaries

```text
src/
  app/                 Next.js route composition, pages, layouts, and API entry points
  components/          Shared UI components
  config/               Validated runtime configuration
  features/
    auth/               Authentication, OAuth, email, MFA, OTP, and session services
    vendors/            Vendor onboarding, review, and related UI
    products/           Public catalogue, product details, and reviews
    commerce/           Cart, reservation-backed orders, simulated payment and SMS outbox
    customer/           Customer profile and marketplace UI
    homepage/           Approved storefront homepage
  i18n/                 Locale dictionaries, types, and routing support
  lib/
    api/                Shared HTTP response conventions and versioned API registry
    errors/             Application error types
    prisma.ts           Server-only shared Prisma client
prisma/
  schema.prisma
  migrations/           Append-only Prisma migrations
tests/
  unit/                 Vitest unit and API contract tests
  integration/          PostgreSQL-backed service/API tests
  e2e/                  Playwright browser tests
```

Keep route handlers thin: validate inputs, enforce authentication/authorization, invoke domain services, and serialize results with the shared API response helpers. Services own business rules and transaction boundaries. Do not query Prisma from UI components.

## Frontend and internationalization

- Keep App Router pages and layouts as React Server Components by default. Use Client Components for browser APIs, local state, and event handlers.
- The homepage is served at `/en` and `/so`; the locale controls server-rendered document language and metadata. `/` redirects using a validated locale preference cookie.
- Keep user-visible copy in `src/i18n/dictionaries`; `src/i18n/types.ts` enforces dictionary parity and typed translation keys.
- The language preference is stored in an HTTP-only cookie and changed through a server action; do not use browser storage or hydration-time locale detection.
- Do not redesign the approved homepage as part of backend work.

## API and security

- All implemented REST endpoints are under `/api/v1`; the authoritative contracts and generated OpenAPI are in `src/lib/api/v1.ts`.
- Success responses use `{ "data": ... }`; errors use `{ "error": { "code": "...", "message": "...", "details"?: [...] } }`. Unknown server failures return a generic error and log only sanitized information.
- Validate request bodies, query/path parameters, and environment values at system boundaries. Never trust a browser-supplied account type or authorization decision.
- Session authentication is server-checked against the `UserSession` row. Access credentials are only returned through an HttpOnly cookie. Same-origin checks protect mutating cookie-authenticated requests.
- Public registration is limited to customers and vendors. Administrators are provisioned through the controlled script, not a public endpoint.
- Vendor approval is separate from registration. Only authorized admins can review applications, and restricted selling actions must check approved vendor status.
- Do not expose stack traces, SQL details, credentials, OTPs, OAuth tokens, or provider secrets in API responses or logs.

## Persistence and migrations

- `prisma/schema.prisma` is the application model source of truth; Prisma ORM 7 configuration is in `prisma7.config.ts`.
- Use `src/lib/prisma.ts` for the shared generated Prisma client and PostgreSQL adapter.
- The configured development database was checked after the simulated-payment migration was deployed: all 15 migrations were applied. This is not a guarantee about CI, staging, or production.
- Preserve applied migration history. Make schema changes through new versioned migrations; do not reset a database or use `db push` to bypass migration history.
- Migration-managed PostgreSQL CHECK constraints for provider account types are not represented in Prisma schema syntax; see the database design document.
- Keep secrets server-only and validate required environment variables. Never prefix secrets with `NEXT_PUBLIC_` or overwrite `.env` as part of implementation.

## Quality and CI

Available local commands include `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`, and `npm run test:e2e`. Integration tests require an isolated `TEST_DATABASE_URL`; do not run them against a developer database.

GitHub Actions provisions PostgreSQL 18, applies migrations to its isolated database, and runs Prisma generation, lint, unit tests, backend integration tests, typecheck, production build, and Playwright browser tests.

## Implemented and future domains

Implemented database/API functionality includes authentication, administrator security, vendor onboarding and review, the product catalogue, marketplace commerce, and persisted administrator/vendor notifications. Consult the current Prisma schema and versioned migrations for the authoritative feature set; future proposals are not implemented unless represented there.
