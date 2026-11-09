# Somsuuq Complete API Reference

This document lists the REST endpoints implemented in the current codebase, based on the actual route registry in `src/lib/api/v1.ts`, the dynamic API dispatcher at `src/app/api/v1/[...segments]/route.ts`, and the supporting services under `src/features/*`.

The reference intentionally documents only implemented endpoints. Endpoints not registered in the active API router are omitted.

## 1. API conventions

- Base path: `/api/v1`
- Authentication mechanism: secure HttpOnly session cookies (`marketplace_session` or `__Host-marketplace_session`)
- Success responses: JSON envelopes with `data` or `result` payloads, depending on route
- Error responses: standardized `error` envelope with `code`, `message`, and optional validation `details`
- Cross-site protection: same-origin checks are enforced on state-changing requests
- Public routes: auth, registration, Amazon OAuth, and some support/public catalog endpoints

## 2. Authentication

### `POST /api/v1/auth/customer/register`
- Purpose: register a customer account
- Auth: none
- Roles: public
- Validation: email, password, reCAPTCHA token
- Notes: sends a temporary verification cookie and requires email confirmation before full activation

### `POST /api/v1/auth/vendor/register`
- Purpose: register a vendor account
- Auth: none
- Roles: public
- Validation: email, password, reCAPTCHA token

### `POST /api/v1/auth/login`
- Purpose: sign in a customer or vendor
- Auth: none
- Roles: public, `CUSTOMER` or `VENDOR`
- Validation: email, password, account type, reCAPTCHA token
- Response: sets session cookie and returns user payload

### `POST /api/v1/auth/logout`
- Purpose: revoke current session and clear cookies
- Auth: required
- Roles: any authenticated user

### `GET /api/v1/auth/me`
- Purpose: fetch current authenticated user details
- Auth: required
- Roles: `CUSTOMER`, `VENDOR`, `ADMIN`
- Response includes session context and vendor status when applicable

### `POST /api/v1/auth/email/request-verification`
- Purpose: send a verification email for a new account
- Auth: none or pending session context

### `POST /api/v1/auth/email/verify`
- Purpose: verify email with a code
- Auth: none; uses verification cookie or token context

### `POST /api/v1/auth/password/request-reset`
- Purpose: request password reset email

### `POST /api/v1/auth/password/reset`
- Purpose: complete password reset with a one-time code

### `POST /api/v1/auth/amazon`
- Purpose: initiate Amazon OAuth login
- Auth: public
- Request content: JSON with `accountType` and optionally locale; also supports `application/x-www-form-urlencoded`

### `GET /api/v1/auth/amazon/callback`
- Purpose: complete Amazon OAuth exchange and redirect back to app
- Auth: public
- Handles PKCE and state validation with callback cookie
- Response: 303 redirect on success or error

### `POST /api/v1/admin/auth/login`
- Purpose: admin login without the standard customer/vendor flow
- Auth: public
- Roles: admin-only login endpoint

### `POST /api/v1/admin/auth/mfa/setup`
- Purpose: enable MFA for admins
- Auth: required
- Roles: admin

### `POST /api/v1/admin/auth/mfa/verify`
- Purpose: verify the TOTP code and complete MFA setup
- Auth: required
- Roles: admin

## 3. Customer

### `GET /api/v1/customer/profile`
- Purpose: read authenticated customer profile
- Auth: required
- Roles: `CUSTOMER`

### `PATCH /api/v1/customer/profile`
- Purpose: update profile details
- Auth: required
- Roles: `CUSTOMER`

### `GET /api/v1/customer/notifications`
- Purpose: list customer notifications
- Auth: required
- Roles: `CUSTOMER`

### `POST /api/v1/customer/notifications/read`
- Purpose: mark notifications read
- Auth: required
- Roles: `CUSTOMER`

### `GET /api/v1/customer/orders`
- Purpose: list customer orders
- Auth: required
- Roles: `CUSTOMER`

### `GET /api/v1/customer/orders/{orderId}`
- Purpose: fetch a specific order
- Auth: required
- Roles: `CUSTOMER`

### `GET /api/v1/customer/returns`
- Purpose: list customer returns
- Auth: required
- Roles: `CUSTOMER`

### `GET /api/v1/customer/payment-history`
- Purpose: retrieve simulated payment history and receipts
- Auth: required
- Roles: `CUSTOMER`

## 4. Vendor onboarding

### `GET /api/v1/vendor/onboarding`
- Purpose: load vendor onboarding draft and status
- Auth: required
- Roles: `VENDOR`

### `PATCH /api/v1/vendor/onboarding`
- Purpose: update onboarding draft
- Auth: required
- Roles: `VENDOR`

### `POST /api/v1/vendor/onboarding/submit`
- Purpose: submit the vendor application
- Auth: required
- Roles: `VENDOR`

### `POST /api/v1/vendor/onboarding/files`
- Purpose: upload onboarding files
- Auth: required
- Roles: `VENDOR`

### `DELETE /api/v1/vendor/onboarding/files/{fileId}`
- Purpose: remove a file upload
- Auth: required
- Roles: `VENDOR`

## 5. Vendor profile

### `GET /api/v1/vendor/profile`
- Purpose: fetch vendor profile
- Auth: required
- Roles: `VENDOR`

### `PATCH /api/v1/vendor/profile`
- Purpose: update vendor profile data
- Auth: required
- Roles: `VENDOR`

### `GET /api/v1/vendor/profile-change/{changeId}`
- Purpose: inspect profile change review status
- Auth: required
- Roles: `VENDOR`, `ADMIN`

### `POST /api/v1/vendor/profile-change/submit`
- Purpose: submit profile update for review
- Auth: required
- Roles: `VENDOR`

## 6. Products

### `GET /api/v1/products`
- Purpose: list public products with filters, sorting, and pagination
- Auth: optional or public
- Roles: all users

### `GET /api/v1/products/{productId}`
- Purpose: fetch a public product view
- Auth: public
- Roles: all users

### `GET /api/v1/products/{productId}/images/{imageId}`
- Purpose: retrieve a product image
- Auth: public or authenticated depending on access patterns

### `GET /api/v1/vendor/products`
- Purpose: list authenticated vendor's products
- Auth: required
- Roles: `VENDOR`

### `POST /api/v1/vendor/products`
- Purpose: create a product
- Auth: required
- Roles: `VENDOR`

### `GET /api/v1/vendor/products/{productId}`
- Purpose: fetch a single vendor-owned product
- Auth: required
- Roles: `VENDOR`

### `PATCH /api/v1/vendor/products/{productId}`
- Purpose: update product details
- Auth: required
- Roles: `VENDOR`

### `POST /api/v1/vendor/products/{productId}/publish`
### `POST /api/v1/vendor/products/{productId}/archive`
### `POST /api/v1/vendor/products/{productId}/images`
### `DELETE /api/v1/vendor/products/{productId}/images/{imageId}`

## 7. Categories

### `GET /api/v1/categories`
- Purpose: list categories and subcategories
- Auth: public

### `POST /api/v1/admin/categories`
- Purpose: create a category
- Auth: required
- Roles: `ADMIN`

### `PATCH /api/v1/admin/categories/{categoryId}`
- Purpose: update a category
- Auth: required
- Roles: `ADMIN`

## 8. Inventory

### `PATCH /api/v1/vendor/stock`
- Purpose: update stock quantity for a product variant
- Auth: required
- Roles: `VENDOR`

### `POST /api/v1/cron/marketplace`
- Purpose: scheduled marketplace job to expire or release stale reservations
- Auth: protected internal or admin-run job endpoint
- Roles: system/admin

## 9. Shopping cart

### `GET /api/v1/cart`
- Purpose: retrieve current cart
- Auth: required for customer session; guest cart support is also present

### `POST /api/v1/cart/items`
- Purpose: add an item to cart
- Auth: required

### `PATCH /api/v1/cart/items/{itemId}`
- Purpose: update item quantity
- Auth: required

### `DELETE /api/v1/cart/items/{itemId}`
- Purpose: remove an item
- Auth: required

### `DELETE /api/v1/cart`
- Purpose: clear cart
- Auth: required

## 10. Checkout

### `POST /api/v1/checkout/reservations/quote`
- Purpose: quote a checkout reservation including coupons and delivery fees
- Auth: required
- Roles: `CUSTOMER`

### `POST /api/v1/checkout/reservations`
- Purpose: create a checkout reservation
- Auth: required
- Roles: `CUSTOMER`

### `POST /api/v1/checkout/reservations/{reservationId}/cancel`
- Purpose: cancel an active reservation
- Auth: required
- Roles: `CUSTOMER`

### `POST /api/v1/checkout/payments`
- Purpose: simulate a mobile-money payment for a reservation
- Auth: required
- Roles: `CUSTOMER`

### `POST /api/v1/checkout/payments/cancel`
- Purpose: cancel or reverse a simulated payment flow
- Auth: required
- Roles: `CUSTOMER`

## 11. Orders

### `GET /api/v1/orders`
- Purpose: list customer orders
- Auth: required
- Roles: `CUSTOMER`

### `GET /api/v1/orders/{orderId}`
- Purpose: get a single order
- Auth: required
- Roles: `CUSTOMER`

### `GET /api/v1/vendor/orders`
- Purpose: list vendor orders
- Auth: required
- Roles: `VENDOR`

### `PATCH /api/v1/vendor/orders/{orderId}`
- Purpose: update order status
- Auth: required
- Roles: `VENDOR`

## 12. Payments

### `GET /api/v1/customer/payments/receipts/{receiptId}`
- Purpose: fetch a payment receipt
- Auth: required
- Roles: `CUSTOMER`

### `GET /api/v1/admin/payments/receipts/{receiptId}`
- Purpose: fetch a payment receipt for admin inspection
- Auth: required
- Roles: `ADMIN`

## 13. Reviews

### `POST /api/v1/reviews`
- Purpose: create product review
- Auth: required
- Roles: `CUSTOMER`

### `GET /api/v1/admin/reviews`
- Purpose: list reviews for moderation
- Auth: required
- Roles: `ADMIN`

### `PATCH /api/v1/admin/reviews/{reviewId}/hide`
- Purpose: hide a review
- Auth: required
- Roles: `ADMIN`

### `PATCH /api/v1/admin/reviews/{reviewId}/restore`
- Purpose: restore a review
- Auth: required
- Roles: `ADMIN`

## 14. Coupons

### `GET /api/v1/admin/coupons`
- Purpose: list platform coupons
- Auth: required
- Roles: `ADMIN`

### `GET /api/v1/vendor/coupons`
- Purpose: list vendor coupons
- Auth: required
- Roles: `VENDOR`

### `POST /api/v1/admin/coupons`
### `PATCH /api/v1/admin/coupons/{couponId}`
- Purpose: create or update coupons and discount rules
- Auth: required
- Roles: `ADMIN` or `VENDOR` depending on scope

## 15. Returns and refunds

### `POST /api/v1/returns`
- Purpose: request a return or refund
- Auth: required
- Roles: `CUSTOMER`

### `GET /api/v1/returns`
- Purpose: list customer or vendor returns
- Auth: required
- Roles: `CUSTOMER`, `VENDOR`, `ADMIN`

### `PATCH /api/v1/vendor/returns/{returnId}`
- Purpose: review/approve a return request
- Auth: required
- Roles: `VENDOR`

### `PATCH /api/v1/admin/returns/{returnId}`
- Purpose: approve or reject a return in moderation
- Auth: required
- Roles: `ADMIN`

## 16. Commissions

### `GET /api/v1/admin/commission-settings`
- Purpose: read platform commission configuration
- Auth: required
- Roles: `ADMIN`

### `PATCH /api/v1/admin/commission-settings/default`
- Purpose: update the default commission percent
- Auth: required
- Roles: `ADMIN`

### `PATCH /api/v1/admin/commission-settings/categories/{categoryId}`
- Purpose: update category commission rules
- Auth: required
- Roles: `ADMIN`

## 17. Financial ledger

### `GET /api/v1/admin/ledger`
- Purpose: view financial ledger and reconciliation entries
- Auth: required
- Roles: `ADMIN`

### `GET /api/v1/vendor/financial-statement`
- Purpose: view vendor financial statement and summary
- Auth: required
- Roles: `VENDOR`

## 18. Payouts

### `GET /api/v1/admin/payouts`
- Purpose: list payout batches and payout records
- Auth: required
- Roles: `ADMIN`

### `POST /api/v1/admin/payouts/preview`
- Purpose: preview payout balances before approval
- Auth: required
- Roles: `ADMIN`

### `POST /api/v1/admin/payouts/batches`
- Purpose: create a weekly payout batch
- Auth: required
- Roles: `ADMIN`

### `POST /api/v1/admin/payouts/batches/{batchId}/approve`
### `POST /api/v1/admin/payouts/batches/{batchId}/cancel`
### `POST /api/v1/admin/payouts/batches/{batchId}/retry`
- Purpose: approve, cancel, or retry payouts
- Auth: required
- Roles: `ADMIN`

## 19. Notifications

### `GET /api/v1/admin/notifications`
- Purpose: admin notification list
- Auth: required
- Roles: `ADMIN`

### `POST /api/v1/admin/notifications/read`
- Purpose: mark admin notifications as read
- Auth: required
- Roles: `ADMIN`

### `GET /api/v1/customer/notifications`
### `POST /api/v1/customer/notifications/read`

### `GET /api/v1/vendor/notifications`
### `POST /api/v1/vendor/notifications/read`

## 20. Support

### `GET /api/v1/support/tickets`
- Purpose: list support tickets for the current user or admin
- Auth: required
- Roles: `CUSTOMER`, `VENDOR`, `ADMIN`

### `POST /api/v1/support/tickets`
- Purpose: create a new support ticket
- Auth: required
- Roles: `CUSTOMER`, `VENDOR`

### `GET /api/v1/support/tickets/{ticketId}`
- Purpose: fetch a ticket and its activity
- Auth: required
- Roles: `CUSTOMER`, `VENDOR`, `ADMIN`

### `POST /api/v1/support/tickets/{ticketId}/messages`
- Purpose: add a ticket message
- Auth: required
- Roles: `CUSTOMER`, `VENDOR`, `ADMIN`

### `GET /api/v1/support/availability`
- Purpose: check whether the support channel is available
- Auth: required
- Roles: `CUSTOMER`, `VENDOR`

### `GET /api/v1/admin/support/tickets`
### `PATCH /api/v1/admin/support/tickets/{ticketId}`
### `POST /api/v1/admin/support/tickets/{ticketId}/email-deliveries/{deliveryId}/retry`
- Purpose: support triage and email delivery retry workflows
- Auth: required
- Roles: `ADMIN`

## 21. Conversations and messaging

### `GET /api/v1/conversations`
- Purpose: list customer-vendor conversations
- Auth: required
- Roles: `CUSTOMER`, `VENDOR`

### `POST /api/v1/conversations`
- Purpose: create a conversation
- Auth: required
- Roles: `CUSTOMER`, `VENDOR`

### `GET /api/v1/conversations/{conversationId}`
### `GET /api/v1/conversations/{conversationId}/messages`
### `POST /api/v1/conversations/{conversationId}/messages`
### `POST /api/v1/conversations/{conversationId}/block`
### `GET /api/v1/conversations/{conversationId}/presence`
### `GET /api/v1/conversations/{conversationId}/products`
### `GET /api/v1/conversations/{conversationId}/orders`
### `POST /api/v1/conversations/{conversationId}/images`
### `DELETE /api/v1/conversations/{conversationId}/attachments/{attachmentId}`

These endpoints support the messaging layer used by the Socket.IO integration and conversation workspace.

## 22. Communication moderation

### `GET /api/v1/admin/communication-reports`
- Purpose: list moderation reports
- Auth: required
- Roles: `ADMIN`

### `POST /api/v1/admin/communication-reports/{reportId}/review`
- Purpose: review a communication report
- Auth: required
- Roles: `ADMIN`

## 23. Administration

### `GET /api/v1/admin/overview`
- Purpose: display admin dashboard metrics
- Auth: required
- Roles: `ADMIN`

### `GET /api/v1/admin/users`
- Purpose: list users for admin management
- Auth: required
- Roles: `ADMIN`

### `GET /api/v1/admin/audit-logs`
- Purpose: read system audit log activity
- Auth: required
- Roles: `ADMIN`

### `GET /api/v1/admin/vendors/applications`
- Purpose: list vendor applications
- Auth: required
- Roles: `ADMIN`

### `GET /api/v1/admin/vendors/applications/{applicationId}`
### `POST /api/v1/admin/vendors/applications/{applicationId}/approve`
### `POST /api/v1/admin/vendors/applications/{applicationId}/reject`
### `POST /api/v1/admin/vendors/applications/{applicationId}/request-information`
- Purpose: review onboarding applications and action them
- Auth: required
- Roles: `ADMIN`

### `POST /api/v1/admin/vendors/{vendorId}/suspend`
- Purpose: suspend a vendor account
- Auth: required
- Roles: `ADMIN`

## 24. System and scheduled jobs

### `GET /api/openapi.json`
- Purpose: generate the OpenAPI JSON specification
- Auth: public

### `POST /api/cron/marketplace`
- Purpose: scheduled cleanup for expirations and stale reservations
- Auth: internal/system style job endpoint

## 25. Important omissions and boundaries

This API reference intentionally does not list endpoints that are not implemented or not registered in the current server. The project currently documents routes via OpenAPI generation, not by manual static route files only.

If a route is absent from `src/lib/api/v1.ts`, it is considered absent from the implemented API contract for this reference.
