# API Error Handling & Status Codes

Somsuuq enforces consistent error envelopes across all endpoints. Errors are designed to provide clear, actionable feedback for clients while strictly preventing the exposure of stack traces, database schema specifics, or cryptographic secrets.

---

## 1. Standard Error Envelope

All HTTP 4xx and 5xx responses conform to the following schema:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "A clear, user-safe description of the failure.",
    "details": [
      {
        "path": "field.name",
        "code": "zod_issue_code",
        "message": "Specific field validation message"
      }
    ]
  }
}
```

The `details` array is included primarily on `400 VALIDATION_ERROR` responses to indicate exact validation failures.

---

## 2. HTTP Status Code Catalog

| HTTP Status | Standard Error Code | Description / Typical Scenarios |
|---|---|---|
| **400** | `VALIDATION_ERROR` | Request body or query parameter failed Zod schema parsing; missing required fields; invalid format. |
| **400** | `INVALID_IDEMPOTENCY_KEY` | Missing or malformed `Idempotency-Key` on financial, ticket, or chat requests. |
| **401** | `UNAUTHENTICATED` | Missing, expired, or invalid session cookie; expired admin login challenge. |
| **401** | `EMAIL_VERIFICATION_SESSION_REQUIRED` | Attempting to verify or resend email OTP without the required signed cookie. |
| **403** | `FORBIDDEN` | The authenticated user does not have permission for the requested action (e.g., Customer accessing Vendor route). |
| **403** | `EMAIL_NOT_VERIFIED` | Account has not completed initial email OTP verification. |
| **403** | `RECAPTCHA_FAILED` | Bot protection score fell below `RECAPTCHA_MIN_SCORE` or token verification was rejected. |
| **403** | `CSRF_VIOLATION` | Mutating request originated from an untrusted origin or lacked required headers. |
| **404** | `NOT_FOUND` | The requested route, product, category, order, or ticket does not exist. |
| **405** | `METHOD_NOT_ALLOWED` | The HTTP method (e.g., PUT) is not supported on this endpoint. |
| **409** | `CONFLICT` | Concurrent state conflict, such as duplicate coupon code, duplicate review, or email collision. |
| **409** | `INVALID_APPLICATION_TRANSITION` | Attempting an invalid vendor onboarding or return workflow state change. |
| **409** | `OUT_OF_STOCK` | Stock insufficient to satisfy 10-minute cart reservation request. |
| **413** | `PAYLOAD_TOO_LARGE` | Uploaded image or document exceeds size limits (5 MB for photos, 10 MB for documents). |
| **415** | `UNSUPPORTED_MEDIA_TYPE` | Uploaded file MIME type or magic bytes signature does not match allowed types. |
| **429** | `RATE_LIMITED` | Endpoint-specific sliding window rate limit exceeded (e.g., 5 ticket creations per hour). |
| **500** | `INTERNAL_SERVER_ERROR` | Unhandled server exception. Raw internal stack traces are redacted. |
| **503** | `SERVICE_UNAVAILABLE` | External integration unavailable (e.g., unconfigured SMTP mailer, Amazon OAuth unavailable). |

---

## 3. Common Error Examples

### A. Validation Error (400)
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload.",
    "details": [
      {
        "path": "price",
        "code": "too_small",
        "message": "Price must be greater than zero."
      },
      {
        "path": "sku",
        "code": "invalid_string",
        "message": "SKU may only contain alphanumeric characters and hyphens."
      }
    ]
  }
}
```

### B. Unauthenticated (401)
```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Authentication required. Please sign in to continue."
  }
}
```

### C. Forbidden Role Boundary (403)
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "This action requires an approved VENDOR account."
  }
}
```

### D. Inventory Lock Conflict (409)
```json
{
  "error": {
    "code": "OUT_OF_STOCK",
    "message": "Insufficient stock available for variant 'VAR-7782-MED'. Only 2 items remain."
  }
}
```

### E. Rate Limited (429)
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please wait a few moments before trying again."
  }
}
```
