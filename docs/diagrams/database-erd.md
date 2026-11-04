
erDiagram
    USERS {
        uuid id PK
        string email
        enum accountType
        boolean isActive
        datetime emailVerifiedAt
        datetime createdAt
        datetime updatedAt
    }

    USER_AUTH_ACCOUNTS {
        uuid id PK
        uuid userId FK
        enum provider
        string providerAccountId
        string passwordHash
    }

    USER_SESSIONS {
        uuid id PK
        uuid userId FK
        string sessionTokenHash
        datetime lastActivityAt
        datetime expiresAt
        datetime revokedAt
    }

    EMAIL_VERIFICATION_CODES {
        uuid id PK
        uuid userId FK
        string codeHash
        enum purpose
        datetime expiresAt
        datetime usedAt
    }

    ADMIN_MFA_METHODS {
        uuid id PK
        uuid userId FK
        string encryptedSecret
        boolean enabled
        datetime verifiedAt
    }

    ADMIN_RECOVERY_CODES {
        uuid id PK
        uuid userId FK
        string codeHash
        datetime usedAt
    }

    LOGIN_ATTEMPTS {
        uuid id PK
        uuid userId FK
        string identifier
        string ipAddress
        boolean successful
        datetime attemptedAt
    }

    AUDIT_LOGS {
        uuid id PK
        uuid actorUserId FK
        string action
        string entityType
        uuid entityId
        json metadata
        datetime createdAt
    }

    VENDORS {
        uuid id PK
        uuid userId FK
        string storeName
        enum approvalStatus
        uuid approvedBy FK
        datetime approvedAt
        datetime createdAt
    }

    MARKETS {
        uuid id PK
        string name
        string city
        string region
        boolean isActive
    }

    VENDOR_MARKETS {
        uuid id PK
        uuid vendorId FK
        uuid marketId FK
    }

    CATEGORIES {
        uuid id PK
        string name
        string slug
        uuid parentId FK
        boolean isActive
    }

    PRODUCTS {
        uuid id PK
        uuid vendorId FK
        uuid categoryId FK
        string name
        string slug
        string description
        enum status
        datetime createdAt
    }

    PRODUCT_VARIANTS {
        uuid id PK
        uuid productId FK
        string sku
        json attributes
        decimal price
        int stockOnHand
        int reservedQuantity
        boolean isActive
    }

    CARTS {
        uuid id PK
        uuid customerId FK
        enum status
        datetime createdAt
    }

    CART_ITEMS {
        uuid id PK
        uuid cartId FK
        uuid variantId FK
        int quantity
    }

    RESERVATIONS {
        uuid id PK
        uuid customerId FK
        uuid orderId FK
        enum status
        datetime expiresAt
        datetime createdAt
    }

    RESERVATION_ITEMS {
        uuid id PK
        uuid reservationId FK
        uuid variantId FK
        int quantity
    }

    ORDERS {
        uuid id PK
        uuid customerId FK
        uuid reservationId FK
        string orderNumber
        enum status
        decimal subtotal
        decimal discountTotal
        decimal deliveryTotal
        decimal totalAmount
        string currency
        datetime createdAt
    }

    SUB_ORDERS {
        uuid id PK
        uuid orderId FK
        uuid vendorId FK
        string subOrderNumber
        enum status
        decimal subtotal
        decimal deliveryFee
        decimal discountAmount
        decimal commissionRate
        decimal commissionAmount
        decimal vendorPayable
        datetime vendorConfirmedAt
    }

    ORDER_ITEMS {
        uuid id PK
        uuid subOrderId FK
        uuid variantId FK
        string productNameSnapshot
        string skuSnapshot
        json variantSnapshot
        decimal unitPrice
        int quantity
        decimal lineTotal
    }

    PAYMENTS {
        uuid id PK
        uuid orderId FK
        enum provider
        string transactionReference
        string idempotencyKey
        decimal amount
        enum status
        datetime paidAt
    }

    COUPONS {
        uuid id PK
        string code
        enum discountType
        decimal discountValue
        enum fundingType
        uuid vendorId FK
        decimal maxDiscount
        datetime startsAt
        datetime expiresAt
        int usageLimit
        boolean isActive
    }

    COUPON_REDEMPTIONS {
        uuid id PK
        uuid couponId FK
        uuid orderId FK
        uuid customerId FK
        decimal totalDiscount
        datetime createdAt
    }

    COUPON_REDEMPTION_ALLOCATIONS {
        uuid id PK
        uuid redemptionId FK
        uuid subOrderId FK
        enum fundingType
        uuid vendorId FK
        decimal amount
    }

    RETURNS {
        uuid id PK
        uuid subOrderId FK
        uuid customerId FK
        enum status
        string reason
        uuid reviewedBy FK
        datetime requestedAt
        datetime reviewedAt
    }

    RETURN_ITEMS {
        uuid id PK
        uuid returnId FK
        uuid orderItemId FK
        int quantity
        decimal refundAmount
    }

    PLATFORM_SETTINGS {
        uuid id PK
        decimal commissionRate
        uuid updatedBy FK
        datetime updatedAt
    }

    LEDGER_ENTRIES {
        uuid id PK
        uuid vendorId FK
        uuid subOrderId FK
        uuid returnId FK
        uuid payoutId FK
        enum entryType
        decimal amount
        string currency
        string reference
        datetime createdAt
    }

    PAYOUTS {
        uuid id PK
        uuid vendorId FK
        decimal amount
        enum status
        datetime periodStart
        datetime periodEnd
        string reference
        datetime paidAt
    }

    REVIEWS {
        uuid id PK
        uuid customerId FK
        uuid productId FK
        uuid orderItemId FK
        int rating
        string comment
        datetime createdAt
    }

    VIDEO_CALL_SESSIONS {
        uuid id PK
        uuid customerId FK
        uuid vendorId FK
        uuid productId FK
        string roomId
        enum status
        datetime requestedAt
        datetime acceptedAt
        datetime startedAt
        datetime endedAt
    }

    NOTIFICATION_OUTBOX {
        uuid id PK
        uuid userId FK
        enum channel
        string template
        json payload
        enum status
        int attempts
        datetime nextAttemptAt
        datetime sentAt
        datetime createdAt
    }

    USERS ||--o{ USER_AUTH_ACCOUNTS : authenticates
    USERS ||--o{ USER_SESSIONS : owns
    USERS ||--o{ EMAIL_VERIFICATION_CODES : verifies
    USERS ||--o| ADMIN_MFA_METHODS : configures
    USERS ||--o{ ADMIN_RECOVERY_CODES : receives
    USERS ||--o{ LOGIN_ATTEMPTS : attempts
    USERS ||--o{ AUDIT_LOGS : performs
    USERS ||--o{ NOTIFICATION_OUTBOX : receives

    USERS ||--o| VENDORS : owns
    USERS |o--o{ VENDORS : approves

    VENDORS ||--o{ VENDOR_MARKETS : operates
    MARKETS ||--o{ VENDOR_MARKETS : includes
    VENDORS ||--o{ PRODUCTS : owns
    CATEGORIES ||--o{ PRODUCTS : classifies
    CATEGORIES o|--o{ CATEGORIES : parent_of
    PRODUCTS ||--|{ PRODUCT_VARIANTS : has

    USERS ||--o{ CARTS : owns
    CARTS ||--o{ CART_ITEMS : contains
    PRODUCT_VARIANTS ||--o{ CART_ITEMS : selected

    USERS ||--o{ RESERVATIONS : creates
    RESERVATIONS ||--|{ RESERVATION_ITEMS : contains
    PRODUCT_VARIANTS ||--o{ RESERVATION_ITEMS : reserved

    USERS ||--o{ ORDERS : places
    RESERVATIONS o|--o| ORDERS : creates
    ORDERS ||--|{ SUB_ORDERS : splits
    VENDORS ||--o{ SUB_ORDERS : fulfills
    SUB_ORDERS ||--|{ ORDER_ITEMS : contains
    PRODUCT_VARIANTS o|--o{ ORDER_ITEMS : references
    ORDERS ||--o{ PAYMENTS : paid_by

    COUPONS ||--o{ COUPON_REDEMPTIONS : redeemed
    USERS ||--o{ COUPON_REDEMPTIONS : uses
    ORDERS ||--o{ COUPON_REDEMPTIONS : applies
    COUPON_REDEMPTIONS ||--o{ COUPON_REDEMPTION_ALLOCATIONS : allocates
    SUB_ORDERS ||--o{ COUPON_REDEMPTION_ALLOCATIONS : receives
    VENDORS o|--o{ COUPONS : funds

    SUB_ORDERS ||--o{ RETURNS : has
    RETURNS ||--|{ RETURN_ITEMS : contains
    ORDER_ITEMS ||--o{ RETURN_ITEMS : returned

    USERS ||--o{ PLATFORM_SETTINGS : updates
    VENDORS ||--o{ LEDGER_ENTRIES : owns
    SUB_ORDERS o|--o{ LEDGER_ENTRIES : generates
    RETURNS o|--o{ LEDGER_ENTRIES : adjusts
    PAYOUTS o|--o{ LEDGER_ENTRIES : settles
    VENDORS ||--o{ PAYOUTS : receives

    USERS ||--o{ REVIEWS : writes
    PRODUCTS ||--o{ REVIEWS : receives
    ORDER_ITEMS ||--o| REVIEWS : qualifies

    USERS ||--o{ VIDEO_CALL_SESSIONS : customer
    VENDORS ||--o{ VIDEO_CALL_SESSIONS : vendor
    PRODUCTS o|--o{ VIDEO_CALL_SESSIONS : discussed
