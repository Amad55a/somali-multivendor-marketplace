# Current database ER diagram

This diagram reflects `prisma/schema.prisma` and the configured development database verified on 2026-11-05. It contains only implemented application tables; Prisma's `_prisma_migrations` bookkeeping table is omitted.

```mermaid
erDiagram
    USERS {
        uuid id PK
        varchar email
        varchar normalizedEmail
        enum accountType
        timestamptz emailVerifiedAt
        boolean isActive
        timestamptz createdAt
        timestamptz updatedAt
        unique accountType_normalizedEmail
        unique id_accountType
    }

    USER_AUTH_ACCOUNTS {
        uuid id PK
        uuid userId FK
        enum accountType FK
        enum provider
        varchar providerAccountId
        varchar passwordHash
        timestamptz createdAt
        timestamptz updatedAt
        unique provider_providerAccountId_accountType
    }

    USER_SESSIONS {
        uuid id PK
        uuid userId FK
        varchar sessionTokenHash UK
        timestamptz lastActivityAt
        timestamptz expiresAt
        timestamptz revokedAt
        timestamptz createdAt
    }

    EMAIL_VERIFICATION_CODES {
        uuid id PK
        uuid userId FK
        varchar codeHash
        enum purpose
        timestamptz expiresAt
        timestamptz usedAt
        timestamptz createdAt
    }

    ADMIN_MFA_METHODS {
        uuid id PK
        uuid userId FK_UK
        varchar encryptedSecret
        boolean enabled
        timestamptz verifiedAt
        timestamptz createdAt
    }

    ADMIN_RECOVERY_CODES {
        uuid id PK
        uuid userId FK
        varchar codeHash
        timestamptz usedAt
        timestamptz createdAt
    }

    ADMIN_LOGIN_CHALLENGES {
        uuid id PK
        uuid userId FK
        varchar tokenHash UK
        timestamptz expiresAt
        timestamptz usedAt
        timestamptz createdAt
    }

    LOGIN_ATTEMPTS {
        uuid id PK
        uuid userId FK
        varchar identifier
        varchar ipAddress
        boolean successful
        timestamptz attemptedAt
    }

    AUDIT_LOGS {
        uuid id PK
        uuid actorUserId FK
        varchar action
        varchar entityType
        uuid entityId
        jsonb metadata
        timestamptz createdAt
    }

    VENDOR_PROFILES {
        uuid id PK
        uuid userId FK_UK
        enum accountType FK
        enum applicationStatus
        enum verificationStatus
        varchar businessName
        varchar storeName
        varchar businessType
        varchar description
        varchar contactName
        varchar phone
        varchar country
        varchar region
        varchar city
        varchar address
        varchar marketAssociation
        timestamptz submittedAt
        timestamptz reviewedAt
        uuid reviewedById FK
        varchar rejectionReason
        varchar informationRequest
        timestamptz createdAt
        timestamptz updatedAt
        unique userId_accountType
    }

    USERS ||--o{ USER_AUTH_ACCOUNTS : "userId + accountType"
    USERS ||--o{ USER_SESSIONS : owns
    USERS ||--o{ EMAIL_VERIFICATION_CODES : receives
    USERS ||--o| ADMIN_MFA_METHODS : configures
    USERS ||--o{ ADMIN_RECOVERY_CODES : receives
    USERS ||--o{ ADMIN_LOGIN_CHALLENGES : challenged
    USERS o|--o{ LOGIN_ATTEMPTS : associated
    USERS o|--o{ AUDIT_LOGS : acts
    USERS ||--o| VENDOR_PROFILES : owns
    USERS o|--o{ VENDOR_PROFILES : reviews
```

Implemented enums:

- `AccountType`: `CUSTOMER`, `VENDOR`, `ADMIN`
- `AuthProvider`: `LOCAL`, `AMAZON`
- `VerificationPurpose`: `EMAIL_VERIFY`, `ADMIN_LOGIN`, `PASSWORD_RESET`
- `VendorApplicationStatus`: `DRAFT`, `PENDING`, `UNDER_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `REJECTED`, `SUSPENDED`
- `VendorVerificationStatus`: `UNVERIFIED`, `PENDING`, `VERIFIED`, `REJECTED`

Database-level checks created by migration but not expressible in the current Prisma schema syntax require Amazon auth accounts to use `CUSTOMER`/`VENDOR` and vendor profiles to use `VENDOR`.
