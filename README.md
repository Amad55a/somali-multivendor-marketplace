# Somsuuq (Soomaali Suuq) — Somali Multi-Vendor E-Commerce Marketplace

[![Next.js 16](https://img.shields.io/badge/Next.js-16.4.5-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.3.0-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma 7](https://img.shields.io/badge/Prisma-7.10.1-2D3748?style=flat&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B%20%2F%2016%2B-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind-v4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Vitest-125%20Passed-green?style=flat&logo=vitest)](https://vitest.dev/)
[![OpenAPI 3.0.3](https://img.shields.io/badge/OpenAPI-3.0.3-85EA2D?style=flat&logo=openapi-initiative)](http://localhost:3000/api-docs)

---

## Table of Contents

- [A. Project Introduction](#a-project-introduction)
- [B. Feature Availability Matrix](#b-feature-availability-matrix)
- [C. Technology Stack](#c-technology-stack)
- [D. System Architecture](#d-system-architecture)
- [E. Complete Installation Guide](#e-complete-installation-guide)
- [F. Environment Variables Specification](#f-environment-variables-specification)
- [G. Demo Accounts & Provisioning](#g-demo-accounts--provisioning)
- [H. Screenshots & Visual Assets](#h-screenshots--visual-assets)
- [I. Testing & Verification Suite](#i-testing--verification-suite)
- [J. Production Deployment Guide](#j-production-deployment-guide)
- [K. Security Architecture & Limitations](#k-security-architecture--limitations)
- [L. Assumptions & Future Roadmap](#l-assumptions--future-roadmap)
- [Documentation Index](#documentation-index)

---

## A. Project Introduction

**Somsuuq** (*Soomaali Suuq*) is a comprehensive, production-engineered multi-vendor marketplace designed specifically to bridge Somali retail commerce with digital infrastructure.

### The Problem
Somali commerce across Mogadishu, Hargeisa, Bosaso, Kismayo, and the diaspora operates with vibrant commercial momentum but faces severe structural challenges:
- **Fragmentation:** Local souks (Bakaaro, Suuq Bacad, Islii, Suuqa Hoose) lack centralized digital discoverability.
- **Payment Barriers:** Traditional e-commerce platforms mandate credit cards (Visa/Mastercard), which are largely inaccessible to Somali consumers who rely overwhelmingly on mobile-money ecosystems (EVC Plus, Zaad, eDahab).
- **Multi-Vendor Coordination:** Disconnected merchants struggle with digital storefront management, order confirmation tracking, and fair commission calculations.
- **Language Exclusion:** Mainstream global platforms lack native Somali linguistic support and localized address conventions.

### Project Objectives
1. Provide a modern, bilingual (**Af-Soomaali** and **English**) e-commerce platform.
2. Enable merchants across Somali regions to register, pass verification, establish digital storefronts, and manage inventory.
3. Facilitate atomic multi-vendor cart checkouts with 10-minute optimistic stock reservations.
4. Model local payment habits through mobile-money workflows (EVC Plus, Zaad, eDahab).
5. Implement a double-entry general ledger to handle category commissions, delivery splits, and vendor payouts.
6. Provide customer/vendor support ticketing with private attachments and optional AI triage.

### Project Background
Somsuuq was developed as part of the **SIMAD iLab Somalia 10X Challenge**, a venture development initiative spearheaded by **SIMAD University** to accelerate high-impact tech innovation addressing real-world economic challenges in the Horn of Africa.

### Current Development & Deployment Status
- **Core Marketplace Engine:** Fully functional and tested (125 unit tests passing).
- **Database Layer:** Production-ready schema with 57 models, 32 enums, and 22 applied migrations.
- **API Surface:** 137 OpenAPI 3.0.3 documented endpoints with Swagger UI.
- **Payments & SMS:** Currently executed through a deterministic **simulation adapter** (no live telecom API contracts attached).
- **Real-Time Chat:** Fully functional via Socket.IO when running persistent Node server (`server.ts`).

---

## B. Feature Availability Matrix

The following table documents the implementation status across all 30 core functional domains:

| # | Feature Domain | Customer Capabilities | Vendor Capabilities | Admin Capabilities | Status | Relevant Routes / Modules |
|---|---|---|---|---|---|---|
| 1 | **Authentication & Registration** | Email/password sign-up, pending OTP verification, session cookies. | Vendor account sign-up, session cookies, onboarding redirect. | Private provisioning only; session renewal. | **DONE** | `/api/v1/auth/*`, `src/features/auth/` |
| 2 | **Amazon OAuth (LWA)** | One-click login with Amazon profile linking via PKCE. | One-click login with Amazon for merchant account. | Not available for administrative roles. | **DONE** | `/api/v1/auth/amazon*`, `src/features/auth/amazon.ts` |
| 3 | **Email OTP & Password Recovery** | 6-digit OTP verification; password reset request and confirm. | 6-digit OTP verification; password reset request and confirm. | Email OTP challenge required at sign-in. | **DONE** | `/api/v1/auth/email/*`, `src/features/auth/service.ts` |
| 4 | **Role Authorization & Admin MFA** | Role-bound route guards (`CUSTOMER`). | Role-bound route guards (`VENDOR`). | Two-factor TOTP setup, verify, recovery codes, AES-256 key. | **DONE** | `src/features/auth/admin-service.ts`, `src/config/env.ts` |
| 5 | **Vendor Onboarding & Approval** | Browse approved storefronts. | Multi-step draft, license/logo upload, location selection, submit. | Application inbox, inspect files, approve, reject, request info. | **DONE** | `/api/v1/vendor/onboarding*`, `src/features/vendors/` |
| 6 | **Catalogue & Product Variants** | Browse variants, prices, images, stock availability. | Create, edit, publish, archive products; manage variant options. | View all products, moderate listings, inspect categories. | **DONE** | `/api/v1/products*`, `src/features/products/` |
| 7 | **Bilingual Somali & English** | Dynamic locale toggle (`/en`, `/so`); translated product fields. | Bilingual dashboard copy and bilingual product field inputs. | Bilingual dashboard and notification broadcasts. | **DONE** | `src/i18n/`, `src/app/[locale]/` |
| 8 | **Categories & Subcategories** | Browse category taxonomy tree and filter products. | Select subcategories when listing items. | Create, update, activate/deactivate categories and hierarchy. | **DONE** | `/api/v1/categories`, `src/features/products/service.ts` |
| 9 | **Search, Filtering & Sorting** | Full-text search (EN/SO), filter by region, rating, price. | Search within own product inventory. | Search across products, users, applications, and audit logs. | **DONE** | `/api/v1/products`, `src/features/products/` |
| 10 | **Cart & Multi-Vendor Checkout** | Persistent user cart, guest cookie cart, multi-vendor items. | View sub-orders generated from split checkouts. | Inspect platform cart and checkout metrics. | **DONE** | `/api/v1/cart*`, `/api/v1/checkout*` |
| 11 | **Inventory & Stock Reservations** | 10-minute optimistic stock lock during checkout countdown. | Inventory level tracking, variant stock adjustment. | Automated minute-cron reservation expiration sweep. | **DONE** | `src/features/commerce/inventory.ts`, `/api/cron/marketplace` |
| 12 | **Simulated Mobile Money** | Pay via EVC Plus, Zaad, or eDahab (numbers ending `0000` fail). | Receives confirmed sub-orders upon simulated capture. | View payment records, receipts, and simulation outcomes. | **DONE** | `src/features/commerce/marketplace-workflow.ts` |
| 13 | **Parent Orders & Sub-Orders** | View aggregate order with multi-vendor item grouping. | Receives isolated sub-order (`VendorOrder`) with 24h confirmation. | Inspect all orders, sub-orders, and shipping lines. | **DONE** | `src/features/commerce/service.ts` |
| 14 | **Vendor Order Management** | Track sub-order progress (Confirmed, Processing, Shipped). | Update status, assign courier name and tracking number. | Monitor vendor order confirmation compliance. | **DONE** | `/api/v1/vendor/orders*`, `src/features/vendors/` |
| 15 | **Verified Reviews & Ratings** | Post 1-5 star review with optional photo for delivered items. | Read reviews on own store products; aggregate rating. | Moderate reviews (audit-logged hide/restore actions). | **DONE** | `/api/v1/products/{id}/reviews`, `src/features/commerce/` |
| 16 | **Vendor & Platform Coupons** | Apply vendor or platform coupons during checkout quote. | Create store-funded coupons with usage limits and expiry. | Create platform-wide subsidized coupons. | **DONE** | `/api/v1/coupons`, `src/features/commerce/` |
| 17 | **Returns, Refunds & Disputes** | Request return within 7 days of delivery with photo evidence. | Review return (approve, reject, receive & restock). | Intervene in escalated disputes (uphold, overturn, message). | **DONE** | `/api/v1/returns*`, `src/features/commerce/returns.ts` |
| 18 | **Commission Management** | Transparent checkout pricing (no hidden buyer surcharge). | View category commission rates applicable to products. | Set default platform commission and category overrides. | **DONE** | `/api/v1/admin/commissions*`, `src/features/commerce/` |
| 19 | **Vendor Statements & Payouts** | N/A | View ledger statement, sales, deductions, weekly payout status. | Preview weekly balances, create batches, approve payouts. | **DONE** | `/api/v1/vendor/payouts`, `/api/v1/admin/payouts*` |
| 20 | **Financial Reconciliation** | N/A | N/A | Compare paid orders vs general ledger entries vs payouts. | **DONE** | `/api/v1/admin/financial-reconciliation` |
| 21 | **Admin & Vendor Analytics** | N/A | View sales trends, revenue charts, top-performing items. | View platform GMV, order volume, revenue, top vendors. | **DONE** | `/api/v1/vendor/analytics`, `/api/v1/admin/marketplace-analytics`|
| 22 | **Notifications & SMS Outbox** | In-app order alerts, unread counts, mark as read. | In-app sub-order alerts, return alerts, payout alerts. | System notifications, application submissions, dispute alerts. | **DONE** | `/api/v1/*/notifications*`, `/api/v1/admin/sms-outbox` |
| 23 | **Email Notifications** | Verification OTP, password reset, support resolution emails. | Onboarding updates (submitted, approved, rejected, info). | Notified of critical admin escalations. | **DONE** | `src/features/auth/email.ts`, `src/features/support/` |
| 24 | **Support Ticketing (Users)** | Submit ticket with order/product context, upload files. | Submit vendor support inquiry, upload license/docs. | N/A | **DONE** | `/api/v1/support/tickets*`, `src/features/support/` |
| 25 | **Admin Support Inbox** | Receive staff replies and resolution notifications. | Receive staff replies and resolution notifications. | Manage queue, assign staff, post internal notes, resolve. | **DONE** | `/api/v1/admin/support/tickets*` |
| 26 | **Abuur AI Support Assistance** | Ask optional AI marketplace assistant (`/api/v1/support/ai`). | Ask optional AI merchant guidance. | Request AI ticket summarization and suggested draft replies. | **PARTIAL** | Active when `ABUUR_AI_PROVIDER` configured; returns false gracefully if unset. |
| 27 | **Buyer-Vendor Communications** | Direct chat with seller, share product/order cards, block/report. | Chat with buyers, view presence, typing indicators. | Review communication reports, dismiss or take moderation action. | **PARTIAL** | Fully implemented via REST + Socket.IO in `server.ts`; persistent sockets require non-serverless runtime. |
| 28 | **Audit Logs** | N/A | N/A | Inspect immutable audit log of administrative operations. | **DONE** | `/api/v1/admin/audit-logs`, `src/features/admin/` |
| 29 | **User & Vendor Management** | View own public profile, update photo and display name. | View public storefront profile. | List users, suspend accounts, GDPR account anonymization. | **DONE** | `/api/v1/admin/users*`, `src/features/admin/service.ts` |
| 30 | **Admin Settings & Cron** | N/A | N/A | Configure commission defaults; trigger minute maintenance job. | **DONE** | `/api/v1/admin/commission-settings`, `/api/cron/marketplace`|

---

## C. Technology Stack

All versions are extracted directly from [`package.json`](./package.json) and lockfiles:

- **Runtime Environment:** Node.js `>= 20.x` (Verified on `v24.22.1`)
- **Package Manager:** npm `11.19.1`
- **Application Framework:** Next.js `16.4.5` (App Router, Turbopack, React Server Components)
- **UI Library:** React `19.3.0` & React DOM `19.3.0`
- **Type System:** TypeScript `^5` (Strict mode enabled, zero `any`)
- **Styling & Design:** Tailwind CSS `^4` with `@tailwindcss/turbopack` `^4`
- **UI Component System:** shadcn/ui `^4.23.0` with `@base-ui/react` `^1.9.0`, `lucide-react` `^1.68.0`, `class-variance-authority` `^0.7.1`
- **Database & ORM:** Prisma ORM `^7.10.1` (`@prisma/client` `^7.10.1`, `@prisma/adapter-pg` `^7.10.1`)
- **Database Engine:** PostgreSQL `pg` `^8.23.1` (PostgreSQL 15+ / 16+)
- **Authentication & Cryptography:** `argon2` `^0.45.2`, `jose` `^6.2.15`, `otpauth` `^9.6.0`
- **Data Validation & OpenAPI:** `zod` `^4.1.12`, `@asteasolutions/zod-to-openapi` `^9.1.0`
- **Interactive Documentation:** `swagger-ui-react` `^5.34.1`, `@types/swagger-ui-react` `^5.18.0`
- **Real-Time Communication:** `socket.io` `^4.8.4`, `socket.io-client` `^4.8.4`
- **Email Delivery:** `nodemailer` `^10.3.1`
- **AI Integration:** `abuur-ai` `^0.2.2` (Unified LLM Gateway)
- **Data Visualization:** `recharts` `^3.10.1`
- **Testing Tools:** `vitest` `^3.2.4`, `@playwright/test` `^1.56.1`
- **Scripting & Tooling:** `tsx` `^4.23.15`, `dotenv` `^18.0.9`, `eslint` `^9`

---

## D. System Architecture

### Layered Architecture Diagram

```mermaid
flowchart TD
    subgraph Client ["Client Devices & Browsers"]
        Browser["Desktop & Mobile Web (Bilingual EN/SO)"]
        Swagger["Swagger UI (/api-docs)"]
    end

    subgraph Security ["Edge & Transport Security"]
        SameOrigin["Same-Origin / CSRF Protection"]
        ReCaptcha["Google reCAPTCHA v3 Verification"]
        RateLimit["Sliding-Window Rate Limiter"]
        SessionCheck["HttpOnly JWT & Sliding Refresh Validator"]
    end

    subgraph Routing ["Next.js 16 Application Layer"]
        AppRouter["App Router (SSR Pages & Layouts)"]
        ApiDispatcher["Centralized REST Dispatcher (/api/v1)"]
        CronEndpoint["Scheduled Maintenance (/api/cron/marketplace)"]
        SocketServer["Persistent Socket.IO Server (server.ts)"]
    end

    subgraph Domains ["Domain Service Layer"]
        AuthModule["Auth & Admin MFA"]
        VendorModule["Vendor Onboarding & Storefront"]
        CatalogModule["Product Taxonomy & Variants"]
        CommerceModule["Cart & 10-Min Stock Reservation"]
        PaymentModule["Simulated Mobile Money & Receipts"]
        LedgerModule["Double-Entry Ledger & Payouts"]
        SupportModule["Support Tickets & Abuur AI"]
    end

    subgraph Persistence ["Persistence & External Providers"]
        PrismaPool["Prisma 7 Client with PG Pool"]
        PostgresDB[("PostgreSQL Database (57 Models)")]
        LocalMedia["Private File Store (.data/vendor-files)"]
        SMTPService["SMTP Mail Service (Nodemailer)"]
    end

    Client --> Security
    Security --> Routing
    Routing --> Domains
    Domains --> Persistence
    PrismaPool --> PostgresDB
```

### Key Architectural Flows

1. **Authentication Flow:** Passwords hashed with Argon2id; session issued as 15-minute JWT in an HttpOnly cookie; transparent 30-day sliding refresh via SHA-256 tokens stored in `user_sessions`.
2. **Admin MFA Flow:** Step 1 validates credentials and sends email OTP; Step 2 validates short-lived challenge using TOTP (AES-256 encrypted secret) or recovery code.
3. **10-Minute Stock Reservation:** Checkout reserves available stock (`stock_reservations`), locks rows in PostgreSQL, and starts a 10-minute timer. Expired reservations are swept every minute.
4. **Order Splitting:** The single customer order (`MarketplaceOrder`) is split into child `VendorOrder` sub-orders per merchant, each with its own fulfillment cycle and 24-hour confirmation deadline.
5. **Commission & Settlement:** Calculated per order line based on category hierarchy; committed to `ledger_entries`; aggregated into weekly payout batches past the 7-day post-delivery hold threshold.

---

## E. Complete Installation Guide

Follow these step-by-step instructions to clone, configure, seed, and run Somsuuq on a new development machine.

### 1. Prerequisites
- **Node.js:** Version `20.x` or higher (tested on `v24.22.1`).
- **npm:** Version `10.x` or higher.
- **PostgreSQL:** Running local or hosted PostgreSQL instance (version 15 or 16).

---

### 2. Step-by-Step Setup Instructions

#### PowerShell (Windows)
```powershell
# 1. Clone repository
git clone https://github.com/your-org/somali-multivendor-marketplace.git
cd somali-multivendor-marketplace

# 2. Install dependencies
npm install

# 3. Create .env from template
Copy-Item .env.example .env

# 4. Generate a 32-byte hexadecimal MFA key in PowerShell
$mfaKey = [System.BitConverter]::ToString((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 })).Replace("-","").ToLower()
Write-Host "Generated ADMIN_MFA_ENCRYPTION_KEY: $mfaKey"

# 5. Open .env and configure DATABASE_URL, AUTH_SECRET (32+ chars), and ADMIN_MFA_ENCRYPTION_KEY
notepad .env

# 6. Generate Prisma Client
npm run prisma:generate

# 7. Apply database migrations
npx prisma migrate deploy

# 8. Seed categories and Somali translations
npm run categories:seed

# 9. Seed commission hierarchy
npm run commissions:seed

# 10. Provision initial super administrator
$env:ADMIN_EMAIL="admin@somsuuq.com"; $env:ADMIN_PASSWORD="SecureAdminPassword123!"; npm run admin:provision

# 11. Start development server
npm run dev
```

#### Bash (macOS / Linux)
```bash
# 1. Clone repository
git clone https://github.com/your-org/somali-multivendor-marketplace.git
cd somali-multivendor-marketplace

# 2. Install dependencies
npm install

# 3. Create .env from template
cp .env.example .env

# 4. Generate 32-byte hexadecimal MFA key
openssl rand -hex 32

# 5. Edit .env with your PostgreSQL credentials, AUTH_SECRET, and ADMIN_MFA_ENCRYPTION_KEY
nano .env

# 6. Generate Prisma Client
npm run prisma:generate

# 7. Apply database migrations
npx prisma migrate deploy

# 8. Seed categories and Somali translations
npm run categories:seed

# 9. Seed commission hierarchy
npm run commissions:seed

# 10. Provision initial super administrator
ADMIN_EMAIL="admin@somsuuq.com" ADMIN_PASSWORD="SecureAdminPassword123!" npm run admin:provision

# 11. Start development server
npm run dev
```

---

### 3. Application Access Points

Once the development server is running (`npm run dev`):

- **Marketplace Web App:** [`http://localhost:3000`](http://localhost:3000)
- **Somali Homepage:** [`http://localhost:3000/so`](http://localhost:3000/so)
- **English Homepage:** [`http://localhost:3000/en`](http://localhost:3000/en)
- **Interactive Swagger UI:** [`http://localhost:3000/api-docs`](http://localhost:3000/api-docs)
- **OpenAPI 3.0.3 Specification:** [`http://localhost:3000/api/openapi.json`](http://localhost:3000/api/openapi.json)
- **Vendor Portal:** [`http://localhost:3000/en/vendor`](http://localhost:3000/en/vendor)
- **Admin Portal:** [`http://localhost:3000/en/admin`](http://localhost:3000/en/admin)

### 4. Production Build & Execution

To test the optimized production build locally:
```bash
npm run build
npm start
```

---

## F. Environment Variables Specification

The application validates environment configuration at startup using Zod in [`src/config/env.ts`](./src/config/env.ts):

| Variable Name | Required | Example Placeholder | Purpose & How to Obtain |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | `postgresql://user:pass@localhost:5432/somsuuq` | PostgreSQL connection string. |
| `NEXT_PUBLIC_APP_URL` | **Yes** | `http://localhost:3000` | Canonical app URL (no trailing slash). Use HTTPS tunnel origin if testing OAuth. |
| `AUTH_SECRET` | **Yes** | `f6a9e1b2c3d4e5f6a9e1b2c3d4e5f6a9` | JWT signing secret (minimum 32 characters/bytes). |
| `AUTH_ISSUER` | Optional | `http://localhost:3000` | Custom JWT issuer (defaults to `NEXT_PUBLIC_APP_URL` origin). |
| `AUTH_AUDIENCE` | Optional | `somali-marketplace-api` | JWT audience claim. |
| `ADMIN_MFA_ENCRYPTION_KEY` | **Yes** | `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef` | Exactly 32 bytes encoded as 64 hex characters or 44 base64 characters. |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Optional (Dev) | `6LeIx0cD...` | Google reCAPTCHA v3 site key for frontend widget. |
| `RECAPTCHA_SECRET_KEY` | Optional (Dev) | `6LeIx0cD...` | Google reCAPTCHA v3 secret key for backend verification. |
| `RECAPTCHA_MIN_SCORE` | Optional | `0.5` | Minimum score threshold for reCAPTCHA v3 (0.0 to 1.0). |
| `SMTP_HOST` | Optional (Dev) | `smtp.mailtrap.io` | SMTP server host. If unset, OTPs are printed to console. |
| `SMTP_PORT` | Optional | `587` | SMTP port (typically 587 or 465). |
| `SMTP_USER` | Optional (Dev) | `smtp-user-id` | SMTP credential username. |
| `SMTP_PASSWORD` | Optional (Dev) | `smtp-password` | SMTP credential password. |
| `SMTP_FROM` | Optional (Dev) | `"Somsuuq" <no-reply@somsuuq.com>` | Sender email address or named RFC format. |
| `SIMULATED_PAYMENTS_ENABLED` | Optional | `true` | Enables mobile money checkout simulation (must be `false` in prod). |
| `SIMULATED_PAYMENT_ADAPTER` | Optional | `mock` | Default simulation adapter (`mock`). |
| `CRON_SECRET` | **Yes (Prod)** | `secret-bearer-token-12345` | Protects `/api/cron/marketplace` in production. |
| `AMAZON_CLIENT_ID` | Optional | `amzn1.application-oa2-client...` | Amazon Login with Amazon client ID. |
| `AMAZON_CLIENT_SECRET` | Optional | `amzn.oa2.cs.v1...` | Amazon Login with Amazon client secret. |
| `AMAZON_REDIRECT_URI` | Optional | `https://your-domain.com/api/v1/auth/amazon/callback` | HTTPS OAuth callback URL. |
| `ADMIN_EMAIL` | Script only | `admin@somsuuq.com` | Used exclusively by `npm run admin:provision`. |
| `ADMIN_PASSWORD` | Script only | `SecureAdminPassword123!` | Used exclusively by `npm run admin:provision` (min 12 chars). |
| `ABUUR_AI_PROVIDER` | Optional | `openai` | AI provider (`openai`, `gemini`, `anthropic`, `ollama`, etc.). |
| `ABUUR_AI_MODEL` | Optional | `gpt-4o` | Model name. |
| `ABUUR_AI_API_KEY` | Optional | `sk-...` | API key for the configured AI provider. |

> [!WARNING]
> Never commit `.env` or paste real credentials into pull requests or public repositories.

---

## G. Demo Accounts & Provisioning

Somsuuq does not hardcode fake test accounts into the migration history. Real seeded demo accounts are provisioned via reproducible scripts:

### 1. Administrator Account
Provisioned using the CLI script:
```bash
ADMIN_EMAIL="admin@somsuuq.com" ADMIN_PASSWORD="SecureAdminPassword123!" npm run admin:provision
```
- **Role:** `ADMIN`
- **First Sign-In:** When signing in for the first time via `POST /api/v1/admin/auth/login` (or `/admin/mfa-setup`), the administrator will be prompted to scan a TOTP QR code and save their recovery codes.

### 2. Vendor Account
- Sign up at `http://localhost:3000/en/vendor/register` (e.g. `merchant@somsuuq.com` / `VendorPassword123!`).
- If SMTP is unconfigured in development, retrieve the 6-digit verification code from your terminal output.
- Complete the onboarding draft to submit store details for administrative approval.

### 3. Customer Account
- Sign up at `http://localhost:3000/en/register` (e.g. `customer@somsuuq.com` / `CustomerPassword123!`).
- Verify email via the console OTP and start shopping.

> [!IMPORTANT]
> Change all passwords before deploying to any publicly accessible staging or production server.

---

## H. Screenshots & Visual Assets

Visual specifications and capture guidelines for all 20 standard application views are defined in:

👉 [`docs/screenshots/README.md`](./docs/screenshots/README.md)

This includes required viewports, bilingual states, and specific page views (Marketplace, Cart, Checkout, Receipts, Orders, Vendor Dashboard, Admin Console, Support Inbox, and Swagger UI).

---

## I. Testing & Verification Suite

Somsuuq includes automated tests ensuring regression prevention across critical workflows:

### Automated Test Execution
```bash
# Run all unit tests
npm run test

# Run TypeScript type check
npm run typecheck

# Run ESLint validation
npm run lint

# Validate Prisma schema
npx prisma validate

# Run integration tests
npm run test:integration
```

### Verified Test Results (20 Suites, 125 Tests Passed)
- `tests/unit/openapi.test.ts` (4 passed) — OpenAPI 3.0.3 contract and schema validation.
- `tests/unit/auth-foundation.test.ts` (13 passed) — Argon2id, JWT, and Amazon OAuth state validation.
- `tests/unit/financial-calculations.test.ts` (12 passed) — Category commission inheritance and net vendor earnings.
- `tests/unit/financial-service.test.ts` (11 passed) — Weekly payout batches and 7-day hold rules.
- `tests/unit/commerce-returns.test.ts` (17 passed) — 7-day return requests and dispute escalation.
- `tests/unit/support.test.ts` (19 passed) — Support tickets, permissions, and internal notes.
- `tests/unit/support-email.test.ts` (3 passed) — Support transactional emails.
- `tests/unit/support-ai.test.ts` (4 passed) — Abuur AI client resilience.
- `tests/unit/support-ai-env.test.ts` (2 passed) — AI configuration parsing.
- `tests/unit/mobile-money-adapters.test.ts` (6 passed) — EVC Plus, Zaad, and eDahab simulation rules.
- `tests/unit/inventory-reservations.test.ts` (3 passed) — 10-minute optimistic stock lock.
- `tests/unit/marketplace-operations.test.ts` (5 passed) — Multi-vendor order splitting.
- `tests/unit/product-catalog.test.ts` (2 passed) — Category hierarchy and product filtering.
- `tests/unit/variant-options.test.ts` (4 passed) — Multi-variant pricing and SKU assignment.
- `tests/unit/vendor-storefront.test.ts` (2 passed) — Public storefront queries.
- `tests/unit/vendor-files.test.ts` (2 passed) — File upload MIME and size validation.
- `tests/unit/admin-user-anonymization.test.ts` (2 passed) — User anonymization preserving financial records.
- `tests/unit/api-responses.test.ts` (8 passed) — Error and success response envelopes.
- `tests/unit/communication-location.test.ts` (2 passed) — Chat location data and presence.
- `tests/unit/i18n.test.ts` (4 passed) — Somali/English translation dictionary parity.

---

## J. Production Deployment Guide

For full deployment instructions, see [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

### Summary Checklist:
1. **Container vs Serverless:** For persistent Socket.IO chat, deploy the custom Node HTTP server (`server.ts`) via Docker, AWS ECS, Railway, or a persistent VPS. If deploying on serverless (e.g., Vercel), chat falls back to HTTP polling.
2. **Migrations:** Run `npx prisma migrate deploy` in CI/CD before starting the web process. Never run `prisma migrate reset` in production.
3. **Cron Worker:** Schedule a recurring 1-minute job targeting `GET https://your-domain.com/api/cron/marketplace` with header `Authorization: Bearer <CRON_SECRET>`.
4. **Storage Durability:** Configure durable persistent storage for `.data/vendor-files` or mount an S3-compatible volume.
5. **Simulated Payments Notice:** All mobile money payments (EVC Plus, Zaad, eDahab) are currently **simulated** via the mock adapter. Ensure `SIMULATED_PAYMENTS_ENABLED=false` in production until real telecom gateway partnerships are established.

---

## K. Security Architecture & Limitations

1. **Authentication Security:** Argon2id password hashing, HttpOnly/SameSite/Secure cookies, short-lived 15-minute access JWTs, SHA-256 hashed refresh tokens.
2. **Admin Protection:** Private provisioning only (no public registration), email OTP requirement, TOTP MFA with AES-256 encrypted secrets, recovery codes.
3. **Data Integrity:** Double-entry ledger prevents balance manipulation; compound foreign keys `(id, accountType)` prevent role spoofing.
4. **File Upload Security:** Enforces magic byte signature checks (JPEG, PNG, WebP, PDF) to prevent malicious executable execution; files stored outside web root.
5. **Rate Limiting & Bot Protection:** In-memory sliding-window rate limiters; Google reCAPTCHA v3 on all sensitive authentication and checkout flows.

---

## L. Assumptions & Future Roadmap

- **Live Mobile Money Integration:** Transition simulated mobile money adapters to direct Hormuud Telecom (EVC Plus), Telesom (Zaad), and Somtel (eDahab) merchant APIs once merchant partner agreements are finalized.
- **Telecom SMS Gateway:** Transition `sms_outbox_messages` from database-only recording to an active SMS delivery gateway.
- **Cloud Object Storage:** Transition local media directory (`.data/vendor-files`) to Amazon S3 or Cloudflare R2 for multi-region clustering.
- **Delivery Fleet Management:** Introduce localized GPS tracking and driver dispatch portals tailored to Somali urban road systems.

---

## Documentation Index

- 🏛️ [System Architecture](docs/ARCHITECTURE.md)
- 🗄️ [Database Architecture & Schema Specification](docs/database/README.md)
- 🧾 [Database Reference](docs/database/DATABASE_REFERENCE.md)
- 📊 [Mermaid Entity Relationship Diagram (ERD)](docs/database/erd.mmd)
- 🔌 [REST API Reference](docs/api/README.md)
- 📚 [Complete API Reference](docs/api/COMPLETE_API_REFERENCE.md)
- 📜 [OpenAPI 3.0.3 Contract](docs/api/openapi.md)
- 🏗️ [Backend Architecture](docs/BACKEND_ARCHITECTURE.md)
- 🔐 [Authentication & Security](docs/AUTHENTICATION.md)
- 💰 [Financial System & Ledger](docs/FINANCIAL_SYSTEM.md)
- 📦 [Inventory & Order Fulfillment](docs/INVENTORY_AND_ORDERS.md)
- 🔔 [Notifications & SMS Outbox](docs/NOTIFICATIONS_AND_SMS.md)
- 🎧 [Support System & Abuur AI](docs/SUPPORT_SYSTEM.md)
- 🚀 [Production Deployment Guide](docs/DEPLOYMENT.md)
- 🧪 [Testing & Verification Guide](docs/TESTING.md)
- 🤝 [Contributing Guidelines](docs/CONTRIBUTING.md)
- 📸 [Screenshots Inventory](docs/screenshots/README.md)

---

*Somsuuq is developed with pride for the Somali business community. SIMAD iLab Somalia 10X Challenge.*
