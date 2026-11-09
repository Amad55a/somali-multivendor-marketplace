# Somsuuq Database Reference

This reference is derived from the current Prisma schema in `prisma/schema.prisma` and the live application logic in `src/features/*` and `src/lib/api/v1.ts`. It documents the schema that actually powers the Somali multi-vendor marketplace.

## 1. Database overview

- Database engine: PostgreSQL
- ORM: Prisma 7
- Primary runtime: Next.js App Router + TypeScript
- Core database concerns:
  - identity and session management
  - vendor onboarding and profile lifecycle
  - catalog and inventory management
  - shopping cart and reservation flows
  - multi-vendor checkout and order splitting
  - payment simulation, ledger accounting, and payout reconciliation
  - support tickets, conversations, and moderation

## 2. Core design principles

1. Role-bound identity: `users` uses `(id, accountType)` as a compound key to prevent account-type spoofing.
2. Explicit marketplace accounting: `LedgerEntry`, `VendorPayout`, and `PayoutBatch` model financial movement independently of order status.
3. Inventory reservation workflow: `StockReservation` keeps stock claims short-lived and expires them through scheduled jobs.
4. Vendor splitting: `MarketplaceOrder` is the customer-level order while `VendorOrder` isolates each vendor's portion.
5. Verification and traceability: MFA, session hashes, email verification codes, and audit logs are separate models with retention-friendly indexes.

## 3. Enumerations

The schema defines 32 enums. The most important values are:

- `AccountType`: `CUSTOMER`, `VENDOR`, `ADMIN`
- `AuthProvider`: `LOCAL`, `AMAZON`
- `VendorApplicationStatus`: `DRAFT`, `PENDING`, `UNDER_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `REJECTED`, `SUSPENDED`
- `ProductStatus`: `DRAFT`, `PUBLISHED`, `ARCHIVED`
- `MarketplaceOrderStatus`: `PENDING_PAYMENT`, `PAID`, `CANCELLED`, `FULFILLING`, `COMPLETED`
- `VendorOrderStatus`: `NEW`, `CONFIRMED`, `PROCESSING`, `PACKED`, `READY`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `EXPIRED`
- `StockReservationStatus`: `ACTIVE`, `CONVERTED`, `EXPIRED`, `RELEASED`
- `LedgerEntryType`: `SALE`, `COMMISSION`, `VENDOR_DISCOUNT`, `PLATFORM_DISCOUNT`, `DELIVERY_FEE`, `REFUND`, `REFUND_ADJUSTMENT`, `PAYOUT`, `ADJUSTMENT`
- `PayoutStatus`: `PENDING`, `APPROVED`, `PROCESSING`, `SIMULATED_PAID`, `FAILED`, `CANCELLED`
- `SupportTicketStatus`: `OPEN`, `IN_PROGRESS`, `WAITING_FOR_CUSTOMER`, `WAITING_FOR_VENDOR`, `RESOLVED`, `CLOSED`
- `CommunicationReportStatus`: `OPEN`, `INVESTIGATING`, `DISMISSED`, `ACTIONED`

## 4. Key models by domain

### 4.1 Identity and authentication

#### `User`
Purpose: central actor table for customer, vendor, and admin accounts.

Key fields:
- `id` UUID primary key
- `email`, `normalizedEmail`
- `accountType`
- `emailVerifiedAt`
- `displayName`, `profileImageKey`
- `isActive`

Relationships:
- One-to-many with `UserAuthAccount`, `UserSession`, `EmailVerificationCode`, `AuditLog`
- Optional one-to-one with `VendorProfile`, `AdminMfaMethod`
- One-to-many with products, orders, notifications, coupons, tickets, and conversation records

Unique constraints / indexes:
- `@@unique([id, accountType])`
- `@@unique([accountType, normalizedEmail])`
- indexes on `email`, `accountType + isActive`

#### `UserAuthAccount`
Purpose: authentication backends such as local login or Amazon OAuth.

Key fields:
- `userId`, `accountType`
- `provider`
- `providerAccountId`
- `passwordHash`

Important rule: references `User(id, accountType)` and deletes with cascade.

#### `UserSession`
Purpose: tracks active browser sessions and refresh tokens.

Key fields:
- `sessionTokenHash` unique
- `refreshTokenHash` unique
- `expiresAt`, `refreshExpiresAt`, `revokedAt`

#### `AdminMfaMethod` and `AdminRecoveryCode`
Purpose: admin-specific TOTP and recovery code storage. These use encrypted secret material and are removed on delete.

### 4.2 Vendor onboarding and profile management

#### `VendorProfile`
Purpose: vendor profile and onboarding state.

Key fields:
- `userId` unique
- `applicationStatus`, `verificationStatus`
- `businessName`, `storeName`, `businessType`, `description`
- `contactName`, `phone`, `country`, `region`, `city`, `district`, `address`
- `mobileMoneyNumber`, `deliveryFee`
- `reviewedById`, `rejectionReason`, `informationRequest`

Important business rules:
- A vendor profile is tied to a single `User`.
- The profile can be amended through `VendorProfileChangeRequest`.
- Approval/rejection and review actions are audited via related records.

#### `VendorApplicationFile`
Purpose: supports license and logo document uploads.

Field notes:
- `storageKey` is unique.
- file types are limited to `STORE_LOGO` and `BUSINESS_LICENSE`.

#### `VendorProfileChangeRequest`
Purpose: record profile modifications submitted for review.

Purposeful fields:
- `status`
- `proposed` JSON payload
- `currentSnapshot` JSON payload
- `adminNote` and `vendorNote`

### 4.3 Product catalog and variant model

#### `Category`
Purpose: hierarchical catalog taxonomy.

Important fields:
- `parentId` for nested categories
- `name`, `slug`, `imageKey`, `isActive`

Relationship: self-referential parent/children tree.

#### `Product`
Purpose: vendor listing.

Key fields:
- `vendorId` (owner)
- `categoryId`
- `title`, `slug`, `description`, `status`, `condition`
- `basePrice`, `currency`, `isFeatured`

Rules:
- one vendor owns each product
- category assignment influences catalog browsing and commissions
- status controls visibility and ordering

#### `ProductVariant`
Purpose: SKU-level variant dimension such as size, color, or pack size.

Key fields:
- `productId`
- `name`, `sku`, `stockQuantity`, `priceOverride`, `isActive`

#### `ProductImage`
Purpose: gallery storage and image metadata.

Cascading behavior: product images are linked to product ownership and deleted when product owner or product is removed.

### 4.4 Cart, inventory, and reservations

#### `ShoppingCart`
Purpose: customer shopping cart.

Related items:
- `ShoppingCartItem`

Important fields:
- `userId` or guest-based cart record; cart contents map to variant IDs and quantities.

#### `StockReservation`
Purpose: temporary stock lock within checkout.

Important fields:
- `productVariantId`
- `userId`
- `quantity`
- `status`
- `expiresAt`
- `releasedAt`

Business rules:
- checkout uses short-lived reservation windows for optimistic locking
- expired/resolved reservations are handled by scheduled marketplace jobs

### 4.5 Orders and fulfillment

#### `MarketplaceOrder`
Purpose: parent customer order spanning multiple vendors.

Key fields:
- `orderNumber`, `customerId`
- `status`, `subtotal`, `deliveryFee`, `total`, `currency`
- `paymentStatus`

Relationship:
- one customer order can split into many `VendorOrder` records

#### `VendorOrder`
Purpose: merchant-specific fulfillment order.

Key fields:
- `marketplaceOrderId`, `vendorId`
- `status`, `subtotal`, `commissionAmount`, `deliveryFee`, `total`

Business logic:
- vendor order state evolves independently from the parent order
- updates are used for vendor fulfillment, packing, shipping, and payout mapping

#### `OrderLine`
Purpose: line item within a vendor order.

Contains:
- `vendorOrderId`
- `productVariantId`
- `quantity`, `unitPrice`, `discountAmount`, `subtotal`

### 4.6 Payments, receipts, and commissions

#### `SimulatedPaymentAttempt`
Purpose: represents a simulated mobile-money attempt.

Key fields:
- `reservationId`, `userId`, `method`, `phone`, `amount`, `status`, `expiresAt`

#### `PaymentReceipt`
Purpose: a receipt tied to a completed payment attempt or reservation.

Key fields:
- `paymentAttemptId`, `userId`, `amount`, `currency`, `receiptNumber`

#### `LedgerEntry`
Purpose: immutable financial journal.

Key fields:
- `entryType`
- `amount`, `currency`
- `orderId`, `vendorOrderId`, `userId`
- `referenceType`, `referenceId`
- `description`

Important rule: the schema is set up for double-entry accounting patterns and reconciliation.

#### `CommissionSettings` and `CategoryCommission`
Purpose: platform commission configuration and category-specific overrides.

#### `VendorPayout` and `PayoutBatch`
Purpose: vendor settlement grouping.

Important fields:
- `batchId`, `vendorId`, `status`, `amount`, `currency`, `approvedAt`

### 4.7 Returns and disputes

#### `ReturnRequest`
Purpose: customer return/refund workflow.

Key fields:
- `orderLineId`, `customerId`, `vendorId`, `status`, `reason`, `quantity`, `amount`

#### `ReturnPhoto`
Purpose: image attachments used in return review.

### 4.8 Support, messaging, and moderation

#### `SupportTicket`, `SupportMessage`, `SupportAttachment`, `SupportTicketActivity`
Purpose: private customer/vendor support workflows.

The schema supports:
- assignment and status updates
- attachments
- internal notes
- delivery of emails and AI-enriched context

#### `Conversation`, `ConversationMessage`, `ConversationAttachment`, `ConversationPresence`
Purpose: buyer-vendor messaging and presence.

#### `CommunicationBlock` and `CommunicationReport`
Purpose: moderation and anti-abuse controls.

## 5. Relationship summary

The most important relationship paths are:

- `User` -> `VendorProfile` -> `VendorApplicationFile`
- `User` -> `Product` -> `ProductVariant` -> `ShoppingCartItem` / `OrderLine`
- `Customer` -> `ShoppingCart` -> `ShoppingCartItem`
- `MarketplaceOrder` -> `VendorOrder` -> `OrderLine`
- `MarketplaceOrder` -> `PaymentReceipt` and `SimulatedPaymentAttempt`
- `VendorOrder` -> `LedgerEntry` -> `VendorPayout`
- `OrderLine` -> `ReturnRequest`
- `User` -> `SupportTicket` -> `SupportMessage`
- `User` -> `Conversation` -> `ConversationMessage`

## 6. Cascading and data retention behavior

- `UserAuthAccount` deletes with the owning user via `onDelete: Cascade`.
- `UserSession` is also a cascade relationship.
- `EmailVerificationCode`, `AdminMfaMethod`, and other admin security records cascade on user deletion.
- `VendorProfileChangeRequest` and associated files are retained or removed according to the implementation rules in the service layer.
- Order and accounting models are designed to preserve auditability; they are not expected to be deleted aggressively.

## 7. Marketplace workflow support

The schema supports the major business flows in the application:

- Customer registration and email verification
- Vendor onboarding and document review
- Product listing with variant prices and inventory
- Cart and checkout with reservation windows
- Pay by simulated mobile money
- Order splitting across vendors
- Ledger updating and payout batch generation
- Returns/refunds and dispute review
- Support ticketing and moderation
- Messaging and communication safety

## 8. Notable indexes and uniqueness constraints

The schema adds operational indexes on the highest-traffic query patterns, including:

- `users(accountType, normalizedEmail)`
- `user_sessions(userId, expiresAt)` and `expiresAt`
- `stock_reservations(userId, status, expiresAt)`
- `vendor_orders(vendorId, status)`
- `marketplace_orders(customerId, status)`
- `support_tickets(status, priority)`
- conversation and moderation records by user and status

## 9. Source of truth

The canonical schema is in:

- `prisma/schema.prisma`
- `prisma/migrations/`
- generated Prisma client under `generated/prisma/`

This file intentionally reflects the current application architecture rather than a legacy design document.
