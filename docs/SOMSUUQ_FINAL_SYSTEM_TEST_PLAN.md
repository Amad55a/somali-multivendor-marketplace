# Somsuuq Final System Test Plan

## Test summary dashboard

Update the counts as each manual case is completed. All cases start as **Not tested**; implementation assessment is a separate, source-inspection-only field and is not a test result.

| Metric | Count |
|---|---:|
| Total test cases | 166 |
| Not tested | 166 |
| Passed | 0 |
| Failed | 0 |
| Blocked | 0 |
| Not applicable | 0 |
| Confirmed official SIMAD requirements | 0 — official brief not supplied |
| Provisional SIMAD-topic cases from the request | 166 |
| Confirmed Somsuuq-only requirements | Not determinable without the official brief |

### Status and assessment legends

Manual status checkboxes:

- `[ ]` Not tested
- `[x]` Passed
- `[!]` Failed
- `[-]` Blocked or not applicable

Implementation assessment (based on repository inspection only):

- **IMPLEMENTED** — relevant code/schema is present; this does not prove runtime behavior.
- **PARTIAL** — only part of the described behavior is evident, or an important limitation remains.
- **NOT IMPLEMENTED** — no relevant implementation was found.
- **NOT VERIFIED** — code or UI exists, but its behavior or deployment configuration cannot be established from inspection.

Source labels:

- **SIMAD REQUIRED — provisional**: included because the request lists this coverage; must be checked against the official brief.
- **SOMSUUQ ADDITIONAL FEATURE — provisional**: likely application-specific; classification must be checked against the official brief.
- **TECHNICAL QUALITY**: security, data-integrity, or build-quality check.
- **MANUAL DEMO**: a human-operated demonstration scenario.

> **Official brief limitation:** The supplied pasted text is the test-plan request, not the official SIMAD iLab Somalia 10X Challenge Project 10 brief. No official brief file was found in the repository or attachments. Consequently, this plan cannot make a verified clause-by-clause SIMAD comparison. All source classifications are provisional; do not present them as confirmed official requirements until the brief is added and mapped.

## Scope, evidence, and safe execution

This is a manual system test plan, not a claim that the features work. The repository inspection found a Next.js application, Prisma/PostgreSQL models, 21 checked-in migrations, an executable API registry, feature services, unit/integration tests, and a Playwright homepage spec. There are 100 `it`/`test` declarations in 17 `*.test.ts` files (92 unit and 8 integration declarations by file inventory); this count is not a test run or proof of coverage. The Playwright suite is intentionally not run by this plan.

Use a disposable, isolated test environment and non-production accounts/data. Do not reset or seed a shared database, manually edit production records, use real mobile-money accounts, or expose secrets in screenshots. Verify the configured migration status against the isolated database before testing. The repository contains a historical `20261108100000_conversation_call_lifecycle` migration, while the current Prisma schema has no call model; never delete/edit applied migrations. Resolve any migration failure on a disposable database before continuing.

Implementation evidence inspected includes:

- [Prisma schema](../prisma/schema.prisma), [migrations](../prisma/migrations/), [API registry](../src/lib/api/v1.ts), and [API documentation](./api/v1.md).
- [Authentication services](../src/features/auth/), [vendor services](../src/features/vendors/), [catalog services](../src/features/products/), and [commerce services](../src/features/commerce/).
- [Support services](../src/features/support/), [communications services](../src/features/communications/), [admin services](../src/features/admin/), and [customer services](../src/features/customer/).
- [Unit and integration tests](../tests/), [package scripts](../package.json), [CI workflow](../.github/workflows/ci.yml), [README](../README.md), [environment example](../.env.example), and [architecture overview](./architecture/overview.md).

Repository evidence does not establish that the database is reachable, migrations are applied to the target environment, email/OAuth/reCAPTCHA providers are configured, cron is scheduled, media storage is durable, or multi-user behavior works in a browser. The older [authentication/API verification guide](./AUTHENTICATION-AND-API-VERIFICATION.md) contains statements about missing commerce APIs that conflict with the current schema and API registry; use the current code as a test lead and treat that guide as potentially stale.

### Prepare test accounts and data

1. Use a disposable environment with the correct public origin, database, SMTP, reCAPTCHA, and any optional OAuth settings. Keep all credentials in the local secret manager/environment, never in this document.
2. Prepare two customer accounts (Customer A and Customer B), two vendors (Vendor A and Vendor B; both approved for selling), and an administrator provisioned through the documented private setup.
3. Use distinct test emails and mobile-money numbers. Use only a documented simulated payment number; the documented suffix `0000` simulates failure. No real money is transferred.
4. Create published products for both vendors, including English and Somali product text, variants/SKUs, known stock quantities, at least one out-of-stock variant, and known prices. Keep a written fixture sheet with IDs, quantities, and expected totals.
5. Prepare a delivered eligible order, an undelivered order, a second customer, and available time windows for coupon, return, reservation, and payout tests. Use test clocks/controlled fixtures only where supported; do not change production data.
6. For concurrency tests, use two independent browser profiles (or two separate devices), each signed into a different customer account. Keep both sessions open on the same last-unit product.
7. Record the environment/build identifier and timezone in the evidence log. Redact email addresses, phone numbers, order IDs, private attachments, and session details in screenshots shared outside the test team.

Each test's **Actual**, **Evidence**, and **Notes/bug** fields are intentionally blank for manual execution. Capture a screenshot or sanitized request/response/log reference; never include passwords, OTPs, cookies, tokens, private keys, or payment credentials.

## A. Project setup and environment

Evidence: [README](../README.md), [environment example](../.env.example), [CI workflow](../.github/workflows/ci.yml), and [Prisma migrations](../prisma/migrations/).

### ST-A01 — Clean application startup
- **Source / implementation:** TECHNICAL QUALITY / **NOT VERIFIED** — scripts are present; clean-environment startup was not run.
- **Role:** Operator.
- **Preconditions / data:** Fresh disposable checkout, supported Node.js, dependencies installed, valid environment.
- **Steps:** 1. Follow the README setup from a clean workspace. 2. Run the documented development command. 3. Open the configured origin.
- **Expected:** The server starts without fatal errors and the localized public home page loads.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-A02 — Database connection and migration history
- **Source / implementation:** TECHNICAL QUALITY / **NOT VERIFIED** — 21 migration directories are checked in; target database state is unknown.
- **Role:** Operator.
- **Preconditions / data:** Isolated PostgreSQL test database; backup or disposable database confirmed.
- **Steps:** 1. Configure the isolated connection. 2. Check migration status using the project’s documented Prisma CLI. 3. If empty, apply migrations only to this disposable database and inspect the resulting status.
- **Expected:** Connection succeeds; migrations apply in order without manual schema edits; final status reports no pending migrations. Never reset a shared database.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-A03 — Seed and demo data readiness
- **Source / implementation:** SIMAD REQUIRED — provisional / **NOT VERIFIED** — scripts exist for categories, commissions, and admin provisioning; demo-account fixtures are not established by inspection.
- **Role:** Operator.
- **Preconditions / data:** Isolated database and approved seed procedure.
- **Steps:** 1. Follow only the documented seed/provision commands. 2. Sign in with each prepared demo role. 3. Inspect sample categories, products, and vendor records.
- **Expected:** Required demo fixtures exist, have no unintended duplicates, and roles match their intended accounts. Record any manual fixture creation needed.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-A04 — Environment configuration and secret handling
- **Source / implementation:** TECHNICAL QUALITY / **PARTIAL** — `.env.example` documents core values; production completeness and deployment secrets are not established.
- **Role:** Operator.
- **Preconditions / data:** Test environment; no actual secret values in evidence.
- **Steps:** 1. Compare configured variables with `.env.example` and README. 2. Exercise one protected auth flow and one optional flow only if configured. 3. Check client-visible pages, logs, and errors for secret disclosure.
- **Expected:** Required values are validated; optional services fail clearly when absent; secrets never appear in browser responses, client bundles, screenshots, or logs.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-A05 — Development and production startup paths
- **Source / implementation:** TECHNICAL QUALITY / **NOT VERIFIED** — `dev`, `build`, and `start` scripts exist.
- **Role:** Operator.
- **Preconditions / data:** Isolated test deployment; Socket.IO messaging requires the custom Node server.
- **Steps:** 1. Start the development server and open the home page. 2. Build production assets. 3. Start the built app with the documented custom server command and visit the same origin.
- **Expected:** Both modes serve the app; production starts with the custom server required for Socket.IO and does not rely on `next start`.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-A06 — API availability, errors, and logs
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — shared response helpers and API registry are present; runtime responses are unverified.
- **Role:** Operator / authenticated test user.
- **Preconditions / data:** App running; `/api/openapi.json` and `/api-docs` available.
- **Steps:** 1. Open both API documentation endpoints. 2. Request an invalid route and submit one invalid body. 3. Inspect the response and server log.
- **Expected:** API documentation loads; invalid inputs return structured errors; unexpected errors do not expose stack traces, SQL, tokens, or secrets.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## B. Authentication and account management

Evidence: [auth services](../src/features/auth/), [auth/API reference](./api/v1.md), and [authentication tests](../tests/unit/auth-foundation.test.ts).

### ST-B01 — Customer registration and email verification
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — registration and verification flows are in the API and auth services.
- **Role:** New customer.
- **Preconditions / data:** Unique email, valid password, working SMTP and reCAPTCHA.
- **Steps:** 1. Register as a customer. 2. Retrieve the email code. 3. Verify the account. 4. Refresh the page.
- **Expected:** Account is created as CUSTOMER, verified once, and signed in; verification cannot be replayed.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-B02 — Vendor registration and pending approval state
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — vendor registration and application states exist.
- **Role:** New vendor.
- **Preconditions / data:** Unique email, valid password, SMTP and reCAPTCHA.
- **Steps:** 1. Register as a vendor. 2. Verify email. 3. Follow the redirect and try opening an approved-vendor dashboard URL.
- **Expected:** Account is a VENDOR but not automatically approved; pending vendors see onboarding/status and cannot perform approved-only selling actions.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-B03 — Customer and vendor login, invalid credentials
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — password login and role checks exist.
- **Role:** Customer, vendor.
- **Preconditions / data:** Verified customer and vendor accounts; reCAPTCHA configured.
- **Steps:** 1. Sign in with each correct account type. 2. Try a wrong password and a mismatched account type. 3. Sign out and repeat.
- **Expected:** Correct accounts sign in to the right destination; invalid combinations fail without revealing whether an email exists.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-B04 — Administrator login and MFA
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — admin email OTP, TOTP, recovery-code flows and private provisioning exist.
- **Role:** Administrator.
- **Preconditions / data:** Privately provisioned admin, SMTP, MFA encryption key; authenticator app.
- **Steps:** 1. Start admin login. 2. Complete email OTP. 3. Complete TOTP (or initial MFA setup/enable where required). 4. Sign out and test a recovery code once.
- **Expected:** Admin access is granted only after required factors; a used recovery code cannot be reused; admin is not publicly registerable.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-B05 — Password reset and expired/reused OTP
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — reset-code flow and session revocation exist.
- **Role:** Customer or vendor.
- **Preconditions / data:** Existing account, working SMTP.
- **Steps:** 1. Request password reset. 2. Reset with the emailed code and a compliant new password. 3. Try the old password, old code, and an expired code. 4. Sign in with the new password.
- **Expected:** New password works; old password and consumed/expired code fail; prior sessions are revoked.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-B06 — Session persistence, refresh, and logout
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — persisted sessions and refresh-cookie design exist; browser operation is unverified.
- **Role:** Customer, vendor, admin.
- **Preconditions / data:** Signed-in accounts for each role.
- **Steps:** 1. Navigate and refresh a protected page. 2. Leave the session idle, then return. 3. Log out and use browser Back/refresh to revisit the protected page.
- **Expected:** Valid session persists according to policy; revoked/expired sessions are rejected; logout does not leave protected content accessible.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-B07 — Role-based redirects and protected routes
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — server route guards and account-role checks exist.
- **Role:** Customer, pending vendor, approved vendor, admin, anonymous.
- **Preconditions / data:** Accounts in the listed states.
- **Steps:** 1. Open each role’s dashboard URL as the matching user. 2. Repeat each URL as anonymous and as a wrong-role user. 3. Try vendor selling pages as pending/suspended vendor.
- **Expected:** Correct user lands in the allowed area; unauthenticated/wrong-role users are redirected or denied server-side; status restrictions cannot be bypassed with a direct URL.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-B08 — Amazon OAuth (conditional)
- **Source / implementation:** SOMSUUQ ADDITIONAL FEATURE — provisional / **IMPLEMENTED** — Amazon OAuth implementation and environment settings exist; provider setup is unverified.
- **Role:** Customer or vendor.
- **Preconditions / data:** HTTPS test origin, registered callback, Amazon client settings and account.
- **Steps:** 1. Start Amazon login as customer and vendor. 2. Complete provider consent. 3. Test cancel, state mismatch, and callback from a different origin.
- **Expected:** Valid callback signs in the selected role; invalid state/origin is rejected; no admin Amazon login or implicit account linking occurs.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-B09 — Rate limits, repeated attempts, and verification resend
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — rate-limiting code and auth tests exist; thresholds and deployment behavior need runtime verification.
- **Role:** Customer, vendor, attacker simulation.
- **Preconditions / data:** Dedicated test account and controlled client; do not use production.
- **Steps:** 1. Make repeated invalid login/OTP/reset/resend attempts within the configured window. 2. Make a valid attempt after the limit window. 3. Check rate-limit error and audit/log handling.
- **Expected:** Excess attempts are throttled; normal use recovers as documented; no sensitive code or account-existence information is leaked.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## C. Customer marketplace

Evidence: [catalog service](../src/features/products/service.ts), [marketplace browser](../src/features/products/components/marketplace-browser.tsx), and [product detail](../src/features/products/components/product-detail-client.tsx).

### ST-C01 — Homepage and category browsing
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — home, categories, and catalog code exist.
- **Role:** Visitor.
- **Preconditions / data:** Published products in multiple active categories.
- **Steps:** 1. Open English and Somali home pages. 2. Open a category. 3. Open a subcategory and return using browser navigation.
- **Expected:** Home content and categories load; listings match selected category; navigation does not lose locale unexpectedly.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-C02 — Search in English and Somali
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — bilingual product fields and search UI exist; search quality needs manual verification.
- **Role:** Visitor.
- **Preconditions / data:** Products with distinct English and Somali names/descriptions.
- **Steps:** 1. Search by an English product term. 2. Repeat with its Somali term. 3. Try a partial term, punctuation, and a term with no match.
- **Expected:** Relevant products appear in both languages; no-match state is clear; no unrelated products are returned.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-C03 — Filters, sorting, and result counts
- **Source / implementation:** SIMAD REQUIRED — provisional / **NOT VERIFIED** — controls are present in the marketplace UI; exact applied query behavior is not established by inspection.
- **Role:** Visitor.
- **Preconditions / data:** Products varying in category, price, stock, and creation time.
- **Steps:** 1. Apply each visible filter individually and in combination. 2. Change sort order. 3. Clear filters and compare result counts.
- **Expected:** Results and counts update to match selected criteria; clearing controls restores the unfiltered set.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-C04 — Product details, images, variants, SKU, and availability
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — product, image, variant, SKU, and stock models/services exist.
- **Role:** Visitor.
- **Preconditions / data:** Published products with multiple variants, images, SKU, and one unavailable variant.
- **Steps:** 1. Open each product. 2. Change variant selection. 3. Inspect image display, SKU, price, and availability. 4. Refresh and reopen a deep link.
- **Expected:** Product details match selected variant and server data; unavailable variants cannot be added to cart; direct URLs load correctly.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-C05 — Vendor storefront and Contact Vendor
- **Source / implementation:** SOMSUUQ ADDITIONAL FEATURE — provisional / **IMPLEMENTED** — storefront service and customer-vendor messaging entry point exist.
- **Role:** Visitor, customer.
- **Preconditions / data:** Approved vendor with public store and published product.
- **Steps:** 1. Open the vendor storefront from a product. 2. Inspect store identity and products. 3. As a customer, use Contact Vendor and return to the product.
- **Expected:** Correct vendor/store data appears; contact opens a private conversation without losing the product context.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-C06 — Ratings, reviews, and out-of-stock behavior
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — review model, service, and moderation UI exist; policy enforcement requires execution.
- **Role:** Visitor, eligible customer.
- **Preconditions / data:** One delivered eligible order and one non-delivered order; one out-of-stock product.
- **Steps:** 1. Inspect rating average and visible reviews. 2. Attempt a review from each order state. 3. Try buying the out-of-stock variant.
- **Expected:** Only eligible delivered purchases can be reviewed; invalid purchase review is rejected; out-of-stock purchase is blocked with clear feedback.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-C07 — Product and store Somali content persistence
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — independent bilingual catalog fields exist in schema and UI.
- **Role:** Vendor, visitor.
- **Preconditions / data:** Product/store with different English and user-authored Somali content.
- **Steps:** 1. Save English and Somali text. 2. Switch locale several times. 3. Edit English text only and revisit Somali view.
- **Expected:** Each language displays its own saved content; changing English does not overwrite Somali text with an automatic translation.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-C08 — Empty, malformed, and unavailable catalog states
- **Source / implementation:** SIMAD REQUIRED — provisional / **NOT VERIFIED** — empty and error states need runtime inspection.
- **Role:** Visitor.
- **Preconditions / data:** Search with no results; temporarily unavailable test endpoint if safely simulated.
- **Steps:** 1. Search for a nonexistent item. 2. Open a removed/invalid product URL. 3. Refresh after a transient catalog error.
- **Expected:** Useful empty/not-found/error state appears; no broken card or unhandled stack trace; retry/navigation remains possible.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## D. Vendor onboarding

Evidence: [vendor service](../src/features/vendors/service.ts), [onboarding form](../src/features/vendors/components/onboarding-form.tsx), and [vendor review board](../src/features/vendors/components/review-board.tsx).

### ST-D01 — Draft creation and required business information
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — draft and submit workflow exists.
- **Role:** Vendor applicant.
- **Preconditions / data:** New verified vendor.
- **Steps:** 1. Start onboarding. 2. Save an incomplete draft. 3. Complete business/store/contact details and location fields. 4. Leave a required submission field blank and attempt submission.
- **Expected:** Draft can be saved incrementally; invalid submission identifies missing data and is not submitted.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-D02 — Logo and business-license uploads
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — private upload code exists; durable production storage and malware scanning are not established.
- **Role:** Vendor applicant.
- **Preconditions / data:** Valid image and license file plus invalid type/oversized file.
- **Steps:** 1. Upload valid logo and license. 2. Try invalid extension, MIME type, and oversized file. 3. Sign out and try opening the private file URL as another user.
- **Expected:** Allowed files are stored and associated with the applicant; invalid files are rejected; private documents are not readable by another vendor.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-D03 — Phone, mobile-money, and location validation
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — onboarding data and validation code exist.
- **Role:** Vendor applicant.
- **Preconditions / data:** Valid and malformed phone/mobile-money data; country/region/city/district.
- **Steps:** 1. Enter valid contact and location data. 2. Try malformed phone and missing required location. 3. Save, leave, and reopen the draft.
- **Expected:** Valid values persist; malformed or required missing values are rejected with actionable messages.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-D04 — Submit application and applicant status
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — submission and application-status paths exist.
- **Role:** Vendor applicant.
- **Preconditions / data:** Complete application with required documents.
- **Steps:** 1. Submit. 2. Refresh and revisit status. 3. Try editing server-managed status fields through the normal UI/API.
- **Expected:** Application enters pending review; applicant sees current status; client cannot set approval/reviewer state.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-D05 — Admin approval, rejection, and change request
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — admin review actions and audit records exist.
- **Role:** Admin and applicant.
- **Preconditions / data:** Three independent submitted applications.
- **Steps:** 1. Approve one. 2. Reject a second with a reason. 3. Request changes on the third with instructions. 4. Inspect both user views and audit history.
- **Expected:** Each decision updates the correct application and applicant-visible status; decision/reason is recorded; unrelated applications are unchanged.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-D06 — Changes requested and resubmission
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — changes-requested status and update workflow exist.
- **Role:** Vendor applicant and admin.
- **Preconditions / data:** Application in CHANGES_REQUESTED.
- **Steps:** 1. Review admin instructions. 2. Edit requested fields/documents. 3. Resubmit. 4. Confirm admin can review the new submission.
- **Expected:** Vendor can address requested changes and resubmit; prior decision is not mistaken for approval.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-D07 — Vendor suspension and selling restrictions
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — suspension and approved-vendor checks exist.
- **Role:** Admin and vendor.
- **Preconditions / data:** Approved vendor with published product and active session.
- **Steps:** 1. Suspend the vendor as admin. 2. Using the vendor's existing session, try product, inventory, and order actions. 3. Revisit as a public shopper.
- **Expected:** Restricted operations are denied server-side; public storefront/selling behavior follows the suspension policy; existing sessions do not bypass the restriction.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-D08 — Onboarding notifications and ownership
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — notification and file ownership code exists; end-to-end delivery is unverified.
- **Role:** Two vendors and admin.
- **Preconditions / data:** Separate vendor applications and configured email/notification channel.
- **Steps:** 1. Submit and review each application. 2. Check only the relevant applicant receives its status notification. 3. Attempt to access another vendor's application/file.
- **Expected:** Correct recipient sees status updates; applicant A cannot read or modify applicant B's application or private files.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## E. Vendor dashboard

Evidence: [vendor UI and services](../src/features/vendors/), [commerce UI and services](../src/features/commerce/), and [vendor routes](../src/app/[locale]/vendor/).

### ST-E01 — Overview, statistics, and ownership
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — dashboard service and role guards exist; displayed metrics need reconciliation.
- **Role:** Approved Vendor A and Vendor B.
- **Preconditions / data:** Known orders, sales, products, and stock for both vendors.
- **Steps:** 1. Open each dashboard. 2. Compare visible counts/totals to that vendor's known records. 3. Try changing a URL/resource ID to Vendor B's data.
- **Expected:** Statistics correspond to real vendor-owned records; no cross-vendor data is exposed.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-E02 — Store profile, logo, and profile change review
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — store profile and profile-change service exist.
- **Role:** Vendor and admin.
- **Preconditions / data:** Approved vendor with current public profile and replacement logo.
- **Steps:** 1. View profile. 2. Propose a profile/logo change. 3. Check admin review and the public storefront before/after approval.
- **Expected:** Public data changes only according to review policy; uploaded files stay owner-scoped; rejected changes do not replace the live profile.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-E03 — Product create, edit, publish, and archive
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — product manager and catalog APIs/services exist.
- **Role:** Approved vendor.
- **Preconditions / data:** Approved vendor with valid category and product images.
- **Steps:** 1. Create a draft. 2. Fill product fields and publish. 3. Edit price/details. 4. Archive and inspect public listing.
- **Expected:** Saved fields persist; published products appear in marketplace; archived products are no longer purchasable; vendor cannot edit another vendor's product.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-E04 — Bilingual product fields, categories, and variants/SKUs
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — bilingual catalog, categories, and variant models exist.
- **Role:** Approved vendor.
- **Preconditions / data:** Product with English/Somali fields and two variants.
- **Steps:** 1. Save both languages. 2. Add variants with distinct SKUs and stock. 3. Try duplicate SKU and invalid category/variant values. 4. Reopen product in both locales.
- **Expected:** Valid fields persist independently; SKUs remain unique as required; invalid/duplicate input is rejected.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-E05 — Inventory and stock management
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — variant stock and vendor stock update services exist.
- **Role:** Approved Vendor A.
- **Preconditions / data:** Known stock counts and an active reservation on another variant.
- **Steps:** 1. Update stock for an unreserved variant. 2. Try a negative/invalid count. 3. Try changing stock while reserved units exist. 4. Reopen inventory.
- **Expected:** Valid counts persist; invalid values are rejected; reserved-stock invariants are preserved and displayed accurately.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-E06 — Orders and delivery updates
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — vendor order lists and transition service exist.
- **Role:** Vendor.
- **Preconditions / data:** Paid vendor sub-order in NEW state.
- **Steps:** 1. Open the order. 2. Apply each allowed status transition and delivery/tracking details. 3. Try skipping or reversing a disallowed state.
- **Expected:** Allowed transitions persist and notify the buyer; invalid transitions are refused; vendor sees only its sub-order.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-E07 — Analytics, coupons, returns, and payout statements
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — pages/services exist; full totals and account-specific calculations require data reconciliation.
- **Role:** Vendor.
- **Preconditions / data:** Known paid, cancelled, refunded, returned, coupon, and payout fixtures.
- **Steps:** 1. Open analytics, coupons, returns, and payout statement pages. 2. Compare each value/action to prepared records. 3. Try accessing another vendor's record.
- **Expected:** Real data and correct calculations are shown; vendor-specific actions are available; cross-vendor records are denied.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-E08 — Vendor notification bell, Communications, and settings
- **Source / implementation:** SOMSUUQ ADDITIONAL FEATURE — provisional / **IMPLEMENTED** — notification bell reads existing vendor notifications; communications and settings pages exist.
- **Role:** Approved vendor.
- **Preconditions / data:** Vendor notifications, including read and unread entries.
- **Steps:** 1. Open header bell and compare unread count with the vendor's own notifications. 2. Open a notification destination. 3. Mark one and all read. 4. Open Communications and settings.
- **Expected:** Real recent notifications, titles/messages/timestamps, and read states display; read actions persist; destinations work where supplied; only this vendor's notifications appear.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## F. Shopping cart and checkout

Evidence: [cart service](../src/features/commerce/service.ts), [cart API](../src/features/commerce/cart-api.ts), and [checkout workflow](../src/features/commerce/marketplace-workflow.ts).

### ST-F01 — Add same-vendor and cross-vendor items
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — cart groups and multi-vendor order model exist.
- **Role:** Customer.
- **Preconditions / data:** Published in-stock products from Vendor A and Vendor B.
- **Steps:** 1. Add two Vendor A items and one Vendor B item. 2. Open cart and proceed toward checkout.
- **Expected:** All valid items appear; cart shows vendor groups/subtotals without mixing ownership or losing selected variants.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-F02 — Quantity changes, removal, and invalid quantity
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — cart update operations exist.
- **Role:** Customer.
- **Preconditions / data:** Cart with multiple lines and known stock.
- **Steps:** 1. Increase/decrease quantity. 2. Set quantity to zero, negative, non-integer, and above available stock. 3. Remove a line and reload.
- **Expected:** Valid changes persist; invalid/unavailable quantities are rejected; removed lines remain absent after reload.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-F03 — Vendor subtotals, delivery fees, and total
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — delivery and order totals are calculated in commerce workflow.
- **Role:** Customer.
- **Preconditions / data:** Multiple vendors with known product prices and delivery fees.
- **Steps:** 1. Calculate expected line totals, vendor subtotals, delivery fees, and grand total manually. 2. Compare cart and checkout quote.
- **Expected:** Displayed totals match prepared arithmetic with currency/rounding applied consistently; vendor-specific fees are not charged twice.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-F04 — Price changes and stock changes after adding to cart
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — checkout recalculates server-side; customer-facing conflict handling needs runtime verification.
- **Role:** Customer and vendor.
- **Preconditions / data:** Product in cart; change price/stock in separate vendor session before checkout.
- **Steps:** 1. Add product to cart. 2. Change its price or available stock. 3. Return to cart/checkout and continue.
- **Expected:** Server uses current authoritative price and availability; customer sees any changed total and must confirm rather than being charged a stale amount.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-F05 — Out-of-stock cart and checkout validation
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — eligible variant checks and checkout reservation validation exist.
- **Role:** Customer.
- **Preconditions / data:** Cart includes a variant with insufficient stock and one valid line.
- **Steps:** 1. Attempt checkout. 2. Correct the unavailable line. 3. Try missing/invalid checkout fields and retry.
- **Expected:** Unavailable item is clearly identified; checkout does not silently omit/change it; invalid inputs are rejected and valid retry can proceed.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-F06 — Checkout interruption and cart recovery
- **Source / implementation:** SIMAD REQUIRED — provisional / **NOT VERIFIED** — recovery across refresh/browser close must be demonstrated.
- **Role:** Customer.
- **Preconditions / data:** Non-empty cart and active reservation.
- **Steps:** 1. Start checkout. 2. Refresh, navigate away, and reopen checkout before expiry. 3. Repeat after reservation expiry.
- **Expected:** Before expiry, user sees accurate remaining time and can continue; after expiry, expired items are released and user is guided to refresh/re-reserve.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## G. Critical stock reservation tests

Evidence: [reservation workflow](../src/features/commerce/marketplace-workflow.ts), [reservation schema](../prisma/schema.prisma), and [checkout API reference](./api/v1.md). Source inspection shows a ten-minute server expiry and request/cron cleanup paths; it does not prove simultaneous-client correctness or that the deployment scheduler is configured.

### ST-G01 — Customer A reserves the final unit
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — reservation service creates a server-timestamped expiry.
- **Role:** Customer A.
- **Preconditions / data:** Published variant with exactly one available unit; Customer A and B have separate sessions.
- **Steps:** 1. As Customer A, add the variant. 2. Begin checkout/reserve. 3. Record the displayed expiry and remaining time.
- **Expected:** Reservation succeeds once and server reports a deadline approximately ten minutes after creation.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-G02 — Customer B races for the same final unit
- **Source / implementation:** TECHNICAL QUALITY / **NOT VERIFIED** — concurrent transaction outcome requires two-session execution.
- **Role:** Customer A and Customer B.
- **Preconditions / data:** One remaining unit; two separate browser profiles on independent authenticated accounts.
- **Steps:** 1. Open the same item on both profiles. 2. Submit reserve from both nearly simultaneously. 3. Refresh both carts and inspect available stock.
- **Expected:** Exactly one reservation succeeds; the other receives an availability/conflict response; stock is never oversold.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-G03 — Reserved stock is unavailable to other shoppers
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — active reservations are included in availability calculations.
- **Role:** Customer A and Customer B.
- **Preconditions / data:** Customer A holds an active reservation for the last unit.
- **Steps:** 1. Keep Customer A's checkout open. 2. As Customer B, refresh product/cart and attempt reservation.
- **Expected:** Customer B cannot reserve or purchase the held unit; product availability reflects the held quantity.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-G04 — Countdown accuracy and refresh/reconnect
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — API provides expiry/remaining time; countdown and reconnect behavior need browser verification.
- **Role:** Customer A.
- **Preconditions / data:** Active reservation; accurate client clock.
- **Steps:** 1. Record server expiry. 2. Compare the displayed countdown over two minutes. 3. Refresh and reconnect before expiry.
- **Expected:** Countdown is based on server expiry, decreases consistently, and refresh/reconnect does not restart the ten-minute window.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-G05 — Expiry releases stock automatically
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — expiry cleanup exists on commerce requests and cron route; scheduled execution is deployment-dependent.
- **Role:** Customer A and Customer B / operator.
- **Preconditions / data:** Active reservation with a controllable test clock or ability to wait ten minutes; isolated environment.
- **Steps:** 1. Reserve the final unit. 2. Do not pay. 3. Wait until server expiry plus a small observation margin. 4. Trigger the documented cleanup/cron path if scheduled cleanup is the configured mechanism. 5. Try reserving as Customer B.
- **Expected:** Expired reservation is marked expired and stock becomes available exactly according to its server deadline; no browser-only timer is required to release it.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-G06 — Failed payment preserves reservation until its deadline
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — payment workflow says failure may be retried before expiry.
- **Role:** Customer A.
- **Preconditions / data:** Active reservation and documented simulated failure number ending `0000`.
- **Steps:** 1. Start payment with failure number. 2. Verify payment fails. 3. Before expiry, retry with a success number.
- **Expected:** Failure transfers no money and does not prematurely release the still-valid reservation; retry is allowed before expiry.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-G07 — Successful payment converts reservation to order
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — payment and reservation conversion models/services exist.
- **Role:** Customer A.
- **Preconditions / data:** Active reservation, valid simulated payment input.
- **Steps:** 1. Complete successful simulated payment before expiry. 2. Inspect customer order, vendor sub-orders, and reservation state.
- **Expected:** One paid parent order and correct vendor sub-orders are created; reservation is converted; purchased stock is reduced once.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-G08 — Duplicate payment submission/callback is idempotent
- **Source / implementation:** TECHNICAL QUALITY / **PARTIAL** — idempotency keys and unique constraints exist; duplicate behavior needs integration/runtime proof.
- **Role:** Customer / operator.
- **Preconditions / data:** Isolated successful payment attempt; safe means to retry the same request/callback.
- **Steps:** 1. Submit the same payment attempt twice with the same idempotency key. 2. If a callback is exposed, replay the identical callback. 3. Inspect order, stock, receipts, and ledger.
- **Expected:** One payment outcome, one order, one receipt/ledger effect, and a single stock decrement; retries return a consistent result.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-G09 — Atomic reservation of multiple products
- **Source / implementation:** TECHNICAL QUALITY / **NOT VERIFIED** — atomic all-or-nothing behavior must be demonstrated.
- **Role:** Customer.
- **Preconditions / data:** Cart has multiple variants; one has sufficient stock and another has insufficient stock.
- **Steps:** 1. Attempt to reserve the entire cart. 2. Inspect each variant's reserved quantity and reservation records.
- **Expected:** Entire reservation fails without partial held stock; no line remains reserved if any item cannot be reserved.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-G10 — Reservation expiry during payment
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — payment path validates reservation expiry.
- **Role:** Customer.
- **Preconditions / data:** Reservation close to expiry; test clock or carefully controlled delay.
- **Steps:** 1. Begin payment shortly before expiry. 2. Allow the reservation to expire before payment confirmation. 3. Inspect payment/order status and stock.
- **Expected:** Late payment cannot convert an expired reservation into an order or oversell stock; error explains that checkout must be restarted.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-G11 — Refresh and network loss during reservation
- **Source / implementation:** TECHNICAL QUALITY / **NOT VERIFIED** — recovery behavior requires browser/network test.
- **Role:** Customer.
- **Preconditions / data:** Active reservation in disposable environment.
- **Steps:** 1. Disable network or close the tab after reservation creation. 2. Wait briefly. 3. Reconnect/reopen the same account. 4. Repeat after expiry.
- **Expected:** Server expiry remains unchanged; no duplicate reservation is created by reconnect; UI recovers or accurately reports expiry.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-G12 — Competing carts, duplicate lines, and reservation cleanup
- **Source / implementation:** TECHNICAL QUALITY / **NOT VERIFIED** — edge-case invariants require execution.
- **Role:** Two customers / operator.
- **Preconditions / data:** Two variants and available stock; one active and one expired reservation.
- **Steps:** 1. Add repeated quantities/duplicate cart lines and reserve. 2. Check that the server aggregates correctly. 3. Trigger expiry cleanup twice. 4. Inspect counts and reservation statuses.
- **Expected:** Quantities are neither undercounted nor double-counted; cleanup is safe to repeat and cannot release stock twice.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## H. Simulated mobile money payment

Evidence: [payment adapter](../src/features/commerce/payment-adapter.ts), [payment workflow](../src/features/commerce/marketplace-workflow.ts), and [payment schema](../prisma/schema.prisma). **All payment scenarios are simulations; no real money is transferred.**

### ST-H01 — EVC Plus, Zaad, and eDahab method selection
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — simulated method enum and adapter exist.
- **Role:** Customer.
- **Preconditions / data:** Active reservation and supported simulated test phone.
- **Steps:** 1. Complete a separate checkout with EVC Plus, Zaad, and eDahab. 2. Inspect payment method on each order/receipt.
- **Expected:** Each supported method is selectable and recorded correctly; payment screens clearly disclose simulation.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-H02 — Successful simulated payment and receipt
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — payment attempt and receipt models exist.
- **Role:** Customer.
- **Preconditions / data:** Active reservation and success test number.
- **Steps:** 1. Submit a successful simulated payment. 2. Open order history and receipt. 3. Refresh receipt page.
- **Expected:** One completed simulated transaction and persistent receipt with correct amount, currency, method, masked number, and order reference.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-H03 — Failure number ending in 0000 and retry
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — adapter maps the documented suffix to a simulated failure.
- **Role:** Customer.
- **Preconditions / data:** Active reservation and dedicated test number ending `0000`.
- **Steps:** 1. Submit payment using the failure number. 2. Verify error/status. 3. Retry using a success number before reservation expiry.
- **Expected:** Failure is explicit and marked simulated; no money/order/receipt is created; retry works only while reservation is valid.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-H04 — Duplicate payment attempt and replay
- **Source / implementation:** TECHNICAL QUALITY / **PARTIAL** — unique idempotency constraints exist; replay protection is unverified.
- **Role:** Customer / operator.
- **Preconditions / data:** One payment attempt in isolated environment.
- **Steps:** 1. Double-submit payment rapidly. 2. Refresh and retry the same attempt. 3. Compare attempt, receipt, order, stock, and ledger totals.
- **Expected:** Duplicate submission does not double-charge, create duplicate receipts/orders, or decrement stock again.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-H05 — Payment after reservation expiry
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — payment validates active and unexpired reservation.
- **Role:** Customer.
- **Preconditions / data:** Expired reservation and payment page.
- **Steps:** 1. Let reservation expire. 2. Submit a payment attempt. 3. Inspect payment, receipt, and order history.
- **Expected:** Expired reservation cannot be paid; no successful payment/order/receipt is recorded.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-H06 — Payment and parent/vendor order consistency
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — parent orders, vendor orders, payment attempts, and receipts are persisted.
- **Role:** Customer, Vendor A, Vendor B.
- **Preconditions / data:** Multi-vendor cart and successful simulated payment.
- **Steps:** 1. Pay once. 2. Compare payment amount with parent order total and vendor sub-order totals. 3. Inspect each vendor account.
- **Expected:** Amounts reconcile; each vendor sees only its own sub-order; receipt belongs to the correct customer/order.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-H07 — SMS outbox and payment notices
- **Source / implementation:** SOMSUUQ ADDITIONAL FEATURE — provisional / **PARTIAL** — simulated SMS outbox exists; actual carrier delivery is not implemented.
- **Role:** Customer / operator.
- **Preconditions / data:** Successful and failed payment cases; SMS outbox UI/data access.
- **Steps:** 1. Complete each payment outcome. 2. Inspect outbox status and recipient masking. 3. Check no actual SMS provider is contacted.
- **Expected:** Expected simulated message is stored once with correct outcome; no claim of real SMS delivery is made.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## I. Order management

Evidence: [commerce service](../src/features/commerce/service.ts), [order schema](../prisma/schema.prisma), and customer/vendor order pages.

### ST-I01 — Parent order creation and vendor splitting
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — parent order and vendor sub-order models/services exist.
- **Role:** Customer, Vendor A, Vendor B.
- **Preconditions / data:** Paid checkout with products from two vendors.
- **Steps:** 1. Complete checkout. 2. Inspect customer order and each vendor order list.
- **Expected:** One parent order contains correct vendor sub-orders and line items; vendor A/B each see only their own sub-order.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-I02 — Customer order history and detail
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — customer order history/detail services and pages exist.
- **Role:** Customer.
- **Preconditions / data:** Customer with multiple orders and statuses.
- **Steps:** 1. Open order history. 2. Filter/search if available. 3. Open each detail and receipt.
- **Expected:** Only current customer's records display; totals, items, statuses, and receipt match stored order data.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-I03 — Vendor order status and delivery tracking
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — explicit vendor transition map and delivery fields exist.
- **Role:** Vendor.
- **Preconditions / data:** Paid order assigned to vendor.
- **Steps:** 1. Confirm the order. 2. Move through processing, packing, ready, shipped, and delivered as permitted. 3. Add courier/tracking details and inspect customer view.
- **Expected:** Allowed transitions and tracking persist; customer sees updated status; invalid transitions are rejected.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-I04 — 24-hour vendor confirmation policy and expiry job
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — `confirmBy` and stale-order cleanup exist; deployment scheduling and exact policy must be verified.
- **Role:** Vendor / operator / customer.
- **Preconditions / data:** Isolated test order with controllable clock or a test fixture near confirmation deadline.
- **Steps:** 1. Create a paid order. 2. Confirm one before deadline. 3. Leave another unconfirmed beyond its deadline. 4. Run configured scheduled cleanup.
- **Expected:** Timely order remains active; overdue order is handled according to documented policy; stock/refund/customer notice are consistent.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-I05 — Cancellation and refund behavior
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — cancellation, return, and simulated-refund states exist; cancellation-specific refund automation is not established.
- **Role:** Customer, vendor, admin.
- **Preconditions / data:** Separate unpaid and paid orders in cancellable states.
- **Steps:** 1. Cancel unpaid order. 2. Try cancelling paid/fulfilling order. 3. Inspect stock, payment, refund, and ledger.
- **Expected:** Only permitted state transitions succeed; any refund follows policy and is recorded once; no unsupported automatic refund is assumed.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-I06 — Customer delivery confirmation
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — customer delivery confirmation service exists.
- **Role:** Customer.
- **Preconditions / data:** Shipped/delivered vendor sub-order.
- **Steps:** 1. Confirm delivery as customer. 2. Repeat the action. 3. Try another customer's order ID.
- **Expected:** Eligible order is confirmed once; duplicate or unauthorized confirmation is refused; related financial eligibility changes once.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-I07 — Order notifications and status synchronization
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — persisted notifications and polling/refresh mechanisms exist; end-to-end timing is unverified.
- **Role:** Customer and vendor.
- **Preconditions / data:** Order with active customer and vendor sessions in separate browsers.
- **Steps:** 1. Change vendor order status. 2. Observe both sessions and notifications. 3. Refresh and revisit order detail.
- **Expected:** Correct recipients receive status/notification update; persisted state remains correct after refresh.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-I08 — Order privacy and ID tampering
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — ownership checks exist in services; adversarial verification is required.
- **Role:** Customer A, Customer B, Vendor A, Vendor B.
- **Preconditions / data:** Distinct customer orders and vendor sub-orders.
- **Steps:** 1. Substitute another customer's order ID in URL/request. 2. Substitute another vendor's sub-order ID. 3. Repeat with anonymous session.
- **Expected:** Unauthorized records return not-found/forbidden without disclosing private order, address, payment, or line-item data.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## J. Coupons and promotions

Evidence: [coupon schema](../prisma/schema.prisma), [coupon UI](../src/features/commerce/components/coupon-manager.tsx), and [checkout workflow](../src/features/commerce/marketplace-workflow.ts).

### ST-J01 — Vendor and platform coupon creation
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — vendor/platform coupon scopes and management UI exist.
- **Role:** Vendor and admin.
- **Preconditions / data:** Approved vendor and admin accounts.
- **Steps:** 1. Create a vendor coupon. 2. Create a platform coupon as admin. 3. Try creating platform scope as vendor.
- **Expected:** Each authorized role creates only its allowed scope; unauthorized scope is rejected server-side.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-J02 — Percentage and fixed discounts
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — discount types and calculation service exist.
- **Role:** Customer, vendor/admin.
- **Preconditions / data:** Known subtotal; one percentage coupon and one fixed coupon.
- **Steps:** 1. Apply each coupon to separate eligible carts. 2. Calculate expected discounts and totals manually.
- **Expected:** Discount arithmetic, caps, rounding, and displayed total match the configured coupon rule.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-J03 — Minimum subtotal and start/end dates
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — coupon time/subtotal fields exist; boundary behavior needs runtime testing.
- **Role:** Customer.
- **Preconditions / data:** Coupons just below/at minimum and before/at/after validity dates.
- **Steps:** 1. Apply below-minimum coupon. 2. Apply at threshold. 3. Test not-yet-started, active, and expired coupon.
- **Expected:** Eligibility follows configured amount and time boundaries; rejected coupon explains why and does not change order total.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-J04 — Total-use and per-customer limits
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — usage-limit fields and redemption records exist.
- **Role:** Two customers.
- **Preconditions / data:** Coupon with low global limit and per-customer limit.
- **Steps:** 1. Redeem as Customer A up to the allowed limit. 2. Retry as A. 3. Redeem as B after global limit is reached.
- **Expected:** Per-customer and total limits are enforced without race-related over-redemption.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-J05 — One vendor coupon per vendor sub-order
- **Source / implementation:** SIMAD REQUIRED — provisional / **NOT VERIFIED** — scope enforcement must be demonstrated.
- **Role:** Customer.
- **Preconditions / data:** Multi-vendor cart and two vendor coupons.
- **Steps:** 1. Apply one coupon to each vendor's qualifying items. 2. Try applying two vendor coupons to the same vendor sub-order. 3. Inspect split totals.
- **Expected:** Vendor discounts apply only to their vendor subtotal; one-coupon-per-sub-order rule is enforced if configured.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-J06 — One platform coupon per parent order and discount funding
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — platform coupon scope and ledger entries exist; accounting requires reconciliation.
- **Role:** Customer, admin.
- **Preconditions / data:** Multi-vendor cart, one platform coupon, known commission/ledger configuration.
- **Steps:** 1. Apply platform coupon once. 2. Try applying a second platform coupon. 3. Inspect parent order, vendor sub-orders, coupon redemption, and ledger.
- **Expected:** Coupon applies at permitted scope; platform-funded discount is attributed correctly and does not incorrectly reduce vendor earnings.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-J07 — Invalid, expired, inactive, and tampered coupon
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — coupon validation exists in checkout workflow.
- **Role:** Customer.
- **Preconditions / data:** Invalid code, expired coupon, inactive coupon, and coupon owned by another vendor.
- **Steps:** 1. Apply each code in appropriate cart. 2. Tamper with client-submitted discount value if using browser/API tools.
- **Expected:** Server rejects invalid/out-of-scope coupons and recalculates all values itself; client cannot set discount amount.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## K. Reviews and ratings

Evidence: [review model](../prisma/schema.prisma), [product services](../src/features/products/service.ts), and [admin review moderation](../src/features/admin/components/admin-review-moderation.tsx).

### ST-K01 — Review eligibility after delivery
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — review ties to an order line and delivered-order workflow.
- **Role:** Customer.
- **Preconditions / data:** One delivered eligible order and one pending/undelivered order.
- **Steps:** 1. Submit a 1–5-star review for delivered line. 2. Attempt review for the pending line.
- **Expected:** Eligible review is accepted; undelivered/unverified purchase is rejected.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-K02 — One review per eligible line and rating bounds
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — unique order-line review and rating field exist.
- **Role:** Customer.
- **Preconditions / data:** Delivered eligible line.
- **Steps:** 1. Submit a rating with optional comment. 2. Submit a second review for same line. 3. Try ratings 0, 6, and non-integer.
- **Expected:** First valid review succeeds; duplicate and out-of-range ratings are rejected.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-K03 — Review photo upload and access
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — photo key exists; storage/access policy requires execution.
- **Role:** Customer and visitor.
- **Preconditions / data:** Eligible order line and valid/invalid image files.
- **Steps:** 1. Attach valid review photo. 2. Try unsupported/oversized file. 3. Open product review as visitor and attempt private source URL access.
- **Expected:** Valid image displays according to policy; invalid upload is rejected; private storage is not exposed.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-K04 — Average rating and hidden review behavior
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — product rating and hidden-state fields/services exist.
- **Role:** Visitor, admin.
- **Preconditions / data:** Product with multiple ratings, including one hidden review.
- **Steps:** 1. Compute expected public average. 2. Compare product page. 3. Hide/unhide a review as admin and refresh.
- **Expected:** Public average and list match the applicable visible reviews; moderation change is reflected consistently.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-K05 — Admin moderation and audit
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — admin moderation component and audit patterns exist.
- **Role:** Admin.
- **Preconditions / data:** Review containing abusive test text.
- **Steps:** 1. Hide the review with reason. 2. Inspect customer/public views and audit history. 3. Try moderation without admin role.
- **Expected:** Review is hidden per policy; reason/action is auditable; non-admin cannot moderate.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-K06 — Review privacy and locale
- **Source / implementation:** SIMAD REQUIRED — provisional / **NOT VERIFIED** — displayed names and localized labels require browser review.
- **Role:** Visitor and reviewer.
- **Preconditions / data:** Review with optional comment; English and Somali product pages.
- **Steps:** 1. Switch locale. 2. Inspect review content, author display, dates, and empty comments. 3. Try editing another user's review.
- **Expected:** User-authored review text remains unchanged; labels/localized UI are appropriate; only permitted owner/admin actions succeed.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## L. Returns and refunds

Evidence: [return models](../prisma/schema.prisma), [commerce returns tests](../tests/unit/commerce-returns.test.ts), and [admin/vendor return UI](../src/features/admin/components/admin-returns-disputes.tsx).

### ST-L01 — Return request in seven-day window
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — return request model/workflow exists; exact window boundary must be exercised.
- **Role:** Customer.
- **Preconditions / data:** Delivered order line within seven days.
- **Steps:** 1. Open order and request return. 2. Enter reason and explanation. 3. Attach a photo if available. 4. Submit.
- **Expected:** Eligible request is persisted for correct order line/quantity and appears to the vendor.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-L02 — Return deadline and ineligible order
- **Source / implementation:** SIMAD REQUIRED — provisional / **NOT VERIFIED** — boundary calculations and ineligible states need execution.
- **Role:** Customer.
- **Preconditions / data:** Delivered order just inside/outside seven-day limit; undelivered order.
- **Steps:** 1. Request return for each fixture. 2. Record result at the exact boundary using environment timezone.
- **Expected:** Only orders/lines within the configured return window are eligible; boundary rule is consistent and explained.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-L03 — Vendor approval, rejection, and receipt confirmation
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — vendor return review fields/statuses exist.
- **Role:** Vendor.
- **Preconditions / data:** Separate requested returns.
- **Steps:** 1. Approve one with instructions. 2. Reject another with note. 3. For an approved return, mark received after shipment.
- **Expected:** Only assigned vendor can update its return; each status/note persists and is visible to the customer.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-L04 — Admin dispute escalation
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — escalation/admin review states and admin UI exist.
- **Role:** Customer and admin.
- **Preconditions / data:** Vendor-rejected or disputed return.
- **Steps:** 1. Escalate as customer. 2. Review as admin. 3. Approve/reject with an admin note. 4. Inspect audit trail.
- **Expected:** Authorized admin decision updates the dispute and is recorded; internal admin-only note is not exposed to customer/vendor.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-L05 — Simulated refund and ledger adjustment
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — simulated refund and financial records exist; real-money refund is not implemented.
- **Role:** Vendor/admin/customer.
- **Preconditions / data:** Approved return, known line value and ledger entries.
- **Steps:** 1. Process return/refund through permitted flow. 2. Inspect refund record, parent/vendor order, and ledger. 3. Confirm no real payment provider is called.
- **Expected:** One simulated refund is recorded for the authorized amount; ledger adjustment is consistent; UI clearly identifies simulation.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-L06 — Partial refund for one vendor sub-order
- **Source / implementation:** SIMAD REQUIRED — provisional / **NOT VERIFIED** — partial multi-vendor reconciliation requires manual arithmetic.
- **Role:** Customer, Vendor A, Vendor B, admin.
- **Preconditions / data:** Parent order with two vendor sub-orders; return only one line from Vendor A.
- **Steps:** 1. Complete the return/refund for Vendor A line. 2. Compare both sub-orders and parent total. 3. Inspect Vendor B payout/ledger.
- **Expected:** Refund affects only correct line/vendor sub-order and parent totals; Vendor B's unrelated earnings are unchanged.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-L07 — Duplicate return/refund and unauthorized access
- **Source / implementation:** TECHNICAL QUALITY / **PARTIAL** — unique refund relationship exists; duplicate/ownership behavior needs execution.
- **Role:** Customer A/B, Vendor A/B, admin.
- **Preconditions / data:** One processed and one open return.
- **Steps:** 1. Replay refund action. 2. Access another customer's return ID. 3. Try updating a return as unrelated vendor.
- **Expected:** No duplicate refund or ledger adjustment; records are owner-scoped and unauthorized actions are denied.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## M. Commission and vendor payouts

Evidence: [financial service](../src/features/commerce/financial-service.ts), [financial calculations](../src/features/commerce/financial-calculations.ts), [seed commissions](../scripts/seed-commissions.ts), and [financial tests](../tests/unit/financial-calculations.test.ts).

### ST-M01 — Effective commission settings
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — default and category-level settings plus history exist.
- **Role:** Admin.
- **Preconditions / data:** Seeded default rate and at least two category rates; inspect actual configured values first.
- **Steps:** 1. Review admin commission settings. 2. Change one category and default rate in test environment. 3. Inspect change history.
- **Expected:** Commission is taken from actual configured values (not assumed constants); changes are scoped and audit/history recorded.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-M02 — Commission calculation and arithmetic example
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — calculation functions and unit tests exist.
- **Role:** Admin, Vendor.
- **Preconditions / data:** Product subtotal `$100.00`, configured commission `10%` (or substitute actual configured rate).
- **Steps:** 1. Complete a paid eligible order. 2. Compare line commission, ledger, and vendor gross/net values to `subtotal × actual rate`. 3. Repeat with category-specific rate.
- **Expected:** Example at 10% gives $10.00 commission before any other applicable adjustments; actual configured rate governs the real fixture; rounding matches ledger.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-M03 — Sales ledger and vendor earnings reconciliation
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — ledger entries and vendor statements exist.
- **Role:** Vendor, admin.
- **Preconditions / data:** Known paid order, delivery fee, commission, and discount.
- **Steps:** 1. Reconcile sale, commission, discount, delivery, and net payable. 2. Compare vendor statement, admin reconciliation, and order detail.
- **Expected:** Each source sums to the same vendor liability; no parent/sub-order double counting.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-M04 — Vendor/platform coupon and refund deductions
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — ledger types exist; funding attribution requires execution.
- **Role:** Admin and vendor.
- **Preconditions / data:** Orders with vendor coupon, platform coupon, and partial refund.
- **Steps:** 1. Reconcile each ledger effect. 2. Compare vendor-funded vs platform-funded discounts. 3. Verify refund reverses only related entries.
- **Expected:** Vendor balance bears only applicable vendor-funded discount/refund; platform-funded amount stays with platform; entries are traceable.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-M05 — Seven-day eligibility and weekly simulated payout
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — payout hold and weekly batch services exist; scheduler/payment provider outcome is simulated.
- **Role:** Admin and vendor.
- **Preconditions / data:** Eligible delivered order older than seven days and a recent ineligible order.
- **Steps:** 1. Preview payout balances. 2. Create/approve weekly batch. 3. Inspect older vs recent order allocations. 4. Verify no real funds are sent.
- **Expected:** Only eligible amounts are included per configured hold; payout is explicitly simulated and statement identifies included orders.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-M06 — Negative balance carried forward and failed payout retry
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — payout retry/status and ledger adjustments exist.
- **Role:** Admin and vendor.
- **Preconditions / data:** Vendor with refund/adjustment exceeding current positive balance and one failed payout.
- **Steps:** 1. Run payout calculation. 2. Inspect negative balance/carry-forward. 3. Retry failed payout once and inspect ledger.
- **Expected:** Negative amount remains owed/carried forward without being paid out; retry does not duplicate payout entries.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-M07 — Payout statement and full reconciliation
- **Source / implementation:** TECHNICAL QUALITY / **PARTIAL** — reconciliation service/UI and financial tests exist; production data consistency is unknown.
- **Role:** Admin, Vendor A, Vendor B.
- **Preconditions / data:** Multi-vendor order with commission, delivery, coupon, refund, and payout.
- **Steps:** 1. Build an independent spreadsheet calculation. 2. Compare admin reconciliation and each vendor statement. 3. Try viewing another vendor statement.
- **Expected:** Totals reconcile without duplicate parent/sub-order counting; vendor cannot see another's statement.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## N. Admin dashboard

Evidence: [admin pages](../src/app/[locale]/admin/), [admin services](../src/features/admin/service.ts), and [admin audit logs](../src/features/admin/components/admin-audit-logs.tsx).

### ST-N01 — Admin overview and live database statistics
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — overview service exists; all dashboard totals need data reconciliation.
- **Role:** Admin.
- **Preconditions / data:** Known counts of users, vendors, applications, and orders.
- **Steps:** 1. Open overview. 2. Compare each displayed number to prepared data. 3. Refresh after creating a test record.
- **Expected:** Numbers are database-backed, update consistently, and do not use placeholder values.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-N02 — Vendor applications and decisions
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — admin review pages and service actions exist.
- **Role:** Admin.
- **Preconditions / data:** Submitted applications in multiple states.
- **Steps:** 1. Search/filter applications. 2. Open a detail. 3. Approve/reject/request information on separate fixtures.
- **Expected:** Filters show correct records; detail is accurate; decisions follow valid transitions and are audited.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-N03 — Users, vendors, products, and order administration
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — admin pages exist; each action's data backing and permissions require confirmation.
- **Role:** Admin and non-admin.
- **Preconditions / data:** Test users, vendors, products, and orders.
- **Steps:** 1. Inspect lists and search/filter. 2. Open details and attempt supported admin actions. 3. Repeat as vendor/customer.
- **Expected:** Admin sees permitted real records; non-admin cannot access admin data or invoke admin actions.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-N04 — Admin notifications and settings
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — admin notification model/UI and settings pages exist.
- **Role:** Admin.
- **Preconditions / data:** At least one unread and one read admin notification.
- **Steps:** 1. Inspect unread count and recent list. 2. Mark one/all read. 3. Change a reversible test setting and reload.
- **Expected:** Count and read state persist; settings update only when authorized and are effective as documented.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-N05 — Audit logs and sensitive actions
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — audit model and admin actions exist.
- **Role:** Admin.
- **Preconditions / data:** Disposable user/vendor on which to perform reversible sensitive actions.
- **Steps:** 1. Perform an approved/rejected/suspended/commission-setting action. 2. Search audit logs by actor/entity/date. 3. Try accessing logs as non-admin.
- **Expected:** Sensitive action has actor, action, entity, timestamp, and safe metadata; non-admin is denied; no secrets are logged.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-N06 — Admin permissions and self-protection
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — admin-only guards and self-delete/suspend checks exist.
- **Role:** Admin and customer/vendor.
- **Preconditions / data:** Admin account and disposable non-admin account.
- **Steps:** 1. Try admin routes without login and as customer/vendor. 2. Try suspending/deleting the current admin. 3. Try unauthorized destructive action on another user.
- **Expected:** Non-admin receives denial; self-protection and authorization rules are enforced server-side; no data is altered by rejected attempts.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-N07 — Search, filters, and date ranges
- **Source / implementation:** SIMAD REQUIRED — provisional / **NOT VERIFIED** — filter correctness needs UI/API test.
- **Role:** Admin.
- **Preconditions / data:** Records with distinct dates, statuses, and search terms.
- **Steps:** 1. Apply each available search/filter/date range across applications, users, orders, and reports. 2. Compare with known fixtures.
- **Expected:** Results match selected criteria, pagination does not duplicate/skip items, and clearing filters restores full list.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-N08 — Admin product/order/review/return/financial tools
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — domain models/pages/services exist; integrated workflows need live verification.
- **Role:** Admin.
- **Preconditions / data:** Test product, order, review, return, commission, payout, and reconciliation records.
- **Steps:** 1. Open each admin module. 2. Reconcile visible records. 3. Perform only reversible/test-authorized moderation or financial action.
- **Expected:** Modules reflect current database values and role policies; actions update the correct record and audit where sensitive.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## O. Analytics

Evidence: [admin analytics](../src/features/admin/components/admin-marketplace-analytics.tsx), [vendor analytics](../src/features/vendors/components/vendor-sales-analytics.tsx), and their services.

### ST-O01 — Daily sales and date range
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — analytics UI/service exist; calculations require reconciliation.
- **Role:** Admin.
- **Preconditions / data:** Paid orders on known dates, including outside selected range.
- **Steps:** 1. Select one-day and multi-day ranges. 2. Sum qualifying orders independently. 3. Compare chart and totals.
- **Expected:** Daily sales match records and selected range; timezone boundaries are consistent.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-O02 — Top vendors, categories, and commission
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — analytics calculations and real database queries exist; output values need test.
- **Role:** Admin.
- **Preconditions / data:** Known order line/vendor/category values and actual commission configuration.
- **Steps:** 1. Compare top rankings and commission totals to independent calculations. 2. Change date range and repeat.
- **Expected:** Rankings and amounts reflect the selected qualifying data and actual configuration.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-O03 — Status breakdown, cancellation/refund exclusions
- **Source / implementation:** SIMAD REQUIRED — provisional / **NOT VERIFIED** — exclusion and status grouping rules require execution.
- **Role:** Admin.
- **Preconditions / data:** Paid, cancelled, refunded, and partially refunded fixtures.
- **Steps:** 1. Compare status chart counts. 2. Reconcile sales/commission with policy for cancelled/refunded orders.
- **Expected:** Each order is grouped once; cancelled/refunded amounts are excluded or adjusted consistently with documented accounting rules.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-O04 — Parent and vendor sub-order de-duplication
- **Source / implementation:** TECHNICAL QUALITY / **NOT VERIFIED** — double-count prevention requires a multi-vendor test.
- **Role:** Admin.
- **Preconditions / data:** One parent order split between two vendors.
- **Steps:** 1. Compare order count, sales, and commissions in analytics. 2. Calculate totals by parent and by vendor sub-order.
- **Expected:** Parent totals are not added again to sub-order totals; each sale/commission appears once.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-O05 — Vendor analytics ownership
- **Source / implementation:** TECHNICAL QUALITY / **PARTIAL** — vendor-scoped dashboard service exists; isolation must be proven.
- **Role:** Vendor A and Vendor B.
- **Preconditions / data:** Distinct sales and products per vendor.
- **Steps:** 1. Compare each vendor chart to their ledger/orders. 2. Try changing query/date parameters and IDs to another vendor's values.
- **Expected:** Each vendor sees only their own data and cannot change the scope to another vendor.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-O06 — Real data, empty range, and chart resizing
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — chart components and API services exist; responsive/empty states need review.
- **Role:** Admin and vendor.
- **Preconditions / data:** Empty date range and known non-empty range.
- **Steps:** 1. Select a range with no data. 2. Inspect empty state. 3. Resize browser and compare chart labels/values.
- **Expected:** Empty state is explicit; chart is backed by selected data, has readable axes, and does not clip on target screens.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## P. Support and communications

Evidence: [support service](../src/features/support/service.ts), [support workflow](../src/features/support/workflow.ts), and [support portal](../src/features/support/components/support-portal.tsx).

### ST-P01 — Customer and vendor help centre access
- **Source / implementation:** SOMSUUQ ADDITIONAL FEATURE — provisional / **IMPLEMENTED** — customer/vendor help routes exist, including unapproved vendor help.
- **Role:** Customer and vendor.
- **Preconditions / data:** Signed-in customer, approved vendor, and unapproved vendor.
- **Steps:** 1. Open each help centre. 2. Navigate to ticket list and new-ticket flow. 3. Try opening another role's route.
- **Expected:** Each role can access its support area; unapproved vendor access follows documented policy; other roles' private tickets are not exposed.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-P02 — Ticket creation, category, and attachment
- **Source / implementation:** SOMSUUQ ADDITIONAL FEATURE — provisional / **IMPLEMENTED** — ticket categories and private attachment models/services exist.
- **Role:** Customer or vendor.
- **Preconditions / data:** Test ticket with valid category, valid attachment, and invalid file.
- **Steps:** 1. Create ticket. 2. Upload attachment. 3. Try unsupported/oversized file. 4. Reopen ticket.
- **Expected:** Ticket and valid attachment persist; invalid file is rejected; ticket requester is taken from authenticated account, not submitted identity.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-P03 — Replies, assignment, status, and priority
- **Source / implementation:** SOMSUUQ ADDITIONAL FEATURE — provisional / **IMPLEMENTED** — support messages, activity, assignment, status, and priority are modeled.
- **Role:** Customer, vendor, admin.
- **Preconditions / data:** Open ticket and at least two support agents/admins if available.
- **Steps:** 1. Reply as requester. 2. Assign ticket and change status/priority as admin. 3. Continue conversation as appropriate.
- **Expected:** Replies and transitions persist with actor/time; notifications go to relevant participants; unauthorized role cannot change admin fields.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-P04 — Internal admin notes are private
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — internal-note flag and AI-context handling exist; access control must be tested.
- **Role:** Admin, customer, vendor.
- **Preconditions / data:** Ticket with one internal note and one public reply.
- **Steps:** 1. Add an internal note as admin. 2. Open ticket as requester/vendor and inspect page/API. 3. Open as admin.
- **Expected:** Internal note is visible only to authorized admins; never appears in customer/vendor responses, exports, or suggested public text.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-P05 — Admin support inbox, assignment, and escalation
- **Source / implementation:** SOMSUUQ ADDITIONAL FEATURE — provisional / **IMPLEMENTED** — admin support inbox/detail routes exist.
- **Role:** Admin.
- **Preconditions / data:** Tickets with multiple categories/statuses and an open communication report.
- **Steps:** 1. Search/filter tickets. 2. Assign and update priority/status. 3. Open escalated communication/support cases.
- **Expected:** Inbox displays correct records; admin actions persist and are audited where sensitive.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-P06 — Email outbox, delivery failure, retry
- **Source / implementation:** SOMSUUQ ADDITIONAL FEATURE — provisional / **PARTIAL** — persistent email outbox and retry behavior exist; SMTP delivery is deployment-dependent.
- **Role:** Admin / operator.
- **Preconditions / data:** SMTP test mailbox; safe ability to simulate failed delivery.
- **Steps:** 1. Create/resolve a ticket. 2. Check outbox and mailbox. 3. Simulate failure and retry only a retryable state.
- **Expected:** Ticket operation persists even if email fails; outbox status is visible; uncertain SENDING state is not blindly retried into duplicate email.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-P07 — Optional AbuurAI and support fallback
- **Source / implementation:** SOMSUUQ ADDITIONAL FEATURE — provisional / **PARTIAL** — AI service is optional; provider configuration and failure behavior need execution.
- **Role:** Customer, vendor, admin.
- **Preconditions / data:** One run with AI unconfigured; optional second run with valid provider test credentials.
- **Steps:** 1. Create/reply to a ticket with AI unavailable. 2. If configured, request assistance. 3. Simulate timeout/provider failure. 4. Inspect output for private/internal data.
- **Expected:** Normal ticketing works without AI; AI errors do not block support; response is advisory and does not expose internal notes or another user's data.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## Q. Customer-vendor messaging

Evidence: [communications service](../src/features/communications/service.ts), [Socket.IO server](../src/features/communications/socket-server.ts), [conversation UI](../src/features/communications/components/conversation-inbox.tsx), and [message routes](../src/app/api/v1/conversations/).

### ST-Q01 — Contact Vendor and conversation creation
- **Source / implementation:** SOMSUUQ ADDITIONAL FEATURE — provisional / **IMPLEMENTED** — product contact and conversation creation exist.
- **Role:** Customer and approved vendor.
- **Preconditions / data:** Published product and two authenticated participants.
- **Steps:** 1. Select Contact Vendor from product detail. 2. Send first message. 3. Open vendor's messages page.
- **Expected:** One conversation is associated with correct customer/vendor and product context; participants can access it.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-Q02 — Text message persistence and history
- **Source / implementation:** SOMSUUQ ADDITIONAL FEATURE — provisional / **IMPLEMENTED** — message persistence and HTTP history routes exist.
- **Role:** Customer and vendor.
- **Preconditions / data:** Existing conversation in two separate browser sessions.
- **Steps:** 1. Send text from customer. 2. Open vendor session and reply. 3. Refresh both pages and page through older history.
- **Expected:** Messages persist in correct order and appear to both participants after refresh/history load.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-Q03 — Real-time delivery, read receipts, typing, and presence
- **Source / implementation:** SOMSUUQ ADDITIONAL FEATURE — provisional / **PARTIAL** — Socket.IO and presence components exist; delivery semantics require live testing.
- **Role:** Customer and vendor.
- **Preconditions / data:** Two separate authenticated sessions open to conversation.
- **Steps:** 1. Send messages while both are online. 2. Observe delivery/read indicators and typing state if displayed. 3. Close one session and observe presence; reconnect.
- **Expected:** Supported indicators reflect actual persisted/connected state and recover after reconnect; do not mark unsupported indicators as implemented if absent.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-Q04 — Image/file attachment privacy
- **Source / implementation:** SOMSUUQ ADDITIONAL FEATURE — provisional / **PARTIAL** — message image and private attachment routes exist; durable storage is not established.
- **Role:** Customer, vendor, unrelated user.
- **Preconditions / data:** Valid/invalid image/file and a conversation attachment.
- **Steps:** 1. Share valid image/file. 2. Download as other participant. 3. Try access as unrelated account and after logout.
- **Expected:** Participants can access allowed attachments; unauthorized users cannot; invalid uploads rejected; storage limitation is documented for deployment.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-Q05 — Product/order sharing and location
- **Source / implementation:** SOMSUUQ ADDITIONAL FEATURE — provisional / **IMPLEMENTED** — PRODUCT/ORDER message types and location support code exist.
- **Role:** Customer and vendor.
- **Preconditions / data:** Product, participant order, and two-party conversation.
- **Steps:** 1. Share a product. 2. Share an order permitted to the sender. 3. Share location if the UI offers it. 4. Inspect message on recipient account.
- **Expected:** Shared entity is accurate and permission-checked; location is shared only after user action and only with conversation participant.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-Q06 — Block, report, and admin moderation
- **Source / implementation:** SOMSUUQ ADDITIONAL FEATURE — provisional / **IMPLEMENTED** — block/report models and admin communication reporting UI exist.
- **Role:** Customer/vendor and admin.
- **Preconditions / data:** Test conversation with no real personal data.
- **Steps:** 1. Block participant and attempt new message. 2. Submit a report with reason. 3. Review report as admin and resolve.
- **Expected:** Block affects intended communication only; report is persisted and admin-visible; unrelated conversations and accounts remain unaffected.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-Q07 — Conversation authorization and duplicate tabs
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — socket auth and membership checks exist; session-level behavior needs execution.
- **Role:** Customer A/B, Vendor A/B.
- **Preconditions / data:** Two separate conversations and multiple tabs for one account.
- **Steps:** 1. Attempt to subscribe/send with an unrelated conversation ID. 2. Open duplicate tabs and reconnect one. 3. Inspect messages and presence.
- **Expected:** Only conversation members can read/write; no duplicate persisted message is created by reconnect; multiple tabs do not leak another conversation.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## R. Notifications

Evidence: [notification models](../prisma/schema.prisma), [admin notification service](../src/features/admin/notifications.ts), [vendor bell](../src/features/vendors/components/vendor-notification-bell.tsx), and [customer notifications](../src/features/customer/components/customer-notifications.tsx).

### ST-R01 — Customer, vendor, and admin notification creation
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — recipient-specific persisted notification models exist.
- **Role:** Customer, vendor, admin.
- **Preconditions / data:** Trigger one event for each role, such as order or application status.
- **Steps:** 1. Trigger each event. 2. Sign in as each recipient. 3. Compare notification content with the event.
- **Expected:** Notification appears only for intended recipient with correct source, language variants, and destination when supplied.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-R02 — Unread count and individual mark-read
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — read timestamps and mark-read services exist.
- **Role:** Customer, vendor, admin.
- **Preconditions / data:** At least two unread notifications.
- **Steps:** 1. Compare displayed count with unread records. 2. Mark one notification read. 3. Refresh.
- **Expected:** Count decrements once; only selected item changes; read status persists.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-R03 — Mark all read and notification destination
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — bulk read operation and href fields exist.
- **Role:** Customer/vendor/admin.
- **Preconditions / data:** Multiple unread notifications, including one with destination.
- **Steps:** 1. Mark all read. 2. Refresh. 3. Click notification with destination and one without.
- **Expected:** All target user's notifications are read; valid destination opens the relevant page; missing destination does not cause a broken route.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-R04 — Persistence and notification recipient isolation
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — recipient-scoped models/services exist; cross-account testing required.
- **Role:** Customer A/B and Vendor A/B.
- **Preconditions / data:** Separate unread notifications per account.
- **Steps:** 1. Refresh/relogin. 2. Try using another user's notification ID in mark-read route. 3. Compare both accounts.
- **Expected:** Notifications persist for recipient; unauthorized IDs cannot be read/modified; count is not affected for another user.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-R05 — Locale-specific notification content
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — vendor bilingual content fields exist; all event translations are not established.
- **Role:** Customer/vendor/admin.
- **Preconditions / data:** Notifications with English and Somali text.
- **Steps:** 1. Switch locale. 2. Open list and bell/dropdown. 3. Compare title/body and destination labels.
- **Expected:** Notification text follows selected language where translated; no database title/body is overwritten by language switching.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-R06 — Notification event failure and duplicate delivery
- **Source / implementation:** TECHNICAL QUALITY / **PARTIAL** — dedupe keys and persisted models exist; event reliability must be tested.
- **Role:** Operator and affected test user.
- **Preconditions / data:** One event that creates a notification; safe retry trigger.
- **Steps:** 1. Trigger event once and inspect. 2. Retry/replay the operation. 3. Inspect recipient count and related event.
- **Expected:** No duplicate notification for idempotent repeated event; failures are observable and do not notify unrelated users.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## S. English and Somali localization

Evidence: [dictionaries](../src/i18n/dictionaries/), [typed translations](../src/i18n/types.ts), and [locale provider](../src/i18n/locale-provider.tsx).

### ST-S01 — Language switcher preserves route and query
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — locale provider preserves pathname, search, and fragment.
- **Role:** Visitor, customer, vendor, admin.
- **Preconditions / data:** Open a nested page with query parameters and fragment.
- **Steps:** 1. Switch English to Somali. 2. Switch back. 3. Repeat from customer, vendor, and admin pages.
- **Expected:** Same page and relevant query/hash are preserved in new locale; no unexpected redirect to homepage.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-S02 — Public marketplace and product text
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — dictionaries and bilingual catalog content exist; whole-site parity not audited.
- **Role:** Visitor.
- **Preconditions / data:** English/Somali browser sessions.
- **Steps:** 1. Visit homepage, category/search, product detail, and store pages in both locales. 2. Inspect headings, buttons, filters, badges, empty/error states, and content.
- **Expected:** Shared UI is translated consistently; user-provided product/store Somali text stays intact; missing translation is logged as a bug.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-S03 — Customer dashboard, checkout, orders, and forms
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — selected customer and checkout strings are translated; complete parity is not established.
- **Role:** Customer.
- **Preconditions / data:** Customer account, cart, order, and a form with validation errors.
- **Steps:** 1. Check account, cart, checkout, payment, orders, returns, help, and notifications in both languages. 2. Trigger required/invalid-field errors and success states.
- **Expected:** Titles, labels, placeholders, dropdowns, statuses, errors, and success messages use selected locale consistently.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-S04 — Vendor dashboard and onboarding localization
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — vendor strings and notification content are partially bilingual.
- **Role:** Vendor.
- **Preconditions / data:** Vendor with onboarding and dashboard access.
- **Steps:** 1. Inspect onboarding, products, orders, inventory, analytics, communications, settings, and support in both languages. 2. Trigger validation/status messages.
- **Expected:** Navigation, tables, dialogs, statuses, bell, and form messages are localized without breaking route.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-S05 — Admin dashboard localization
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — selected admin labels were translated; full admin dictionary coverage is not established.
- **Role:** Admin.
- **Preconditions / data:** Admin account with sample records.
- **Steps:** 1. Inspect overview, users, vendors, products, orders, analytics, coupons, returns, support, notifications, and settings in both locales.
- **Expected:** Visible headings, filters, charts, dialog controls, and status text are localized; untranslated strings are recorded rather than assumed complete.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-S06 — Emails, errors, and no content overwrite
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — bilingual email templates/dictionaries exist; provider delivery and all error messages need verification.
- **Role:** Customer, vendor, admin.
- **Preconditions / data:** SMTP test inbox and records with distinct Somali content.
- **Steps:** 1. Trigger supported emails in each locale. 2. Compare validation/API errors and notification text. 3. Edit English product copy and inspect stored Somali version.
- **Expected:** Supported emails/messages use intended locale; errors are understandable; machine translation never replaces user-provided Somali fields.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## T. Responsive design

Evidence: shared layout and role pages under [app routes](../src/app/[locale]/), components under [features](../src/features/), and [global styles](../src/app/globals.css).

### ST-T01 — Viewport matrix and overflow sweep
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — some responsive refinements exist; no complete viewport audit was performed.
- **Role:** Visitor, customer, vendor, admin.
- **Preconditions / data:** Browser responsive mode or physical devices.
- **Steps:** 1. Test 320, 375, 768, 1024, and 1440 CSS-pixel widths. 2. At each width inspect page edges and scroll behavior. 3. Repeat key pages in English and Somali.
- **Expected:** No unintended horizontal overflow, clipped controls, or unreadable text; intentionally scrolling tables stay inside their own container.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-T02 — Homepage, marketplace, product, and store pages
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — responsive layouts exist but visual behavior is unverified.
- **Role:** Visitor.
- **Preconditions / data:** Viewport matrix.
- **Steps:** 1. Inspect home, marketplace/search/filter, product detail, and storefront at each width. 2. Test image galleries, product grid, filters, and contact action.
- **Expected:** Content adapts without hiding product controls or causing page-wide horizontal scroll; touch controls remain usable.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-T03 — Customer cart, checkout, and forms
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — cart wrapping refinements exist; checkout mobile fit is unverified.
- **Role:** Customer.
- **Preconditions / data:** Cart with multiple vendor lines.
- **Steps:** 1. Inspect cart, checkout, payment form, order detail, and return form at 320/375/768 widths. 2. Open validation errors and dropdowns.
- **Expected:** Inputs/buttons fit, remain reachable, and do not overlap; important checkout information/actions remain visible and usable.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-T04 — Customer/vendor/admin navigation and dashboards
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — sidebar/header changes exist; end-to-end mobile navigation is not audited.
- **Role:** Customer, vendor, admin.
- **Preconditions / data:** Accounts for all roles.
- **Steps:** 1. At each viewport open/close mobile navigation or sidebar. 2. Navigate to all major role sections. 3. Return and inspect active route state.
- **Expected:** Navigation is discoverable, keyboard/touch usable, closes appropriately, and does not hide essential destinations.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-T05 — Tables, charts, dialogs, dropdowns, and support/messaging
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — some tables/charts have responsive patterns; all overlays need testing.
- **Role:** Vendor, admin, customer.
- **Preconditions / data:** Populated tables, charts, conversation, ticket, and open dialog.
- **Steps:** 1. Inspect orders, inventory, admin tables, analytics charts, messaging, support, dropdowns, and dialogs at 320/375/768 widths. 2. Try every action.
- **Expected:** Tables scroll locally or reflow; charts resize; dialogs/dropdowns fit viewport and remain operable; message/support controls are not clipped.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-T06 — Authentication and touch-target usability
- **Source / implementation:** SIMAD REQUIRED — provisional / **NOT VERIFIED** — complete mobile usability is not established.
- **Role:** Visitor/customer/vendor/admin.
- **Preconditions / data:** Mobile browser or responsive viewport with touch emulation.
- **Steps:** 1. Test login/register, verification, reset, admin MFA, and onboarding at 320/375 widths. 2. Tap controls without zooming. 3. Test keyboard focus and screen rotation.
- **Expected:** Forms and error messages fit; touch targets are usable; no required function is hidden; focus order remains understandable.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## U. Security and authorization

Evidence: [session/auth services](../src/features/auth/sessions.ts), [API registry](../src/lib/api/v1.ts), [media handlers](../src/lib/media/), [audit services](../src/features/admin/), and [API security docs](./api/v1.md).

### ST-U01 — Customer/vendor/admin role isolation
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — role guards exist; adversarial access tests are required.
- **Role:** Customer, vendor, admin, anonymous.
- **Preconditions / data:** Active sessions for each role.
- **Steps:** 1. Attempt direct-page and API access across roles. 2. Repeat without session. 3. Inspect returned status and data.
- **Expected:** Server denies unauthorized access; no protected data is returned despite client navigation or URL tampering.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-U02 — Vendor ownership and approval/suspension enforcement
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — vendor ownership/approval checks exist.
- **Role:** Vendor A/B and admin.
- **Preconditions / data:** Separate products, orders, tickets, and a pending/suspended vendor.
- **Steps:** 1. Substitute another vendor's IDs in supported URLs/requests. 2. Try publishing as pending/suspended vendor. 3. Try another vendor's ticket/order.
- **Expected:** Ownership and status are enforced in services/APIs, not only hidden in UI.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-U03 — Input validation and error disclosure
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — strict Zod validation and response helpers exist.
- **Role:** Test operator.
- **Preconditions / data:** Disposable test account and safe invalid requests.
- **Steps:** 1. Submit malformed JSON, unknown fields, oversized strings, invalid IDs, and boundary numbers. 2. Inspect response and logs.
- **Expected:** Invalid input is rejected consistently; no stack, SQL, token, or private metadata leaks.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-U04 — File upload validation and private attachment access
- **Source / implementation:** TECHNICAL QUALITY / **PARTIAL** — private local file handlers and validation exist; malware scanning/durable storage are not established.
- **Role:** Customer/vendor/admin/unrelated account.
- **Preconditions / data:** Valid and invalid test files; private attachment.
- **Steps:** 1. Try spoofed MIME, wrong extension, oversize, and valid files in each upload flow. 2. Access private download as unrelated and anonymous users.
- **Expected:** Invalid files are rejected; private files are authorization checked; document known lack of malware scanning and persistent shared storage.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-U05 — Password, cookie, session, CSRF, and refresh security
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — hashing, HttpOnly cookie/session validation and same-origin checks are documented/implemented.
- **Role:** Operator with browser developer tools.
- **Preconditions / data:** HTTPS test environment and test account.
- **Steps:** 1. Inspect cookie attributes without copying values. 2. Try unsafe request with wrong/missing Origin. 3. Reuse revoked/expired session and refresh token.
- **Expected:** Cookies are HttpOnly/SameSite and Secure in production; mutations require allowed origin; revoked/expired sessions fail.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-U06 — Rate limiting and brute-force resistance
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — rate-limit helpers and auth attempt persistence exist.
- **Role:** Operator.
- **Preconditions / data:** Isolated test environment and controlled request rate.
- **Steps:** 1. Repeatedly submit invalid login, OTP, and sensitive requests. 2. Verify throttling, then wait for configured recovery.
- **Expected:** Excess attempts are bounded; lockout/rate behavior does not allow easy bypass by changing form/UI; no sensitive data is disclosed.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-U07 — Audit coverage and sensitive-data scan
- **Source / implementation:** TECHNICAL QUALITY / **PARTIAL** — audit model and selected actions exist; exhaustive coverage is not established.
- **Role:** Admin/operator.
- **Preconditions / data:** Test admin/vendor actions and sanitized logs.
- **Steps:** 1. Trigger vendor review, suspension, commission, payout, support assignment, and moderation actions. 2. Inspect audit log. 3. Search logs/client assets for test secrets or OTP-like values.
- **Expected:** Sensitive changes are attributable and auditable; secrets, credentials, private messages, and payment inputs are not logged/exposed.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-U08 — IDOR, conversation privacy, and report/block access
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — owner/member checks exist in resource services; end-to-end adversarial test is required.
- **Role:** Customer A/B, Vendor A/B, admin.
- **Preconditions / data:** Separate orders, tickets, attachments, conversations, and reports.
- **Steps:** 1. Substitute resource IDs across accounts. 2. Attempt read/write/download and block/report operations. 3. Check admin-only review paths.
- **Expected:** Only resource owner/participant or authorized admin can access; denied attempts do not reveal existence or private content.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## V. Automated quality checks and CI

Evidence: [package scripts](../package.json), [CI workflow](../.github/workflows/ci.yml), and [tests](../tests/). This plan does not run Playwright or edit test/config files.

### ST-V01 — Unit test suite and minimum automated-test requirement
- **Source / implementation:** SIMAD REQUIRED — provisional / **IMPLEMENTED** — 100 unit/integration `it`/`test` declarations were inventoried; this is not a run or proof of SIMAD compliance.
- **Role:** Developer/CI operator.
- **Preconditions / data:** Dependencies installed; isolated environment.
- **Steps:** 1. Confirm the official brief's exact minimum and definition of a test. 2. Run `npm test` locally. 3. Record passed/failed/skipped counts and coverage.
- **Expected:** Required minimum is met by relevant automated tests (not merely declaration count); suite exits successfully or failures are logged as defects.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-V02 — PostgreSQL integration tests
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — 8 integration test declarations and a dedicated config exist; database execution was not performed for this document.
- **Role:** Developer/CI operator.
- **Preconditions / data:** Dedicated `TEST_DATABASE_URL`; never point it at a developer/shared/production database.
- **Steps:** 1. Confirm DB URL is isolated. 2. Run `npm run test:integration`. 3. Record migration/setup and teardown results.
- **Expected:** Integration suite completes against isolated PostgreSQL and cleans only its own fixtures; failures are diagnosable.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-V03 — API/OpenAPI contract checks
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — OpenAPI registry, endpoint tests, and docs exist.
- **Role:** Developer/QA.
- **Preconditions / data:** Dependencies installed.
- **Steps:** 1. Run relevant API/OpenAPI tests. 2. Open generated JSON and Swagger UI. 3. Compare documented contracts with current routes, especially communication routes.
- **Expected:** Contract tests pass; active routes and auth/error schemas are represented accurately; known undocumented direct conversation handlers are recorded as a documentation gap.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-V04 — TypeScript and lint
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — `typecheck` and `lint` scripts are defined.
- **Role:** Developer.
- **Preconditions / data:** Dependencies installed and generated Prisma client current.
- **Steps:** 1. Run `npm run typecheck`. 2. Run `npm run lint`. 3. Record warnings separately from errors.
- **Expected:** Typecheck and lint finish successfully; any existing warnings are listed, not presented as clean pass if the command fails.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-V05 — Production build
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — build script exists; build result not verified in this document.
- **Role:** Developer.
- **Preconditions / data:** Valid build environment; Prisma client generation is available.
- **Steps:** 1. Run `npm run build`. 2. Review complete exit status and warnings. 3. Start built app with documented server entry.
- **Expected:** Production build succeeds and the custom server serves Next.js/Socket.IO as intended.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-V06 — CI workflow and migrations
- **Source / implementation:** TECHNICAL QUALITY / **IMPLEMENTED** — CI workflow provisions PostgreSQL and runs migration, quality, integration, and Playwright jobs.
- **Role:** Developer/CI operator.
- **Preconditions / data:** CI run on a branch/PR; do not trigger if prohibited by release controls.
- **Steps:** 1. Inspect the CI run and job logs. 2. Verify PostgreSQL health, migration deployment, unit/integration, typecheck, lint, build, and browser-test job statuses.
- **Expected:** All required CI jobs pass; failures point to the exact step; test DB is isolated.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-V07 — Playwright browser tests (run manually by project owner)
- **Source / implementation:** MANUAL DEMO / **NOT VERIFIED** — Playwright config/spec exist; intentionally not run by this task.
- **Role:** Project owner/QA.
- **Preconditions / data:** Owner-approved browser test environment and demo accounts.
- **Steps:** 1. Review existing Playwright suite. 2. Run it manually when authorized. 3. Record browser/version and results without editing tests/config as part of this plan.
- **Expected:** Browser tests complete in the owner's environment; no result is inferred from this document or CI configuration alone.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## W. Documentation and submission readiness

Evidence: [README](../README.md), [API docs](./api/v1.md), [database design](./04-database-design.md), [ERD](./diagrams/database-erd.md), [architecture](./architecture/overview.md), and [`.env.example`](../.env.example).

### ST-W01 — README and fresh setup instructions
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — README contains setup instructions; clean-clone execution and consistency need review.
- **Role:** New developer/evaluator.
- **Preconditions / data:** Fresh clone and clean test environment.
- **Steps:** 1. Follow README exactly. 2. Compare commands, runtime requirements, environment names, and server entry to current package/config. 3. Record every undocumented manual action.
- **Expected:** Another developer can install, configure, migrate an isolated DB, generate client, and run app without relying on private knowledge.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-W02 — Project description, features, architecture, and tech versions
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — documentation exists but contains stale statements.
- **Role:** Evaluator.
- **Preconditions / data:** Current source tree and docs.
- **Steps:** 1. Compare feature list and versions with `package.json` and current code. 2. Review architecture diagrams and deployment notes. 3. Log contradictions or outdated claims.
- **Expected:** Descriptions reflect implemented behavior and limitations; no unimplemented feature is claimed as complete.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-W03 — Database design, ERD, and migration history
- **Source / implementation:** SIMAD REQUIRED — provisional / **PARTIAL** — schema, ERD, and migration history exist; alignment needs review.
- **Role:** Developer/evaluator.
- **Preconditions / data:** Current Prisma schema and all migration SQL.
- **Steps:** 1. Compare ERD entities/relations to current schema. 2. Review append-only migration order on a disposable database. 3. Verify historical call migration is retained without active call models.
- **Expected:** Schema/ERD/migrations are consistent and reproducible; historical migrations are not rewritten or deleted; no database reset is used.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-W04 — API documentation and `.env.example`
- **Source / implementation:** TECHNICAL QUALITY / **PARTIAL** — API docs/environment example exist; at least one API guide appears stale and cron config completeness needs confirmation.
- **Role:** Developer/evaluator.
- **Preconditions / data:** Current routes, env validation, and deployment config.
- **Steps:** 1. Compare API docs to registry and direct route handlers. 2. Compare `.env.example` to config/runtime variables, including cron requirements. 3. Confirm examples contain no real secrets.
- **Expected:** Documentation matches current APIs/configuration and identifies optional/required values without exposing secrets.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-W05 — Demo accounts, sample data, screenshots, and limitations
- **Source / implementation:** SIMAD REQUIRED — provisional / **NOT VERIFIED** — demo credentials/data/screenshots are not established by repository inspection.
- **Role:** Project owner/evaluator.
- **Preconditions / data:** Release/demo environment.
- **Steps:** 1. Verify customer, approved vendor, and admin demo setup through approved provisioning. 2. Check sample catalog/orders. 3. Prepare redacted screenshots and known-limitations list.
- **Expected:** Demo can be repeated safely; no default/shared password or secret is published; simulated payments and unsupported capabilities are clearly labeled.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

### ST-W06 — Repository availability, history, and submission package
- **Source / implementation:** SIMAD REQUIRED — provisional / **NOT VERIFIED** — remote access and final submission criteria were not checked.
- **Role:** Project owner/evaluator.
- **Preconditions / data:** Authorized repository access; official submission checklist.
- **Steps:** 1. Confirm repository can be cloned by intended evaluators. 2. Review commit history for coherent implementation and absence of secrets. 3. Compare final package to the official submission rubric once provided.
- **Expected:** Evaluators can access source and reproducible docs; submission has no credentials; rubric-specific deliverables are accounted for.
- **Actual:** ___ | **Status:** [ ] Not tested | **Evidence:** ___ | **Notes/bug:** ___

## Critical gaps to resolve before the final demonstration

1. Obtain the official SIMAD iLab Somalia 10X Challenge Project 10 brief and map each clause to the test IDs. Until then, the official-requirement count is **not verifiable**.
2. Execute the last-unit concurrent reservation case with two independent customer sessions; source presence does not establish race safety or all-or-nothing reservation.
3. Verify reservation expiry and cleanup in the actual deployment, including the scheduled cron invocation and behavior after browser refresh/network loss.
4. Reconcile real database totals for multi-vendor order splitting, discount funding, refunds, commissions, payouts, and analytics.
5. Verify production email, reCAPTCHA, Amazon OAuth (if used), durable private media storage, and the custom Node/Socket.IO deployment. The README documents local filesystem media and deployment constraints.
6. Complete the requested viewport and bilingual sweeps. Earlier work touched only selected layouts/dictionaries; this repository inspection did not establish full-screen coverage.
7. Refresh stale API/database documentation. In particular, the authentication/API verification guide's claim that commerce API models are absent conflicts with the current Prisma schema and API registry. The API guide also says communication routes are not in generated OpenAPI, which should be confirmed against current route registration.
8. Confirm the historical call migration is present only for migration-history continuity and that no live calling UI/API/event remains. The current schema has no call model, but historical migration filenames must not be deleted or rewritten.
9. Run and record the actual non-Playwright quality commands and review Playwright results separately when the project owner chooses to run them. The existence of CI jobs does not mean they have passed.

## Execution log

| Date/time | Tester | Environment/build | Test IDs | Result summary | Evidence location / bug references |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

