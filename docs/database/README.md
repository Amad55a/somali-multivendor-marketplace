# Somsuuq Database Architecture and Schema Specification

**Database Engine:** PostgreSQL 15+ / 16+  
**ORM:** Prisma ORM 7 (`@prisma/client` `^7.10.1`, `@prisma/adapter-pg` `^7.10.1`)  
**Schema Definition:** [`prisma/schema.prisma`](../../prisma/schema.prisma)  
**Mermaid ER Diagram:** [`docs/database/erd.mmd`](./erd.mmd)  
**Total Models:** 57  
**Total Enums:** 32  
**Total Migrations:** 22 (located in `prisma/migrations/`)

---

## 1. Overview & Architectural Principles

The Somsuuq database is engineered to handle a multi-vendor e-commerce marketplace tailored to Somali retail conditions. The schema incorporates strict data-integrity safeguards:

1. **Role-Bound Foreign Keys:** Compound keys such as `(id, accountType)` prevent account-type spoofing (e.g., ensuring a Customer record cannot be referenced as a Vendor in vendor-scoped relations).
2. **Double-Entry Financial Ledger:** Every monetary movement (sales, commissions, discounts, delivery fees, refunds, and payouts) is recorded in immutable `LedgerEntry` rows.
3. **Optimistic Stock Reservations:** High-concurrency checkout uses a 10-minute atomic stock reservation mechanism before payment is confirmed.
4. **Multi-Vendor Order Hierarchy:** A parent `MarketplaceOrder` atomically splits into isolated `VendorOrder` sub-orders per merchant, each carrying its own status, fulfillment schedule, commission calculations, and returns.
5. **Simulated Payment & SMS Transparency:** All mobile-money transactions and SMS outbox messages are explicitly flagged as simulated (`simulated: true`, `mode: SIMULATED`), preventing false assumptions regarding external payment gateways.

---

## 2. Enumerations (32 Enums)

| Enum Name | Values | Description |
|---|---|---|
| `AccountType` | `CUSTOMER`, `VENDOR`, `ADMIN` | High-level user classification |
| `AuthProvider` | `LOCAL`, `AMAZON` | Authentication provider used |
| `VerificationPurpose` | `EMAIL_VERIFY`, `ADMIN_LOGIN`, `PASSWORD_RESET` | OTP purpose scopes |
| `VendorApplicationStatus` | `DRAFT`, `PENDING`, `UNDER_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `REJECTED`, `SUSPENDED` | Vendor onboarding state machine |
| `VendorVerificationStatus` | `UNVERIFIED`, `PENDING`, `VERIFIED`, `REJECTED` | Document validation status |
| `VendorFileType` | `STORE_LOGO`, `BUSINESS_LICENSE` | Types of uploaded onboarding files |
| `VendorApplicationEmailEvent`| `SUBMITTED`, `APPROVED`, `REJECTED`, `CHANGES_REQUESTED`, `PROFILE_CHANGE_SUBMITTED`, `PROFILE_CHANGE_APPROVED`, `PROFILE_CHANGE_REJECTED` | Email trigger events |
| `VendorProfileChangeStatus` | `DRAFT`, `PENDING`, `APPROVED`, `REJECTED` | Merchant profile amendment cycle |
| `ProductStatus` | `DRAFT`, `PUBLISHED`, `ARCHIVED` | Product catalogue visibility |
| `ProductCondition` | `NEW`, `USED`, `REFURBISHED` | Physical item condition |
| `MarketplaceOrderStatus` | `PENDING_PAYMENT`, `PAID`, `CANCELLED`, `FULFILLING`, `COMPLETED` | Customer parent order state |
| `VendorOrderStatus` | `NEW`, `CONFIRMED`, `PROCESSING`, `PACKED`, `READY`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `EXPIRED` | Vendor sub-order state |
| `SimulatedPaymentMethod` | `EVC_PLUS`, `ZAAD`, `EDAHAB` | Somali mobile money methods (simulated) |
| `StockReservationStatus` | `ACTIVE`, `CONVERTED`, `EXPIRED`, `RELEASED` | 10-minute inventory lock state |
| `CouponScope` | `VENDOR`, `PLATFORM` | Coupon funding boundary |
| `DiscountType` | `PERCENTAGE`, `FIXED` | Value calculation type |
| `ReturnRequestStatus` | `REQUESTED`, `VENDOR_APPROVED`, `VENDOR_REJECTED`, `RETURN_SHIPPED`, `ESCALATED`, `IN_REVIEW`, `ADMIN_APPROVED`, `ADMIN_REJECTED`, `RETURNED`, `RECEIVED`, `REFUND_PROCESSING`, `REFUNDED` | Full return and dispute lifecycle |
| `LedgerEntryType` | `SALE`, `COMMISSION`, `VENDOR_DISCOUNT`, `PLATFORM_DISCOUNT`, `DELIVERY_FEE`, `REFUND`, `REFUND_ADJUSTMENT`, `PAYOUT`, `ADJUSTMENT` | Double-entry financial categories |
| `PayoutStatus` | `PENDING`, `APPROVED`, `PROCESSING`, `SIMULATED_PAID`, `FAILED`, `CANCELLED` | Weekly payout batch lifecycle |
| `PaymentMode` | `SIMULATED` | Payment execution mode |
| `PaymentRecordStatus` | `PENDING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `REVERSED` | Captured payment record state |
| `SimulatedPaymentAttemptStatus`| `PENDING`, `SIMULATED_SUCCESS`, `FAILED`, `CANCELLED`, `EXPIRED` | Transient mobile money attempt |
| `SmsOutboxStatus` | `QUEUED`, `SAVED_TO_OUTBOX`, `FAILED_TO_SAVE` | In-database message queue state |
| `SupportTicketCategory` | `ORDERS`, `PAYMENTS`, `DELIVERY`, `RETURNS`, `REFUNDS`, `ACCOUNT`, `PRODUCT_ISSUES`, `SAFETY`, `VENDOR_APPLICATION`, `STORE_PROFILE`, `PRODUCT_LISTING`, `INVENTORY`, `COUPONS`, `COMMISSION_PAYOUTS`, `ACCOUNT_SECURITY`, `OTHER` | Customer/vendor support categorization |
| `SupportTicketStatus` | `OPEN`, `IN_PROGRESS`, `WAITING_FOR_CUSTOMER`, `WAITING_FOR_VENDOR`, `RESOLVED`, `CLOSED` | Support workflow stages |
| `SupportTicketPriority` | `LOW`, `NORMAL`, `HIGH`, `URGENT` | Service level agreement priority |
| `SupportTicketActivityType` | `CREATED`, `MESSAGE_ADDED`, `ASSIGNED`, `STATUS_CHANGED`, `PRIORITY_CHANGED`, `INTERNAL_NOTE_ADDED` | Audit history of ticket updates |
| `SupportEmailEvent` | `TICKET_CREATED`, `TICKET_RESOLVED` | Outgoing support email notification events |
| `SupportEmailDeliveryStatus`| `PENDING`, `SENDING`, `SENT`, `FAILED` | Delivery state of support emails |
| `ConversationMessageType` | `TEXT`, `PRODUCT`, `ORDER`, `IMAGE`, `SYSTEM` | Chat message payload types |
| `CommunicationReportReason` | `SPAM`, `HARASSMENT`, `FRAUD`, `IMPERSONATION`, `INAPPROPRIATE_CONTENT`, `OTHER` | Chat moderation report triggers |
| `CommunicationReportStatus` | `OPEN`, `INVESTIGATING`, `DISMISSED`, `ACTIONED` | Admin moderation queue stages |

---

## 3. Database Models & Schema Specifications (57 Models)

### Group 1: Identity, Authentication & Security (9 Models)

#### 1. `users`
Represents all system actors (customers, vendors, and platform administrators).
- **Primary Key:** `id` (UUID)
- **Unique Constraints:** `(id, accountType)`, `(accountType, normalizedEmail)`
- **Indexes:** `email`, `(accountType, isActive)`
- **Key Columns:** `email` (VARCHAR 254), `normalizedEmail` (VARCHAR 254, trimmed lowercase), `accountType` (`AccountType`), `emailVerifiedAt` (TIMESTAMPTZ), `displayName` (VARCHAR 160), `profileImageKey` (VARCHAR 500), `isActive` (BOOLEAN, default true).

#### 2. `user_auth_accounts`
Stores credentials bound to authentication providers.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `(userId, accountType)` references `users(id, accountType)` with `ON DELETE CASCADE`.
- **Unique Constraints:** `(provider, providerAccountId, accountType)`
- **Key Columns:** `provider` (`LOCAL` or `AMAZON`), `providerAccountId` (VARCHAR 255), `passwordHash` (Argon2id hash, VARCHAR 255).

#### 3. `user_sessions`
Tracks active bearer sessions and rotating refresh tokens.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `userId` references `users(id)` with `ON DELETE CASCADE`.
- **Unique Constraints:** `sessionTokenHash` (VARCHAR 255), `refreshTokenHash` (VARCHAR 255).
- **Indexes:** `(userId, expiresAt)`, `expiresAt`.

#### 4. `audit_logs`
Immutable compliance and security audit log.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `actorUserId` references `users(id)` with `ON DELETE SET NULL`.
- **Indexes:** `(actorUserId, createdAt)`, `(entityType, entityId)`, `createdAt`.
- **Key Columns:** `action` (VARCHAR 100), `entityType` (VARCHAR 100), `entityId` (UUID), `metadata` (JSON).

#### 5. `email_verification_codes`
Time-bounded one-time passwords for email verification and password reset.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `userId` references `users(id)` with `ON DELETE CASCADE`.
- **Indexes:** `(userId, purpose, expiresAt)`, `expiresAt`.
- **Key Columns:** `codeHash` (VARCHAR 255), `purpose` (`VerificationPurpose`), `expiresAt` (TIMESTAMPTZ), `usedAt` (TIMESTAMPTZ).

#### 6. `admin_mfa_methods`
Stores AES-256 encrypted TOTP secrets for administrators.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `userId` references `users(id)` with `ON DELETE CASCADE`, unique.
- **Key Columns:** `encryptedSecret` (VARCHAR 1024), `enabled` (BOOLEAN, default false), `verifiedAt` (TIMESTAMPTZ).

#### 7. `admin_recovery_codes`
Hashed one-time backup codes for administrator MFA bypass.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `userId` references `users(id)` with `ON DELETE CASCADE`.
- **Indexes:** `(userId, usedAt)`.

#### 8. `admin_login_challenges`
Short-lived authentication challenges bridging email OTP and TOTP verification.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `userId` references `users(id)` with `ON DELETE CASCADE`.
- **Unique Constraints:** `tokenHash` (VARCHAR 64).
- **Indexes:** `(userId, expiresAt)`, `expiresAt`.

#### 9. `login_attempts`
Rate-limiting and brute-force mitigation log.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `userId` references `users(id)` with `ON DELETE SET NULL`.
- **Indexes:** `(identifier, attemptedAt)`, `(userId, attemptedAt)`, `(ipAddress, attemptedAt)`.

---

### Group 2: Vendor Onboarding & Profile Management (6 Models)

#### 10. `vendor_profiles`
Storefront profile and legal registration details for merchants.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `(userId, accountType)` references `users(id, accountType)` with `ON DELETE CASCADE`.
- **Unique Constraints:** `userId`, `(userId, accountType)`.
- **Indexes:** `(applicationStatus, submittedAt)`, `(reviewedById, reviewedAt)`.
- **Key Columns:** `businessName` (VARCHAR 200), `storeName` (VARCHAR 120), `businessType` (VARCHAR 100), `country`, `region`, `city`, `district`, `address`, `marketAssociation`, `mobileMoneyNumber`, `applicationStatus` (`VendorApplicationStatus`), `verificationStatus` (`VendorVerificationStatus`), `deliveryFee` (DECIMAL 12,2).

#### 11. `vendor_application_files`
Secure private storage keys for business licenses and store logos.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `vendorProfileId` references `vendor_profiles(id)` with `ON DELETE CASCADE`.
- **Unique Constraints:** `storageKey`, `(vendorProfileId, fileType)`.
- **Indexes:** `(fileType, createdAt)`.

#### 12. `vendor_application_emails`
Records delivery status of vendor onboarding lifecycle emails.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `vendorProfileId` references `vendor_profiles(id)` with `ON DELETE CASCADE`.
- **Unique Constraints:** `(vendorProfileId, event)`.
- **Indexes:** `(sentAt, lastAttemptAt)`.

#### 13. `vendor_profile_change_requests`
Audit trail of merchant requests to modify approved business information.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `vendorProfileId` references `vendor_profiles(id)` with `ON DELETE CASCADE`.
- **Indexes:** `(vendorProfileId, status, submittedAt)`, `(status, submittedAt)`.
- **Key Columns:** `proposed` (JSON), `currentSnapshot` (JSON), `status` (`VendorProfileChangeStatus`).

#### 14. `vendor_profile_change_files`
Document uploads supporting profile change requests.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `changeRequestId` references `vendor_profile_change_requests(id)` with `ON DELETE CASCADE`.
- **Unique Constraints:** `storageKey`, `(changeRequestId, fileType)`.

#### 15. `vendor_delivery_rules`
Vendor-level flat delivery fee configuration.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `vendorId` references `users(id)` with `ON DELETE CASCADE`, unique.
- **Key Columns:** `fee` (DECIMAL 12,2).

---

### Group 3: Product Catalogue & Inventory (4 Models)

#### 16. `categories`
Hierarchical product taxonomy supporting bilingual Somali/English cataloguing.
- **Primary Key:** `id` (UUID)
- **Self-Relation:** `parentId` references `categories(id)` with `ON DELETE RESTRICT`.
- **Unique Constraints:** `slug` (VARCHAR 140).
- **Indexes:** `(isActive, name)`, `(parentId, isActive)`.
- **Key Columns:** `name` (VARCHAR 120), `nameSo` (VARCHAR 120), `slug`, `isActive` (BOOLEAN).

#### 17. `products`
Merchant product listings with physical location and market mapping.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `vendorId` references `users(id)` (`CASCADE`), `categoryId` references `categories(id)` (`RESTRICT`).
- **Unique Constraints:** `(vendorId, slug)`.
- **Indexes:** `(status, publishedAt)`, `(categoryId, status)`, `(country, region, city, status)`.
- **Key Columns:** `name` (VARCHAR 200), `nameSo` (VARCHAR 200), `slug` (VARCHAR 240), `condition` (`ProductCondition`), `status` (`ProductStatus`), `marketAssociation`, `marketName`.

#### 18. `product_variants`
SKU-level inventory holding stock quantities and pricing.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `productId` references `products(id)` with `ON DELETE CASCADE`.
- **Unique Constraints:** `sku` (VARCHAR 80).
- **Indexes:** `(productId, isActive)`.
- **Key Columns:** `sku`, `variantName` (VARCHAR 160), `attributes` (JSON), `price` (DECIMAL 12,2), `compareAtPrice` (DECIMAL 12,2), `stockQuantity` (INTEGER, default 0), `isActive` (BOOLEAN).

#### 19. `product_images`
Product photo gallery references.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `productId` references `products(id)` (`CASCADE`), `vendorId` references `users(id)` (`CASCADE`).
- **Unique Constraints:** `storageKey`.
- **Indexes:** `(productId, sortOrder)`, `(vendorId, productId)`.

---

### Group 4: Shopping Cart & Inventory Reservations (4 Models)

#### 20. `shopping_carts`
Persistent customer carts or guest browser carts.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `userId` references `users(id)` with `ON DELETE CASCADE`, unique.
- **Unique Constraints:** `guestKey` (VARCHAR 80).

#### 21. `cart_items`
Cart line items capturing historical pricing snapshot.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `cartId` references `shopping_carts(id)` (`CASCADE`), `variantId` references `product_variants(id)` (`CASCADE`).
- **Unique Constraints:** `(cartId, variantId)`.
- **Key Columns:** `quantity` (INTEGER), `capturedPrice` (DECIMAL 12,2).

#### 22. `stock_reservations`
10-minute temporary inventory locks created during checkout.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `customerId` references `users(id)` (`CASCADE`), `orderId` references `marketplace_orders(id)` (`SET NULL`, unique).
- **Indexes:** `(customerId, status, expiresAt)`, `(status, expiresAt)`.
- **Key Columns:** `status` (`StockReservationStatus`), `expiresAt` (TIMESTAMPTZ).

#### 23. `stock_reservation_items`
Variant items and locked quantities for a reservation.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `reservationId` references `stock_reservations(id)` (`CASCADE`), `variantId` references `product_variants(id)` (`RESTRICT`).
- **Indexes:** `variantId`.
- **Key Columns:** `quantity` (INTEGER), `unitPrice` (DECIMAL 12,2).

---

### Group 5: Orders, Fulfillment & Payments (7 Models)

#### 24. `marketplace_orders`
Customer parent order encompassing entire checkout across multiple vendors.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `customerId` references `users(id)` with `ON DELETE RESTRICT`.
- **Unique Constraints:** `orderNumber` (VARCHAR 24).
- **Indexes:** `(customerId, createdAt)`, `(status, createdAt)`.
- **Key Columns:** `orderNumber`, `status` (`MarketplaceOrderStatus`), `currency` (USD), `subtotalAmount` (DECIMAL 12,2), `totalAmount` (DECIMAL 12,2), `platformDiscount` (DECIMAL 12,2), `deliveryTotal` (DECIMAL 12,2), `paymentMode` (`SIMULATED`), `paymentStatus` (`PaymentRecordStatus`), `simulated` (BOOLEAN).

#### 25. `vendor_orders`
Vendor sub-order split from the parent order.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `orderId` references `marketplace_orders(id)` (`CASCADE`), `vendorId` references `users(id)` (`RESTRICT`).
- **Indexes:** `(vendorId, status, createdAt)`, `(status, confirmBy)`.
- **Key Columns:** `status` (`VendorOrderStatus`), `subtotalAmount` (DECIMAL 12,2), `confirmBy` (TIMESTAMPTZ, 24-hour deadline), `confirmedAt` (TIMESTAMPTZ), `courier` (VARCHAR 160), `trackingNumber` (VARCHAR 120), `deliveryFee` (DECIMAL 12,2), `discountAmount` (DECIMAL 12,2).

#### 26. `order_lines`
Individual purchased variant lines belonging to a vendor sub-order.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `vendorOrderId` references `vendor_orders(id)` (`CASCADE`), `variantId` references `product_variants(id)` (`RESTRICT`).
- **Key Columns:** `productName`, `variantName`, `sku`, `unitPrice` (DECIMAL 12,2), `quantity` (INTEGER), `commissionPercent` (DECIMAL 5,2), `commissionAmount` (DECIMAL 12,2).

#### 27. `payment_records`
Persistent ledger of payment authorization and capture.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `orderId` references `marketplace_orders(id)` (`CASCADE`), unique.
- **Unique Constraints:** `idempotencyKey` (VARCHAR 80).
- **Key Columns:** `mode` (`SIMULATED`), `status` (`PaymentRecordStatus`), `method` (`SimulatedPaymentMethod`), `amount` (DECIMAL 12,2).

#### 28. `simulated_payment_attempts`
Transient mobile-money payment attempts.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `customerId` references `users(id)` (`CASCADE`), `reservationId` references `stock_reservations(id)` (`CASCADE`), `orderId` references `marketplace_orders(id)` (`SET NULL`).
- **Unique Constraints:** `transactionReference` (VARCHAR 80), `idempotencyKey` (VARCHAR 80).
- **Indexes:** `(customerId, createdAt)`, `(reservationId, createdAt)`, `orderId`.

#### 29. `payment_receipts`
Formal proof-of-payment issued upon successful mobile money simulation.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `orderId` references `marketplace_orders(id)` (`CASCADE`, unique), `paymentAttemptId` references `simulated_payment_attempts(id)` (`CASCADE`, unique), `customerId` references `users(id)` (`CASCADE`).
- **Unique Constraints:** `receiptNumber` (VARCHAR 32).
- **Indexes:** `(customerId, paidAt)`.

#### 30. `sms_outbox_messages`
Persisted SMS notification records (application message outbox; simulated).
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `relatedUserId` (`SET NULL`), `orderId` (`SET NULL`), `paymentAttemptId` (`SET NULL`).
- **Unique Constraints:** `idempotencyKey` (VARCHAR 120).
- **Indexes:** `(recipient, createdAt)`, `(messageType, status, createdAt)`.

---

### Group 6: Reviews, Coupons, Returns & Disputes (6 Models)

#### 31. `product_reviews`
Customer product reviews restricted to verified, delivered purchases.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `productId` references `products(id)` (`CASCADE`), `customerId` references `users(id)` (`CASCADE`), `orderLineId` references `order_lines(id)` (`RESTRICT`, unique).
- **Indexes:** `(productId, hiddenAt)`.
- **Key Columns:** `rating` (1–5), `comment` (VARCHAR 2000), `photoKey`, `hiddenAt` (TIMESTAMPTZ, for moderation), `hiddenReason`.

#### 32. `coupons`
Promotional codes funded by either the platform or a specific vendor.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `vendorId` references `users(id)` with `ON DELETE CASCADE`.
- **Unique Constraints:** `code` (VARCHAR 40).
- **Indexes:** `(scope, isActive, endsAt)`.
- **Key Columns:** `code`, `scope` (`VENDOR` or `PLATFORM`), `discountType` (`PERCENTAGE` or `FIXED`), `discountValue` (DECIMAL 12,2), `minOrderAmount` (DECIMAL 12,2), `startsAt`, `endsAt`, `totalUsageLimit`, `perCustomerLimit`.

#### 33. `coupon_redemptions`
Redemption instances linking coupons to orders.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `couponId` (`CASCADE`), `customerId` (`CASCADE`), `orderId` (`CASCADE`), `vendorOrderId` (`SET NULL`).
- **Unique Constraints:** `(couponId, orderId)`.
- **Indexes:** `(couponId, customerId)`.

#### 34. `return_requests`
Customer return workflows initiateable within 7 days of delivery.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `orderId` (`CASCADE`), `orderLineId` (`RESTRICT`), `customerId` (`RESTRICT`), `vendorId` (`RESTRICT`), `reviewedByAdminId` (`SET NULL`).
- **Indexes:** `(orderLineId, status)`, `(vendorId, status, createdAt)`, `(customerId, createdAt)`.
- **Key Columns:** `status` (`ReturnRequestStatus`), `quantity` (INTEGER), `reason` (VARCHAR 200), `explanation` (VARCHAR 2000), `photoKey`, `disputeResolution`.

#### 35. `return_dispute_updates`
Communication updates and administrative notes on escalated return disputes.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `returnRequestId` references `return_requests(id)` with `ON DELETE CASCADE`.
- **Indexes:** `(returnRequestId, createdAt)`, `(returnRequestId, audience, createdAt)`.
- **Key Columns:** `authorRole` (`AccountType`), `audience` (`CUSTOMER`, `VENDOR`, or `BOTH`), `kind`, `content` (VARCHAR 2000).

#### 36. `simulated_refunds`
Simulated refund records generated upon confirmed return receipt.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `orderId` (`CASCADE`), `vendorOrderId` (`SET NULL`), `returnId` references `return_requests(id)` (`SET NULL`, unique).
- **Key Columns:** `amount` (DECIMAL 12,2), `reason` (VARCHAR 80), `simulated` (BOOLEAN).

---

### Group 7: Commissions, Financial Ledger & Payouts (8 Models)

#### 37. `category_commissions`
Category-specific commission percentage rules.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `categoryId` references `categories(id)` (`CASCADE`, unique), `updatedById` references `users(id)` (`SET NULL`).
- **Key Columns:** `percent` (DECIMAL 5,2), `isActive` (BOOLEAN).

#### 38. `commission_settings`
Global platform commission configuration.
- **Primary Key:** `id` (VARCHAR 40, defaults to `"default"`).
- **Foreign Key:** `updatedById` references `users(id)` with `ON DELETE SET NULL`.
- **Key Columns:** `defaultPercent` (DECIMAL 5,2).

#### 39. `category_commission_history`
Audit history of commission adjustments.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `categoryId` (`SET NULL`), `changedById` references `users(id)` (`RESTRICT`).
- **Indexes:** `(categoryId, createdAt)`.

#### 40. `ledger_entries`
Immutable double-entry financial journal.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `vendorId` (`RESTRICT`), `orderId` (`RESTRICT`), `vendorOrderId` (`SET NULL`), `orderLineId` (`SET NULL`), `payoutId` (`SET NULL`), `couponId` (`SET NULL`), `relatedEntryId` (`SET NULL`).
- **Unique Constraints:** `idempotencyKey` (VARCHAR 120).
- **Indexes:** `(vendorId, createdAt)`, `(orderId, type)`, `(vendorOrderId, type)`, `payoutId`.
- **Key Columns:** `type` (`LedgerEntryType`), `amount` (DECIMAL 12,2; positive for credits, negative for debits), `currency` (USD), `description` (VARCHAR 500), `simulated` (BOOLEAN).

#### 41. `payout_batches`
Weekly scheduled vendor settlement batches.
- **Primary Key:** `id` (UUID)
- **Unique Constraints:** `weekKey` (VARCHAR 20, e.g., `"2026-W45"`).
- **Foreign Keys:** `createdById` (`SET NULL`), `approvedById` (`SET NULL`).
- **Indexes:** `(status, createdAt)`.
- **Key Columns:** `status` (`PayoutStatus`), `periodStart`, `periodEnd`.

#### 42. `vendor_payouts`
Aggregated payout allocation for an individual vendor within a batch.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `vendorId` (`RESTRICT`), `batchId` (`SET NULL`), `approvedById` (`SET NULL`).
- **Unique Constraints:** `reference` (VARCHAR 40), `idempotencyKey` (VARCHAR 120), `(batchId, vendorId, currency)`.
- **Indexes:** `(vendorId, createdAt)`.
- **Key Columns:** `amount` (DECIMAL 12,2), `status` (`PayoutStatus`), `failureReason`.

#### 43. `payout_allocations`
Cross-table linking specific `LedgerEntry` rows to a `VendorPayout`.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `payoutId` references `vendor_payouts(id)` (`RESTRICT`), `ledgerEntryId` references `ledger_entries(id)` (`RESTRICT`).
- **Unique Constraints:** `(payoutId, ledgerEntryId)`.
- **Indexes:** `(ledgerEntryId, releasedAt)`, `(payoutId, releasedAt)`.

---

### Group 8: Support Ticketing System (5 Models)

#### 44. `support_tickets`
Customer and vendor support inquiries.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `(requesterId, requesterRole)` references `users(id, accountType)` (`CASCADE`), `assignedToId` (`SET NULL`), `relatedOrderId` (`SET NULL`), `vendorProfileId` (`SET NULL`), `productId` (`SET NULL`).
- **Unique Constraints:** `reference` (VARCHAR 32), `(requesterId, idempotencyKey)`.
- **Indexes:** `(requesterId, requesterRole, updatedAt)`, `(requesterRole, status, priority, updatedAt)`, `(assignedToId, status, updatedAt)`.
- **Key Columns:** `subject` (VARCHAR 200), `description` (VARCHAR 4000), `category` (`SupportTicketCategory`), `priority` (`SupportTicketPriority`), `status` (`SupportTicketStatus`).

#### 45. `support_messages`
Conversation replies and internal staff notes on tickets.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `ticketId` references `support_tickets(id)` (`CASCADE`), `senderId` references `users(id)` (`CASCADE`).
- **Unique Constraints:** `(senderId, idempotencyKey)`.
- **Indexes:** `(ticketId, createdAt)`, `(ticketId, internalNote, createdAt)`, `(ticketId, senderRole, requesterReadAt, staffReadAt)`.
- **Key Columns:** `content` (VARCHAR 4000), `internalNote` (BOOLEAN, default false).

#### 46. `support_attachments`
Uploaded documentation and images attached to support messages.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `messageId` references `support_messages(id)` (`CASCADE`), `uploadedById` references `users(id)` (`CASCADE`).
- **Unique Constraints:** `storageKey`, `(uploadedById, idempotencyKey)`.
- **Indexes:** `(messageId, createdAt)`, `(uploadedById, createdAt)`.

#### 47. `support_ticket_activities`
Auditable lifecycle log of ticket events (status changes, assignments, notes).
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `ticketId` references `support_tickets(id)` (`CASCADE`), `actorId` references `users(id)` (`SET NULL`).
- **Indexes:** `(ticketId, createdAt)`, `(actorId, createdAt)`.
- **Key Columns:** `type` (`SupportTicketActivityType`), `metadata` (JSON).

#### 48. `support_email_deliveries`
Tracks outgoing transactional emails for ticket creation and resolution.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `ticketId` references `support_tickets(id)` (`CASCADE`), `activityId` references `support_ticket_activities(id)` (`CASCADE`, unique).
- **Indexes:** `(ticketId, createdAt)`, `(status, lastAttemptAt)`.
- **Key Columns:** `event` (`SupportEmailEvent`), `status` (`SupportEmailDeliveryStatus`), `recipientEmail` (VARCHAR 254), `attemptCount` (INTEGER).

---

### Group 9: Buyer-Vendor Communications & Messaging (6 Models)

#### 49. `conversations`
Direct chat threads between a customer and a vendor.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `customerId` references `users(id)` (`CASCADE`), `vendorId` references `users(id)` (`CASCADE`).
- **Unique Constraints:** `(customerId, vendorId)`.
- **Indexes:** `(customerId, updatedAt)`, `(vendorId, updatedAt)`.

#### 50. `conversation_messages`
Persisted messages within a direct chat conversation.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `conversationId` references `conversations(id)` (`CASCADE`), `senderId` references `users(id)` (`CASCADE`), `productId` references `products(id)` (`SET NULL`).
- **Unique Constraints:** `(conversationId, senderId, clientMessageId)`, `(conversationId, productId)`.
- **Indexes:** `(conversationId, createdAt)`, `(conversationId, senderId, readAt, createdAt)`.
- **Key Columns:** `type` (`ConversationMessageType`), `content` (VARCHAR 4000), `clientMessageId` (VARCHAR 80), `deliveredAt`, `readAt`.

#### 51. `conversation_attachments`
Image files attached to direct chat messages.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `messageId` references `conversation_messages(id)` (`CASCADE`), `uploadedById` references `users(id)` (`CASCADE`).
- **Unique Constraints:** `storageKey`.
- **Indexes:** `(messageId, createdAt)`.

#### 52. `communication_blocks`
User-level blocking to prevent harassment or unwanted communication.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `blockerId` references `users(id)` (`CASCADE`), `blockedId` references `users(id)` (`CASCADE`), `conversationId` references `conversations(id)` (`SET NULL`).
- **Unique Constraints:** `(blockerId, blockedId)`.
- **Indexes:** `(blockedId, createdAt)`, `conversationId`.

#### 53. `communication_reports`
User reports flagged for administrator moderation review.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `conversationId` (`CASCADE`), `reporterId` (`CASCADE`), `reportedUserId` (`CASCADE`), `reviewedById` (`SET NULL`).
- **Unique Constraints:** `(conversationId, reporterId, reportedUserId)`.
- **Indexes:** `(status, createdAt)`, `(reportedUserId, createdAt)`.
- **Key Columns:** `reason` (`CommunicationReportReason`), `explanation` (VARCHAR 2000), `status` (`CommunicationReportStatus`).

#### 54. `conversation_presence`
Tracks online presence and last-seen timestamps for chat participants.
- **Primary Key:** `id` (UUID)
- **Foreign Keys:** `conversationId` references `conversations(id)` (`CASCADE`), `userId` references `users(id)` (`CASCADE`).
- **Unique Constraints:** `(conversationId, userId)`.
- **Indexes:** `(conversationId, lastSeenAt)`.

---

### Group 10: In-App Notifications (3 Models)

#### 55. `customer_notifications`
Notifications dispatched to customers regarding orders, payments, and reviews.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `customerId` references `users(id)` with `ON DELETE CASCADE`.
- **Unique Constraints:** `dedupeKey` (VARCHAR 160).
- **Indexes:** `(customerId, readAt, createdAt)`.
- **Key Columns:** `title`, `titleSo`, `body`, `bodySo`, `href`, `readAt`.

#### 56. `vendor_notifications`
Notifications dispatched to vendors regarding new sub-orders, returns, and payouts.
- **Primary Key:** `id` (UUID)
- **Foreign Key:** `vendorId` references `users(id)` with `ON DELETE CASCADE`.
- **Unique Constraints:** `dedupeKey` (VARCHAR 160).
- **Indexes:** `(vendorId, readAt, createdAt)`.
- **Key Columns:** `title`, `titleSo`, `body`, `bodySo`, `href`, `readAt`.

#### 57. `admin_notifications`
System alerts for administrator review (new vendor applications, profile changes, disputes).
- **Primary Key:** `id` (UUID)
- **Unique Constraints:** `dedupeKey` (VARCHAR 160).
- **Indexes:** `(readAt, createdAt)`.
- **Key Columns:** `type`, `title`, `titleSo`, `body`, `bodySo`, `href`, `readAt`.

---

## 4. Key Business Logic Mechanisms

### A. The 10-Minute Stock Reservation Lifecycle

1. **Trigger:** The customer initiates checkout by calling `POST /api/v1/checkout/reserve`.
2. **Atomic Verification:** Inside a PostgreSQL interactive transaction:
   - The user's `CartItem` rows are retrieved.
   - For each item, current variant stock is verified: `stockQuantity - activeReservedStock >= requestedQuantity`.
   - If stock is insufficient, an `OUT_OF_STOCK` exception aborts the transaction.
3. **Reservation Creation:**
   - A `StockReservation` row is inserted with `status = ACTIVE` and `expiresAt = NOW() + INTERVAL '10 minutes'`.
   - `StockReservationItem` rows are inserted for each variant.
4. **Countdown & Lock:** The user interface displays a 10-minute timer. Subsequent checkout calls (`POST /api/v1/checkout/quote`, `POST /api/v1/checkout/pay`) reference this `reservationId`.
5. **Resolution Paths:**
   - **Success (`CONVERTED`):** When payment succeeds (`POST /api/v1/checkout/pay`), the reservation moves to `CONVERTED`, variant `stockQuantity` is decremented by the purchased count, and `orderId` is linked.
   - **Explicit Cancellation (`RELEASED`):** If the customer cancels via `POST /api/v1/checkout/cancel`, the reservation status changes to `RELEASED`.
   - **Expiration (`EXPIRED`):** The automated cron worker (`/api/cron/marketplace` or `POST /api/v1/jobs/expire`) queries active reservations where `expiresAt < NOW()` and marks them `EXPIRED`, releasing locked quantities.

---

### B. Multi-Vendor Order Splitting & Commission Settlement

1. **Checkout Subtotal Calculation:**
   - Items in the cart belong to one or more merchants (`Product.vendorId`).
   - Shipping fees are computed per vendor based on `VendorDeliveryRule` or default store fees.
2. **Parent Order Creation:**
   - One `MarketplaceOrder` record is created containing the overall aggregate subtotal, delivery total, discounts, and customer contact/shipping address.
3. **Vendor Sub-Order Partitioning:**
   - Items are grouped by `vendorId`.
   - For each distinct merchant, a child `VendorOrder` is inserted with:
     - `orderId` linking to parent `MarketplaceOrder`.
     - `confirmBy = NOW() + INTERVAL '24 hours'` (vendor must acknowledge within 24 hours).
     - Dedicated subtotal, delivery fee, and discount amount.
4. **Order Line Commission Calculation:**
   - Each `OrderLine` computes commission rate via category inheritance:
     $$\text{commissionPercent} = \text{CategoryCommission.percent} \quad (\text{or parent category, or } \text{CommissionSettings.defaultPercent})$$
     $$\text{commissionAmount} = \text{round}\left(\text{unitPrice} \times \text{quantity} \times \frac{\text{commissionPercent}}{100}, 2\right)$$
5. **Ledger Journaling:**
   - For each confirmed delivered order, atomic entries are created in `ledger_entries`:
     - Credit: `SALE` (vendor subtotal).
     - Debit: `COMMISSION` (platform commission fee).
     - Credit: `DELIVERY_FEE` (allocated delivery compensation).

---

## 5. Migration History & Deployment Rules

All database schema evolutions are managed strictly via Prisma Migrate:

| # | Migration Directory | Description |
|---|---|---|
| 01 | `20261104163724_foundation_auth` | Users, auth accounts, and sessions |
| 02 | `20261104165629_authentication_security` | Email codes, MFA, recovery codes, audit logs |
| 03 | `20261105114500_vendor_onboarding_and_auth_hardening` | Vendor profile foundation and login attempts |
| 04 | `20261105183000_vendor_changes_requested_status` | Status updates for vendor review |
| 05 | `20261105201000_vendor_location_fields` | Regional location fields for vendors |
| 06 | `20261106072000_vendor_application_documents` | File attachments for vendor onboarding |
| 07 | `20261106090000_vendor_application_emails` | Onboarding lifecycle email tracking |
| 08 | `20261106100000_auth_refresh_tokens` | Rotating refresh tokens on sessions |
| 09 | `20261106103000_product_catalog` | Products, variants, images, categories |
| 10 | `20261106110000_bilingual_catalog` | Somali translations (`nameSo`, `descriptionSo`) |
| 11 | `20261106120000_vendor_profile_change_requests` | Vendor profile modification workflow |
| 12 | `20261106130000_marketplace_commerce` | Carts, parent orders, vendor sub-orders, payments |
| 13 | `20261106140000_marketplace_workflow` | Stock reservations and order line calculations |
| 14 | `20261106153000_admin_notifications` | Dedicated admin notifications queue |
| 15 | `20261106170000_simulated_payment_receipts_sms` | Receipts, payment attempts, and SMS outbox |
| 16 | `20261106180000_customer_order_reviews_returns` | Verified reviews, returns, and customer notifications |
| 17 | `20261106190000_commission_financial_foundation` | Commissions, ledger entries, payout batches |
| 18 | `20261107090000_support_foundation` | Customer and vendor support tickets |
| 19 | `20261107100000_support_ticket_emails` | Transactional emails for support |
| 20 | `20261107113000_buyer_vendor_communications` | Buyer-vendor direct messaging and presence |
| 21 | `20261108100000_conversation_call_lifecycle` | Voice/video call lifecycle states |
| 22 | `20261108150000_return_dispute_workflow` | Admin dispute escalation and moderation updates |

> [!CAUTION]
> **Production Migration Safety Rule:**  
> Never run `prisma migrate reset` or `prisma db push` in staging or production environments. Always apply pending migrations using:
> ```bash
> npx prisma migrate deploy
> ```
