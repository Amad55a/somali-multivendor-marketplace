# Somsuuq Database Overview

This document provides a developer-friendly overview of the database layer in Somsuuq. For the exhaustive schema breakdown, see [`docs/database/README.md`](./database/README.md) and the Mermaid diagram [`docs/database/erd.mmd`](./database/erd.mmd).

---

## Quick Facts

- **Database Engine:** PostgreSQL 15+ / 16+
- **Prisma Client Output:** `generated/prisma`
- **Total Tables/Models:** 57
- **Total Enums:** 32
- **Migrations Count:** 22 migrations in `prisma/migrations/`

---

## Database Management Commands

```bash
# Validate Prisma schema syntax
npx prisma validate

# Generate Prisma Client (after pull or schema update)
npm run prisma:generate

# Apply pending migrations in production / staging
npx prisma migrate deploy

# Seed baseline data
npm run categories:seed     # Seeds categories and Somali translations
npm run commissions:seed    # Seeds category commission rules
npm run admin:provision     # Provisions private administrator
```

> [!CAUTION]
> **Strict Migration Rule:**  
> Never use `prisma migrate reset` or `prisma db push` on an environment containing real or staging data. Always use `npx prisma migrate deploy`.

---

## Schema Groupings

1. **Identity & Auth:** `User`, `UserAuthAccount`, `UserSession`, `AuditLog`, `EmailVerificationCode`, `AdminMfaMethod`, `AdminRecoveryCode`, `AdminLoginChallenge`, `LoginAttempt`.
2. **Vendor Operations:** `VendorProfile`, `VendorApplicationFile`, `VendorApplicationEmail`, `VendorProfileChangeRequest`, `VendorProfileChangeFile`, `VendorDeliveryRule`.
3. **Catalogue & Stock:** `Category`, `Product`, `ProductVariant`, `ProductImage`, `StockReservation`, `StockReservationItem`.
4. **Commerce & Orders:** `ShoppingCart`, `CartItem`, `MarketplaceOrder`, `VendorOrder`, `OrderLine`, `PaymentRecord`, `SimulatedPaymentAttempt`, `PaymentReceipt`, `SmsOutboxMessage`.
5. **Customer Feedback & Returns:** `ProductReview`, `Coupon`, `CouponRedemption`, `ReturnRequest`, `ReturnDisputeUpdate`, `SimulatedRefund`.
6. **Financial Settlement:** `CategoryCommission`, `CommissionSettings`, `CategoryCommissionHistory`, `LedgerEntry`, `PayoutBatch`, `VendorPayout`, `PayoutAllocation`.
7. **Support & Service:** `SupportTicket`, `SupportMessage`, `SupportAttachment`, `SupportTicketActivity`, `SupportEmailDelivery`.
8. **Buyer-Vendor Communications:** `Conversation`, `ConversationMessage`, `ConversationAttachment`, `CommunicationBlock`, `CommunicationReport`, `ConversationPresence`.
9. **Notifications:** `CustomerNotification`, `VendorNotification`, `AdminNotification`.
