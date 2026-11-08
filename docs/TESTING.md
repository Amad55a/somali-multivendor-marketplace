# Somsuuq Testing & Verification Guide

This document covers the automated test suite, verification tools, commands, and code coverage in Somsuuq.

---

## 1. Test Architecture & Frameworks

Somsuuq utilizes a multi-tiered testing strategy:
- **Unit & Contract Testing:** Powered by **Vitest 3** (`vitest` `^3.2.4`) for ultra-fast, isolated testing of business logic, cryptography, OpenAPI contract validation, financial calculations, and permissions.
- **Integration Testing:** Vitest integration runner (`vitest.integration.config.ts`) testing end-to-end API workflows with transaction isolation and mock email boxes.
- **End-to-End (E2E) Browser Testing:** Configured via **Playwright** (`@playwright/test` `^1.56.1`) for cross-browser testing of bilingual pages and user workflows.

---

## 2. Test Execution Commands

| Test Suite | Command | Execution Scope |
|---|---|---|
| **Unit Test Suite** | `npm run test` | Executes all 20 unit test suites (125 tests total). |
| **Specific Unit Test** | `npx vitest run tests/unit/openapi.test.ts` | Runs an individual test file. |
| **Watch Mode** | `npm run test:watch` | Vitest interactive file watcher. |
| **Integration Suite** | `npm run test:integration` | Runs `tests/integration/backend.integration.test.ts`. |
| **Type Check** | `npm run typecheck` | Strict `tsc --noEmit` validation across entire codebase. |
| **Linting** | `npm run lint` | ESLint check for TypeScript and React conventions. |
| **Prisma Validation** | `npx prisma validate` | Validates schema integrity against Prisma rules. |

---

## 3. Verified Unit Test Suite Inventory

The following 20 unit test suites pass with 100% success (125 tests passed):

1. `tests/unit/openapi.test.ts` (4 tests) – Verifies OpenAPI 3.0.3 contract, route parameters, tags, and absence of secret leakage.
2. `tests/unit/auth-foundation.test.ts` (13 tests) – Password hashing (Argon2id), session tokens, PKCE cookies, Amazon OAuth state validation.
3. `tests/unit/financial-calculations.test.ts` (12 tests) – Line commissions, vendor payouts, double-entry ledger balance calculations.
4. `tests/unit/financial-service.test.ts` (11 tests) – Payout batch creation, approval, cancellation, and balance hold thresholds.
5. `tests/unit/commerce-returns.test.ts` (17 tests) – 7-day return eligibility, dispute escalation, and restock logic.
6. `tests/unit/support.test.ts` (19 tests) – Support ticket creation, attachments, permission boundaries, and internal notes.
7. `tests/unit/support-email.test.ts` (3 tests) – Transactional support email dispatch and error recovery.
8. `tests/unit/support-ai.test.ts` (4 tests) – Abuur AI integration and graceful degradation.
9. `tests/unit/support-ai-env.test.ts` (2 tests) – AI environment variable schema parsing.
10. `tests/unit/mobile-money-adapters.test.ts` (6 tests) – EVC Plus, Zaad, and eDahab simulation adapter rules.
11. `tests/unit/inventory-reservations.test.ts` (3 tests) – 10-minute stock lock, release, and expiry mechanisms.
12. `tests/unit/marketplace-operations.test.ts` (5 tests) – Cart operations, vendor sub-order grouping.
13. `tests/unit/product-catalog.test.ts` (2 tests) – Category inheritance and product filtering.
14. `tests/unit/variant-options.test.ts` (4 tests) – Variant generation, SKU assignment, pricing logic.
15. `tests/unit/vendor-storefront.test.ts` (2 tests) – Public vendor storefront queries.
16. `tests/unit/vendor-files.test.ts` (2 tests) – File upload security, size boundaries, and MIME verification.
17. `tests/unit/admin-user-anonymization.test.ts` (2 tests) – GDPR account anonymization while preserving order ledger history.
18. `tests/unit/api-responses.test.ts` (8 tests) – Standard API success and error envelopes.
19. `tests/unit/communication-location.test.ts` (2 tests) – Buyer-vendor chat location data and presence.
20. `tests/unit/i18n.test.ts` (4 tests) – Bilingual dictionary parity between English (`en`) and Somali (`so`).

---

## 4. Integration & E2E Testing Notes

- **Integration Testing (`npm run test:integration`):**  
  Uses an isolated transactional test runner against a configured test database to simulate full user journeys (registration -> vendor onboarding -> product publish -> cart -> simulated checkout).
- **E2E Testing (`npm run test:e2e`):**  
  Playwright tests in `tests/e2e/homepage.spec.ts` verify bilingual rendering, language toggles, and metadata persistence.
  *(Note: Do not run Playwright in automated non-GUI CI pipelines without an active local server).*
