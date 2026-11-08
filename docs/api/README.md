# Somsuuq REST API Documentation

Welcome to the Somsuuq API developer guide. Somsuuq provides a high-performance RESTful API powering customer shopping, vendor store management, administrator moderation, dispute handling, and double-entry financial settlement.

---

## Interactive Endpoints & Specification

- **Interactive Swagger UI:** [`/api-docs`](http://localhost:3000/api-docs)  
  *Features automatic reCAPTCHA v3 token generation and same-origin session credentials.*
- **OpenAPI 3.0.3 JSON Specification:** [`/api/openapi.json`](http://localhost:3000/api/openapi.json)
- **Central API Dispatcher:** [`src/lib/api/v1.ts`](../../src/lib/api/v1.ts)  
  *Contains 137 executable route registrations with strict Zod request/response contracts.*

---

## Detailed API Sub-Guides

| Guide | Description |
|---|---|
| [`docs/api/openapi.md`](./openapi.md) | How the OpenAPI specification is dynamically compiled, schema validation, and Swagger UI usage |
| [`docs/api/authentication.md`](./authentication.md) | HttpOnly cookies, CSRF protection, OTP verification, Amazon OAuth, and Admin MFA |
| [`docs/api/errors.md`](./errors.md) | Standardized error envelopes, HTTP status codes, validation issues, and domain error codes |
| [`docs/api/financial-endpoints.md`](./financial-endpoints.md) | Commissions, payouts, ledger queries, simulated payment receipts, and reconciliation |
| [`docs/api/support-endpoints.md`](./support-endpoints.md) | Support ticket creation, attachments, admin triage, and optional Abuur AI integration |
| [`docs/api/v1.md`](./v1.md) | Complete reference list of implemented version 1 REST routes |

---

## Core API Design Conventions

1. **Base Path:** All version 1 routes are prefixed with `/api/v1`.
2. **Response Envelopes:**
   - **Success (200, 201, 202):**
     ```json
     {
       "data": { ... }
     }
     ```
   - **Error (4xx, 5xx):**
     ```json
     {
       "error": {
         "code": "ERROR_CODE",
         "message": "Human-readable explanation.",
         "details": [
           { "path": "field.name", "code": "validation_rule" }
         ]
       }
     }
     ```
3. **Session Authentication:** Authenticated endpoints read credentials from secure HttpOnly cookies (`marketplace_session` or production `__Host-marketplace_session`). Bearer tokens are never returned in JSON or browser-accessible storage.
4. **Mutating Request Protection:** All POST, PATCH, and DELETE requests enforce same-origin verification (`Sec-Fetch-Site` or matching `Origin`/`Host`).
5. **Rate Limiting:** Public auth endpoints, OTP verification, checkout, and file uploads apply in-memory sliding window rate limits.
