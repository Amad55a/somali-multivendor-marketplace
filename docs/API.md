# Somsuuq API Quick Reference

This document provides a fast lookup guide for developers integrating with the Somsuuq API. For detailed route documentation, see [`docs/api/README.md`](./api/README.md) and [`docs/api/v1.md`](./api/v1.md).

---

## Interactive Documentation

- **Swagger UI:** [`http://localhost:3000/api-docs`](http://localhost:3000/api-docs)
- **OpenAPI 3.0.3 Spec:** [`http://localhost:3000/api/openapi.json`](http://localhost:3000/api/openapi.json)

---

## Top API Routes Summary

### 1. Authentication (`/api/v1/auth/`)
- `POST /api/v1/auth/customer/register`: Register a customer (sends email OTP).
- `POST /api/v1/auth/vendor/register`: Register a vendor (sends email OTP).
- `POST /api/v1/auth/login`: Sign in with email/password (returns session cookie).
- `POST /api/v1/auth/logout`: Revoke session and clear cookies.
- `GET /api/v1/auth/me`: Get authenticated user profile.
- `POST /api/v1/auth/email/verify`: Verify 6-digit email OTP.
- `POST /api/v1/auth/amazon`: Initiate Amazon Login with Amazon OAuth.

### 2. Marketplace & Products (`/api/v1/`)
- `GET /api/v1/categories`: List active categories with bilingual names.
- `GET /api/v1/products`: Search and filter published products.
- `GET /api/v1/products/{id}`: Detailed product info, variants, and verified reviews.
- `GET /api/v1/products/images/{id}`: Fetch product image asset.

### 3. Shopping Cart & Checkout (`/api/v1/`)
- `GET /api/v1/cart`: View customer or guest shopping cart.
- `POST /api/v1/cart/items`: Add variant to cart.
- `POST /api/v1/checkout/reserve`: Create 10-minute stock reservation.
- `POST /api/v1/checkout/quote`: Compute order subtotal and apply coupons.
- `POST /api/v1/checkout/pay`: Execute simulated mobile money payment (EVC Plus, Zaad, eDahab).
- `POST /api/v1/checkout/cancel`: Cancel checkout and release reserved stock.

### 4. Vendor Storefront (`/api/v1/vendor/`)
- `GET /api/v1/vendor/products`: List vendor's products.
- `POST /api/v1/vendor/products`: Create new product.
- `GET /api/v1/vendor/orders`: List sub-orders assigned to this vendor.
- `POST /api/v1/vendor/orders/{id}/status`: Advance sub-order status (Confirmed, Processing, Shipped, Delivered).
- `GET /api/v1/vendor/payouts`: View earnings, commission deductions, and ledger entries.

### 5. Support Ticketing (`/api/v1/support/`)
- `GET /api/v1/support/tickets`: List requester's support tickets.
- `POST /api/v1/support/tickets`: Create new ticket (Rate limited: 5/hr; requires `Idempotency-Key`).
- `POST /api/v1/support/tickets/{id}/messages`: Add message to ticket conversation.
- `POST /api/v1/support/ai`: Ask optional Abuur AI customer assistant.

### 6. Administration (`/api/v1/admin/`)
- `GET /api/v1/admin/overview`: Platform GMV, orders, active users metrics.
- `GET /api/v1/admin/vendors/applications`: Review pending merchant onboarding applications.
- `POST /api/v1/admin/vendors/applications/{id}/approve`: Approve merchant store.
- `GET /api/v1/admin/financial-reconciliation`: Verify ledger consistency.
- `POST /api/v1/admin/payouts/batches`: Generate weekly vendor payout batch.
